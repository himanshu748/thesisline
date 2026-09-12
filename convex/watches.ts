import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { DAY, MINUTE } from "@convex-dev/rate-limiter";
import {
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id, Doc } from "./_generated/dataModel";
import { COMPANIES, companyFor } from "./lib/companies";
import { cleanQuestion } from "./lib/evidence";
import { watchDoc, eventDoc, snapshotDoc, checkDoc } from "./validators";
import { limits } from "./limits";

const userContext = customCtx(async (ctx: QueryCtx) => {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Sign in to use your research workspace.");
  return { userId };
});
const userQuery = customQuery(query, userContext);
const userMutation = customMutation(mutation, userContext);

async function owned(
  ctx: QueryCtx,
  userId: Id<"users">,
  watchId: Id<"watches">,
) {
  const watch = await ctx.db.get(watchId);
  if (!watch || watch.userId !== userId)
    throw new Error("Research watch not found.");
  return watch;
}

export const companies = query({
  args: {},
  returns: v.array(
    v.object({
      symbol: v.string(),
      name: v.string(),
      sector: v.string(),
      sources: v.array(v.object({ url: v.string(), label: v.string() })),
      sampleQuestions: v.array(v.string()),
    }),
  ),
  handler: async () =>
    COMPANIES.map(({ hosts: _hosts, ...company }) => ({
      ...company,
      sources: [...company.sources],
      sampleQuestions: [...company.sampleQuestions],
    })),
});

export const viewer = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      email: v.union(v.string(), v.null()),
      emailVerified: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const id = await getAuthUserId(ctx);
    if (!id) return null;
    const user = await ctx.db.get(id);
    return user
      ? {
          _id: user._id,
          email: user.email ?? null,
          emailVerified: typeof user.emailVerificationTime === "number",
        }
      : null;
  },
});

export const list = userQuery({
  args: {},
  returns: v.array(watchDoc),
  handler: async (ctx) =>
    ctx.db
      .query("watches")
      .withIndex("by_userId_and_archived", (q) =>
        q.eq("userId", ctx.userId).eq("archived", false),
      )
      .order("desc")
      .take(10),
});

export const detail = userQuery({
  args: { watchId: v.id("watches") },
  returns: v.object({
    watch: watchDoc,
    events: v.array(eventDoc),
    snapshots: v.array(snapshotDoc),
    recentChecks: v.array(checkDoc),
  }),
  handler: async (ctx, { watchId }) => {
    const watch = await owned(ctx, ctx.userId, watchId);
    const events = await ctx.db
      .query("events")
      .withIndex("by_watchId", (q) => q.eq("watchId", watchId))
      .order("desc")
      .take(20);
    const recentChecks = await ctx.db
      .query("checks")
      .withIndex("by_watchId", (q) => q.eq("watchId", watchId))
      .order("desc")
      .take(8);
    const recentSources = await ctx.db
      .query("snapshots")
      .withIndex("by_watchId", (q) => q.eq("watchId", watchId))
      .order("desc")
      .take(3);
    const ids = [
      ...new Set([
        ...events.flatMap((event) =>
          event.citations.map((citation) => citation.snapshotId),
        ),
        ...recentSources.map((snapshot) => snapshot._id),
      ]),
    ];
    const snapshots = (
      await Promise.all(ids.map((id) => ctx.db.get(id)))
    ).filter(
      (snapshot): snapshot is Doc<"snapshots"> =>
        snapshot !== null && snapshot.watchId === watchId,
    );
    return { watch, events, snapshots, recentChecks };
  },
});

