/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED (scripts/gen-api-types.ts until a
 * Convex deployment exists; then by `npx convex dev`).
 * @module
 */

import type * as access from "../access.js";
import type * as auth from "../auth.js";
import type * as email from "../email.js";
import type * as http from "../http.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_email from "../lib/email.js";
import type * as lib_enums from "../lib/enums.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_time from "../lib/time.js";
import type * as provisioning from "../provisioning.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  auth: typeof auth;
  email: typeof email;
  http: typeof http;
  "lib/audit": typeof lib_audit;
  "lib/email": typeof lib_email;
  "lib/enums": typeof lib_enums;
  "lib/functions": typeof lib_functions;
  "lib/time": typeof lib_time;
  provisioning: typeof provisioning;
}>;

export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
