import { ConvexError, v } from "convex/values";
import { RateLimiter, MINUTE, HOUR, DAY } from "@convex-dev/rate-limiter";
import { internalMutation } from "./_generated/server";
import { components, internal } from "./_generated/api";

export const notificationLimits = new RateLimiter(components.rateLimiter, {
  verificationBurst: { kind: "fixed window", rate: 1, period: MINUTE },
  verificationUser: { kind: "fixed window", rate: 3, period: HOUR },
  verificationGlobal: { kind: "fixed window", rate: 20, period: DAY },
  alertUser: { kind: "fixed window", rate: 10, period: DAY },
  alertGlobal: { kind: "fixed window", rate: 30, period: DAY },
  retry: { kind: "fixed window", rate: 1, period: MINUTE },
});
export function mailConfigured() {
  return Boolean(
    process.env.AGENTMAIL_API_KEY &&
    process.env.AGENTMAIL_INBOX_ID &&
    process.env.SITE_URL?.startsWith("https://"),
  );
}
export async function verificationHash(nonce: string, code: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${nonce}:${code}`),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export const reserveVerification = internalMutation({
  args: { userId: v.id("users"), nonce: v.string(), codeHash: v.string() },
  returns: v.union(
    v.null(),
    v.object({ email: v.string(), nonce: v.string() }),
  ),
  handler: async (ctx, { userId, nonce, codeHash }) => {
    if (!mailConfigured())
      throw new ConvexError("Email verification is not configured yet.");
    const user = await ctx.db.get(userId);
    if (
      !user?.email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email) ||
      user.email.length > 254
    )
      throw new ConvexError("Your account needs a valid email address.");
    if (typeof user.emailVerificationTime === "number") return null;
    const existing = await ctx.db
      .query("emailVerifications")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (existing && Date.now() - existing.requestedAt < MINUTE)
      throw new ConvexError("Wait one minute before requesting another code.");
    for (const [name, key] of [
      ["verificationBurst", userId],
      ["verificationUser", userId],
      ["verificationGlobal", "all"],
    ] as const) {
      const result = await notificationLimits.limit(ctx, name, { key });
      if (!result.ok)
        throw new ConvexError(
          "The verification email allowance is used for now. Please try later.",
        );
    }
    const email = user.email.trim().toLowerCase();
    const value = {
      userId,
      email,
      nonce,
      codeHash,
      requestedAt: Date.now(),
      expiresAt: Date.now() + 15 * MINUTE,
      attempts: 0,
      state: "pending" as const,
      error: undefined,
    };
    if (existing) await ctx.db.patch(existing._id, value);
    else await ctx.db.insert("emailVerifications", value);
    return { email, nonce };
  },
});
export const verificationResult = internalMutation({
  args: { userId: v.id("users"), nonce: v.string(), ok: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { userId, nonce, ok }) => {
    const row = await ctx.db
      .query("emailVerifications")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (row?.nonce === nonce && row.state !== "verified")
      await ctx.db.patch(row._id, {
        state: ok ? "sent" : "failed",
        error: ok
          ? undefined
          : "The email service did not confirm delivery. Request a new code after the cooldown.",
      });
    return null;
  },
});

const claimedMail = v.object({
  recipient: v.string(),
  sender: v.string(),
  subject: v.string(),
  text: v.string(),
  attempt: v.number(),
});
export const claim = internalMutation({
  args: { deliveryId: v.id("alertDeliveries"), leaseToken: v.string() },
  returns: v.union(v.null(), claimedMail),
  handler: async (ctx, { deliveryId, leaseToken }) => {
    const delivery = await ctx.db.get(deliveryId);
    if (
      !delivery ||
      delivery.state === "sent" ||
      delivery.state === "cancelled"
    )
      return null;
    if (delivery.state === "failed" && !delivery.retryable) return null;
    const now = Date.now();
    if (delivery.state === "sending" && (delivery.leaseUntil ?? 0) > now)
      return null;
    if ((delivery.nextAttemptAt ?? 0) > now) return null;
    const watch = await ctx.db.get(delivery.watchId);
    const user = await ctx.db.get(delivery.userId);
    const check = await ctx.db.get(delivery.checkId);
    if (
      !watch ||
      watch.userId !== delivery.userId ||
      watch.archived ||
      !watch.notifyEnabled ||
      !user?.email ||
      typeof user.emailVerificationTime !== "number" ||
      check?.state !== "succeeded" ||
      check.watchId !== watch._id ||
      check.newEvents < 1 ||
      (delivery.recipient &&
        delivery.recipient !== user.email.trim().toLowerCase())
    ) {
      await ctx.db.patch(deliveryId, {
        state: "cancelled",
        error: "Alerts were turned off or the verified recipient changed.",
        retryable: false,
      });
      return null;
    }
    if (
      (delivery.attempts ?? 0) >= 3 ||
      (delivery.firstAttemptAt && now - delivery.firstAttemptAt >= HOUR)
    ) {
      await ctx.db.patch(deliveryId, {
        state: "failed",
        retryable: false,
        error: "The retry window closed. This alert will not be resent.",
      });
      return null;
    }
    if (!mailConfigured()) {
      await ctx.db.patch(deliveryId, {
        state: "failed",
        retryable: false,
        error: "Email alerts are not configured.",
      });
      return null;
    }
    let recipient = delivery.recipient;
    let sender = delivery.sender;
    let subject = delivery.subject;
    let text = delivery.text;
    if (!recipient || !sender || !subject || !text) {
      const events = await ctx.db
        .query("events")
        .withIndex("by_checkId", (q) => q.eq("checkId", check._id))
        .take(4);
      if (!events.length) {
        await ctx.db.patch(deliveryId, {
          state: "cancelled",
          retryable: false,
          error: "No new saved evidence belongs to this check.",
        });
        return null;
      }
      for (const [name, key] of [
        ["alertUser", delivery.userId],
        ["alertGlobal", "all"],
      ] as const) {
        const limit = await notificationLimits.limit(ctx, name, { key });
        if (!limit.ok) {
          await ctx.db.patch(deliveryId, {
            state: "failed",
            retryable: false,
            error:
              "The daily email allowance is used. Your new evidence remains in the workspace.",
          });
          return null;
        }
      }
      recipient = user.email.trim().toLowerCase();
      sender = process.env.AGENTMAIL_INBOX_ID!;
      subject = `ThesisLine: new evidence for ${watch.symbol}`;
      const link = `${process.env.SITE_URL!.replace(/\/$/, "")}/#watch=${watch._id}`;
      const sections = [];
      for (const event of events) {
        const citations = [];
        for (const citation of event.citations.slice(0, 3)) {
          const snapshot = await ctx.db.get(citation.snapshotId);
          if (snapshot?.watchId === watch._id)
            citations.push(
              `${snapshot.label}\n${snapshot.url}\n“${citation.quote.slice(0, 500)}”`,
            );
        }
        sections.push(
          `${event.title}\nEvent date: ${event.eventDate ?? "Date not confirmed"}\nResearch assessment: ${event.status}\n${event.answer}\n${citations.join("\n\n")}`,
        );
      }
      text = `New saved evidence for your research question:\n${watch.question}\n\n${sections.join("\n\n---\n\n")}\n\nReview the evidence and source receipts:\n${link}\n\nTo stop these alerts, open this watch and switch off Email alerts. Archiving the watch also stops future alerts.\n\nResearch notes, not trading instructions or a guarantee. Read the original sources. Replies to this email do not enter ThesisLine.\n\nSent through the shared research sender ${sender}.`;
    }
    if (!recipient || !sender || !subject || !text)
      throw new Error("The alert envelope is incomplete.");
    const attempt = (delivery.attempts ?? 0) + 1;
    await ctx.db.patch(deliveryId, {
      state: "sending",
      attempts: attempt,
      firstAttemptAt: delivery.firstAttemptAt ?? now,
      leaseToken,
      leaseUntil: now + 90_000,
      recipient,
      sender,
      subject,
      text,
      error: undefined,
      nextAttemptAt: undefined,
    });
    // A stalled action can be retried with the same frozen request and provider key.
    await ctx.scheduler.runAfter(95_000, internal.mailDelivery.deliver, {
      deliveryId,
    });
    return { recipient, sender, subject, text, attempt };
  },
});

export const finish = internalMutation({
  args: {
    deliveryId: v.id("alertDeliveries"),
    leaseToken: v.string(),
    messageId: v.optional(v.string()),
    retryable: v.boolean(),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.deliveryId);
    if (!row || row.state !== "sending" || row.leaseToken !== args.leaseToken)
      return null;
    if (args.messageId) {
      await ctx.db.patch(row._id, {
        state: "sent",
        messageId: args.messageId,
        sentAt: Date.now(),
        leaseUntil: undefined,
        error: undefined,
        retryable: false,
      });
    } else {
      const retryable =
        args.retryable &&
        (row.attempts ?? 0) < 3 &&
        Date.now() - (row.firstAttemptAt ?? row._creationTime) < HOUR;
      const delay = (row.attempts ?? 0) === 1 ? MINUTE : 5 * MINUTE;
      await ctx.db.patch(row._id, {
        state: "failed",
        retryable,
        error: args.error ?? "The email send could not be confirmed.",
        leaseUntil: undefined,
        nextAttemptAt: retryable ? Date.now() + delay : undefined,
      });
      if (retryable)
        await ctx.scheduler.runAfter(delay, internal.mailDelivery.deliver, {
          deliveryId: row._id,
        });
    }
    return null;
  },
});
