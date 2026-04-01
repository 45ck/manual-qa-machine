# Chrome DevTools MCP Setup Guide

## Installation

### Add to Claude Code

```bash
claude mcp add chrome-devtools -- npx chrome-devtools-mcp@latest
```

Or with auto-connect (Chrome M144+):

```bash
claude mcp add chrome-devtools -- npx chrome-devtools-mcp@latest --autoConnect
```

### Manual Configuration

Add to `~/.claude/settings.json` or project `.claude/settings.json`:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["chrome-devtools-mcp@latest"]
    }
  }
}
```

## Launching Chrome with Remote Debugging

Chrome must be running with the `--remote-debugging-port` flag for the MCP to connect.

### Windows

```bash
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

With a dedicated profile (recommended):

```bash
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\Google\Chrome\QA Profile"
```

### macOS

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

### Linux

```bash
google-chrome --remote-debugging-port=9222
```

## Auto-Connect (Chrome M144+)

Auto-connect eliminates the need for `--remote-debugging-port`. Chrome shows a
permission dialog when the MCP first connects — approve it once.

```bash
npx chrome-devtools-mcp@latest --autoConnect
```

## Verifying Connection

After setup, verify by asking Claude to list available tools. The following should
be present:

- `chrome_navigate`
- `chrome_take_screenshot`
- `chrome_click`
- `chrome_type`
- `chrome_evaluate`
- `chrome_read_console_logs`
- `chrome_get_network_requests`
- `chrome_get_network_request_details`
- `chrome_take_snapshot`

## Using with Authenticated Flows

Chrome DevTools MCP connects to your existing Chrome session. To test authenticated
flows:

1. Open Chrome with remote debugging
2. Log in to the application manually
3. Run the QA flow — the MCP uses your existing cookies and session

This is the primary advantage over Playwright MCP, which starts a fresh browser.

## Troubleshooting

**"Cannot connect to Chrome"**
- Verify Chrome is running with `--remote-debugging-port=9222`
- Check no other process is using port 9222
- Try `curl http://localhost:9222/json/version` to verify

**"No tabs found"**
- Open at least one tab in Chrome before running QA

**"Tool not found"**
- Restart Claude Code after adding the MCP server
- Verify the MCP is listed: `claude mcp list`
