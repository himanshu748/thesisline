import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { createHash } from "node:crypto";
const modules = import.meta.glob("../convex/**/*.ts");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const content =
  "On July 23, 2026, the company reported large-deal wins of $3.8 billion. Revenue guidance was unchanged.";

async function fixture() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const [userId, otherId] = await t.run(async (ctx) => [
    await ctx.db.insert("users", { email: "owner@example.test" }),
    await ctx.db.insert("users", { email: "other@example.test" }),
  ]);
  const owner = t.withIdentity({ subject: `${userId}|test-session` });
  const other = t.withIdentity({ subject: `${otherId}|other-session` });
  const watchId = await owner.mutation(api.watches.create, {
    symbol: "INFY",
    question: "Is the company reporting larger deal wins?",
  });
  const checkId = (await owner.query(api.watches.detail, { watchId })).watch
    .activeCheckId!;
  return { t, owner, other, watchId, checkId, userId };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe("private research workspace", () => {
  it("keeps watches owner-scoped", async () => {
    const { owner, other, watchId } = await fixture();
    expect(await other.query(api.watches.list, {})).toEqual([]);
    await expect(other.query(api.watches.detail, { watchId })).rejects.toThrow(
      "not found",
    );
    await expect(
      other.mutation(api.watches.checkLatest, { watchId }),
    ).rejects.toThrow("not found");
    await expect(
      other.mutation(api.watches.archive, { watchId }),
    ).rejects.toThrow("not found");
    expect((await owner.query(api.watches.list, {})).length).toBe(1);
  });
  it("requires authentication", async () => {
    const { t } = await fixture();
    await expect(t.query(api.watches.list, {})).rejects.toThrow("Sign in");
    expect(await t.query(api.watches.viewer, {})).toBeNull();
  });
  it("treats repeated clicks as the same queued check", async () => {
    const { owner, watchId, checkId } = await fixture();
    expect(await owner.mutation(api.watches.checkLatest, { watchId })).toBe(
      checkId,
    );
    expect(await owner.mutation(api.watches.checkLatest, { watchId })).toBe(
      checkId,
    );
    expect(
      (await owner.query(api.watches.detail, { watchId })).recentChecks,
    ).toHaveLength(1);
  });
  it("does not double-start a scheduled worker", async () => {
    const { t, checkId } = await fixture();
    expect(await t.mutation(internal.checkData.start, { checkId })).toBe(true);
    expect(await t.mutation(internal.checkData.start, { checkId })).toBe(false);
  });
  it("does not create duplicate daily schedules", async () => {
    const { t, owner, watchId } = await fixture();
    await owner.mutation(api.watches.setDaily, { watchId, enabled: true });
    await owner.mutation(api.watches.setDaily, { watchId, enabled: true });
    await t.run(async (ctx) =>
      ctx.db.patch(watchId, { nextCheckAt: Date.now() - 1 }),
    );
    await t.mutation(internal.watches.dispatchDaily, {});
    await t.mutation(internal.watches.dispatchDaily, {});
    const detail = await owner.query(api.watches.detail, { watchId });
    expect(detail.recentChecks).toHaveLength(1);
    expect(detail.watch.nextCheckAt).toBeGreaterThan(Date.now());
  });
  it("archives a watch and disables future checks", async () => {
    const { t, owner, watchId, checkId } = await fixture();
    await owner.mutation(api.watches.setDaily, { watchId, enabled: true });
    await owner.mutation(api.watches.archive, { watchId });
    expect(await owner.query(api.watches.list, {})).toHaveLength(0);
    expect(await t.mutation(internal.checkData.start, { checkId })).toBe(false);
    await expect(
      owner.mutation(api.watches.checkLatest, { watchId }),
    ).rejects.toThrow("archived");
  });
  it("bounds active watches without spending a new check", async () => {
    const { t, owner, userId } = await fixture();
    await t.run(async (ctx) => {
      for (let i = 0; i < 9; i++)
        await ctx.db.insert("watches", {
          userId,
          symbol: "INFY",
          question: `What changed in question ${i}?`,
          archived: false,
          dailyEnabled: false,
          notifyEnabled: false,
        });
    });
    await expect(
      owner.mutation(api.watches.create, {
        symbol: "INFY",
        question: "Has revenue guidance changed?",
      }),
    ).rejects.toThrow("10 active");
    expect(await owner.query(api.watches.list, {})).toHaveLength(10);
  });
});
describe("immutable source evidence and recovery", () => {
  it("revalidates a saved pilot date without provider work or email side effects", async () => {
    const { t, owner, watchId, checkId, userId } = await fixture();
    await t.mutation(internal.checkData.start, { checkId });
    const snapshot = await t.mutation(internal.checkData.recordSnapshot, {
      checkId,
      url: "https://www.infosys.com/investors/results.html",
      label: "Results",
      content,
      contentHash: hash(content),
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { emailVerificationTime: Date.now() });
      await ctx.db.patch(watchId, { notifyEnabled: true });
      await ctx.db.insert("events", {
        watchId,
        checkId,
        title: "Results disclosure",
        kind: "results",
        status: "unclear",
        eventDate: null,
        dateEvidence: null,
        answer: "The company disclosed deal wins on July 23, 2026.",
        fingerprint: hash("legacy-record"),
        firstSeenAt: Date.now(),
        citations: [{ snapshotId: snapshot!.snapshotId, quote: content }],
      });
    });
    expect(
      await t.mutation(internal.checkData.revalidateSavedEvidence, { watchId }),
    ).toEqual({ updated: 1, skipped: 0 });
    expect(
      await t.mutation(internal.checkData.revalidateSavedEvidence, { watchId }),
    ).toEqual({ updated: 0, skipped: 0 });
    const detail = await owner.query(api.watches.detail, { watchId });
    expect(detail.events[0].eventDate).toBe("2026-07-23");
    expect(detail.events[0].dateEvidence).toBe("July 23, 2026");
    expect(detail.snapshots[0].content).toBe(content);
    expect(
      await t.run((ctx) => ctx.db.query("alertDeliveries").collect()),
    ).toHaveLength(0);
    expect(detail.recentChecks).toHaveLength(1);
  });
  it.each([false, true])(
    "only queues new evidence when its immutable source version changes (%s)",
    async (changedSource) => {
      const { t, owner, watchId, checkId, userId } = await fixture();
      await t.mutation(internal.checkData.start, { checkId });
      const snapshot = await t.mutation(internal.checkData.recordSnapshot, {
        checkId,
        url: "https://www.infosys.com/investors/results.html",
        label: "Official results",
        content,
        contentHash: hash(content),
      });
      const priorId = await t.run(async (ctx) => {
        await ctx.db.patch(userId, { emailVerificationTime: Date.now() });
        await ctx.db.patch(watchId, { notifyEnabled: true });
        return ctx.db.insert("events", {
          watchId,
          checkId,
          title: "Original model title",
          kind: "results",
          eventDate: "2026-07-23",
          dateEvidence: "July 23, 2026",
          status: "unclear",
          answer: "The company reported deal wins.",
          fingerprint: hash("legacy-quotation-based-identity"),
          firstSeenAt: Date.now() - 1,
          citations: [
            {
              snapshotId: snapshot!.snapshotId,
              quote: "the company reported large-deal wins of $3.8 billion.",
            },
          ],
        });
      });
      const nextSnapshot = changedSource
        ? await t.mutation(internal.checkData.recordSnapshot, {
            checkId,
            url: "https://www.infosys.com/investors/results.html",
            label: "Official results",
            content: `${content} A new official source revision was published.`,
            contentHash: hash(
              `${content} A new official source revision was published.`,
            ),
          })
        : snapshot;
      const added = await t.mutation(internal.checkData.complete, {
        checkId,
        inputHash: hash("changed-navigation-input"),
        sourceResults: [],
        rejectedEvents: 0,
        message: "Checked sources",
        events: [
          {
            title: "Different model title and excerpt",
            kind: "results",
            eventDate: "2026-07-23",
            dateEvidence: "July 23, 2026",
            status: "unclear",
            answer: "The company disclosed deal wins on July 23, 2026.",
            fingerprint: hash("different-quotation-fingerprint"),
            citations: [
              { snapshotId: nextSnapshot!.snapshotId, quote: content },
            ],
          },
        ],
      });
      expect(added).toBe(changedSource ? 1 : 0);
      expect(
        (await owner.query(api.watches.detail, { watchId })).events,
      ).toHaveLength(changedSource ? 2 : 1);
      const deliveries = await t.run((ctx) =>
        ctx.db.query("alertDeliveries").collect(),
      );
      expect(deliveries).toHaveLength(changedSource ? 1 : 0);
      if (!changedSource)
        expect(
          (await t.run((ctx) => ctx.db.get(priorId)))?.fingerprint,
        ).not.toBe(hash("legacy-quotation-based-identity"));
    },
  );
  it("persists the sanitized answer and recovered date at the write boundary", async () => {
    const { t, owner, watchId, checkId } = await fixture();
    await t.mutation(internal.checkData.start, { checkId });
    const snapshot = await t.mutation(internal.checkData.recordSnapshot, {
      checkId,
      url: "https://www.infosys.com/investors/results.html",
      label: "Results",
      content,
      contentHash: hash(content),
    });
    await t.mutation(internal.checkData.complete, {
      checkId,
      inputHash: hash("date-input"),
      sourceResults: [],
      rejectedEvents: 0,
      message: "Checked sources",
      events: [
        {
          title: "Results",
          kind: "results",
          status: "supports",
          eventDate: null,
          dateEvidence: null,
          answer:
            "Results were disclosed on July 23, 2026. A meeting is expected on August 20, 2026.",
          citations: [{ snapshotId: snapshot!.snapshotId, quote: content }],
          fingerprint: hash("unvalidated-action-output"),
        },
      ],
    });
    const detail = await owner.query(api.watches.detail, { watchId });
    expect(detail.events[0].eventDate).toBe("2026-07-23");
    expect(detail.events[0].dateEvidence).toBe("July 23, 2026");
    expect(detail.events[0].answer).not.toContain("August 20, 2026");
    expect(detail.watch.latestAnswer).toBe(detail.events[0].answer);
  });
  it("keeps saved evidence when the real research action receives provider failures", async () => {
    const { t, owner, watchId, checkId } = await fixture();
    await t.run(async (ctx) => {
      const priorCheckId = await ctx.db.insert("checks", {
        watchId,
        state: "succeeded",
        trigger: "manual",
        sourceCount: 1,
        sourceResults: [],
        newEvents: 1,
        rejectedEvents: 0,
      });
      const snapshotId = await ctx.db.insert("snapshots", {
        watchId,
        url: "https://www.infosys.com/investors/results.html",
        label: "Earlier official result",
        contentHash: hash(content),
        content,
        fetchedAt: Date.now() - 1000,
      });
      await ctx.db.insert("events", {
        watchId,
        checkId: priorCheckId,
        title: "Earlier results",
        kind: "results",
        eventDate: "2026-07-23",
        dateEvidence: "July 23, 2026",
        status: "unclear",
        answer: "Previously verified answer.",
        fingerprint: hash("prior"),
        citations: [
          {
            snapshotId,
            quote: "the company reported large-deal wins of $3.8 billion.",
          },
        ],
        firstSeenAt: Date.now() - 1000,
      });
      await ctx.db.patch(watchId, {
        latestAnswer: "Previously verified answer.",
        latestStatus: "unclear",
      });
    });
    vi.stubEnv("FIRECRAWL_API_KEY", "fixture-no-network");
    vi.stubEnv("AI_GATEWAY_API_KEY", "fixture-no-network");
    const fetchMock = vi.fn(
      async () =>
        new Response("Provider temporarily unavailable", { status: 503 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await t.action(internal.research.run, { checkId });
    const detail = await owner.query(api.watches.detail, { watchId });
    expect(fetchMock).toHaveBeenCalled();
    expect(detail.watch.lastCheckState).toBe("failed");
    expect(detail.watch.latestAnswer).toBe("Previously verified answer.");
    expect(detail.events).toHaveLength(1);
    expect(detail.events[0].title).toBe("Earlier results");
    const failed = detail.recentChecks.find((check) => check._id === checkId)!;
    expect(failed.sourceResults.length).toBeGreaterThan(0);
    expect(
      failed.sourceResults.every((source) => source.state === "failed"),
    ).toBe(true);
  });
  it("reuses an identical snapshot and preserves earlier text when it changes", async () => {
    const { t, checkId } = await fixture();
    await t.mutation(internal.checkData.start, { checkId });
    const args = {
      checkId,
      url: "https://www.infosys.com/investors/results.html",
      label: "Official result",
      content,
      contentHash: hash(content),
    };
    const first = await t.mutation(internal.checkData.recordSnapshot, args);
    const second = await t.mutation(internal.checkData.recordSnapshot, args);
    expect(second?.snapshotId).toBe(first?.snapshotId);
    expect(second?.isNew).toBe(false);
    const third = await t.mutation(internal.checkData.recordSnapshot, {
      ...args,
      content: `${content} More context.`,
      contentHash: hash(`${content} More context.`),
    });
    expect(third?.snapshotId).not.toBe(first?.snapshotId);
    expect(
      (await t.run(async (ctx) => ctx.db.get(first!.snapshotId)))?.content,
    ).toBe(content);
  });
  it("keeps prior evidence and answer after a failed provider check", async () => {
    const { t, owner, watchId, checkId } = await fixture();
    await t.run(async (ctx) =>
      ctx.db.patch(watchId, {
        latestAnswer: "Previously verified answer.",
        latestStatus: "unclear",
      }),
    );
    await t.mutation(internal.checkData.fail, {
      checkId,
      message: "Provider unavailable",
      sourceResults: [],
    });
    const detail = await owner.query(api.watches.detail, { watchId });
    expect(detail.watch.latestAnswer).toBe("Previously verified answer.");
    expect(detail.watch.lastCheckState).toBe("failed");
    expect(detail.watch.activeCheckId).toBeUndefined();
  });
  it("rejects unsupported citations again at the persistence boundary", async () => {
    const { t, owner, watchId, checkId } = await fixture();
    await t.mutation(internal.checkData.start, { checkId });
    const saved = await t.mutation(internal.checkData.recordSnapshot, {
      checkId,
      url: "https://www.infosys.com/investors/results.html",
      label: "Official result",
      content,
      contentHash: hash(content),
    });
    await t.mutation(internal.checkData.complete, {
      checkId,
      inputHash: hash("input"),
      sourceResults: [],
      rejectedEvents: 0,
      message: "Completed",
      events: [
        {
          title: "Invented fact",
          kind: "results",
          eventDate: null,
          dateEvidence: null,
          status: "supports",
          answer: "An unsupported claim",
          fingerprint: hash("fake"),
          citations: [
            {
              snapshotId: saved!.snapshotId,
              quote: "The company guaranteed a 40 percent return.",
            },
          ],
        },
      ],
    });
    const detail = await owner.query(api.watches.detail, { watchId });
    expect(detail.events).toHaveLength(0);
    expect(detail.recentChecks[0].rejectedEvents).toBe(1);
  });
  it("persists each factual event once and makes completion idempotent", async () => {
    const { t, owner, watchId, checkId } = await fixture();
    await t.mutation(internal.checkData.start, { checkId });
    const saved = await t.mutation(internal.checkData.recordSnapshot, {
      checkId,
      url: "https://www.infosys.com/investors/results.html",
      label: "Official result",
      content,
      contentHash: hash(content),
    });
    const event = {
      title: "Deal wins",
      kind: "results" as const,
      eventDate: "2026-07-23",
      dateEvidence: "July 23, 2026",
      status: "unclear" as const,
      answer: "The company disclosed deal wins.",
      fingerprint: hash("fact"),
      citations: [
        {
          snapshotId: saved!.snapshotId,
          quote: "the company reported large-deal wins of $3.8 billion.",
        },
      ],
    };
    const args = {
      checkId,
      inputHash: hash("input"),
      sourceResults: [],
      rejectedEvents: 0,
      message: "Completed",
      events: [event, event],
    };
    expect(await t.mutation(internal.checkData.complete, args)).toBe(1);
    expect(await t.mutation(internal.checkData.complete, args)).toBe(0);
    const detail = await owner.query(api.watches.detail, { watchId });
    expect(detail.events).toHaveLength(1);
    expect(detail.watch.lastSuccessfulHash).toBe(hash("input"));
  });
});
