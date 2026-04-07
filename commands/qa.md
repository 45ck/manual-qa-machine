---
name: qa
description: Compile, run, or explore a canonical manual QA flow with structured evidence
allowed-tools:
  - "Bash"
  - "Read"
  - "Write"
  - "Glob"
---

# /qa

Use `/qa` to execute the repo's canonical manual QA system.

## Contract

`/qa` should:

1. load or compile a `QAFlow`
2. execute the flow through `mqm` / `agent-browser`
3. rely on report artifacts and policy results for verdicts
4. return `pass`, `pass_with_warnings`, `fail`, or `inconclusive`

`/qa` should not:

- call a run passed from screenshots alone
- ignore missing evidence
- silently invent alternative steps

## Supported Workflows

### Run an existing flow

```text
/qa run ./qa-flows/signup.json
```

### Explore and compile a quick smoke flow

```text
/qa https://example.com test signup and dashboard loading
```

### Validate without running

```text
/qa validate ./qa-flows/signup.json
```

### Certify

```text
/qa certify ./qa-flows/signup.json
```

### Screenshot a page

```text
/qa screenshot https://example.com
```

### Explore an app for bugs

```text
/qa explore http://localhost:3000
```

Runs the exploratory mode which autonomously navigates the app, clicks elements,
fills forms, and detects issues (console errors, network failures, a11y violations,
dead ends, performance problems). Results land in `qa/findings/`.

### Promote a finding to a test

```text
/qa promote qa/findings/explore-001-console_error-0.json --target playwright --certify
```

Converts an exploratory finding into a Playwright spec or QAFlow, optionally runs
stability checks before accepting. Promoted tests land in `tests/regression/`.

### Run Playwright smoke tests

```text
/qa smoke
```

### Scaffold QA harness into a repo

```text
/qa init --base-url http://localhost:3000
```

Creates `mqm.config.json`, Playwright config, test directories, and Claude Code
agent definitions.

### Report summary

```text
/qa report
```

## Runtime Notes

- Evidence is captured on every step.
- Legacy flow files are normalized into the canonical `QAFlow` model before running.
- The runtime isolates each viewport run with its own browser session.
- `reuse` mode also applies a stable persisted `session-name`; `fresh` mode does not.
- Session mode must be explicit when reproducibility matters: `fresh` for certification, `reuse` for exploratory/authenticated work.
- Exploratory mode uses a heuristic breadth-first strategy by default (no LLM calls).
- Promotion requires stability verification (`--certify`) before tests are accepted.
