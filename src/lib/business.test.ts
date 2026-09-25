import { describe, expect, it } from 'vitest';
import { applyCaseFilters, computeDailyProductivity, computeIntakeTotals, mapQaState } from './types';

describe('business rules', () => {
  it('maps QA markers correctly', () => {
    expect(mapQaState(undefined, undefined)).toBe('Not Audited');
    expect(mapQaState(true, undefined)).toBe('In Progress');
    expect(mapQaState(undefined, true)).toBe('Audited');
  });

  it('filters cases by status, auth, priority and assignee', () => {
    const cases = [
      { id: '1', patientId: 'P1', caseType: 'urgent', workflowStatus: 'new', authorizationStatus: 'pending_pre_auth', priority: 'urgent', assignee: 'Wendy', createdAt: '2026-09-01' },
      { id: '2', patientId: 'P2', caseType: 'initial_consult', workflowStatus: 'completed', authorizationStatus: 'approved', priority: 'high', assignee: 'Maya', createdAt: '2026-09-02' },
    ] as any;

    const filtered = applyCaseFilters(cases, {
      workflowStatus: 'new',
      authStatus: 'pending_pre_auth',
      priority: 'urgent',
      staff: 'Wendy',
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].patientId).toBe('P1');
  });

  it('sums intake quantities by category', () => {
    expect(computeIntakeTotals([
      { category: 'Inbound', quantity: 3 },
      { category: 'Outbound', quantity: 2 },
      { category: 'Inbound', quantity: 1 },
    ])).toEqual({ Inbound: 4, Outbound: 2 });
  });

  it('removes weekend rows and zero totals from productivity totals', () => {
    const rows = [
      { day: 'Mon', weekday: 'Monday', total: 5 },
      { day: 'Sat', weekday: 'Saturday', total: 9 },
      { day: 'Sun', weekday: 'Sunday', total: 4 },
      { day: 'Tue', weekday: 'Tuesday', total: 0 },
    ];

    expect(computeDailyProductivity(rows)).toEqual([{ day: 'Mon', weekday: 'Monday', total: 5 }]);
  });
});
