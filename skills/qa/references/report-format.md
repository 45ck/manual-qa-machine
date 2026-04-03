# QA Report Format

Each run produces:

- `qa-report.json` as the machine-readable source of truth
- `qa-report.md` as the human-readable summary
- `accessibility.json` with flattened accessibility findings
- `performance.json` with flattened performance snapshots

## Markdown Shape

```markdown
# QA Report: {flow name}

**Flow ID:** {flow id}
**Started:** {iso}
**Finished:** {iso}
**Duration:** {seconds}
**Verdict:** pass | pass_with_warnings | fail | inconclusive
**Session:** fresh|reuse ({session name})

## Summary

- Passed steps: {n}
- Warning steps: {n}
- Failed steps: {n}
- Inconclusive steps: {n}

## Warnings

- {warning}

## Viewport: {name} ({width}x{height})

**Verdict:** {verdict}

### Step {n}: {step name}

**Action:** {kind}
**Verdict:** {verdict}
**URL:** {actual url}
**Duration:** {ms}

![Step {n}](./artifacts/{viewport}/{file}.png)

**Notes:**

- {note}

**Assertions:**

- {assertion}: pass|{failure}

**Console Events:** {count}
**Console Errors:** {count}
**Network Events:** {count}
**Failed Requests:** {count}
**Page Errors:** {count}
**Accessibility Issues:** {count}
**Performance:** load={ms}, dcl={ms}, lcp={ms}

### Policy Results

- consoleErrors: pass|{failure}
- networkFailures: pass|{failure}
- pageErrors: pass|{failure}
- performance: pass|{failure}
- accessibility: pass|{failure}
```

Certification also produces:

```markdown
# Certification Report: {flow name}

**Flow ID:** {flow id}
**Verdict:** pass | pass_with_warnings | fail | inconclusive
**Started:** {iso}
**Finished:** {iso}
**Duration:** {seconds}

## Attempts

- Attempt 1: {verdict} (`attempt-1/qa-report.json`)
- Attempt 2: {verdict} (`attempt-2/qa-report.json`)
- Attempt 3: {verdict} (`attempt-3/qa-report.json`)
```
