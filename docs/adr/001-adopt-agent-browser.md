# ADR-001: Adopt agent-browser as the Browser Automation Engine

**Date:** 2026-04-01
**Status:** Accepted
**Deciders:** Calvin Kennedy
**Applies to:** manual-qa-machine (Claude Code plugin + skill + CLI)

> Note: this ADR captures the adoption decision and time-bound option analysis.
> The current supported runtime contract is defined by `README.md`, `commands/qa.md`,
> and `skills/qa/references/*`, not by the capability matrix below.

---

## Context

manual-qa-machine is a QA testing tool that runs as a Claude Code plugin, Claude Code skill, or standalone CLI. Its job is to walk through user flows step-by-step, capturing screenshots, console logs, and network errors at each checkpoint, then generate a structured markdown report.

The initial implementation (`src/runner.ts`) uses **puppeteer-core** to connect to a user-launched Chrome instance via CDP on port 9222. The Claude Code skill and command (`skills/qa/SKILL.md`, `commands/qa.md`) delegate browser interaction to **Chrome DevTools MCP** tools (`chrome_navigate`, `chrome_take_screenshot`, etc.), with Playwright MCP mentioned as a fallback.

This approach works for basic single-page checks but has concrete limitations that block the roadmap:

1. **No stable element references.** Puppeteer and Chrome DevTools MCP use CSS selectors for element targeting. Selectors break across page changes, dynamic content, and SPAs. There is no stable ref system for multi-step flows where the agent needs to reason about "the same button" across screenshots.

2. **No annotated screenshots.** Screenshots are raw PNGs. The agent (Claude) cannot correlate visual regions to actionable elements without manually running JavaScript to overlay bounding boxes. This makes agentic QA unreliable when the agent needs to decide what to click next.

3. **No visual or snapshot diffing.** Comparison runs are mentioned in the skill spec but not implemented. There is no built-in mechanism for pixel diff, DOM snapshot diff, or baseline comparison.

4. **No HAR recording or video.** Network capture is limited to request/response status codes via puppeteer event listeners. There is no HAR export. There is no video recording of the session for human review.

5. **No batch mode.** Each step requires a separate tool call through the MCP protocol or a separate puppeteer command. There is no way to send a batch of commands to reduce round-trip latency.

6. **Manual Chrome launch required.** Users must launch Chrome with `--remote-debugging-port=9222` before running any test. This is a friction point and a source of support issues.

We evaluated three alternatives to replace the browser automation engine while keeping manual-qa-machine as the QA workflow layer (skill definitions, command interface, flow file format, report generation).

## Decision

**Adopt agent-browser (vercel-labs/agent-browser) as the browser automation engine.** Replace puppeteer-core as the runtime dependency. Replace Chrome DevTools MCP tool references in the skill and command with agent-browser CLI/API calls.

manual-qa-machine retains ownership of:

- The `/qa` skill and command definitions
- The `.qa.json` flow file format and parser
- The `QAReport` type system and markdown report generator (`src/reporter.ts`)
- The `mqm` CLI interface (`src/cli.ts`)

agent-browser becomes the engine that manual-qa-machine calls for:

- Browser session lifecycle (launch, connect, close)
- Navigation, clicking, typing, scrolling
- Screenshot capture (with element annotations)
- Console log and network request capture
- HAR recording
- Visual diff and snapshot diff
- Video recording

### Why agent-browser over the other two options

**Stable element references (`@eN` refs).** agent-browser provides an accessibility-tree-based element reference system where elements are assigned stable `@e1`, `@e2`, etc. identifiers. These refs persist across screenshots and can be used in subsequent commands. This directly solves the problem of multi-step flow reliability. Neither Chrome DevTools MCP nor Playwright MCP offer an equivalent ref system.

**Annotated screenshots.** agent-browser overlays element reference labels directly on screenshots, so the agent can see which `@eN` corresponds to which visual element. This is the single most important capability for agentic QA, where Claude needs to decide the next action based on what it sees. Chrome DevTools MCP and Playwright MCP produce raw screenshots only.

**Built-in diff tools.** agent-browser provides both visual (pixel) diff and snapshot (DOM structure) diff out of the box. This enables baseline comparison runs without manual-qa-machine needing to implement image comparison or DOM diffing. Neither alternative offers this.

**HAR recording and video.** agent-browser records HAR files for full network inspection and supports video recording of sessions for human review. Chrome DevTools MCP has network inspection (via Lighthouse/CrUX) but not HAR export. Playwright MCP has neither.

**Batch command execution.** agent-browser supports sending multiple commands in a single call, reducing the round-trip overhead that makes MCP-based workflows slow. Neither MCP alternative supports batching.

