// Mirrors convex/permissions.ts (Wence, 2026-08-06) — client-side gate for
// hiding/disabling restricted controls. The server-side check is the real
// enforcement; this is only for a clean UI (no dead buttons for everyone
// else).
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export const RESTRICTED_ACTION_EMAILS = [
  "virtualstaff.benedicto.05202024@gmail.com",
  "smbphvs.langit.mitzi@gmail.com",
  "virtualstaff.wenceslao.011325@gmail.com",
  "youroutsourcedexpert@gmail.com",
];

/** True once we know the current user's email is on the restricted-action
 * allowlist. False (not just "loading") while the user query is pending, so
 * controls stay hidden by default until we're sure. */
export function useHasRestrictedAccess(): boolean {
  const user = useQuery(api.auth.currentUser);
  const email = user?.email?.toLowerCase().trim();
  return !!email && RESTRICTED_ACTION_EMAILS.includes(email);
}

// Patient ID lock exception (Wence, 2026-09-17: "only me can edit") — mirrors
// the server-side check in convex/cases.ts. Deliberately just Wence's own
// email, not the 4-person RESTRICTED_ACTION_EMAILS group above.
const PATIENT_ID_LOCK_EXEMPT_EMAIL = "virtualstaff.wenceslao.011325@gmail.com";

/** True once we know the current user is the one account allowed to edit a
 * Patient ID after it's already been set. False (not "loading") until the
 * user query resolves, so the field stays locked by default. */
export function useCanEditLockedPatientId(): boolean {
  const user = useQuery(api.auth.currentUser);
  const email = user?.email?.toLowerCase().trim();
  return email === PATIENT_ID_LOCK_EXEMPT_EMAIL;
}
