# manual-qa-machine

AI-powered manual QA testing. Screenshots, console logs, and network capture at every step of a user flow.

Works as a **Claude Code plugin**, **Claude Code skill**, or **standalone CLI**.

Powered by [agent-browser](https://github.com/vercel-labs/agent-browser) — a Rust CLI+daemon over Chrome DevTools Protocol.

## Quick Start

### As a Claude Code Plugin

```bash
claude plugin add 45ck/manual-qa-machine
```

Then in Claude Code:

```
/qa test the signup flow on https://myapp.com
```

### As a Standalone Skill

Copy `skills/qa/` to your `.claude/skills/` directory:

```bash
cp -r skills/qa ~/.claude/skills/manual-qa
```

### As a CLI

```bash
npx manual-qa-machine run --url https://myapp.com --name "Homepage Check"
```

## Prerequisites

**agent-browser** must be installed globally:

```bash
npm install -g @anthropic-ai/agent-browser
```

Or via Cargo:

```bash
cargo install agent-browser
```

Verify installation:

```bash
agent-browser --version
```

agent-browser manages its own Chrome/Chromium instance — no need to launch Chrome with special flags.

## Usage

### Claude Code (Plugin/Skill)

Describe what you want to test:

```
/qa test the onboarding flow — go to signup, enter email, submit, check dashboard loads
```

```
/qa screenshot every page of https://myapp.com and check for console errors
```

```
/qa walk through the checkout flow and generate a QA report
```

Claude will:

1. Navigate through each step using agent-browser
2. Screenshot at every checkpoint
3. Capture console errors and network failures
4. Generate a markdown QA report

### CLI

**Run a flow from a JSON file:**

```bash
mqm run --flow signup.qa.json --output ./qa-reports/signup
```

**Quick URL check:**

```bash
mqm run --url https://myapp.com --name "Homepage"
```

**Single screenshot:**

```bash
mqm screenshot --url https://myapp.com -o homepage.png
```

### Flow File Format

Create a `.qa.json` file:

```json
{
  "name": "Signup Flow",
  "url": "https://myapp.com",
  "steps": [
    {
      "action": "navigate",
      "target": "/signup",
      "screenshot": true,
      "description": "Open signup page"
    },
    {
      "action": "type",
      "target": "#email",
      "value": "test@example.com",
      "description": "Enter email"
    },
    {
      "action": "click",
      "target": "#submit",
      "wait": 3000,
      "screenshot": true,
      "description": "Submit form"
    },
    {
      "action": "assert",
      "target": "Welcome",
      "screenshot": true,
      "description": "Verify dashboard"
    }
  ]
}
```

## Output

QA reports are saved as markdown with embedded screenshot references:

```
qa-reports/
  2026-04-01-signup-flow/
    qa-report.md
    00-initial.png
    01-open-signup-page.png
    02-enter-email.png
    03-submit-form.png
    04-verify-dashboard.png
```

## Testing Authenticated Flows

agent-browser manages its own browser instance with persistent state. Log in once through the agent-browser session and your cookies persist across QA runs.

## License

MIT
