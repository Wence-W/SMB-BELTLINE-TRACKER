/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED (scripts/gen-api-types.ts until a
 * Convex deployment exists; then by `npx convex dev`).
 * @module
 */

import type * as access from "../access.js";
import type * as appointmentOptions from "../appointmentOptions.js";
import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as dailyMetrics from "../dailyMetrics.js";
import type * as devSeed from "../devSeed.js";
import type * as directory from "../directory.js";
import type * as email from "../email.js";
import type * as http from "../http.js";
import type * as lib_appointmentOptions from "../lib/appointmentOptions.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_email from "../lib/email.js";
import type * as lib_enums from "../lib/enums.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_staff from "../lib/staff.js";
import type * as lib_storageRefs from "../lib/storageRefs.js";
import type * as lib_time from "../lib/time.js";
import type * as managedLists from "../managedLists.js";
import type * as provisioning from "../provisioning.js";
import type * as settings from "../settings.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  appointmentOptions: typeof appointmentOptions;
  auth: typeof auth;
  billing: typeof billing;
  dailyMetrics: typeof dailyMetrics;
  devSeed: typeof devSeed;
  directory: typeof directory;
  email: typeof email;
  http: typeof http;
  "lib/appointmentOptions": typeof lib_appointmentOptions;
  "lib/audit": typeof lib_audit;
  "lib/email": typeof lib_email;
  "lib/enums": typeof lib_enums;
  "lib/functions": typeof lib_functions;
  "lib/staff": typeof lib_staff;
  "lib/storageRefs": typeof lib_storageRefs;
  "lib/time": typeof lib_time;
  managedLists: typeof managedLists;
  provisioning: typeof provisioning;
  settings: typeof settings;
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
