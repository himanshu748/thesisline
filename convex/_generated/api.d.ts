/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as checkData from "../checkData.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as lib_companies from "../lib/companies.js";
import type * as lib_evidence from "../lib/evidence.js";
import type * as limits from "../limits.js";
import type * as mailDelivery from "../mailDelivery.js";
import type * as notificationData from "../notificationData.js";
import type * as notifications from "../notifications.js";
import type * as research from "../research.js";
import type * as validators from "../validators.js";
import type * as watches from "../watches.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  checkData: typeof checkData;
  crons: typeof crons;
  http: typeof http;
  "lib/companies": typeof lib_companies;
  "lib/evidence": typeof lib_evidence;
  limits: typeof limits;
  mailDelivery: typeof mailDelivery;
  notificationData: typeof notificationData;
  notifications: typeof notifications;
  research: typeof research;
  validators: typeof validators;
  watches: typeof watches;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
};
