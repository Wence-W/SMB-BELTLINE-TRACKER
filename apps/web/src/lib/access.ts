// Client-side view of the viewer's access, for showing or hiding controls.
// The server enforces every rule regardless (convex/lib/functions.ts).
import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";

export function useMe() {
  return useQuery(api.access.me);
}

/** False (not "loading") until known, so admin controls stay hidden by default. */
export function useIsAdmin(): boolean {
  return useMe()?.capabilities.includes("admin") ?? false;
}

export function useIsOwner(): boolean {
  return useMe()?.capabilities.includes("owner") ?? false;
}
