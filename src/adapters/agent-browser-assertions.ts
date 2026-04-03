import type { AssertionResult, NetworkEvent, QAAssertion } from "../types.js";

export function buildAssertionResult(
  kind: QAAssertion["kind"],
  passed: boolean,
  failureMessage: string,
): AssertionResult {
  return {
    kind,
    passed,
    message: passed ? "Passed." : failureMessage,
  };
}

export function evaluateRequestAssertion(
  assertion: Extract<QAAssertion, { kind: "requestOccurred" }>,
  events: NetworkEvent[],
): AssertionResult {
  const matched = events.some((event) => {
    const methodMatches =
      !assertion.method ||
      event.method.toLowerCase() === assertion.method.toLowerCase();
    return methodMatches && event.url.includes(assertion.urlContains);
  });
  return buildAssertionResult(
    assertion.kind,
    matched,
    `Expected a request containing "${assertion.urlContains}".`,
  );
}
