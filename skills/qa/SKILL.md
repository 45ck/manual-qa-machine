---
name: Manual QA Machine
description: >
  Execute canonical manual QA flows with structured evidence, policy-based verdicts,
  screenshots, snapshots, and report artifacts through agent-browser.
version: 1.0.0
---

# Manual QA Machine

Use this skill when the user wants to QA a web flow, generate a report, validate a
flow file, compare reports, or certify a regression path.

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

## Preferred Commands

```bash
mqm run --flow <path>
mqm run --url <url> --name "<name>"
mqm validate --flow <path>
mqm certify --flow <path>
mqm compare --baseline <report-a> --candidate <report-b>
mqm screenshot --url <url> --output <png-path>
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

Certification runs also write `certify-report.md` and `certify-report.json`.

Use `references/report-format.md` for the report shape and
`references/agent-browser-setup.md` for the current CLI syntax.
