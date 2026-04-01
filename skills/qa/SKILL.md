---
name: Manual QA Machine
description: >
  This skill should be used when the user asks to "QA test a website",
  "test the onboarding flow", "screenshot every step", "manual test this page",
  "generate a QA report", "test user flow", "check for UI issues", "run QA",
  "walk through the app", "test this URL", or mentions manual testing, QA testing,
  visual testing, or screenshot-based testing of web applications.
version: 0.1.0
---

# Manual QA Machine

Automate manual QA testing of web applications using Chrome DevTools MCP. Walk through
any user flow step-by-step, capturing screenshots, console logs, network errors, and
performance data at every checkpoint. Generate a structured markdown QA report.

## Prerequisites

This skill requires **Chrome DevTools MCP** to be installed and Chrome running with
remote debugging enabled.

**Check availability:** Look for Chrome DevTools MCP tools (`chrome_navigate`,
`chrome_take_screenshot`, `chrome_read_console_logs`, `chrome_get_network_requests`).

**If not available:** Inform the user to install it:
```bash
claude mcp add chrome-devtools -- npx chrome-devtools-mcp@latest
```

Then launch Chrome with remote debugging:
```bash
# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222

# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

# Linux
google-chrome --remote-debugging-port=9222
```

**Fallback:** If Playwright MCP is available instead (`browser_navigate`,
`browser_screenshot`), use that. Adapt tool names accordingly.

## QA Workflow

When the user provides a URL or describes a flow to test, execute this workflow:

### 1. Initialize

- Confirm Chrome DevTools MCP tools are available
- Create a timestamped output directory: `qa-reports/{date}-{flow-name}/`
- Navigate to the starting URL
- Take an initial screenshot: `00-initial.png`
- Capture the initial console log state

### 2. Step-by-Step Execution

For each step in the user flow:

1. **Execute the action** (navigate, click, type, scroll, wait)
2. **Wait for stability** (network idle or explicit wait time)
3. **Capture screenshot** — Save as `{step-number}-{description}.png`
4. **Check console logs** — Flag any errors or warnings
5. **Check network requests** — Flag any failed requests (4xx, 5xx)
6. **Note observations** — Visual issues, broken layouts, missing elements, slow loads

### 3. Report Generation

After completing all steps, generate a markdown QA report. Refer to
`references/report-format.md` for the exact template.

The report includes:
- Test metadata (URL, date, steps executed, duration)
- Step-by-step findings with screenshot references
- Console error summary
- Network error summary
- Overall pass/fail assessment
- Recommended fixes

## Screenshot Naming Convention

```
{NN}-{action}-{description}.png

Examples:
00-initial-homepage.png
01-click-signup-button.png
02-type-email-field.png
03-submit-registration-form.png
04-verify-dashboard-loaded.png
```

## Flow Definition

Users can provide flows in several ways:

**Natural language:** "Test the signup flow on vibecord.com — go to signup, enter an
email, submit, and check if the dashboard loads"

**Step list:**
```
1. Navigate to /signup
2. Click "Get Started"
3. Enter email in the email field
4. Click Submit
5. Verify dashboard appears
```

**YAML flow file** (check if a `.qa.yml` or `qa-flow.yml` exists in the project):
```yaml
name: Signup Flow
url: https://example.com
steps:
  - navigate: /signup
    screenshot: true
  - click: "#get-started"
    screenshot: true
  - type:
      selector: "#email"
      value: "test@example.com"
  - click: "#submit"
    wait: 3000
    screenshot: true
  - assert:
      text: "Welcome"
    screenshot: true
```

## Handling Common Scenarios

**Authentication required:** Ask the user to log in manually in the Chrome instance
first. Chrome DevTools MCP connects to the existing session with cookies intact.

**Dynamic content / SPAs:** After each action, wait for network idle before capturing.
Use `chrome_evaluate` to check for loading indicators if needed.

**Responsive testing:** If the user requests it, repeat the flow at multiple viewports:
- Desktop: 1920x1080
- Tablet: 768x1024
- Mobile: 375x667

**Comparison runs:** If a previous QA report exists for the same flow, note any
differences in the new report.

## Tool Mapping

### Chrome DevTools MCP Tools

| Action | Tool |
|--------|------|
| Navigate | `chrome_navigate` |
| Screenshot | `chrome_take_screenshot` |
| Click element | `chrome_click` |
| Type text | `chrome_type` |
| Console logs | `chrome_read_console_logs` |
| Network requests | `chrome_get_network_requests` |
| Network details | `chrome_get_network_request_details` |
| Evaluate JS | `chrome_evaluate` |
| DOM snapshot | `chrome_take_snapshot` |

### Playwright MCP Tools (Fallback)

| Action | Tool |
|--------|------|
| Navigate | `browser_navigate` |
| Screenshot | `browser_screenshot` |
| Click element | `browser_click` |
| Type text | `browser_type` |
| Console logs | `browser_console_messages` |

## Additional Resources

### Reference Files

- **`references/report-format.md`** — QA report markdown template
- **`references/chrome-devtools-setup.md`** — Detailed Chrome DevTools MCP setup guide

### Scripts

- **`scripts/serve-report.sh`** — Local server to view QA reports with embedded images
