---
name: qa
description: Compile or run a canonical manual QA flow with structured evidence
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

## Runtime Notes

- Evidence is captured on every step.
- Legacy flow files are normalized into the canonical `QAFlow` model before running.
- The runtime isolates each viewport run with its own browser session.
- `reuse` mode also applies a stable persisted `session-name`; `fresh` mode does not.
- Session mode must be explicit when reproducibility matters: `fresh` for certification, `reuse` for exploratory/authenticated work.
