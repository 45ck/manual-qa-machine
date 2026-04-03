# manual-qa-machine

Canonical manual QA execution for Claude Code, Codex CLI, and direct CLI use.

The system compiles legacy flow files into one strict `QAFlow` model, executes that
flow through `agent-browser`, captures structured evidence at every step, and emits
both `qa-report.md` and `qa-report.json`.

## What It Does

- deterministic flow execution with explicit step kinds
- screenshot + snapshot evidence on every step
- console, network, page-error, accessibility, and performance capture
- `pass`, `pass_with_warnings`, `fail`, and `inconclusive` verdicts
- `fresh` and `reuse` session modes
- multi-viewport runs
- report comparison and 3-run certification
- direct screenshot + snapshot capture for quick inspection

## Install

### 1. Install dependencies

```bash
npm install
```

### 2. Install `agent-browser`

```bash
npm install -g agent-browser
agent-browser install
agent-browser --version
```

## CLI

### Run a flow

```bash
mqm run --flow ./qa-flows/signup.json
```

### Quick smoke run

```bash
mqm run --url https://example.com --name "Homepage Smoke"
```

### Validate a flow

```bash
mqm validate --flow ./qa-flows/signup.json
```

### Certify a flow

```bash
mqm certify --flow ./qa-flows/signup.json
```

### Compare two reports

```bash
mqm compare --baseline ./qa-reports/a/qa-report.json --candidate ./qa-reports/b/qa-report.json
```

### Capture a screenshot

```bash
mqm screenshot --url https://example.com --output ./screenshots/homepage.png
```

## Canonical Flow Format

```json
{
  "formatVersion": 1,
  "id": "signup-smoke",
  "name": "Signup Smoke",
  "startUrl": "https://example.com/signup",
  "sessionMode": "fresh",
  "viewports": [
    { "name": "desktop", "width": 1440, "height": 900 },
    { "name": "mobile", "width": 390, "height": 844 }
  ],
  "steps": [
    {
      "kind": "type",
      "name": "Enter email",
      "target": { "kind": "label", "text": "Email" },
      "value": "test@example.com"
    },
    {
      "kind": "click",
      "name": "Submit signup",
      "target": { "kind": "role", "role": "button", "name": "Create account" }
    },
    {
      "kind": "waitFor",
      "condition": { "kind": "url", "pattern": "**/dashboard" }
    },
    {
      "kind": "assert",
      "name": "Dashboard visible",
      "assertion": { "kind": "textPresent", "text": "Dashboard" }
    }
  ],
  "assertions": [{ "kind": "noCriticalA11yViolations" }],
  "policies": {
    "consoleErrors": { "max": 0, "allowMessages": [] },
    "networkFailures": { "max": 0, "allowUrls": [] },
    "pageErrors": { "max": 0, "allowMessages": [] },
    "performance": { "maxPageLoadMs": 4000 },
    "accessibility": { "maxCritical": 0 }
  }
}
```

## Legacy Flow Support

Existing `.qa.json` flows with the old `action/target/value` shape still work. They
are validated and compiled into the canonical `QAFlow` model before execution, and
the run report records a warning that legacy input was normalized.

## Output

Each run writes:

```text
qa-reports/<date>-<flow>/
  qa-report.md
  qa-report.json
  run-metadata.json
  console.json
  network.json
  page-errors.json
  accessibility.json
  performance.json
  artifacts/
```

Certification runs also write:

```text
qa-reports/<date>-<flow>-certify/
  certify-report.md
  certify-report.json
  attempt-1/
  attempt-2/
  attempt-3/
```

## Agent Usage

`/qa` should compile intent into a strict flow, execute it, and summarize only from
artifacts and policy results. It should not mark a run as passed from screenshots
alone.

## Exit Codes

- `0`: `pass` or `pass_with_warnings`
- `1`: `fail`
- `2`: `inconclusive`

## Development

```bash
npm run lint
npm run typecheck
npm run test
noslop doctor
noslop check --tier=fast
```