**Daemon architecture.** agent-browser runs as a native Rust daemon managing the browser lifecycle. This eliminates the requirement for users to manually launch Chrome with debug flags. The daemon handles browser launch, connection, and cleanup.

**Apache-2.0 license.** Compatible with our MIT license. No restrictive copyleft.

## Alternatives Considered

### Option 1: Chrome DevTools MCP (Google)

An MCP server that exposes Chrome DevTools Protocol operations as MCP tools.

**Strengths:**

- Already partially integrated (skill and command reference its tools)
- Lighthouse and CrUX integration for performance auditing
- Familiar Chrome DevTools debugging workflow
- Maintained by Google

**Weaknesses:**

- No stable element reference system -- relies on CSS selectors
- No annotated screenshots -- raw PNGs only
- No batch mode -- one tool call per action
- No HAR export or video recording
- No visual diff or snapshot diff
- No built-in browser lifecycle management -- requires user to launch Chrome manually
- MCP protocol overhead for each step in a multi-step flow

**Verdict:** Good for ad-hoc debugging and performance auditing. Not suited for structured multi-step QA flows where the agent needs to reason about elements across steps.

### Option 2: Playwright MCP (Microsoft)

An MCP server wrapping Playwright, with an accessibility-tree-first interaction model.

**Strengths:**

- Accessibility tree representation gives semantic element descriptions
- Cross-browser support (Chromium, Firefox, WebKit)
- Playwright's mature automation primitives (auto-wait, selectors, network interception)
- Maintained by Microsoft

**Weaknesses:**

- Accessibility tree is the primary interface, screenshots are secondary -- inverts the priority for visual QA
- No stable ref system with annotated screenshots (accessibility tree entries are descriptive but not visually labeled)
- No HAR export within the MCP interface
- No visual diff or snapshot diff
- No video recording via MCP
- No batch command mode
- Requires separate Playwright installation and browser binaries

**Verdict:** Strong automation engine, but the accessibility-tree-first model deprioritizes the visual inspection workflow that manual QA testing requires. The MCP layer adds overhead without providing the diff and annotation features needed.

### Option 3: agent-browser (Vercel Labs) -- Selected

A native Rust CLI and daemon that manages browser sessions over CDP, with an agent-oriented feature set.

**Strengths:**

- Stable `@eN` element references that persist across interactions
- Annotated screenshots with element labels overlaid
- Visual diff (pixel comparison) and snapshot diff (DOM structure comparison)
- HAR recording for full network capture
- Video recording of sessions
- Live streaming dashboard for real-time session monitoring
- Batch command execution to reduce round-trip latency
- Auth vault for credential management
- iOS/Safari support (future cross-platform testing)
- Native Rust daemon -- fast startup, low memory, manages browser lifecycle
- Apache-2.0 license

**Weaknesses:**

- Newer project -- less battle-tested than Playwright or Chrome DevTools
- Adds a system dependency (Rust binary must be installed)
- API surface may change before 1.0 (version risk)
- Tighter coupling to Vercel Labs' development priorities
- No Lighthouse/CrUX integration (unlike Chrome DevTools MCP)

**Verdict:** Best fit for agent-driven QA workflows. The annotated screenshots and stable refs directly solve the core problem of making Claude effective at multi-step visual testing.

## Comparison Matrix

| Capability                      | Chrome DevTools MCP | Playwright MCP | agent-browser |
| ------------------------------- | :-----------------: | :------------: | :-----------: |
| Screenshots                     |         Yes         |      Yes       |      Yes      |
| Annotated screenshots (refs)    |         No          |       No       |      Yes      |
| Stable element references       | No (CSS selectors)  | No (a11y tree) |  Yes (`@eN`)  |
| Accessibility tree              |         No          | Yes (primary)  |      Yes      |
| Console log capture             |         Yes         |    Partial     |      Yes      |
| Network request capture         |         Yes         |    Partial     |      Yes      |
| HAR recording                   |         No          |       No       |      Yes      |
| Visual diff (pixel)             |         No          |       No       |      Yes      |
| Snapshot diff (DOM)             |         No          |       No       |      Yes      |
| Video recording                 |         No          |       No       |      Yes      |
| Live session dashboard          |         No          |       No       |      Yes      |
| Batch commands                  |         No          |       No       |      Yes      |
| Auth vault                      |         No          |       No       |      Yes      |
| Browser lifecycle management    | No (manual launch)  |      Yes       | Yes (daemon)  |
| Lighthouse / CrUX performance   |         Yes         |       No       |      No       |
| Cross-browser (Firefox, WebKit) |         No          |      Yes       |    Partial    |
| iOS / Safari support            |         No          |       No       |      Yes      |
| License                         |     Apache-2.0      |   Apache-2.0   |  Apache-2.0   |
| Integration model               |     MCP server      |   MCP server   | CLI + daemon  |
| Runtime                         |       Node.js       |    Node.js     |  Rust binary  |
| Maturity                        |        High         |      High      |     Early     |

