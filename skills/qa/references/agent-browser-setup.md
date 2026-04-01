# agent-browser Setup Guide

## Installation

### Install globally via npm

```bash
npm install -g agent-browser
```

### Install the browser

After installing the CLI, run the install command to download and configure a
Chromium browser automatically:

```bash
agent-browser install
```

This downloads a compatible Chromium binary. No manual Chrome launch or remote
debugging port configuration is required.

### Verify installation

```bash
agent-browser --version
```

## How It Works

agent-browser is a CLI tool that manages a headless (or headed) Chromium instance
directly. Unlike Chrome DevTools MCP, it does not require a separately running Chrome
process or an MCP server. All interactions happen through CLI commands invoked via the
Bash tool.

Key differences from the previous Chrome DevTools MCP approach:

- No need for `--remote-debugging-port`
- No MCP server configuration
- No `.mcp.json` file
- Commands are invoked directly via Bash, not through MCP tool calls
- The browser lifecycle is managed by agent-browser itself

## Core Commands

### Navigation

```bash
agent-browser open https://example.com
```

### Screenshots

```bash
agent-browser screenshot --output ./screenshots/page.png
```

### Accessibility Snapshot

Get an indexed list of interactive elements on the page:

```bash
agent-browser snapshot -i
```

This returns a numbered list of elements (links, buttons, inputs, etc.) that can
be referenced by index in subsequent `click` or `type` commands.

### Interaction

```bash
# Click an element by its snapshot index
agent-browser click 5

# Type text into an element by its snapshot index
agent-browser type 3 "hello@example.com"

# Scroll the page
agent-browser scroll down
agent-browser scroll up
```

### Console and Errors

```bash
# Read console output (log, warn, info, debug)
agent-browser console

# Read uncaught exceptions and page errors
agent-browser errors
```

### Network

```bash
# List recent network requests with status codes
agent-browser network requests

# Start recording a HAR file
agent-browser network har start

# Stop recording and save the HAR file
agent-browser network har stop --output ./network.har
```

### Visual and DOM Diffing

```bash
# Compare two screenshots for visual regressions
agent-browser diff screenshot baseline.png current.png

# Compare two DOM snapshots for structural changes
agent-browser diff snapshot before.json after.json
```

### Viewport

```bash
# Set viewport dimensions for responsive testing
agent-browser viewport 1920 1080
agent-browser viewport 375 667
```

### Wait

```bash
# Wait for a specified duration (milliseconds)
agent-browser wait 2000
```

## Using with Authenticated Flows

Since agent-browser manages its own browser instance, handle authentication by
navigating to the login page and performing the login programmatically:

1. Open the login URL: `agent-browser open https://app.example.com/login`
2. Get the page structure: `agent-browser snapshot -i`
3. Type credentials: `agent-browser type <email-index> "user@example.com"`
4. Type password: `agent-browser type <password-index> "password"`
5. Click sign in: `agent-browser click <submit-index>`
6. Proceed with the QA flow -- the session cookies persist for the duration of the run

## Troubleshooting

**"agent-browser: command not found"**

- Verify installation: `npm list -g agent-browser`
- Reinstall: `npm install -g agent-browser`
- Ensure your npm global bin directory is in your PATH

**"Browser not installed"**

- Run `agent-browser install` to download the Chromium binary

**Screenshot is blank or empty**

- The page may not have finished loading. Use `agent-browser wait 2000` before
  taking the screenshot
- Take a snapshot first (`agent-browser snapshot -i`) to confirm content is present

**Element index not found**

- Run `agent-browser snapshot -i` again to get an updated element list
- Page may have changed since the last snapshot (SPA navigation, dynamic content)