async function queueCheck(
  ctx: MutationCtx,
  watchId: Id<"watches">,
  trigger: "manual" | "daily",
): Promise<Id<"checks"> | null> {
  const watch = await ctx.db.get(watchId);
  if (!watch || watch.archived) throw new Error("This watch is archived.");
  if (watch.activeCheckId) {
    const active = await ctx.db.get(watch.activeCheckId);
    if (active && (active.state === "queued" || active.state === "running")) {
      if (Date.now() - (active.startedAt ?? active._creationTime) < 10 * MINUTE)
        return active._id;
      await ctx.db.patch(active._id, {
        state: "failed",
        completedAt: Date.now(),
        message: "This check was interrupted. A new check can retry it.",
      });
    }
  }
  if (trigger === "manual")
    await limits.limit(ctx, "checkBurst", { key: watch.userId, throws: true });
  for (const [name, key] of [
    ["userChecks", watch.userId],
    ["globalChecks", "all"],
    ["globalHourly", "all"],
  ] as const) {
    const result = await limits.limit(ctx, name, { key });
    if (!result.ok) {
      if (trigger === "manual")
        throw new Error(
          "The research check allowance is used for now. Your saved evidence is still available. Please try again later.",
        );
      return null;
    }
  }
  const id = await ctx.db.insert("checks", {
    watchId,
    state: "queued",
    trigger,
    sourceCount: 0,
    newEvents: 0,
    rejectedEvents: 0,
    sourceResults: [],
  });
  await ctx.db.patch(watchId, {
    activeCheckId: id,
    lastCheckState: "queued",
    lastCheckAt: Date.now(),
  });
  await ctx.scheduler.runAfter(0, internal.research.run, { checkId: id });
  return id;
}

export const create = userMutation({
  args: {
    symbol: v.string(),
    question: v.string(),
    dailyEnabled: v.optional(v.boolean()),
  },
  returns: v.id("watches"),
  handler: async (ctx, args) => {
    companyFor(args.symbol);
    const question = cleanQuestion(args.question);
    const active = await ctx.db
      .query("watches")
      .withIndex("by_userId_and_archived", (q) =>
        q.eq("userId", ctx.userId).eq("archived", false),
      )
      .take(10);
    if (active.length >= 10)
      throw new Error(
        "Keep up to 10 active research watches. Archive a watch to make room.",
      );
    await limits.limit(ctx, "createWatch", { key: ctx.userId, throws: true });
    const watchId = await ctx.db.insert("watches", {
      userId: ctx.userId,
      symbol: args.symbol,
      question,
      dailyEnabled: args.dailyEnabled ?? false,
      notifyEnabled: false,
      archived: false,
      ...(args.dailyEnabled ? { nextCheckAt: Date.now() + DAY } : {}),
    });
    await queueCheck(ctx, watchId, "manual");
    return watchId;
  },
});

export const checkLatest = userMutation({
  args: { watchId: v.id("watches") },
  returns: v.id("checks"),
  handler: async (ctx, { watchId }) => {
    await owned(ctx, ctx.userId, watchId);
    const id = await queueCheck(ctx, watchId, "manual");
    if (!id)
      throw new Error("The check could not be queued. Please retry later.");
    return id;
  },
});

export const setDaily = userMutation({
  args: { watchId: v.id("watches"), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { watchId, enabled }) => {
    const watch = await owned(ctx, ctx.userId, watchId);
    if (watch.archived) throw new Error("This watch is archived.");
    await ctx.db.patch(watchId, {
      dailyEnabled: enabled,
      nextCheckAt: enabled
        ? (watch.nextCheckAt ?? Date.now() + DAY)
        : undefined,
    });
    return null;
  },
});

export const archive = userMutation({
  args: { watchId: v.id("watches") },
  returns: v.null(),
  handler: async (ctx, { watchId }) => {
    await owned(ctx, ctx.userId, watchId);
    await ctx.db.patch(watchId, {
      archived: true,
      dailyEnabled: false,
      notifyEnabled: false,
      nextCheckAt: undefined,
    });
    return null;
  },
});

export const dispatchDaily = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const due = await ctx.db
      .query("watches")
      .withIndex("by_dailyEnabled_and_archived_and_nextCheckAt", (q) =>
        q
          .eq("dailyEnabled", true)
          .eq("archived", false)
          .lte("nextCheckAt", Date.now()),
      )
      .take(20);
    for (const watch of due) {
      await ctx.db.patch(watch._id, { nextCheckAt: Date.now() + DAY });
      await queueCheck(ctx, watch._id, "daily");
    }
    return null;
  },
});

export const forCheck = internalQuery({
  args: { checkId: v.id("checks") },
  returns: v.union(v.null(), v.object({ watch: watchDoc, check: checkDoc })),
  handler: async (ctx, { checkId }) => {
    const check = await ctx.db.get(checkId);
    if (!check || !["queued", "running"].includes(check.state)) return null;
    const watch = await ctx.db.get(check.watchId);
    if (!watch || watch.archived || watch.activeCheckId !== checkId)
      return null;
    return { watch, check };
  },
});
