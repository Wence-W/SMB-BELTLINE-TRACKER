// ============================================================
// Bariatric Operations Tracker — Local Storage Store
// ============================================================

import type { BariCase } from "./types";

const STORAGE_KEY = "bari-ops-tracker-data";
const VERSION = 1;

interface StoragePayload {
  version: number;
  cases: BariCase[];
  lastSaved: string;
}

export function loadCases(): BariCase[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const payload: StoragePayload = JSON.parse(raw);
    if (typeof payload !== "object" || !Array.isArray(payload.cases)) return [];
    // Basic validation: ensure each case has required fields
    const valid = payload.cases.filter(
      c =>
        c &&
        typeof c.id === "string" &&
        typeof c.caseType === "string" &&
        typeof c.status === "string",
    );
    return valid;
  } catch {
    // Corruption: return empty, don't crash
    return [];
  }
}

export function saveCases(cases: BariCase[]): void {
  try {
    const payload: StoragePayload = {
      version: VERSION,
      cases,
      lastSaved: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage full or unavailable — silently fail
  }
}

export function clearCases(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export function generateId(): string {
  return `bari-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function now(): string {
  return new Date().toISOString();
}

export function isToday(dateString: string): boolean {
  try {
    const date = new Date(dateString);
    const today = new Date();
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  } catch {
    return false;
  }
}
