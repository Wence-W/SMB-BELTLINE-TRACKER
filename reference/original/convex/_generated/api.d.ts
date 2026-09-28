/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ViktorSpacesEmail from "../ViktorSpacesEmail.js";
import type * as adminCreateAccount from "../adminCreateAccount.js";
import type * as appointmentOptions from "../appointmentOptions.js";
import type * as appointmentPresence from "../appointmentPresence.js";
import type * as appointments from "../appointments.js";
import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as callAuditBootstrap from "../callAuditBootstrap.js";
import type * as callAuditMigration from "../callAuditMigration.js";
import type * as callAuditPermissions from "../callAuditPermissions.js";
import type * as callAudits from "../callAudits.js";
import type * as cases from "../cases.js";
import type * as constants from "../constants.js";
import type * as directory from "../directory.js";
import type * as http from "../http.js";
import type * as intake from "../intake.js";
import type * as intakeCallAudits from "../intakeCallAudits.js";
import type * as intakeDirectory from "../intakeDirectory.js";
import type * as intakeHighlights from "../intakeHighlights.js";
import type * as permissions from "../permissions.js";
import type * as piedmontReferrals from "../piedmontReferrals.js";
import type * as precertProviders from "../precertProviders.js";
import type * as preferences from "../preferences.js";
import type * as reports from "../reports.js";
import type * as reverificationRequesters from "../reverificationRequesters.js";
import type * as seedTestUser from "../seedTestUser.js";
import type * as staff from "../staff.js";
import type * as tasks from "../tasks.js";
import type * as testAuth from "../testAuth.js";
import type * as users from "../users.js";
import type * as verificationPages from "../verificationPages.js";
import type * as viktorSpaceAuthConfig from "../viktorSpaceAuthConfig.js";
import type * as viktorSpaceAuthEnv from "../viktorSpaceAuthEnv.js";
import type * as viktorTools from "../viktorTools.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ViktorSpacesEmail: typeof ViktorSpacesEmail;
  adminCreateAccount: typeof adminCreateAccount;
  appointmentOptions: typeof appointmentOptions;
  appointmentPresence: typeof appointmentPresence;
  appointments: typeof appointments;
  auth: typeof auth;
  billing: typeof billing;
  callAuditBootstrap: typeof callAuditBootstrap;
  callAuditMigration: typeof callAuditMigration;
  callAuditPermissions: typeof callAuditPermissions;
  callAudits: typeof callAudits;
  cases: typeof cases;
  constants: typeof constants;
  directory: typeof directory;
  http: typeof http;
  intake: typeof intake;
  intakeCallAudits: typeof intakeCallAudits;
  intakeDirectory: typeof intakeDirectory;
  intakeHighlights: typeof intakeHighlights;
  permissions: typeof permissions;
  piedmontReferrals: typeof piedmontReferrals;
  precertProviders: typeof precertProviders;
  preferences: typeof preferences;
  reports: typeof reports;
  reverificationRequesters: typeof reverificationRequesters;
  seedTestUser: typeof seedTestUser;
  staff: typeof staff;
  tasks: typeof tasks;
  testAuth: typeof testAuth;
  users: typeof users;
  verificationPages: typeof verificationPages;
  viktorSpaceAuthConfig: typeof viktorSpaceAuthConfig;
  viktorSpaceAuthEnv: typeof viktorSpaceAuthEnv;
  viktorTools: typeof viktorTools;
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

export declare const components: {};
