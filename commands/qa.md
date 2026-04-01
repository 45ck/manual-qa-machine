---
name: qa
description: Run manual QA testing on a URL or user flow with screenshots at every step
allowed-tools:
  - "mcp__plugin_manual_qa_machine_chrome_devtools__chrome_navigate"
  - "mcp__plugin_manual_qa_machine_chrome_devtools__chrome_take_screenshot"
  - "mcp__plugin_manual_qa_machine_chrome_devtools__chrome_click"
  - "mcp__plugin_manual_qa_machine_chrome_devtools__chrome_type"
  - "mcp__plugin_manual_qa_machine_chrome_devtools__chrome_evaluate"
  - "mcp__plugin_manual_qa_machine_chrome_devtools__chrome_read_console_logs"
  - "mcp__plugin_manual_qa_machine_chrome_devtools__chrome_get_network_requests"
  - "mcp__plugin_manual_qa_machine_chrome_devtools__chrome_get_network_request_details"
  - "mcp__plugin_manual_qa_machine_chrome_devtools__chrome_take_snapshot"
  - "mcp__plugin_manual_qa_machine_chrome_devtools__chrome_set_viewport"
  - "Read"
  - "Write"
  - "Bash"
  - "Glob"
---

# /qa — Manual QA Testing

Run AI-powered manual QA testing on a web application. Provide a URL and optionally
describe a user flow to test.

## Usage

```
/qa <url> [flow description]
/qa --flow <path-to-flow-file.qa.json>
```

## Examples

```
/qa https://myapp.com
/qa https://myapp.com test the signup flow — enter email, submit, check dashboard
/qa --flow tests/signup.qa.json
```

## What This Command Does

1. Connect to Chrome via Chrome DevTools MCP
2. Navigate to the target URL
3. Walk through each step of the user flow
4. At every step: take a screenshot, check console for errors, check network for failures
5. Generate a markdown QA report in `qa-reports/` with all screenshots embedded

## Workflow

### If the user provides just a URL:
- Navigate to the URL
- Take a full-page screenshot
- Read console logs for errors
- Check network requests for failures
- Report findings

### If the user describes a flow:
- Parse the flow into discrete steps
- Execute each step sequentially
- Screenshot after every action
- Capture console + network state at each checkpoint
- Generate a full QA report

### If the user points to a .qa.json flow file:
- Read and parse the flow file
- Execute the defined steps
- Generate the report

## Output

Save all output to `qa-reports/{date}-{flow-name}/`:
- `qa-report.md` — Full markdown report
- `00-initial.png` through `NN-description.png` — Screenshots at each step

## Chrome DevTools MCP Tools Reference

| Action | Tool |
|--------|------|
| Navigate to URL | `chrome_navigate` |
| Take screenshot | `chrome_take_screenshot` |
| Click element | `chrome_click` |
| Type into field | `chrome_type` |
| Run JavaScript | `chrome_evaluate` |
| Read console | `chrome_read_console_logs` |
| Get requests | `chrome_get_network_requests` |
| Request details | `chrome_get_network_request_details` |
| DOM snapshot | `chrome_take_snapshot` |
| Set viewport | `chrome_set_viewport` |

## Report Format

Follow the template in the skill's `references/report-format.md`. Key sections:
- Header with URL, date, result (PASS/FAIL/ISSUES)
- Step-by-step findings with screenshots
- Console error summary table
- Network error summary table
- Recommended fixes ranked by severity
