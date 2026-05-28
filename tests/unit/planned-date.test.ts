import { describe, it, expect } from 'vitest';
import {
  LIST_TASKS_SCRIPT,
  CREATE_TASK_SCRIPT,
  UPDATE_TASK_SCRIPT,
  UPDATE_TASK_SCRIPT_SIMPLE,
  TODAYS_AGENDA_SCRIPT,
  GET_TASK_COUNT_SCRIPT,
} from 'src/omnifocus/scripts/tasks';
import { ANALYZE_RECURRING_TASKS_SCRIPT, GET_RECURRING_PATTERNS_SCRIPT } from 'src/omnifocus/scripts/recurring';

describe('plannedDate support', () => {
  it('LIST_TASKS_SCRIPT projects plannedDate', () => {
    expect(LIST_TASKS_SCRIPT).toMatch(/task\.plannedDate\(\)/);
    expect(LIST_TASKS_SCRIPT).toMatch(/taskObj\.plannedDate\s*=/);
  });

  it('LIST_TASKS_SCRIPT honors plannedBefore/plannedAfter filters', () => {
    expect(LIST_TASKS_SCRIPT).toMatch(/filter\.plannedBefore/);
    expect(LIST_TASKS_SCRIPT).toMatch(/filter\.plannedAfter/);
  });

  it('TODAYS_AGENDA_SCRIPT projects plannedDate', () => {
    expect(TODAYS_AGENDA_SCRIPT).toMatch(/task\.plannedDate\(\)/);
  });

  it('GET_TASK_COUNT_SCRIPT honors plannedBefore/plannedAfter filters', () => {
    expect(GET_TASK_COUNT_SCRIPT).toMatch(/filter\.plannedBefore/);
    expect(GET_TASK_COUNT_SCRIPT).toMatch(/filter\.plannedAfter/);
  });

  it('CREATE_TASK_SCRIPT writes plannedDate', () => {
    expect(CREATE_TASK_SCRIPT).toMatch(/taskData\.plannedDate/);
    expect(CREATE_TASK_SCRIPT).toMatch(/taskObj\.plannedDate\s*=\s*new Date/);
  });

  it('UPDATE_TASK_SCRIPT writes plannedDate (including null to clear)', () => {
    expect(UPDATE_TASK_SCRIPT).toMatch(/updates\.plannedDate/);
    expect(UPDATE_TASK_SCRIPT).toMatch(/task\.plannedDate\s*=/);
  });

  it('UPDATE_TASK_SCRIPT_SIMPLE writes plannedDate', () => {
    expect(UPDATE_TASK_SCRIPT_SIMPLE).toMatch(/updates\.plannedDate/);
  });

  it('ANALYZE_RECURRING_TASKS_SCRIPT projects plannedDate', () => {
    expect(ANALYZE_RECURRING_TASKS_SCRIPT).toMatch(/task\.plannedDate\(\)/);
  });
});

describe('repetitionRule fix', () => {
  it('ANALYZE_RECURRING_TASKS_SCRIPT reads repetitionMethod and recurrence (real JXA fields)', () => {
    expect(ANALYZE_RECURRING_TASKS_SCRIPT).toMatch(/repetitionRule\.repetitionMethod/);
    expect(ANALYZE_RECURRING_TASKS_SCRIPT).toMatch(/repetitionRule\.recurrence/);
  });

  it('ANALYZE_RECURRING_TASKS_SCRIPT no longer reads broken .fixed off the JXA rule', () => {
    // The bug was reading `repetitionRule.method/unit/steps/fixed` directly off the JXA
    // specifier returned by task.repetitionRule() — those properties don't exist there.
    // Note: `.method` and `.unit` strings also appear on the OUTPUT object (a.repetitionRule.unit
    // in sort callbacks), so we only assert removal of `.fixed` which has no legitimate use here.
    expect(ANALYZE_RECURRING_TASKS_SCRIPT).not.toMatch(/repetitionRule\.fixed/);
    // And confirm the new real fields are present (positive assertions above already cover this).
  });

  it('ANALYZE_RECURRING_TASKS_SCRIPT parses the RRULE to derive unit/steps', () => {
    expect(ANALYZE_RECURRING_TASKS_SCRIPT).toMatch(/parseRRule/);
    expect(ANALYZE_RECURRING_TASKS_SCRIPT).toMatch(/FREQ/);
  });

  it('GET_RECURRING_PATTERNS_SCRIPT uses recurrence instead of broken .unit/.steps', () => {
    expect(GET_RECURRING_PATTERNS_SCRIPT).toMatch(/repetitionRule\.recurrence/);
    expect(GET_RECURRING_PATTERNS_SCRIPT).not.toMatch(/repetitionRule\.unit/);
    expect(GET_RECURRING_PATTERNS_SCRIPT).not.toMatch(/repetitionRule\.steps/);
  });
});
