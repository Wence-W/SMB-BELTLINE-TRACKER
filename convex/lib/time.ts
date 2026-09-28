// Server-stamped timestamps. The original app trusted client-generated ISO
// strings (Inventory section 7); the rebuild stamps them here, in the SAME
// format (ISO-8601 UTC), so the parity logic that does `iso.slice(0, 10)`
// keeps producing identical day buckets.
export function nowIso(): string {
  return new Date().toISOString();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
