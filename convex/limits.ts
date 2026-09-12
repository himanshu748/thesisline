import { RateLimiter, DAY, MINUTE, HOUR } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";
export const limits = new RateLimiter(components.rateLimiter, {
  createWatch: { kind: "fixed window", rate: 10, period: DAY },
  checkBurst: { kind: "token bucket", rate: 1, period: MINUTE, capacity: 2 },
  userChecks: { kind: "fixed window", rate: 30, period: DAY },
  globalChecks: { kind: "fixed window", rate: 100, period: DAY },
  globalHourly: { kind: "fixed window", rate: 20, period: HOUR },
});
