import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { createHash } from "node:crypto";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";

const modules = import.meta.glob("../convex/**/*.ts");
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const content =
  "On July 23, 2026, the company reported large-deal wins of $3.8 billion. Revenue guidance was unchanged.";
const quote = "the company reported large-deal wins of $3.8 billion.";

async function setup(verified = false, enabled = false) {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const [userId, otherId] = await t.run((ctx) =>
    Promise.all([
      ctx.db.insert("users", {
        email: "owner@example.test",
        ...(verified ? { emailVerificationTime: Date.now() } : {}),
      }),
      ctx.db.insert("users", { email: "other@example.test" }),
    ]),
  );
  const owner = t.withIdentity({ subject: `${userId}|session` });
  const other = t.withIdentity({ subject: `${otherId}|session` });
  const watchId = await t.run((ctx) =>
    ctx.db.insert("watches", {
      userId,
      symbol: "INFY",
      question: "Is large-deal momentum improving?",
      dailyEnabled: false,
      notifyEnabled: enabled,
      archived: false,
    }),
  );
  const checkId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("checks", {
      watchId,
      state: "running",
      trigger: "manual",
      startedAt: Date.now(),
      sourceCount: 0,
      sourceResults: [],
      newEvents: 0,
      rejectedEvents: 0,
    });
    await ctx.db.patch(watchId, { activeCheckId: id });
    return id;
  });
  const snapshotId = await t.run((ctx) =>
    ctx.db.insert("snapshots", {
      watchId,
      url: "https://www.infosys.com/investors/results.html",
      label: "Official results",
      content,
      contentHash: hash(content),
      fetchedAt: Date.now(),
    }),
  );
  const event = {
    title: "Deal wins",
    kind: "results" as const,
    eventDate: "2026-07-23",
    dateEvidence: "July 23, 2026",
    status: "unclear" as const,
    answer:
      "Deal wins were reported; this alone does not establish an improving trend.",
    fingerprint: hash("event"),
    citations: [{ snapshotId, quote }],
  };
  const complete = (events = [event]) =>
    t.mutation(internal.checkData.complete, {
      checkId,
      inputHash: hash("input"),
      sourceResults: [],
      rejectedEvents: 0,
      message: "Complete",
      events,
    });
  const delivery = () =>
    t.run((ctx) =>
      ctx.db
        .query("alertDeliveries")
        .withIndex("by_checkId", (q) => q.eq("checkId", checkId))
        .unique(),
    );
  return { t, owner, other, userId, watchId, checkId, complete, delivery };
}
function transport(status = 200) {
  const mock = vi.fn(
    async (_url: string, _init: RequestInit) =>
      new Response(
        JSON.stringify({
          message_id: "fixture-message",
          thread_id: "fixture-thread",
        }),
        { status, headers: { "content-type": "application/json" } },
      ),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}
function codeFrom(mock: ReturnType<typeof transport>) {
  const body = JSON.parse(mock.mock.calls.at(-1)![1].body as string);
  return /\n(\d{8})\n/.exec(body.text)![1];
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("AGENTMAIL_API_KEY", "fixture-no-network");
  vi.stubEnv("AGENTMAIL_INBOX_ID", "sender@example.test");
  vi.stubEnv("SITE_URL", "https://example.test");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

test("verification emails only the signed-in address and stores a digest, then consumes the code once", async () => {
  const { t, owner, other, userId, watchId } = await setup();
  const mock = transport();
  await expect(
    t.action(api.notifications.requestVerification, {}),
  ).rejects.toThrow("Sign in");
  await owner.action(api.notifications.requestVerification, {});
  const body = JSON.parse(mock.mock.calls[0][1].body as string);
  expect(body.to).toEqual(["owner@example.test"]);
  const code = codeFrom(mock);
  const stored = await t.run((ctx) =>
    ctx.db
      .query("emailVerifications")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique(),
  );
  expect(stored?.codeHash).toHaveLength(64);
  expect(JSON.stringify(stored)).not.toContain(code);
  expect((await other.mutation(api.notifications.verify, { code })).ok).toBe(
    false,
  );
  expect((await owner.mutation(api.notifications.verify, { code })).ok).toBe(
    true,
  );
  expect((await owner.mutation(api.notifications.verify, { code })).ok).toBe(
    false,
  );
  expect(
    (await owner.query(api.notifications.status, { watchId }))?.verified,
  ).toBe(true);
  expect(
    (await owner.query(api.notifications.status, { watchId }))?.enabled,
  ).toBe(false);
});

test("verification enforces cooldown, newest-code replacement, expiry and a five-guess budget", async () => {
  const { owner } = await setup();
  const mock = transport();
  await owner.action(api.notifications.requestVerification, {});
  const old = codeFrom(mock);
  await expect(
    owner.action(api.notifications.requestVerification, {}),
  ).rejects.toThrow("Wait one minute");
  vi.setSystemTime(Date.now() + 61_000);
  await owner.action(api.notifications.requestVerification, {});
  const current = codeFrom(mock);
  expect(
    (await owner.mutation(api.notifications.verify, { code: old })).ok,
  ).toBe(false);
  for (let i = 0; i < 4; i++)
    expect(
      (await owner.mutation(api.notifications.verify, { code: "invalid" })).ok,
    ).toBe(false);
  expect(
    (await owner.mutation(api.notifications.verify, { code: current })).ok,
  ).toBe(false);
  vi.setSystemTime(Date.now() + 61_000);
  await owner.action(api.notifications.requestVerification, {});
  vi.setSystemTime(Date.now() + 15 * 60_000);
  expect(
    (await owner.mutation(api.notifications.verify, { code: codeFrom(mock) }))
      .ok,
  ).toBe(false);
});

test("changing the account address invalidates its pending code and send failures are honest", async () => {
  const { t, owner, userId } = await setup();
  const mock = transport();
  await owner.action(api.notifications.requestVerification, {});
  const code = codeFrom(mock);
  await t.run((ctx) => ctx.db.patch(userId, { email: "changed@example.test" }));
  expect((await owner.mutation(api.notifications.verify, { code })).ok).toBe(
    false,
  );
  vi.setSystemTime(Date.now() + 61_000);
  mock.mockResolvedValue(new Response("Unavailable", { status: 503 }));
  expect(
    (await owner.action(api.notifications.requestVerification, {})).ok,
  ).toBe(false);
  expect(
    (await owner.query(api.notifications.status, {}))?.verification?.state,
  ).toBe("failed");
});

test("alerts require a verified owner opt-in and zero-new-evidence checks do not queue mail", async () => {
  const first = await setup();
  await expect(
    first.owner.mutation(api.notifications.setEnabled, {
      watchId: first.watchId,
      enabled: true,
    }),
  ).rejects.toThrow("Verify");
  await expect(
    first.other.query(api.notifications.status, { watchId: first.watchId }),
  ).rejects.toThrow("not found");
  await expect(
    first.other.mutation(api.notifications.setEnabled, {
      watchId: first.watchId,
      enabled: false,
    }),
  ).rejects.toThrow("not found");
  await first.complete();
  expect(await first.delivery()).toBeNull();
  const second = await setup(true, true);
  await second.complete([]);
  expect(await second.delivery()).toBeNull();
});

test("new evidence queues one delivery; opt-out before dispatch cancels it without a provider call", async () => {
  const { t, owner, watchId, complete, delivery } = await setup(true, true);
  const mock = transport();
  expect(await complete()).toBe(1);
  expect(await complete()).toBe(0);
  const row = (await delivery())!;
  expect(
    await t.run((ctx) => ctx.db.query("alertDeliveries").collect()),
  ).toHaveLength(1);
  await owner.mutation(api.notifications.setEnabled, {
    watchId,
    enabled: false,
  });
  await t.action(internal.mailDelivery.deliver, { deliveryId: row._id });
  expect(mock).not.toHaveBeenCalled();
  expect((await delivery())?.state).toBe("cancelled");
});

test("delivery contains saved citations, uses a stable provider key, and cannot send twice after success", async () => {
  const { t, owner, watchId, complete, delivery } = await setup(true, true);
  const mock = transport();
  await complete();
  const id = (await delivery())!._id;
  await t.action(internal.mailDelivery.deliver, { deliveryId: id });
  await t.action(internal.mailDelivery.deliver, { deliveryId: id });
  expect(mock).toHaveBeenCalledTimes(1);
  expect(mock.mock.calls[0][1].headers).toMatchObject({
    "Idempotency-Key": `thesisline-alert-${id}`,
  });
  const body = JSON.parse(mock.mock.calls[0][1].body as string);
  expect(body.text).toContain(quote);
  expect(body.text).toContain("https://www.infosys.com/investors/results.html");
  expect(body.text).toContain("switch off Email alerts");
  expect(
    (await owner.query(api.notifications.status, { watchId }))?.delivery,
  ).toMatchObject({ state: "sent", attempts: 1, canRetry: false });
});

test("ambiguous failures retry the frozen payload and same key, then stop after three attempts", async () => {
  const { t, complete, delivery, watchId } = await setup(true, true);
  const mock = transport(503);
  await complete();
  const id = (await delivery())!._id;
  await t.action(internal.mailDelivery.deliver, { deliveryId: id });
  await t.run((ctx) =>
    ctx.db.patch(watchId, {
      question: "A later edited question must not change a pending message",
    }),
  );
  vi.setSystemTime(Date.now() + 61_000);
  await t.action(internal.mailDelivery.deliver, { deliveryId: id });
  vi.setSystemTime(Date.now() + 301_000);
  await t.action(internal.mailDelivery.deliver, { deliveryId: id });
  vi.setSystemTime(Date.now() + 301_000);
  await t.action(internal.mailDelivery.deliver, { deliveryId: id });
  expect(mock).toHaveBeenCalledTimes(3);
  expect(new Set(mock.mock.calls.map((call) => call[1].body))).toHaveLength(1);
  expect(await delivery()).toMatchObject({
    state: "failed",
    attempts: 3,
    retryable: false,
  });
});

test("a concurrent worker cannot claim an active lease and stale completion cannot overwrite the receipt", async () => {
  const { t, complete, delivery } = await setup(true, true);
  await complete();
  const deliveryId = (await delivery())!._id;
  expect(
    await t.mutation(internal.notificationData.claim, {
      deliveryId,
      leaseToken: "first",
    }),
  ).toBeTruthy();
  expect(
    await t.mutation(internal.notificationData.claim, {
      deliveryId,
      leaseToken: "second",
    }),
  ).toBeNull();
  await t.mutation(internal.notificationData.finish, {
    deliveryId,
    leaseToken: "stale",
    messageId: "wrong",
    retryable: false,
  });
  expect((await delivery())?.state).toBe("sending");
  await t.mutation(internal.notificationData.finish, {
    deliveryId,
    leaseToken: "first",
    messageId: "correct",
    retryable: false,
  });
  expect((await delivery())?.messageId).toBe("correct");
});

test("definitive rejection and an expired idempotency safety window do not resend", async () => {
  const { t, complete, delivery } = await setup(true, true);
  const mock = transport(403);
  await complete();
  const id = (await delivery())!._id;
  await t.action(internal.mailDelivery.deliver, { deliveryId: id });
  vi.setSystemTime(Date.now() + 96_000);
  await t.action(internal.mailDelivery.deliver, { deliveryId: id });
  expect(mock).toHaveBeenCalledTimes(1);
  await t.run((ctx) => ctx.db.patch(id, { state: "failed", retryable: true }));
  vi.setSystemTime(Date.now() + 3_600_000);
  await t.action(internal.mailDelivery.deliver, { deliveryId: id });
  expect(mock).toHaveBeenCalledTimes(1);
  expect((await delivery())?.retryable).toBe(false);
});
