import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { Team } from "./enums";

/**
 * The person a new or edited row is attributed to. Must be an active member of
 * `team`: the original's pickers only offered that team's roster, and the
 * server now enforces the same rule. The row stores `displayName` as its staff
 * string (the original's format) plus the person's id.
 */
export async function requireTeamMember(ctx: QueryCtx, personId: Id<"people">, team: Team): Promise<Doc<"people">> {
  const person = await ctx.db.get(personId);
  if (!person) throw new ConvexError({ code: "NOT_FOUND" });
  if (!person.active || !person.teams.includes(team)) throw new ConvexError({ code: "NOT_ON_TEAM" });
  return person;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A calendar date as the original stored it (YYYY-MM-DD, from a date input). */
export function requireIsoDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!ISO_DATE.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ConvexError({ code: "INVALID_DATE" });
  }
  return value;
}

/** Billing count rule, identical to the original's `Math.max(1, Math.round(count ?? 1))`. */
export function clampTaskCount(count: number | undefined): number {
  if (count !== undefined && !Number.isFinite(count)) throw new ConvexError({ code: "INVALID_COUNT" });
  return Math.max(1, Math.round(count ?? 1));
}

/** A tally typed into a digits-only field: a whole number, zero or more. */
export function requireTally(value: number): number {
  if (!Number.isInteger(value) || value < 0) throw new ConvexError({ code: "INVALID_COUNT" });
  return value;
}
