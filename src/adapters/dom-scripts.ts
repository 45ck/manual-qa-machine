import type { QATarget } from "../types.js";

function embedTarget(target: QATarget): string {
  return JSON.stringify(target);
}

function sharedLocator(target: QATarget): string {
  return `
    const target = ${embedTarget(target)};
    ${matchingHelpersSource()}
    ${locatorHelpersSource()}
    ${stateHelpersSource()}
  `;
}

function matchingHelpersSource(): string {
  return `
    const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim();
    const matches = (actual, expected, exact) =>
      exact ? normalize(actual) === normalize(expected) : normalize(actual).includes(normalize(expected));
  `;
}

function locatorHelpersSource(): string {
  return `
    const roleFor = (element) => {
      const explicit = element.getAttribute("role");
      if (explicit) return explicit;
      const tag = element.tagName.toLowerCase();
      if (tag === "button" || tag === "summary") return "button";
      if (tag === "a" && element.hasAttribute("href")) return "link";
      if (tag === "select") return "combobox";
      if (tag === "textarea") return "textbox";
      if (tag !== "input") return "";
      const type = (element.getAttribute("type") || "text").toLowerCase();
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "submit" || type === "button") return "button";
      return "textbox";
    };
    const nameFor = (element) => {
      const ariaLabel = element.getAttribute("aria-label");
      if (ariaLabel) return ariaLabel;
      const labelledBy = element.getAttribute("aria-labelledby");
      if (labelledBy) {
        const labels = labelledBy
          .split(/\\s+/)
          .map((id) => document.getElementById(id))
          .filter(Boolean)
          .map((node) => node.textContent);
        if (labels.length > 0) return labels.join(" ");
      }
      if ("labels" in element && element.labels?.length) {
        return Array.from(element.labels).map((label) => label.textContent).join(" ");
      }
      return element.getAttribute("title") || element.getAttribute("placeholder") || element.textContent || "";
    };
    const byLabel = (text, exact) => {
      const labels = Array.from(document.querySelectorAll("label"));
      const match = labels.find((label) => matches(label.textContent, text, exact));
      if (!match) return null;
      if (match.htmlFor) return document.getElementById(match.htmlFor);
      return match.querySelector("input, textarea, select, button");
    };
    const byText = (text, exact) =>
      Array.from(document.querySelectorAll("body *")).find((element) => matches(element.textContent, text, exact)) || null;
    const byPlaceholder = (text, exact) =>
      Array.from(document.querySelectorAll("[placeholder]")).find((element) =>
        matches(element.getAttribute("placeholder"), text, exact),
      ) || null;
    const byRole = (role, name, exact) =>
      Array.from(document.querySelectorAll("body *")).find((element) => {
        if (roleFor(element) !== role) return false;
        return matches(nameFor(element), name, exact);
      }) || null;
    const findElement = () => {
      switch (target.kind) {
        case "css":
          return document.querySelector(target.selector);
        case "text":
          return byText(target.text, Boolean(target.exact));
        case "label":
          return byLabel(target.text, Boolean(target.exact));
        case "placeholder":
          return byPlaceholder(target.text, Boolean(target.exact));
        case "role":
          return byRole(target.role, target.name, Boolean(target.exact));
        default:
          return null;
      }
    };
    const element = findElement();
  `;
}

function stateHelpersSource(): string {
  return `
    const isVisible = (candidate) => {
      if (!candidate) return false;
      const style = window.getComputedStyle(candidate);
      return !(style.display === "none" || style.visibility === "hidden" || style.opacity === "0") &&
        candidate.getBoundingClientRect().width > 0 &&
        candidate.getBoundingClientRect().height > 0;
    };
    const isEnabled = (candidate) =>
      Boolean(candidate) &&
      !candidate.hasAttribute("disabled") &&
      candidate.getAttribute("aria-disabled") !== "true";
  `;
}

export function buildTargetActionScript(
  target: QATarget,
  action: "click" | "fill" | "select",
  value?: string,
): string {
  const encodedValue = JSON.stringify(value ?? "");
  return `(() => {
    ${sharedLocator(target)}
    if (!element) return JSON.stringify({ ok: false, reason: "not-found" });
    if (${JSON.stringify(action)} === "click") {
      element.click();
    }
    if (${JSON.stringify(action)} === "fill") {
      if (!("value" in element)) return JSON.stringify({ ok: false, reason: "not-fillable" });
      element.focus();
      element.value = ${encodedValue};
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (${JSON.stringify(action)} === "select") {
      if (!(element instanceof HTMLSelectElement)) {
        return JSON.stringify({ ok: false, reason: "not-select" });
      }
      element.value = ${encodedValue};
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return JSON.stringify({ ok: true });
  })()`;
}

export function buildTargetStateScript(
  target: QATarget,
  state: "visible" | "enabled",
): string {
  return `(() => {
    ${sharedLocator(target)}
    if (!element) return JSON.stringify({ ok: false, value: false });
    return JSON.stringify({
      ok: true,
      value: ${JSON.stringify(state)} === "visible" ? isVisible(element) : isEnabled(element),
    });
  })()`;
}

export function buildWaitFunctionScript(
  target: QATarget,
  state: string,
): string {
  return `(() => {
    ${sharedLocator(target)}
    if (${JSON.stringify(state)} === "hidden") return element ? !isVisible(element) : true;
    if (${JSON.stringify(state)} === "detached") return !element;
    return isVisible(element);
  })()`;
}

