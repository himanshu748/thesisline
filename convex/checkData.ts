import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { citation, eventKind, sourceResult, status } from "./validators";
import { officialUrl } from "./lib/companies";
import {
  eventIdentity,
  validateEvents,
  type CandidateEvent,
} from "./lib/evidence";

async function evidenceFingerprint(event: CandidateEvent) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(eventIdentity(event)),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export const start = internalMutation({
  args: { checkId: v.id("checks") },
  returns: v.boolean(),
  handler: async (ctx, { checkId }) => {
    const check = await ctx.db.get(checkId);
    if (!check || check.state !== "queued") return false;
    const watch = await ctx.db.get(check.watchId);
    if (!watch || watch.archived || watch.activeCheckId !== checkId)
      return false;
    await ctx.db.patch(checkId, { state: "running", startedAt: Date.now() });
    await ctx.db.patch(watch._id, { lastCheckState: "running" });
    return true;
  },
});

export const recordSnapshot = internalMutation({
  args: {
    checkId: v.id("checks"),
    url: v.string(),
    label: v.string(),
    contentHash: v.string(),
    content: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({ snapshotId: v.id("snapshots"), isNew: v.boolean() }),
  ),
  handler: async (ctx, args) => {
    const check = await ctx.db.get(args.checkId);
    if (!check || check.state !== "running") return null;
    const watch = await ctx.db.get(check.watchId);
    if (!watch || watch.archived || watch.activeCheckId !== check._id)
      return null;
    if (
      !officialUrl(watch.symbol, args.url) ||
      args.content.length > 24000 ||
      args.content.trim().length < 80 ||
      !/^[a-f0-9]{64}$/.test(args.contentHash)
    )
      throw new Error("Invalid source snapshot.");
    const existing = await ctx.db
      .query("snapshots")
      .withIndex("by_watchId_and_url_and_contentHash", (q) =>
        q
          .eq("watchId", watch._id)
          .eq("url", args.url)
          .eq("contentHash", args.contentHash),
      )
      .unique();
    if (existing) return { snapshotId: existing._id, isNew: false };
    const snapshotId = await ctx.db.insert("snapshots", {
      watchId: watch._id,
      url: args.url,
      label: args.label.slice(0, 160),
      content: args.content,
      contentHash: args.contentHash,
      fetchedAt: Date.now(),
    });
    return { snapshotId, isNew: true };
  },
});

export const complete = internalMutation({
  args: {
    checkId: v.id("checks"),
    inputHash: v.string(),
    sourceResults: v.array(sourceResult),
    rejectedEvents: v.number(),
    message: v.string(),
    events: v.array(
      v.object({
        title: v.string(),
        kind: eventKind,
        eventDate: v.union(v.string(), v.null()),
        dateEvidence: v.union(v.string(), v.null()),
        status,
        answer: v.string(),
        citations: v.array(citation),
        fingerprint: v.string(),
      }),
    ),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const check = await ctx.db.get(args.checkId);
    if (!check || check.state !== "running") return 0;
    const watch = await ctx.db.get(check.watchId);
    if (!watch || watch.archived || watch.activeCheckId !== check._id) return 0;
    if (
      args.events.length > 4 ||
      args.sourceResults.length > 3 ||
      !/^[a-f0-9]{64}$/.test(args.inputHash)
    )
      throw new Error("Invalid research result.");
    let newEvents = 0;
    let rejected = args.rejectedEvents;
    // A bounded compatibility pass covers pilot events written before stable
    // snapshot-based identities. New identities use the existing exact index.
    const previousEvents = await ctx.db
      .query("events")
      .withIndex("by_watchId", (q) => q.eq("watchId", watch._id))
      .order("desc")
      .take(100);
    for (const event of args.events) {
      const sources = [];
      for (const citation of event.citations) {
        const snapshot = await ctx.db.get(citation.snapshotId);
        if (!snapshot || snapshot.watchId !== watch._id)
          throw new Error("Citation does not belong to this watch.");
        sources.push({ id: snapshot._id, text: snapshot.content });
      }
      const candidate = {
        ...event,
        citations: event.citations.map((citation) => ({
          sourceId: citation.snapshotId,
          quote: citation.quote,
        })),
      };
      const validated = validateEvents([candidate], sources)[0];
      if (!validated || !/^[a-f0-9]{64}$/.test(event.fingerprint)) {
        rejected++;
        continue;
      }
      const identity = eventIdentity(validated);
      const fingerprint = await evidenceFingerprint(validated);
      const duplicate = await ctx.db
        .query("events")
        .withIndex("by_watchId_and_fingerprint", (q) =>
          q.eq("watchId", watch._id).eq("fingerprint", fingerprint),
        )
        .unique();
      if (duplicate) continue;
      const legacy = previousEvents.find(
        (previous) =>
          eventIdentity({
            ...previous,
            citations: previous.citations.map((citation) => ({
              sourceId: citation.snapshotId,
              quote: citation.quote,
            })),
          }) === identity,
      );
      if (legacy) {
        await ctx.db.patch(legacy._id, { fingerprint });
        continue;
      }
      await ctx.db.insert("events", {
        ...event,
        title: validated.title,
        answer: validated.answer,
        eventDate: validated.eventDate,
        dateEvidence: validated.dateEvidence,
        fingerprint,
        watchId: watch._id,
        checkId: check._id,
        firstSeenAt: Date.now(),
      });
      if (newEvents === 0)
        await ctx.db.patch(watch._id, {
          latestAnswer: validated.answer,
          latestStatus: validated.status,
        });
      newEvents++;
    }
    await ctx.db.patch(check._id, {
      state: "succeeded",
      completedAt: Date.now(),
      sourceCount: args.sourceResults.filter(
        (source) => source.state !== "failed",
      ).length,
      sourceResults: args.sourceResults,
      newEvents,
      rejectedEvents: rejected,
      message: args.message,
    });
    await ctx.db.patch(watch._id, {
      activeCheckId: undefined,
      lastCheckState: "succeeded",
      lastSuccessfulHash: args.inputHash,
    });
    const user = await ctx.db.get(watch.userId);
    if (
      newEvents > 0 &&
      watch.notifyEnabled &&
      user?.email &&
      typeof user.emailVerificationTime === "number"
    ) {
      const delivery = await ctx.db
        .query("alertDeliveries")
        .withIndex("by_checkId", (q) => q.eq("checkId", check._id))
        .unique();
      if (!delivery) {
        const deliveryId = await ctx.db.insert("alertDeliveries", {
          watchId: watch._id,
          checkId: check._id,
          userId: watch.userId,
          state: "pending",
        });
        await ctx.scheduler.runAfter(0, internal.mailDelivery.deliver, {
          deliveryId,
        });
      }
    }
    return newEvents;
  },
});

