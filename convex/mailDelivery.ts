import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { verificationHash } from "./notificationData";

function randomCode() {
  let number: number;
  do {
    number = crypto.getRandomValues(new Uint32Array(1))[0];
  } while (number >= 4_200_000_000);
  return String(number % 100_000_000).padStart(8, "0");
}

type Envelope = {
  sender: string;
  recipient: string;
  subject: string;
  text: string;
};
export async function sendEnvelope(
  mail: Envelope,
  key: string,
): Promise<{ messageId?: string; retryable: boolean; error?: string }> {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  if (!apiKey)
    return { retryable: false, error: "Email alerts are not configured." };
  try {
    const response = await fetch(
      `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(mail.sender)}/messages/send`,
      {
        method: "POST",
        signal: AbortSignal.timeout(20_000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body: JSON.stringify({
          to: [mail.recipient],
          subject: mail.subject,
          text: mail.text,
        }),
      },
    );
    if (!response.ok)
      return {
        retryable:
          response.status === 429 ||
          response.status >= 500 ||
          response.status === 408,
        error:
          response.status === 429
            ? "The email provider is busy. A bounded retry is scheduled."
            : "The email provider did not accept this alert.",
      };
    const data: unknown = await response.json();
    const messageId =
      data && typeof data === "object" && "message_id" in data
        ? data.message_id
        : null;
    if (typeof messageId !== "string" || !messageId || messageId.length > 1000)
      return {
        retryable: true,
        error:
          "The provider did not return a message receipt. A retry will reuse the original key.",
      };
    return { messageId, retryable: false };
  } catch {
    return {
      retryable: true,
      error:
        "The email send could not be confirmed. A retry will reuse the original receipt key.",
    };
  }
}

export const verifyAddress = internalAction({
  args: { userId: v.id("users") },
  returns: v.object({ ok: v.boolean(), message: v.string() }),
  handler: async (
    ctx,
    { userId },
  ): Promise<{ ok: boolean; message: string }> => {
    const code = randomCode(),
      nonce = crypto.randomUUID();
    const reservation = await ctx.runMutation(
      internal.notificationData.reserveVerification,
      { userId, nonce, codeHash: await verificationHash(nonce, code) },
    );
    if (!reservation)
      return { ok: true, message: "Your email is already verified." };
    const result = await sendEnvelope(
      {
        sender: process.env.AGENTMAIL_INBOX_ID!,
        recipient: reservation.email,
        subject: "Verify your ThesisLine research alerts",
        text: `You requested email verification for your ThesisLine account.\n\nYour single-use code:\n${code}\n\nOpen ${process.env.SITE_URL}, sign in, and paste this code in Email alerts. It expires in 15 minutes. Only the newest code works. Verification does not turn on alerts: choose the watches you want afterward.\n\nIf you did not request this, ignore the email. Never share this code.`,
      },
      `thesisline-verify-${nonce}`,
    );
    await ctx.runMutation(internal.notificationData.verificationResult, {
      userId,
      nonce,
      ok: Boolean(result.messageId),
    });
    return result.messageId
      ? {
          ok: true,
          message: "Code sent. Check your account email, including spam.",
        }
      : {
          ok: false,
          message:
            "The email send was not confirmed. If the code arrives, it still works; otherwise request another after the cooldown.",
        };
  },
});

export const deliver = internalAction({
  args: { deliveryId: v.id("alertDeliveries") },
  returns: v.null(),
  handler: async (ctx, { deliveryId }) => {
    const leaseToken = crypto.randomUUID();
    const mail = await ctx.runMutation(internal.notificationData.claim, {
      deliveryId,
      leaseToken,
    });
    if (!mail) return null;
    const result = await sendEnvelope(mail, `thesisline-alert-${deliveryId}`);
    await ctx.runMutation(internal.notificationData.finish, {
      deliveryId,
      leaseToken,
      ...result,
    });
    return null;
  },
});
