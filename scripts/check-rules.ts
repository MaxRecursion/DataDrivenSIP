/**
 * Static checks for rules a type checker can't see (CLAUDE.md "Non-negotiable", PLAN.md §8, §11):
 * - animate transform and opacity only; no will-change in static CSS; no scroll-triggered reveals
 * - m components inside LazyMotion only: no motion.*, no domMax, no layout animations
 * - no advice-sounding words in user-facing copy
 * - no Inter or Geist
 *
 * tests/rules/rules.test.ts runs these over src/ and index.html; `pnpm check:rules` prints them.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

export type Rule = "animation" | "motion" | "copy" | "font";
export type Violation = { file: string; line: number; rule: Rule; detail: string };

const ANIMATABLE = new Set(["transform", "opacity"]);
const KEYFRAME_ALLOWED = new Set(["transform", "opacity", "animation-timing-function"]);

/** Keys a Motion animation target may use: opacity and the transform family. */
const MOTION_TARGET_ALLOWED = new Set([
  "opacity", "transform", "transformOrigin", "originX", "originY", "x", "y", "z",
  "translateX", "translateY", "translateZ", "scale", "scaleX", "scaleY",
  "rotate", "rotateX", "rotateY", "rotateZ", "skew", "skewX", "skewY", "transition",
  "transitionEnd",
]);
const MOTION_TARGET_PROPS = new Set(["initial", "animate", "exit", "whileHover", "whileTap", "whileFocus", "whileDrag"]);
const WAAPI_KEYFRAME_ALLOWED = new Set(["transform", "opacity", "offset", "easing", "composite"]);

const bounded = (pattern: string) => new RegExp(`(?<![\\w-])${pattern}(?![\\w-])`, "i");
const BANNED_COPY: ReadonlyArray<readonly [string, RegExp]> = [
  ["best", bounded("best")],
  ["recommend", /(?<![\w-])recommend/i],
  ["safe", bounded("safe")],
  ["real advantage", bounded("real advantage")],
  ["winner", bounded("winners?")],
  ["guarantee", /(?<![\w-])guarantee/i],
  ["outperform", /(?<![\w-])outperform/i],
  ["top performing", bounded("top[- ]performing")],
];

/** Disclaimers that have to name a banned idea in order to deny it. */
const ALLOWED_COPY = ["Not a recommendation to buy, sell or hold any scheme"];

const BANNED_FONT = /(?<![\w-])(Inter|Geist)(?![\w-])/;

/** JSX attributes whose values are never user-facing copy. */
const NON_COPY_ATTRIBUTES = new Set(["className", "class", "href", "src", "id", "key", "type", "rel", "as", "role", "name", "htmlFor"]);

// ---------------------------------------------------------------------------------------------
// Shared helpers

function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of value) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** "md:hover:transition-colors!" → "transition-colors". Ignores ":" inside brackets. */
function baseUtility(token: string): string {
  let depth = 0;
  let start = 0;
  for (let i = 0; i < token.length; i++) {
    const char = token[i];
    if (char === "[") depth++;
    else if (char === "]") depth--;
    else if (char === ":" && depth === 0) start = i + 1;
  }
  return token.slice(start).replace(/^!|!$/g, "");
}

/** Why a Tailwind utility breaks the animation rule, or null if it doesn't. */
export function classViolation(token: string): string | null {
  const utility = baseUtility(token);
  if (["transition", "transition-all", "transition-colors", "transition-shadow"].includes(utility)) {
    return `${utility} animates more than transform and opacity`;
  }
  if (utility.startsWith("transition-[")) {
    const properties = utility.slice("transition-[".length, -1).split(",").map((p) => p.trim()).filter(Boolean);
    const bad = properties.filter((property) => !ANIMATABLE.has(property));
    return bad.length > 0 ? `${utility} animates ${bad.join(", ")}` : null;
  }
  if (utility.startsWith("animate-") && utility !== "animate-none") return `${utility} runs a keyframe animation`;
  if (utility.startsWith("will-change-")) return `${utility} leaves will-change in static CSS`;
  return null;
}

function transitionViolation(value: string): string | null {
  if (value.trim() === "none") return null;
  for (const part of splitTopLevel(value)) {
    const property = part.split(/\s+/)[0] ?? "";
    // A duration or easing in first position means the transition applies to "all".
    if (!ANIMATABLE.has(property)) return `transition on "${property}"`;
  }
  return null;
}

