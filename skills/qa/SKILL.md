---
name: Manual QA Machine
description: >
  Full QA harness: exploratory testing, regression promotion, Playwright smoke tests,
  deterministic flow execution, and report artifacts through agent-browser.
version: 2.0.0
---

# Manual QA Machine

Use this skill when the user wants to QA a web flow, explore an app for bugs,
promote findings to regression tests, run smoke tests, generate reports,
validate a flow file, compare reports, or certify a regression path.

## Principles

- Compile natural-language intent into one canonical `QAFlow` model.
- Capture evidence on every step.
- Use explicit assertions and policies for verdicts.
- Return `inconclusive` when evidence is missing or targeting is ambiguous.
- Do not claim a pass from screenshots alone.

## Prerequisites

```bash
agent-browser --version
```

If missing:

```bash
npm install -g agent-browser
agent-browser install
```

For Playwright smoke tests:

```bash
npm install -D @playwright/test
npx playwright install
```

## Quick Start

```bash
mqm init --base-url http://localhost:3000   # scaffold QA harness
mqm explore --url http://localhost:3000     # exploratory QA
mqm promote --finding qa/findings/<id>.json --target playwright --certify
mqm smoke                                   # run Playwright smoke tests
mqm report                                  # summarize findings
```

## Commands

```bash
# Deterministic flows
mqm run --flow <path>
mqm run --url <url> --name "<name>"
mqm validate --flow <path>
mqm certify --flow <path>
mqm compare --baseline <report-a> --candidate <report-b>
mqm screenshot --url <url> --output <png-path>

# Exploratory QA
mqm explore --url <url> [--depth N] [--timeout Nms] [--max-interactions N]

# Promotion pipeline
mqm promote --finding <path> [--target flow|playwright] [--certify] [--runs N]

# Playwright integration
mqm smoke

# Scaffolding
mqm init [--base-url URL] [--force]

# Reporting
mqm report [--output DIR]
```

## Flow Guidance

Prefer canonical flows with:

- `startUrl`
- explicit `sessionMode`
- typed targets like `role`, `label`, `placeholder`, `text`, or `css`
- explicit `waitFor` conditions
- explicit assertions
- explicit policy thresholds

Legacy `.qa.json` flows are allowed, but the system will normalize them and warn.

## Reporting

The runtime writes:

- `qa-report.md`
- `qa-report.json`
- `run-metadata.json`
- `console.json`
- `network.json`
- `page-errors.json`
- `accessibility.json`
- `performance.json`
- `artifacts/`

Exploratory runs write:

- `explore-report.md`
- `explore-report.json`
- `findings/<finding-id>.json`
- `findings/index.json`

Certification runs write `certify-report.md` and `certify-report.json`.

Use `references/report-format.md` for the report shape and
`references/agent-browser-setup.md` for the current CLI syntax.

## Claude Code Agents

After `mqm init`, these agents are scaffolded into `.claude/agents/`:

- **qa-orchestrator** — Decides what QA action to take
- **qa-explorer** — Runs exploratory QA via agent-browser
- **qa-promoter** — Converts findings into Playwright tests or QAFlows
- **qa-healer** — Inspects failures and proposes safe test repairs
