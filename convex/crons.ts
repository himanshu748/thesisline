import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
crons.interval(
  "dispatch due research watches",
  { minutes: 15 },
  internal.watches.dispatchDaily,
  {},
);
export default crons;
