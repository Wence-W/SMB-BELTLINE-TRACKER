import { httpRouter } from "convex/server";
import { auth } from "./auth";

// Only Convex Auth's own routes for now. Module HTTP endpoints (the
// call-audit recording range endpoint) arrive in Phase 7, behind the same
// access checks as the wrappers in lib/functions.ts.
const http = httpRouter();
auth.addHttpRoutes(http);

export default http;