export function buildTextPresenceScript(text: string): string {
  return `document.body.innerText.includes(${JSON.stringify(text)})`;
}

export function buildAccessibilityAuditScript(): string {
  return `(() => {
    const issues = [];
    const push = (id, severity, message, selector) => issues.push({ id, severity, message, selector });
    if (!document.title.trim()) push("page-title", "critical", "Document title is missing or empty");
    if (!document.documentElement.lang) push("html-lang", "critical", "The html element is missing a lang attribute");
    for (const image of document.querySelectorAll("img")) {
      if (!image.hasAttribute("alt")) push("image-alt", "critical", "Image is missing alt text", image.outerHTML.slice(0, 80));
    }
    const controls = document.querySelectorAll(
      "button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=textbox]",
    );
    for (const control of controls) {
      const label =
        control.getAttribute("aria-label") ||
        control.getAttribute("title") ||
        control.getAttribute("placeholder") ||
        control.textContent ||
        "";
      const hasLabel = label.trim().length > 0 || ("labels" in control && control.labels?.length);
      if (!hasLabel) {
        push("control-name", "critical", "Interactive control is missing an accessible name", control.outerHTML.slice(0, 80));
      }
    }
    const seenIds = new Set();
    for (const element of document.querySelectorAll("[id]")) {
      if (seenIds.has(element.id)) {
        push("duplicate-id", "warning", "Duplicate id attribute found", "#" + element.id);
      }
      seenIds.add(element.id);
    }
    return JSON.stringify(issues);
  })()`;
}

export function buildPerformanceScript(): string {
  return `(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
    const largestContentfulPaint = lcpEntries.length > 0 ? lcpEntries[lcpEntries.length - 1].startTime : undefined;
    return JSON.stringify({
      navigationMs: navigation?.duration,
      domContentLoadedMs: navigation?.domContentLoadedEventEnd,
      loadMs: navigation?.loadEventEnd,
      largestContentfulPaintMs: largestContentfulPaint,
    });
  })()`;
}

export function buildLinkExtractionScript(): string {
  return `(() => {
    const isVisible = (el) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return !(style.display === "none" || style.visibility === "hidden" || style.opacity === "0") &&
        el.getBoundingClientRect().width > 0 &&
        el.getBoundingClientRect().height > 0;
    };
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    const results = [];
    for (const a of anchors) {
      const raw = a.getAttribute("href") || "";
      if (!raw || raw.startsWith("javascript:")) continue;
      let href;
      try {
        href = new URL(raw, location.href).href;
      } catch {
        continue;
      }
      results.push({
        href,
        text: (a.textContent || "").trim().slice(0, 200),
        visible: isVisible(a),
      });
    }
    return JSON.stringify(results);
  })()`;
}

export function buildInteractiveElementsScript(): string {
  return `(() => {
    const isVisible = (el) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return !(style.display === "none" || style.visibility === "hidden" || style.opacity === "0") &&
        el.getBoundingClientRect().width > 0 &&
        el.getBoundingClientRect().height > 0;
    };
    const roleFor = (el) => {
      const explicit = el.getAttribute("role");
      if (explicit) return explicit;
      const tag = el.tagName.toLowerCase();
      if (tag === "button" || tag === "summary") return "button";
      if (tag === "a" && el.hasAttribute("href")) return "link";
      if (tag === "select") return "combobox";
      if (tag === "textarea") return "textbox";
      if (tag !== "input") return "";
      const type = (el.getAttribute("type") || "text").toLowerCase();
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "submit" || type === "button") return "button";
      return "textbox";
    };
    const buildSelector = (el) => {
      const parts = [];
      let current = el;
      while (current && current !== document.body && current !== document.documentElement) {
        let seg = current.tagName.toLowerCase();
        if (current.id) {
          seg += "#" + current.id;
          parts.unshift(seg);
          break;
        }
        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(
            (c) => c.tagName === current.tagName,
          );
          if (siblings.length > 1) {
            const idx = siblings.indexOf(current) + 1;
            seg += ":nth-of-type(" + idx + ")";
          }
        }
        parts.unshift(seg);
        current = parent;
      }
      return parts.join(" > ");
    };
    const selector = "button, input:not([type=hidden]), a[href], select, textarea, " +
      "[role=button], [role=link], [role=textbox], [contenteditable]";
    const elements = Array.from(document.querySelectorAll(selector));
    const seen = new Set();
    const results = [];
    let index = 0;
    for (const el of elements) {
      if (seen.has(el)) continue;
      seen.add(el);
      if (!isVisible(el)) continue;
      if (index >= 200) break;
      const tag = el.tagName.toLowerCase();
      const type = el.getAttribute("type") || undefined;
      const role = roleFor(el) || undefined;
      const text = (
        el.getAttribute("aria-label") ||
        (el.textContent || "").trim() ||
        el.getAttribute("placeholder") ||
        el.getAttribute("title") ||
        ""
      ).slice(0, 200);
      const name = el.getAttribute("name") || undefined;
      const cssPath = buildSelector(el);
      results.push({ index, tag, type, role, text, name, selector: cssPath });
      index++;
    }
    return JSON.stringify(results);
  })()`;
}
