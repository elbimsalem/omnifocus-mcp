# Patch Notes — `patch/planned-dates-and-repetition`

Personal fork of `duquesnay/omnifocus-mcp`. This branch fixes two gaps in upstream that block effective GTD analysis against modern OmniFocus.

## What this branch changes

**Patch 1: `plannedDate` field (new feature in modern OmniFocus)**
- Added `plannedDate` to the task type and to read/write paths across the MCP.
- New filter params `plannedBefore` / `plannedAfter` on `list_tasks` and `get_task_count`.
- `create_task` and `update_task` accept `plannedDate` (ISO datetime string; `null` to clear via update).
- Surfaced in `todays_agenda`, `list_tasks`, `analyze_recurring_tasks`, and the export scripts.

**Patch 2: `repetitionRule` was returning `{}`**
- Upstream code reads `repetitionRule.method / .unit / .steps / .fixed` — those property names don't exist on the JXA-returned rule object. The real JXA properties are `repetitionMethod` and `recurrence` (the latter is an iCal RRULE string).
- Patched `recurring.ts` to read the correct fields and parse the RRULE into `{unit, steps}` for backward compatibility with downstream consumers (`frequency` description, `get_recurring_patterns` keys).

## How the probe established the fix

Run against live OmniFocus on 2026-05-27:

| Access pattern | Result |
|---|---|
| `rule.method` / `.unit` / `.steps` (upstream code) | `undefined` |
| `rule.method()` (function call) | TypeError |
| `doc.evaluateJavascript(...)` | `Error: Message not understood` |
| `app.evaluateJavascript(...)` | Works — returns OmniJS API results |
| **`rule.repetitionMethod` / `rule.recurrence`** (this fix) | **Works — returns `"due after completion"` / `"FREQ=WEEKLY;BYDAY=WE"`** |

The fix needed no OmniJS bridge — just correct JXA property names.

## Files touched

```
src/omnifocus/types.ts                            # +plannedDate; corrected RepetitionRule shape
src/omnifocus/scripts/tasks.ts                    # 5 scripts: LIST/COUNT filters + projection,
                                                  #   TODAYS_AGENDA projection, CREATE/UPDATE write paths
src/omnifocus/scripts/recurring.ts                # repetitionRule field-name fix + RRULE parser
                                                  #   in ANALYZE_RECURRING_TASKS_SCRIPT and
                                                  #   GET_RECURRING_PATTERNS_SCRIPT;
                                                  #   plus plannedDate projection
src/omnifocus/scripts/export.ts                   # +plannedDate field handler
src/omnifocus/scripts/export-fix.ts               # +plannedDate case
src/tools/tasks/CreateTaskTool.ts                 # +plannedDate in inputSchema
src/tools/tasks/UpdateTaskTool.ts                 # +plannedDate in inputSchema + safeUpdates passthrough
tests/unit/planned-date.test.ts                   # 12 new regex assertions over patched scripts
```

## How to verify

```bash
cd /Volumes/DATA/GitApps/omnifocus-mcp
npm run typecheck        # clean
npm run build            # writes dist/
npx vitest run tests/unit/planned-date.test.ts   # 12/12 pass
```

Live verification via the patched MCP tools (after restart):
- `todays_agenda` and `list_tasks` responses include `plannedDate` for tasks that have it set.
- `analyze_recurring_tasks` returns non-empty `repetitionRule.method`, `recurrence`, `unit`, `steps`, and a real `frequency` string (e.g., `"Every 2 weeks"`).
- `create_task(name="...", plannedDate="2026-06-01T09:00:00Z")` echoes the planned date back; visible in OF.app.
- `update_task(id="...", plannedDate=null)` clears the planned date.

## How to revert

**Hot revert** (next MCP restart):
```bash
cd /Volumes/DATA/GitApps/omnifocus-mcp
git checkout main
npm run build
# kill the running MCP node process; Claude Code respawns it from the rebuilt dist/
```

**Reapply**:
```bash
git checkout patch/planned-dates-and-repetition
npm run build
# kill running MCP node process again
```

**Cold revert**: delete `/Volumes/DATA/GitApps/omnifocus-mcp` and re-clone from `origin` (`https://github.com/duquesnay/omnifocus-mcp.git`). The branch survives on the personal fork at `https://github.com/elbimsalem/omnifocus-mcp`.

## Out of scope (not changed)

- The upstream `UPDATE_TASK_SCRIPT_SIMPLE` silently drops `dueDate` / `deferDate` / `estimatedMinutes` / `tags` updates (they're in the input schema but filtered out before the script runs). This patch adds `plannedDate` to the passthrough but does **not** fix the broader latent bug — that's a separate cleanup.
- The 17 upstream commits ahead of `bb7e158` (perf, BUG3/4/5 fixes) are not pulled into this branch. Pulling them is a separate decision.