function transitionPropertyViolation(value: string): string | null {
  const bad = splitTopLevel(value).filter((property) => property !== "none" && !ANIMATABLE.has(property));
  return bad.length > 0 ? `transition-property: ${bad.join(", ")}` : null;
}

function copyViolations(text: string): string[] {
  let copy = text.replace(/\s+/g, " ");
  for (const allowed of ALLOWED_COPY) copy = copy.split(allowed).join(" ");
  return BANNED_COPY.filter(([, pattern]) => pattern.test(copy)).map(([name]) => `"${name}" in user-facing text`);
}

// ---------------------------------------------------------------------------------------------
// CSS

function blockBody(text: string, openBrace: number): string {
  let depth = 0;
  for (let i = openBrace; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return text.slice(openBrace + 1, i);
  }
  return text.slice(openBrace + 1);
}

export function checkCss(file: string, source: string): Violation[] {
  // Blank out comments but keep newlines so line numbers stay right.
  const text = source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
  const violations: Violation[] = [];
  const add = (index: number, rule: Rule, detail: string) => violations.push({ file, line: lineAt(text, index), rule, detail });

  for (const match of text.matchAll(/(?:^|[{;\s])(transition-property|transition|will-change)\s*:\s*([^;}]*)/g)) {
    const [, property, value = ""] = match;
    const why =
      property === "will-change"
        ? "will-change in static CSS"
        : property === "transition"
          ? transitionViolation(value)
          : transitionPropertyViolation(value);
    if (why) add(match.index, "animation", why);
  }

  for (const match of text.matchAll(/@apply\s+([^;]+);/g)) {
    for (const token of (match[1] ?? "").split(/\s+/)) {
      const why = classViolation(token);
      if (why) add(match.index, "animation", why);
    }
  }

  for (const match of text.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
    const body = blockBody(text, match.index + match[0].length - 1);
    for (const declaration of body.matchAll(/([a-z-]+)\s*:/g)) {
      const property = declaration[1] ?? "";
      if (!KEYFRAME_ALLOWED.has(property)) add(match.index, "animation", `@keyframes ${match[1]} animates ${property}`);
    }
  }

  for (const match of text.matchAll(new RegExp(BANNED_FONT, "g"))) {
    add(match.index, "font", `${match[1]} is not an allowed font`);
  }
  return violations;
}

// ---------------------------------------------------------------------------------------------
// TypeScript and TSX

