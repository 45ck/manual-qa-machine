import type {
  ExploreInteraction,
  ExploreState,
  InteractiveElement,
  NextAction,
} from "./explore-types.js";
import { normalizeUrl } from "./explore-helpers.js";

// ---------------------------------------------------------------------------
// Heuristic decision function
// ---------------------------------------------------------------------------

export function heuristicDecision(
  state: ExploreState,
  history: ExploreInteraction[],
): NextAction {
  const triedActions = new Set(history.map((h) => h.action));

  return (
    tryUnvisitedLink(state) ??
    tryInteractiveElement(state, triedActions) ??
    tryScroll(history) ??
    tryBack(history) ??
    doneAction()
  );
}

// ---------------------------------------------------------------------------
// Priority 1: Unvisited links within scope
// ---------------------------------------------------------------------------

function tryUnvisitedLink(state: ExploreState): NextAction | undefined {
  for (const link of state.links) {
    if (!link.visible) continue;
    const normalized = normalizeUrl(link.href);
    if (state.pagesVisited.has(normalized)) continue;
    return {
      kind: "navigate",
      target: link.href,
      reason: `Visit unvisited link: ${link.text || link.href}`,
    };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Priority 2: Interactive elements not yet tried
// ---------------------------------------------------------------------------

function tryInteractiveElement(
  state: ExploreState,
  triedActions: Set<string>,
): NextAction | undefined {
  for (const element of state.interactiveElements) {
    const actionKey = `click ${element.selector}`;
    if (triedActions.has(actionKey)) continue;
    if (element.tag === "a") continue;

    return elementToAction(element);
  }
  return undefined;
}

function elementToAction(element: InteractiveElement): NextAction {
  if (isButton(element)) {
    return {
      kind: "click",
      target: element.selector,
      reason: `Click untried button: ${element.text || element.selector}`,
    };
  }
  if (isTextInput(element)) {
    return {
      kind: "type",
      target: element.selector,
      value: "test",
      reason: `Fill untried input: ${element.text || element.selector}`,
    };
  }
  return {
    kind: "click",
    target: element.selector,
    reason: `Click untried element: ${element.text || element.selector}`,
  };
}

function isButton(element: InteractiveElement): boolean {
  return (
    element.role === "button" ||
    element.tag === "button" ||
    element.tag === "summary"
  );
}

function isTextInput(element: InteractiveElement): boolean {
  return (
    element.role === "textbox" ||
    element.tag === "input" ||
    element.tag === "textarea"
  );
}

// ---------------------------------------------------------------------------
// Priority 3: Scroll down to discover more content
// ---------------------------------------------------------------------------

function tryScroll(history: ExploreInteraction[]): NextAction | undefined {
  const scrollCount = history.filter((h) =>
    h.action.startsWith("scroll"),
  ).length;
  if (scrollCount < 3) {
    return {
      kind: "scroll",
      reason: "Scroll down to discover more content",
    };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Priority 4: Navigate back if stuck
// ---------------------------------------------------------------------------

function tryBack(history: ExploreInteraction[]): NextAction | undefined {
  const backCount = history.filter((h) => h.action.startsWith("back")).length;
  if (backCount < 2) {
    return {
      kind: "back",
      reason: "Navigate back to discover new paths",
    };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Fallback: nothing left
// ---------------------------------------------------------------------------

function doneAction(): NextAction {
  return {
    kind: "done",
    reason: "No unvisited links, untried elements, or scroll targets remain",
  };
}
