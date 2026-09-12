import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  watchFields,
  checkFields,
  eventFields,
  snapshotFields,
} from "./validators";

export default defineSchema({
  ...authTables,
  emailVerifications: defineTable({
    userId: v.id("users"),
    email: v.string(),
    nonce: v.string(),
    codeHash: v.string(),
    requestedAt: v.number(),
    expiresAt: v.number(),
    attempts: v.number(),
    state: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("verified"),
    ),
    error: v.optional(v.string()),
  }).index("by_userId", ["userId"]),
  watches: defineTable(watchFields)
    .index("by_userId_and_archived", ["userId", "archived"])
    .index("by_dailyEnabled_and_archived_and_nextCheckAt", [
      "dailyEnabled",
      "archived",
      "nextCheckAt",
    ]),
  checks: defineTable(checkFields).index("by_watchId", ["watchId"]),
  snapshots: defineTable(snapshotFields)
    .index("by_watchId_and_url_and_contentHash", [
      "watchId",
      "url",
      "contentHash",
    ])
    .index("by_watchId", ["watchId"]),
  events: defineTable(eventFields)
    .index("by_watchId", ["watchId"])
    .index("by_checkId", ["checkId"])
    .index("by_watchId_and_fingerprint", ["watchId", "fingerprint"]),
  alertDeliveries: defineTable({
    watchId: v.id("watches"),
    checkId: v.id("checks"),
    userId: v.id("users"),
    state: v.union(
      v.literal("pending"),
      v.literal("sending"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    messageId: v.optional(v.string()),
    error: v.optional(v.string()),
    attempts: v.optional(v.number()),
    retryable: v.optional(v.boolean()),
    leaseToken: v.optional(v.string()),
    leaseUntil: v.optional(v.number()),
    firstAttemptAt: v.optional(v.number()),
    nextAttemptAt: v.optional(v.number()),
    recipient: v.optional(v.string()),
    sender: v.optional(v.string()),
    subject: v.optional(v.string()),
    text: v.optional(v.string()),
    sentAt: v.optional(v.number()),
  })
    .index("by_checkId", ["checkId"])
    .index("by_watchId", ["watchId"])
    .index("by_state", ["state"]),
});
