---
name: Manual QA Machine
description: >
  This skill should be used when the user asks to "QA test a website",
  "test the onboarding flow", "screenshot every step", "manual test this page",
  "generate a QA report", "test user flow", "check for UI issues", "run QA",
  "walk through the app", "test this URL", or mentions manual testing, QA testing,
  visual testing, or screenshot-based testing of web applications.
version: 0.2.0
---

# Manual QA Machine

Automate manual QA testing of web applications using agent-browser CLI. Walk through
any user flow step-by-step, capturing screenshots, console logs, network errors, and
performance data at every checkpoint. Generate a structured markdown QA report.

## Prerequisites

This skill requires **agent-browser** to be installed globally.

**Install agent-browser:**

```bash
npm install -g agent-browser && agent-browser install
```

The `agent-browser install` command downloads and configures a Chromium browser
automatically. No manual Chrome launch or remote debugging port is required.

**Verify installation:**

```bash
agent-browser --version
```

## QA Workflow

When the user provides a URL or describes a flow to test, execute this workflow:

### 1. Initialize

- Verify agent-browser is installed by running `agent-browser --version` via Bash
- Create a timestamped output directory: `qa-reports/{date}-{flow-name}/`
- Open the starting URL: `agent-browser open <url>`
- Take an initial screenshot: `agent-browser screenshot --output qa-reports/{dir}/00-initial.png`
- Take an accessibility snapshot to understand page structure: `agent-browser snapshot -i`
- Capture the initial console log state: `agent-browser console`

### 2. Step-by-Step Execution

For each step in the user flow:

1. **Execute the action** — Use the accessibility snapshot output to identify interactive
   elements by their index. Interact via `agent-browser snapshot -i` to get the current
   element map, then use `agent-browser click <index>`, `agent-browser type <index> <text>`,
   `agent-browser scroll`, or `agent-browser open <url>` to navigate.
2. **Wait for stability** — Allow the page to settle. Use `agent-browser wait <ms>` if
   needed, or take a fresh snapshot to confirm the page has updated.
3. **Capture screenshot** — `agent-browser screenshot --output qa-reports/{dir}/{NN}-{description}.png`
4. **Check console logs** — `agent-browser console` to read recent console output. Flag
   any errors or warnings.
5. **Check for errors** — `agent-browser errors` to surface uncaught exceptions and page
   errors.
6. **Check network requests** — `agent-browser network requests` to inspect recent
   requests. Flag any failed requests (4xx, 5xx).
7. **Note observations** — Visual issues, broken layouts, missing elements, slow loads.

### 3. Advanced Capture (When Needed)

- **HAR recording** — Start a HAR capture before a flow segment with
  `agent-browser network har start`, then stop and save with
  `agent-browser network har stop --output qa-reports/{dir}/network.har`.
- **Visual regression** — Compare a screenshot against a baseline with
  `agent-browser diff screenshot <baseline.png> <current.png>`.
- **DOM state diff** — Compare page structure between two points with
  `agent-browser diff snapshot <before.json> <after.json>`.

### 4. Report Generation

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

**Natural language:** "Test the signup flow on vibecord.com -- go to signup, enter an
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

**Authentication required:** Use `agent-browser open <login-url>` to navigate to the
login page first. Use `agent-browser snapshot -i` to identify form fields, then
`agent-browser type <index> <value>` and `agent-browser click <index>` to log in
programmatically. Alternatively, ask the user to provide session cookies.

**Dynamic content / SPAs:** After each action, wait for the page to stabilize. Use
`agent-browser wait <ms>` or take a fresh `agent-browser snapshot -i` to confirm the
page has updated before capturing screenshots.

**Responsive testing:** If the user requests it, repeat the flow at multiple viewports
by using `agent-browser viewport <width> <height>` before each run:

- Desktop: 1920x1080
- Tablet: 768x1024
- Mobile: 375x667

**Comparison runs:** If a previous QA report exists for the same flow, use
`agent-browser diff screenshot` to compare screenshots and note any visual regressions
in the new report.

## Tool Mapping

All interactions use the Bash tool to invoke agent-browser CLI commands:

| Action                 | Command                                          |
| ---------------------- | ------------------------------------------------ |
| Navigate               | `agent-browser open <url>`                       |
| Screenshot             | `agent-browser screenshot --output <path>`       |
| Accessibility snapshot | `agent-browser snapshot -i`                      |
| Click element          | `agent-browser click <index>`                    |
| Type text              | `agent-browser type <index> <text>`              |
| Console logs           | `agent-browser console`                          |
| Page errors            | `agent-browser errors`                           |
| Network requests       | `agent-browser network requests`                 |
| HAR start              | `agent-browser network har start`                |
| HAR stop               | `agent-browser network har stop --output <path>` |
| Visual diff            | `agent-browser diff screenshot <a> <b>`          |
| DOM diff               | `agent-browser diff snapshot <a> <b>`            |
| Set viewport           | `agent-browser viewport <width> <height>`        |
| Wait                   | `agent-browser wait <ms>`                        |
| Scroll                 | `agent-browser scroll [direction]`               |

## Additional Resources

### Reference Files

- **`references/report-format.md`** -- QA report markdown template
- **`references/agent-browser-setup.md`** -- Detailed agent-browser installation and setup guide

### Scripts

- **`scripts/serve-report.sh`** -- Local server to view QA reports with embedded images
