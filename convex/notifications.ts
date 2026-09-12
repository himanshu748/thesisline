import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  verificationHash,
  mailConfigured,
  notificationLimits,
} from "./notificationData";

const verificationView = v.union(
  v.null(),
  v.object({
    state: v.string(),
    expiresAt: v.number(),
    canRetryAt: v.number(),
    error: v.union(v.string(), v.null()),
  }),
);
const deliveryView = v.union(
  v.null(),
  v.object({
    state: v.string(),
    attempts: v.number(),
    sentAt: v.union(v.number(), v.null()),
    error: v.union(v.string(), v.null()),
    canRetry: v.boolean(),
  }),
);

export const status = query({
  args: { watchId: v.optional(v.id("watches")) },
  returns: v.union(
    v.null(),
    v.object({
      email: v.union(v.string(), v.null()),
      verified: v.boolean(),
      configured: v.boolean(),
      verification: verificationView,
      enabled: v.union(v.boolean(), v.null()),
      delivery: deliveryView,
    }),
  ),
  handler: async (ctx, { watchId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const verification = await ctx.db
      .query("emailVerifications")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const watch = watchId ? await ctx.db.get(watchId) : null;
    if (watchId && (!watch || watch.userId !== userId))
      throw new ConvexError("Research watch not found.");
    const delivery = watchId
      ? await ctx.db
          .query("alertDeliveries")
          .withIndex("by_watchId", (q) => q.eq("watchId", watchId))
          .order("desc")
          .first()
      : null;
    return {
      email: user.email ?? null,
      verified: typeof user.emailVerificationTime === "number",
      configured: mailConfigured(),
      enabled: watch ? watch.notifyEnabled : null,
      verification: verification
        ? {
            state: verification.state,
            expiresAt: verification.expiresAt,
            canRetryAt: verification.requestedAt + 60_000,
            error: verification.error ?? null,
          }
        : null,
      delivery: delivery
        ? {
            state: delivery.state,
            attempts: delivery.attempts ?? 0,
            sentAt: delivery.sentAt ?? null,
            error: delivery.error ?? null,
            canRetry:
              delivery.state === "failed" &&
              Boolean(delivery.retryable) &&
              (delivery.attempts ?? 0) < 3 &&
              Date.now() - (delivery.firstAttemptAt ?? delivery._creationTime) <
                3_600_000 &&
              Boolean(watch?.notifyEnabled && !watch.archived),
          }
        : null,
    };
  },
});

export const requestVerification = action({
  args: {},
  returns: v.object({ ok: v.boolean(), message: v.string() }),
  handler: async (ctx): Promise<{ ok: boolean; message: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Sign in before verifying your email.");
    return await ctx.runAction(internal.mailDelivery.verifyAddress, { userId });
  },
});

export const verify = mutation({
  args: { code: v.string() },
  returns: v.object({ ok: v.boolean(), message: v.string() }),
  handler: async (ctx, { code }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Sign in before verifying your email.");
    const user = await ctx.db.get(userId);
    const record = await ctx.db
      .query("emailVerifications")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (
      !record ||
      !user?.email ||
      record.email !== user.email.trim().toLowerCase() ||
      record.state === "verified" ||
      Date.now() >= record.expiresAt ||
      record.attempts >= 5
    )
      return {
        ok: false,
        message: "This code is unavailable or expired. Request a new code.",
      };
    const guess = code.trim();
    const matches =
      /^\d{8}$/.test(guess) &&
      (await verificationHash(record.nonce, guess)) === record.codeHash;
    if (!matches) {
      await ctx.db.patch(record._id, { attempts: record.attempts + 1 });
      return {
        ok: false,
        message:
          record.attempts >= 4
            ? "Too many guesses. Request a new code after the cooldown."
            : "That code did not match. Use the newest email.",
      };
    }
    await ctx.db.patch(userId, { emailVerificationTime: Date.now() });
    await ctx.db.patch(record._id, {
      state: "verified",
      codeHash: "",
      attempts: record.attempts + 1,
    });
    return {
      ok: true,
      message: "Email verified. You can now enable alerts for a watch.",
    };
  },
});

export const setEnabled = mutation({
  args: { watchId: v.id("watches"), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { watchId, enabled }) => {
    const userId = await getAuthUserId(ctx);
    const watch = await ctx.db.get(watchId);
    if (!userId || !watch || watch.userId !== userId)
      throw new ConvexError("Research watch not found.");
    if (enabled) {
      const user = await ctx.db.get(userId);
      if (watch.archived) throw new ConvexError("This watch is archived.");
      if (!mailConfigured())
        throw new ConvexError("Email alerts are not configured yet.");
      if (!user?.email || typeof user.emailVerificationTime !== "number")
        throw new ConvexError(
          "Verify your account email before enabling alerts.",
        );
    }
    await ctx.db.patch(watchId, { notifyEnabled: enabled });
    return null;
  },
});

export const retry = mutation({
  args: { watchId: v.id("watches") },
  returns: v.object({ ok: v.boolean(), message: v.string() }),
  handler: async (ctx, { watchId }) => {
    const userId = await getAuthUserId(ctx);
    const watch = await ctx.db.get(watchId);
    if (!userId || !watch || watch.userId !== userId)
      throw new ConvexError("Research watch not found.");
    const delivery = await ctx.db
      .query("alertDeliveries")
      .withIndex("by_watchId", (q) => q.eq("watchId", watchId))
      .order("desc")
      .first();
    if (
      !delivery ||
      delivery.state !== "failed" ||
      !delivery.retryable ||
      (delivery.attempts ?? 0) >= 3 ||
      Date.now() - (delivery.firstAttemptAt ?? delivery._creationTime) >=
        3_600_000 ||
      !watch.notifyEnabled ||
      watch.archived
    )
      return {
        ok: false,
        message: "There is no retryable alert for this watch.",
      };
    const limit = await notificationLimits.limit(ctx, "retry", { key: userId });
    if (!limit.ok)
      return { ok: false, message: "Please wait a minute before retrying." };
    await ctx.db.patch(delivery._id, {
      state: "pending",
      nextAttemptAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.mailDelivery.deliver, {
      deliveryId: delivery._id,
    });
    return {
      ok: true,
      message: "Retry queued. It reuses the original email receipt key.",
    };
  },
});