## Consequences

### Positive

- **Annotated screenshots enable reliable agentic QA.** Claude can see element references overlaid on screenshots and issue commands using stable `@eN` identifiers rather than brittle CSS selectors. This is the primary quality improvement.

- **Visual diff unlocks baseline comparison.** The skill spec already describes comparison runs. agent-browser's built-in diff means manual-qa-machine can implement this without pulling in image comparison libraries.

- **HAR recording improves network diagnostics.** The current implementation only captures HTTP status codes from puppeteer event listeners. HAR files provide full request/response bodies, timing, and headers for deeper network analysis in QA reports.

- **Batch commands reduce latency.** Multi-step flows currently require one round-trip per action. Batching commands through agent-browser will reduce total flow execution time, which matters for flows with 10+ steps.

- **No manual Chrome launch.** The daemon manages browser lifecycle. This removes a friction point from the setup instructions and eliminates the "make sure Chrome is running with --remote-debugging-port=9222" error class.

- **Video recording adds human review artifact.** QA reports can link to session recordings, making it easier for humans to review what the agent actually did.

### Negative

- **System dependency on a Rust binary.** Users must install agent-browser separately. This is an additional setup step compared to the current approach where puppeteer-core is a pure npm dependency. Installation instructions must be updated.

- **Pre-1.0 API instability risk.** agent-browser is a newer project. Breaking changes in the CLI or daemon API could require manual-qa-machine updates. We mitigate this by isolating all agent-browser calls behind an adapter interface in `src/runner.ts`.

- **Loss of direct Lighthouse/CrUX integration.** Chrome DevTools MCP provides performance auditing via Lighthouse and CrUX. agent-browser does not. If performance auditing is needed, it would require a separate tool or a supplementary Chrome DevTools MCP integration for that specific use case.

- **Dependency on Vercel Labs' maintenance.** If the project is abandoned or pivots, we inherit the cost of either forking or migrating again. The Apache-2.0 license means forking is viable, and the current puppeteer-core code can serve as a fallback path.

### Neutral

- **The `.qa.json` flow file format does not change.** The flow definition schema (`QAStep`, `QAFlow` types in `src/types.ts`) remains the same. Only the runner implementation changes.

- **The `QAReport` type and markdown report generator do not change.** `src/reporter.ts` is independent of the browser engine. New data (HAR paths, video paths, diff results) will be added incrementally as new fields on `StepResult` and `QAReport`.

- **The Claude Code skill and command will need updated tool references.** `commands/qa.md` and `skills/qa/SKILL.md` currently reference `mcp__plugin_manual_qa_machine_chrome_devtools__*` tools. These will be updated to reference agent-browser operations, either via new MCP tool names or via direct CLI invocation through the Bash tool.

- **The `mqm` CLI interface does not change.** Users still run `mqm run --url` or `mqm run --flow`. The internal implementation of `QARunner` changes, but the public API stays the same.

## Migration Plan

1. **Add agent-browser adapter.** Create `src/engine/agent-browser.ts` implementing the same `connect()`, `runFlow()`, `disconnect()` interface that `QARunner` currently exposes. Keep the puppeteer-core implementation as `src/engine/puppeteer.ts` for fallback.

2. **Update `src/runner.ts`.** Make it a facade that selects the engine based on availability (agent-browser preferred, puppeteer-core fallback).

3. **Extend types.** Add optional fields to `StepResult` for annotated screenshot paths, HAR file paths, video paths, and diff results.

4. **Update skill and command.** Replace Chrome DevTools MCP tool references with agent-browser operations in `skills/qa/SKILL.md` and `commands/qa.md`.

5. **Update README and setup docs.** Replace Chrome manual launch instructions with agent-browser installation instructions.

6. **Remove puppeteer-core dependency** once agent-browser integration is stable and the fallback path is no longer needed.

## Open Questions

- **What is the minimum supported agent-browser version?** We should pin to a specific version range until the project reaches 1.0 stability.
- **How does agent-browser handle authenticated sessions?** The auth vault feature needs evaluation to determine whether it replaces the "log in manually in Chrome first" workflow or supplements it.
- **Should we keep Chrome DevTools MCP as an optional integration for Lighthouse/CrUX?** Performance auditing is a distinct concern from functional QA, but users may expect it in the same tool.

---

_This ADR was authored on 2026-04-01. It supersedes the implicit decision to use puppeteer-core + Chrome DevTools MCP established when the project was created._