// Deployment-maintenance hook for earlier pilot records. This uses saved
// evidence only, never runs a provider or queues an alert, and preserves the
// original source snapshots. It is intentionally unavailable to public clients.
export const revalidateSavedEvidence = internalMutation({
  args: { watchId: v.id("watches") },
  returns: v.object({ updated: v.number(), skipped: v.number() }),
  handler: async (ctx, { watchId }) => {
    const watch = await ctx.db.get(watchId);
    if (!watch) return { updated: 0, skipped: 0 };
    const events = await ctx.db
      .query("events")
      .withIndex("by_watchId", (q) => q.eq("watchId", watchId))
      .order("desc")
      .take(20);
    let updated = 0;
    let skipped = 0;
    for (const event of events) {
      const snapshots = await Promise.all(
        event.citations.map((citation) => ctx.db.get(citation.snapshotId)),
      );
      if (
        snapshots.some((snapshot) => !snapshot || snapshot.watchId !== watchId)
      ) {
        skipped++;
        continue;
      }
      const validated = validateEvents(
        [
          {
            ...event,
            citations: event.citations.map((citation) => ({
              sourceId: citation.snapshotId,
              quote: citation.quote,
            })),
          },
        ],
        snapshots.map((snapshot) => ({
          id: snapshot!._id,
          text: snapshot!.content,
        })),
      )[0];
      if (!validated) {
        skipped++;
        continue;
      }
      const canonical = await evidenceFingerprint(validated);
      const existing = await ctx.db
        .query("events")
        .withIndex("by_watchId_and_fingerprint", (q) =>
          q.eq("watchId", watchId).eq("fingerprint", canonical),
        )
        .unique();
      const fields = {
        title: validated.title,
        answer: validated.answer,
        eventDate: validated.eventDate,
        dateEvidence: validated.dateEvidence,
        fingerprint:
          existing && existing._id !== event._id
            ? event.fingerprint
            : canonical,
      };
      if (
        Object.entries(fields).some(
          ([key, value]) => event[key as keyof typeof fields] !== value,
        )
      ) {
        await ctx.db.patch(event._id, fields);
        if (watch.latestAnswer === event.answer)
          await ctx.db.patch(watchId, {
            latestAnswer: validated.answer,
            latestStatus: validated.status,
          });
        updated++;
      }
    }
    return { updated, skipped };
  },
});

export const fail = internalMutation({
  args: {
    checkId: v.id("checks"),
    message: v.string(),
    sourceResults: v.array(sourceResult),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const check = await ctx.db.get(args.checkId);
    if (!check || !["queued", "running"].includes(check.state)) return null;
    await ctx.db.patch(check._id, {
      state: "failed",
      completedAt: Date.now(),
      message: args.message.slice(0, 300),
      sourceResults: args.sourceResults.slice(0, 3),
      sourceCount: args.sourceResults.filter(
        (source) => source.state !== "failed",
      ).length,
    });
    const watch = await ctx.db.get(check.watchId);
    if (watch?.activeCheckId === check._id)
      await ctx.db.patch(watch._id, {
        activeCheckId: undefined,
        lastCheckState: "failed",
      });
    return null;
  },
});
