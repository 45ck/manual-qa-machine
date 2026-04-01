---
name: qa
description: Run manual QA testing on a URL or user flow with screenshots at every step
allowed-tools:
  - "Bash"
  - "Read"
  - "Write"
  - "Glob"
---

# /qa -- Manual QA Testing

Run AI-powered manual QA testing on a web application. Provide a URL and optionally
describe a user flow to test. Uses agent-browser CLI via the Bash tool.

## Usage

```
/qa <url> [flow description]
/qa --flow <path-to-flow-file.qa.json>
```

## Examples

```
/qa https://myapp.com
/qa https://myapp.com test the signup flow -- enter email, submit, check dashboard
/qa --flow tests/signup.qa.json
```

## What This Command Does

1. Launch agent-browser and open the target URL
2. Walk through each step of the user flow
3. At every step: take a screenshot, check console for errors, check network for failures
4. Generate a markdown QA report in `qa-reports/` with all screenshots embedded

## Workflow

### If the user provides just a URL:

- Open the URL: `agent-browser open <url>`
- Take a screenshot: `agent-browser screenshot --output <path>`
- Read console logs for errors: `agent-browser console`
- Check for page errors: `agent-browser errors`
- Check network requests for failures: `agent-browser network requests`
- Report findings

### If the user describes a flow:

- Parse the flow into discrete steps
- Execute each step sequentially using agent-browser commands
- Screenshot after every action
- Capture console + network state at each checkpoint
- Generate a full QA report

### If the user points to a .qa.json flow file:

- Read and parse the flow file
- Execute the defined steps via agent-browser
- Generate the report

## Output

Save all output to `qa-reports/{date}-{flow-name}/`:

- `qa-report.md` -- Full markdown report
- `00-initial.png` through `NN-description.png` -- Screenshots at each step

## agent-browser CLI Command Reference

| Action                 | Command                                          |
| ---------------------- | ------------------------------------------------ |
| Open URL               | `agent-browser open <url>`                       |
| Take screenshot        | `agent-browser screenshot --output <path>`       |
| Accessibility snapshot | `agent-browser snapshot -i`                      |
| Click element          | `agent-browser click <index>`                    |
| Type into field        | `agent-browser type <index> <text>`              |
| Read console           | `agent-browser console`                          |
| Page errors            | `agent-browser errors`                           |
| Get requests           | `agent-browser network requests`                 |
| HAR start              | `agent-browser network har start`                |
| HAR stop               | `agent-browser network har stop --output <path>` |
| Visual diff            | `agent-browser diff screenshot <a> <b>`          |
| DOM diff               | `agent-browser diff snapshot <a> <b>`            |
| Set viewport           | `agent-browser viewport <width> <height>`        |
| Wait                   | `agent-browser wait <ms>`                        |

## Report Format

Follow the template in the skill's `references/report-format.md`. Key sections:

- Header with URL, date, result (PASS/FAIL/ISSUES)
- Step-by-step findings with screenshots
- Console error summary table
- Network error summary table
- Recommended fixes ranked by severity