function propertyName(name: ts.PropertyName, sourceFile: ts.SourceFile): string {
  return name.getText(sourceFile).replace(/^["']|["']$/g, "");
}

export function checkTsx(file: string, source: string): Violation[] {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const violations: Violation[] = [];
  const add = (node: ts.Node, rule: Rule, detail: string) =>
    violations.push({ file, line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1, rule, detail });

  const checkString = (node: ts.Node, text: string, isCopy: boolean) => {
    for (const token of text.split(/\s+/)) {
      const why = classViolation(token);
      if (why) add(node, "animation", why);
    }
    const font = BANNED_FONT.exec(text);
    if (font) add(node, "font", `${font[1]} is not an allowed font`);
    if (isCopy) for (const detail of copyViolations(text)) add(node, "copy", detail);
  };

  const stringsIn = (node: ts.Node, isCopy: boolean) => {
    const walk = (child: ts.Node): void => {
      if (ts.isStringLiteral(child) || ts.isNoSubstitutionTemplateLiteral(child)) checkString(child, child.text, isCopy);
      else if (ts.isTemplateHead(child) || ts.isTemplateMiddle(child) || ts.isTemplateTail(child)) checkString(child, child.text, isCopy);
      ts.forEachChild(child, walk);
    };
    walk(node);
  };

  const checkTargetObject = (node: ts.Expression, allowed: Set<string>, context: string) => {
    if (!ts.isObjectLiteralExpression(node)) return;
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) continue;
      const key = propertyName(property.name, sourceFile);
      if (!allowed.has(key)) add(property, "animation", `${context} animates "${key}"`);
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const from = ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : "";
      if (from === "framer-motion") add(node, "motion", "import from motion/react, not framer-motion");
      if (from === "motion/react" || from === "motion" || from === "framer-motion") {
        const bindings = node.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            const imported = (element.propertyName ?? element.name).text;
            if (imported === "motion") add(element, "motion", "use m inside LazyMotion, not motion");
            if (imported === "domMax") add(element, "motion", "domMax isn't allowed; the one morph is a FLIP (PLAN.md D10a)");
          }
        }
      }
      return;
    }

    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sourceFile);
      if (name === "layout" || name === "layoutId") add(node, "motion", `${name} needs domMax; the one morph is a FLIP (PLAN.md D10a)`);
      if (name === "whileInView") add(node, "motion", "scroll-triggered reveals are forbidden (spec §8.4)");
      const expression = node.initializer && ts.isJsxExpression(node.initializer) ? node.initializer.expression : undefined;
      if (expression && MOTION_TARGET_PROPS.has(name)) checkTargetObject(expression, MOTION_TARGET_ALLOWED, name);
      if (expression && name === "variants" && ts.isObjectLiteralExpression(expression)) {
        for (const variant of expression.properties) {
          if (ts.isPropertyAssignment(variant)) checkTargetObject(variant.initializer, MOTION_TARGET_ALLOWED, "variant");
        }
      }
      if (node.initializer && (NON_COPY_ATTRIBUTES.has(name) || name.startsWith("data-"))) {
        stringsIn(node.initializer, false);
        return;
      }
    }

    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "motion") {
      add(node, "motion", "motion.* components aren't allowed; use m.*");
    }

    // element.animate(keyframes, options): WAAPI keyframes may only use transform and opacity.
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "animate") {
      const keyframes = node.arguments[0];
      if (keyframes && ts.isArrayLiteralExpression(keyframes)) {
        for (const frame of keyframes.elements) checkTargetObject(frame, WAAPI_KEYFRAME_ALLOWED, "animate() keyframe");
      } else if (keyframes) {
        checkTargetObject(keyframes, WAAPI_KEYFRAME_ALLOWED, "animate() keyframe");
      }
    }

    // Style objects: { transition: "height 200ms" }, { willChange: "transform" }.
    if (ts.isPropertyAssignment(node) && ts.isStringLiteralLike(node.initializer)) {
      const key = propertyName(node.name, sourceFile);
      const value = node.initializer.text;
      const why =
        key === "willChange" || key === "will-change"
          ? "will-change in a static style; set it only while animating"
          : key === "transition"
            ? transitionViolation(value)
            : key === "transitionProperty" || key === "transition-property"
              ? transitionPropertyViolation(value)
              : key === "animation" || key === "animationName"
                ? "CSS keyframe animation in a style object"
                : null;
      if (why) add(node, "animation", why);
    }

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) checkString(node, node.text, true);
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) checkString(node, node.text, true);
    else if (ts.isJsxText(node)) checkString(node, node.text, true);

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

// ---------------------------------------------------------------------------------------------
// HTML

export function checkHtml(file: string, source: string): Violation[] {
  const violations: Violation[] = [];
  const withoutScripts = source.replace(/<script[\s\S]*?<\/script>/gi, (block) => block.replace(/[^\n]/g, " "));

  for (const match of withoutScripts.matchAll(/(?:>([^<]+)<)|(?:\b(?:content|title|alt|aria-label)="([^"]*)")/g)) {
    const text = match[1] ?? match[2] ?? "";
    for (const detail of copyViolations(text)) violations.push({ file, line: lineAt(source, match.index), rule: "copy", detail });
  }
  for (const match of source.matchAll(new RegExp(BANNED_FONT, "g"))) {
    violations.push({ file, line: lineAt(source, match.index), rule: "font", detail: `${match[1]} is not an allowed font` });
  }
  return violations;
}

// ---------------------------------------------------------------------------------------------
// Project

export function checkProject(root: string): Violation[] {
  const sourceFiles = (readdirSync(join(root, "src"), { recursive: true }) as string[])
    .map((entry) => join("src", entry))
    .filter((path) => /\.(tsx?|css)$/.test(path) && !/\.test\.tsx?$/.test(path))
    .sort();

  const violations: Violation[] = [];
  for (const path of sourceFiles) {
    const text = readFileSync(join(root, path), "utf8");
    violations.push(...(path.endsWith(".css") ? checkCss(path, text) : checkTsx(path, text)));
  }
  violations.push(...checkHtml("index.html", readFileSync(join(root, "index.html"), "utf8")));
  return violations;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const violations = checkProject(process.cwd());
  for (const v of violations) console.error(`${v.file}:${v.line} [${v.rule}] ${v.detail}`);
  console.log(violations.length === 0 ? "No rule violations." : `${violations.length} rule violation(s).`);
  process.exitCode = violations.length === 0 ? 0 : 1;
}
