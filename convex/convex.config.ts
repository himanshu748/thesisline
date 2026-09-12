import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config.js";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";
import staticHosting from "@convex-dev/static-hosting/convex.config.js";
const app = defineApp();
app.use(agent);
app.use(rateLimiter);
app.use(staticHosting);
export default app;
