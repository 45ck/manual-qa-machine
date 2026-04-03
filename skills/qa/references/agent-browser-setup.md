# agent-browser Setup Guide

## Install

```bash
npm install -g agent-browser
agent-browser install
agent-browser --version
```

## Commands Used By Manual QA Machine

```bash
agent-browser open <url>
agent-browser set viewport <width> <height>
agent-browser wait --load networkidle
agent-browser click <selector-or-ref>
agent-browser fill <selector-or-ref> <text>
agent-browser select <selector-or-ref> <value>
agent-browser press <key>
agent-browser snapshot -i --json
agent-browser screenshot --annotate <path>
agent-browser console --clear --json
agent-browser errors --clear --json
agent-browser network requests --clear --json
agent-browser get url --json
agent-browser eval --base64 <encoded-js>
```

## Session Persistence

The canonical runtime always uses `--session` for per-run browser isolation.

It uses `--session-name` only in `reuse` mode:

- `reuse` mode keeps a stable persisted session name
- `fresh` mode uses a unique isolated session and no persisted session name

## Targeting Notes

The runtime prefers semantic targets and falls back only when necessary:

- role + accessible name
- label
- placeholder
- text
- CSS selector
- agent-browser ref like `@e3`
