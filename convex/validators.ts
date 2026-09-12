import { v } from "convex/values";
export const status = v.union(
  v.literal("supports"),
  v.literal("contradicts"),
  v.literal("unclear"),
);
export const eventKind = v.union(
  v.literal("results"),
  v.literal("guidance"),
  v.literal("corporate_action"),
  v.literal("business_update"),
  v.literal("other"),
);
export const checkState = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("succeeded"),
  v.literal("failed"),
);
export const sourceResult = v.object({
  url: v.string(),
  label: v.string(),
  state: v.union(
    v.literal("changed"),
    v.literal("unchanged"),
    v.literal("failed"),
  ),
  message: v.optional(v.string()),
});
export const citation = v.object({
  snapshotId: v.id("snapshots"),
  quote: v.string(),
});
export const eventFields = {
  watchId: v.id("watches"),
  checkId: v.id("checks"),
  fingerprint: v.string(),
  title: v.string(),
  kind: eventKind,
  eventDate: v.union(v.string(), v.null()),
  dateEvidence: v.union(v.string(), v.null()),
  status,
  answer: v.string(),
  citations: v.array(citation),
  firstSeenAt: v.number(),
};
export const watchFields = {
  userId: v.id("users"),
  symbol: v.string(),
  question: v.string(),
  dailyEnabled: v.boolean(),
  notifyEnabled: v.boolean(),
  archived: v.boolean(),
  lastCheckAt: v.optional(v.number()),
  nextCheckAt: v.optional(v.number()),
  activeCheckId: v.optional(v.id("checks")),
  lastCheckState: v.optional(checkState),
  latestAnswer: v.optional(v.string()),
  latestStatus: v.optional(status),
  lastSuccessfulHash: v.optional(v.string()),
};
export const checkFields = {
  watchId: v.id("watches"),
  state: checkState,
  trigger: v.union(v.literal("manual"), v.literal("daily")),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  sourceCount: v.number(),
  newEvents: v.number(),
  rejectedEvents: v.number(),
  sourceResults: v.array(sourceResult),
  message: v.optional(v.string()),
};
export const snapshotFields = {
  watchId: v.id("watches"),
  url: v.string(),
  label: v.string(),
  contentHash: v.string(),
  content: v.string(),
  fetchedAt: v.number(),
};
export const watchDoc = v.object({
  _id: v.id("watches"),
  _creationTime: v.number(),
  ...watchFields,
});
export const checkDoc = v.object({
  _id: v.id("checks"),
  _creationTime: v.number(),
  ...checkFields,
});
export const eventDoc = v.object({
  _id: v.id("events"),
  _creationTime: v.number(),
  ...eventFields,
});
export const snapshotDoc = v.object({
  _id: v.id("snapshots"),
  _creationTime: v.number(),
  ...snapshotFields,
});
