/**
 * Static checks for rules a type checker can't see (CLAUDE.md "Non-negotiable"; PLAN.md §2, §7, §8, §11, D18):
 * - animate transform and opacity only; no will-change in static styles; no scroll-triggered motion
 * - m components inside LazyMotion only: no motion.*, no domMax, no layout animations
 * - stripped extras stay stripped: tw-animate-css, the full cn engine, lucide-react, Recharts
 * - no advice-sounding words in user-facing copy. "Best" is allowed of a DAY, because that is
 *   the question the product answers, and still banned of a fund: there is no ranking of funds
 * - no Inter or Geist
 *
 * It's a heuristic linter, not a proof. It follows local constants, spreads, conditionals and
 * returned objects, but not values imported from other modules. tests/rules/rules.test.ts runs it
 * over the project, and `pnpm check:rules` prints the results.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

export type Rule = "animation" | "motion" | "copy" | "font" | "dependency";
export type Violation = { file: string; line: number; rule: Rule; detail: string };

// ---------------------------------------------------------------------------------------------
// Rule data

/** Compositor-only properties: transform, its individual forms, and opacity. */
const ANIMATABLE = new Set(["transform", "translate", "scale", "rotate", "opacity"]);
const KEYFRAME_ALLOWED = new Set([...ANIMATABLE, "animation-timing-function"]);
const WAAPI_KEYFRAME_ALLOWED = new Set([...ANIMATABLE, "offset", "easing", "composite"]);

/** Keys a Motion target may use: opacity, the transform family, and transition options. */
const MOTION_TARGET_ALLOWED = new Set([
  ...ANIMATABLE,
  "x", "y", "z", "translateX", "translateY", "translateZ", "scaleX", "scaleY",
  "rotateX", "rotateY", "rotateZ", "skew", "skewX", "skewY", "transformPerspective",
  "transformOrigin", "originX", "originY", "transition", "transitionEnd", "offset", "easing",
]);
const MOTION_TARGET_PROPS = new Set(["initial", "animate", "exit", "whileHover", "whileTap", "whileFocus", "whileDrag"]);
const MOTION_TARGET_TYPES = new Set(["Target", "TargetAndTransition"]);
const MOTION_VARIANT_TYPES = new Set(["Variants"]);
const LAYOUT_PROPS = new Set(["layout", "layoutId", "layoutDependency", "layoutScroll", "layoutRoot"]);

const MOTION_MODULE = /^(?:motion(?:\/.*)?|framer-motion)$/;
const MOTION_BANNED_NAMES = new Map([
  ["motion", "use m inside LazyMotion, not motion"],
  ["domMax", "domMax isn't allowed; the one morph is a FLIP (PLAN.md D10a)"],
  ["useInView", "scroll-triggered reveals are forbidden (spec §8.4)"],
  ["useScroll", "scroll-linked animation is forbidden (spec §8.4)"],
]);

/** [module pattern, reason, also banned as a package.json dependency]. */
const BANNED_MODULES: ReadonlyArray<readonly [RegExp, string, boolean]> = [
  [/^framer-motion$/, "import from motion/react, not framer-motion", true],
  [/^tw-animate-css$/, "tw-animate-css was stripped (PLAN.md §7)", true],
  [/^shadcn\/tailwind\.css$/, "shadcn's animation CSS was stripped (PLAN.md §7)", false],
  [/^(?:tailwind-merge|clsx)$/, "use cn/lite (PLAN.md D18)", true],
  [/^cn$/, "import cn/lite, not the full cn engine (PLAN.md D18)", false],
  [/^lucide-react$/, "icons are inline SVG, not lucide-react (PLAN.md D18)", true],
  [/^recharts$/, "charts use uPlot, never Recharts (spec §2)", true],
  [/^@fontsource(?:-variable)?\/(?:geist|inter)/i, "Geist and Inter aren't allowed fonts (spec §7.3)", true],
];

const bounded = (pattern: string) => new RegExp(`(?<![\\w-])${pattern}(?![\\w-])`, "i");
const BANNED_COPY: ReadonlyArray<readonly [string, RegExp]> = [
  /*
   * Not a bare "best". The product asks which is the best day of the month for one fund the
   * reader has already chosen, so the word is its own headline. Ranking FUNDS is still forbidden
   * everywhere, and that is the reading this catches.
   */
  ["best fund", bounded("best\\s+(?:fund|scheme|plan|performer|option)")],
  ["recommend", /(?<![\w-])recommend/i],
  ["safe", bounded("saf(?:e|er|est|ely)")],
  ["real advantage", bounded("real advantage")],
  ["winner", bounded("winn(?:er|ers|ing)")],
  ["guarantee", /(?<![\w-])guarantee/i],
  ["outperform", /(?<![\w-])outperform/i],
  ["top performing", /(?<![\w-])top[- ]perform/i],
];

/** Disclaimers that have to name a banned idea in order to deny it. */
const ALLOWED_COPY = ["Not a recommendation to buy, sell or hold any scheme"];

const BANNED_FONT = /(?<![\w-])(Inter|Geist)(?![\w-])/;

/** JSX attributes whose values are never user-facing copy. */
const NON_COPY_ATTRIBUTES = new Set([
  "className", "class", "href", "src", "srcSet", "sizes", "media", "id", "key", "type", "rel", "as",
  "role", "name", "htmlFor", "target", "method", "lang", "dir", "inputMode", "autoComplete", "style", "to",
]);
const CLASS_FUNCTIONS = new Set(["cn", "cva", "clsx", "cx", "twMerge", "twJoin"]);
const CLASS_TOKEN = /^[!a-z0-9@*&_\-:[\]()/.%#,=>'"+~]+$/;

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

/** "md:hover:transition-colors!" → "transition-colors". Ignores ":" inside brackets and parentheses. */
function baseUtility(token: string): string {
  let depth = 0;
  let start = 0;
  for (let i = 0; i < token.length; i++) {
    const char = token[i];
    if (char === "[" || char === "(") depth++;
    else if (char === "]" || char === ")") depth--;
    else if (char === ":" && depth === 0) start = i + 1;
  }
  return token.slice(start).replace(/^!|!$/g, "");
}

function transitionViolation(value: string): string | null {
  if (value === "none") return null;
  for (const part of splitTopLevel(value)) {
    const property = part.split(/\s+/)[0] ?? "";
    // A duration, easing or variable in first position means the transition applies to "all".
    if (!ANIMATABLE.has(property)) return `transition on "${property}"`;
  }
  return null;
}

function transitionPropertyViolation(value: string): string | null {
  const bad = splitTopLevel(value).filter((property) => property !== "none" && !ANIMATABLE.has(property));
  return bad.length > 0 ? `transition-property: ${bad.join(", ")}` : null;
}

/**
 * Why a CSS declaration breaks the animation rule, or null.
 * `keyframesVisible` is true in stylesheets, where @keyframes bodies are checked separately.
 */
function declarationViolation(rawProperty: string, rawValue: string, keyframesVisible: boolean): string | null {
  const property = rawProperty.trim().toLowerCase().replace(/^-(?:webkit|moz|ms|o)-/, "");
  const value = rawValue.replace(/!important/gi, "").trim();
  switch (property) {
    case "will-change":
      return value === "auto" ? null : "will-change in a static style; set it only while animating";
    case "transition":
      return transitionViolation(value);
    case "transition-property":
      return transitionPropertyViolation(value);
    case "animation":
    case "animation-name":
      return keyframesVisible || value === "none" ? null : "keyframe animation whose @keyframes can't be checked here";
    default:
      return null;
  }
}

/** Why a Tailwind utility breaks the animation rule, or null. */
export function classViolation(token: string): string | null {
  const utility = baseUtility(token);
  const arbitraryProperty = /^\[([a-z-]+):(.+)\]$/.exec(utility);
  if (arbitraryProperty) {
    const why = declarationViolation(arbitraryProperty[1] ?? "", (arbitraryProperty[2] ?? "").replace(/_/g, " "), false);
    return why ? `${utility}: ${why}` : null;
  }
  if (["transition", "transition-all", "transition-colors", "transition-shadow"].includes(utility)) {
    return `${utility} animates more than transform and opacity`;
  }
  if (utility.startsWith("transition-(")) return `${utility} can't be checked; name transform or opacity explicitly`;
  if (utility.startsWith("transition-[")) {
    const properties = utility.slice("transition-[".length, -1).replace(/_/g, " ").split(",").map((p) => p.trim()).filter(Boolean);
    const bad = properties.filter((property) => !ANIMATABLE.has(property));
    return bad.length > 0 ? `${utility} animates ${bad.join(", ")}` : null;
  }
  if (utility.startsWith("animate-") && utility !== "animate-none") return `${utility} runs a keyframe animation`;
  if (utility.startsWith("will-change-") && utility !== "will-change-auto") return `${utility} leaves will-change in static CSS`;
  return null;
}

function looksLikeClassList(text: string): boolean {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((t) => CLASS_TOKEN.test(t)) && tokens.some((t) => /[-:[]/.test(t) || t === "transition");
}

function copyViolations(text: string): string[] {
  let copy = text.replace(/\s+/g, " ");
  for (const allowed of ALLOWED_COPY) copy = copy.split(allowed).join(" ");
  return BANNED_COPY.filter(([, pattern]) => pattern.test(copy)).map(([name]) => `"${name}" in user-facing text`);
}

function bannedModule(specifier: string, asDependency = false): string | null {
  for (const [pattern, reason, dependency] of BANNED_MODULES) {
    if (pattern.test(specifier) && (!asDependency || dependency)) return reason;
  }
  return null;
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

export function checkCss(file: string, source: string, firstLine = 1): Violation[] {
  // Blank out comments but keep newlines so line numbers stay right.
  const text = source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
  const violations: Violation[] = [];
  const add = (index: number, rule: Rule, detail: string) =>
    violations.push({ file, line: lineAt(text, index) + firstLine - 1, rule, detail });

  for (const match of text.matchAll(/(?:^|[{;\s])((?:-(?:webkit|moz|ms|o)-)?(?:transition-property|transition|will-change|animation-name|animation))\s*:\s*([^;}]*)/g)) {
    const why = declarationViolation(match[1] ?? "", match[2] ?? "", true);
    if (why) add(match.index, "animation", why);
  }

  for (const match of text.matchAll(/@apply\s+([^;}]+)/g)) {
    for (const token of (match[1] ?? "").split(/\s+/)) {
      const why = classViolation(token);
      if (why) add(match.index, "animation", why);
    }
  }

  for (const match of text.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
    const body = blockBody(text, match.index + match[0].length - 1);
    for (const declaration of body.matchAll(/([a-z-]+)\s*:/g)) {
      const property = (declaration[1] ?? "").replace(/^-(?:webkit|moz|ms|o)-/, "");
      if (!KEYFRAME_ALLOWED.has(property)) add(match.index, "animation", `@keyframes ${match[1]} animates ${property}`);
    }
  }

  for (const match of text.matchAll(/--animate-[\w-]+\s*:/g)) {
    add(match.index, "animation", "animation theme tokens were stripped (PLAN.md §7)");
  }

  for (const match of text.matchAll(/@import\s+(?:url\()?\s*["']([^"']+)["']/g)) {
    const reason = bannedModule(match[1] ?? "");
    if (reason) add(match.index, "dependency", `${match[1]}: ${reason}`);
  }

  for (const match of text.matchAll(new RegExp(BANNED_FONT, "g"))) {
    add(match.index, "font", `${match[1]} is not an allowed font`);
  }
  return violations;
}

// ---------------------------------------------------------------------------------------------
// TypeScript and TSX

type FunctionWithBody = ts.ArrowFunction | ts.FunctionExpression | ts.MethodDeclaration;

function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function returnedExpressions(fn: FunctionWithBody): ts.Expression[] {
  if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) return [fn.body];
  const found: ts.Expression[] = [];
  const walk = (node: ts.Node): void => {
    if (ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node) && node.expression) found.push(node.expression);
    ts.forEachChild(node, walk);
  };
  if (fn.body) ts.forEachChild(fn.body, walk);
  return found;
}

function typeName(type: ts.TypeNode | undefined): string | null {
  if (!type || !ts.isTypeReferenceNode(type)) return null;
  return ts.isIdentifier(type.typeName) ? type.typeName.text : type.typeName.right.text;
}

/** "WebkitTransition" → "transition", "willChange" → "will-change". */
function cssPropertyName(key: string): string {
  return key
    .replace(/^(?:Webkit|Moz|ms|O)(?=[A-Z])/, "")
    .replace(/^-(?:webkit|moz|ms|o)-/, "")
    .replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)
    .replace(/^-/, "");
}

const EQUALITY = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

export function checkTsx(file: string, source: string): Violation[] {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const violations: Violation[] = [];
  const add = (node: ts.Node, rule: Rule, detail: string) =>
    violations.push({ file, line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1, rule, detail });

  // First pass: local initialisers (so values passed by name can be followed) and motion namespaces.
  const declarations = new Map<string, ts.Expression[]>();
  const motionNamespaces = new Set<string>();
  const collect = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      declarations.set(node.name.text, [...(declarations.get(node.name.text) ?? []), node.initializer]);
    }
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && MOTION_MODULE.test(node.moduleSpecifier.text)) {
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) motionNamespaces.add(bindings.name.text);
    }
    ts.forEachChild(node, collect);
  };
  collect(sourceFile);

  const keyOf = (name: ts.PropertyName): string | null => {
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name) || ts.isPrivateIdentifier(name)) return name.text;
    if (ts.isComputedPropertyName(name)) {
      const expression = unwrap(name.expression);
      return ts.isStringLiteralLike(expression) ? expression.text : null;
    }
    return null;
  };

  /** Object literals an expression can evaluate to, following locals, conditionals and returns. */
  const objectsOf = (expression: ts.Expression | undefined, depth = 0): ts.ObjectLiteralExpression[] => {
    if (!expression || depth > 6) return [];
    const current = unwrap(expression);
    if (ts.isObjectLiteralExpression(current)) return [current];
    if (ts.isArrayLiteralExpression(current)) return current.elements.flatMap((element) => objectsOf(element, depth + 1));
    if (ts.isConditionalExpression(current)) return [...objectsOf(current.whenTrue, depth + 1), ...objectsOf(current.whenFalse, depth + 1)];
    if (ts.isBinaryExpression(current)) return [...objectsOf(current.left, depth + 1), ...objectsOf(current.right, depth + 1)];
    if (ts.isIdentifier(current)) return (declarations.get(current.text) ?? []).flatMap((init) => objectsOf(init, depth + 1));
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      return returnedExpressions(current).flatMap((returned) => objectsOf(returned, depth + 1));
    }
    return [];
  };

  /** String values an expression can evaluate to. Template placeholders become "0". */
  const stringsOf = (expression: ts.Expression | undefined, depth = 0): string[] => {
    if (!expression || depth > 6) return [];
    const current = unwrap(expression);
    if (ts.isStringLiteralLike(current)) return [current.text];
    if (ts.isTemplateExpression(current)) return [current.head.text + current.templateSpans.map((span) => ` 0 ${span.literal.text}`).join("")];
    if (ts.isConditionalExpression(current)) return [...stringsOf(current.whenTrue, depth + 1), ...stringsOf(current.whenFalse, depth + 1)];
    if (ts.isIdentifier(current)) return (declarations.get(current.text) ?? []).flatMap((init) => stringsOf(init, depth + 1));
    return [];
  };

  const checkTarget = (expression: ts.Expression | undefined, allowed: ReadonlySet<string>, context: string, depth = 0): void => {
    if (depth > 6) return;
    for (const object of objectsOf(expression)) {
      for (const property of object.properties) {
        if (ts.isSpreadAssignment(property)) {
          checkTarget(property.expression, allowed, context, depth + 1);
          continue;
        }
        if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) continue;
        const key = keyOf(property.name);
        if (key !== null && !allowed.has(key)) add(property, "animation", `${context} animates "${key}"`);
      }
    }
  };

  const checkVariants = (expression: ts.Expression | undefined, depth = 0): void => {
    if (depth > 6) return;
    for (const object of objectsOf(expression)) {
      for (const property of object.properties) {
        if (ts.isPropertyAssignment(property)) checkTarget(property.initializer, MOTION_TARGET_ALLOWED, "variant");
        else if (ts.isShorthandPropertyAssignment(property)) checkTarget(property.name, MOTION_TARGET_ALLOWED, "variant");
        else if (ts.isSpreadAssignment(property)) checkVariants(property.expression, depth + 1);
        else if (ts.isMethodDeclaration(property)) {
          for (const returned of returnedExpressions(property)) checkTarget(returned, MOTION_TARGET_ALLOWED, "variant");
        }
      }
    }
  };

  const checkModule = (specifier: string, node: ts.Node) => {
    const reason = bannedModule(specifier);
    if (reason) add(node, specifier === "framer-motion" ? "motion" : "dependency", `${specifier}: ${reason}`);
  };

  const enclosingAttribute = (node: ts.Node): string | null => {
    for (let current = node.parent; current; current = current.parent) {
      if (ts.isJsxAttribute(current)) return current.name.getText(sourceFile);
      if (ts.isStatement(current) || ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current) || ts.isFunctionLike(current)) return null;
    }
    return null;
  };

  const inClassContext = (node: ts.Node): boolean => {
    for (let current = node.parent; current; current = current.parent) {
      if (ts.isJsxAttribute(current)) {
        const name = current.name.getText(sourceFile);
        return name === "className" || name === "class";
      }
      if (ts.isCallExpression(current)) {
        const callee = current.expression;
        const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : "";
        if (CLASS_FUNCTIONS.has(name)) return true;
      }
      if (ts.isStatement(current) || ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current) || ts.isFunctionLike(current)) return false;
    }
    return false;
  };

  /** Strings that are code rather than copy: types, keys, comparisons, errors, logs, non-copy attributes. */
  const isCodeString = (owner: ts.Node): boolean => {
    const parent = owner.parent;
    if (!parent) return false;
    if (ts.isLiteralTypeNode(parent) || ts.isCaseClause(parent) || ts.isComputedPropertyName(parent)) return true;
    if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isExternalModuleReference(parent)) return true;
    if (ts.isElementAccessExpression(parent) && parent.argumentExpression === owner) return true;
    if (ts.isBinaryExpression(parent) && EQUALITY.has(parent.operatorToken.kind)) return true;
    if ((ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent)) && parent.name === owner) return true;
    if (ts.isCallExpression(parent) || ts.isNewExpression(parent)) {
      const callee = parent.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword) return true;
      if (ts.isIdentifier(callee) && /^(?:Error|TypeError|RangeError|SyntaxError|require)$/.test(callee.text)) return true;
      if (ts.isPropertyAccessExpression(callee)) {
        if (ts.isIdentifier(callee.expression) && callee.expression.text === "console") return true;
        if (/^(?:getElementById|querySelector|querySelectorAll|addEventListener|removeEventListener|getItem|setItem|removeItem)$/.test(callee.name.text)) return true;
      }
    }
    const attribute = enclosingAttribute(owner);
    return attribute !== null && (NON_COPY_ATTRIBUTES.has(attribute) || attribute.startsWith("data-"));
  };

  const checkString = (node: ts.Node, owner: ts.Node, text: string) => {
    const classContext = inClassContext(owner);
    if (classContext || looksLikeClassList(text)) {
      for (const token of text.split(/\s+/)) {
        const why = classViolation(token);
        if (why) add(node, "animation", why);
      }
    }
    const font = BANNED_FONT.exec(text);
    if (font) add(node, "font", `${font[1]} is not an allowed font`);
    if (!classContext && !isCodeString(owner)) for (const detail of copyViolations(text)) add(node, "copy", detail);
  };

  /** Visible text of a JSX subtree, with expressions and self-closing children as spaces. */
  const jsxText = (node: ts.Node): string => {
    if (ts.isJsxText(node)) return node.text;
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) return node.children.map(jsxText).join("");
    if (ts.isJsxExpression(node) || ts.isJsxSelfClosingElement(node)) return " ";
    return "";
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const from = node.moduleSpecifier.text;
      checkModule(from, node);
      const bindings = node.importClause?.namedBindings;
      if (MOTION_MODULE.test(from) && bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          const reason = MOTION_BANNED_NAMES.get((element.propertyName ?? element.name).text);
          if (reason) add(element, "motion", reason);
        }
      }
      return;
    }

    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const from = node.moduleSpecifier.text;
      checkModule(from, node);
      if (MOTION_MODULE.test(from) && node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          const reason = MOTION_BANNED_NAMES.get((element.propertyName ?? element.name).text);
          if (reason) add(element, "motion", reason);
        }
      }
      return;
    }

    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sourceFile);
      if (LAYOUT_PROPS.has(name)) add(node, "motion", `${name} needs domMax; the one morph is a FLIP (PLAN.md D10a)`);
      if (name === "whileInView") add(node, "motion", "scroll-triggered reveals are forbidden (spec §8.4)");
      const expression = node.initializer && ts.isJsxExpression(node.initializer) ? node.initializer.expression : undefined;
      if (MOTION_TARGET_PROPS.has(name)) checkTarget(expression, MOTION_TARGET_ALLOWED, name);
      if (name === "variants") checkVariants(expression);
    }

    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      const inherited = new Set(
        node.children.filter((child) => ts.isJsxElement(child) || ts.isJsxFragment(child)).flatMap((child) => copyViolations(jsxText(child))),
      );
      for (const detail of copyViolations(jsxText(node))) if (!inherited.has(detail)) add(node, "copy", detail);
    }

    if (ts.isPropertyAccessExpression(node)) {
      const target = node.expression;
      if (ts.isIdentifier(target) && target.text === "motion") add(node, "motion", "motion.* components aren't allowed; use m.*");
      if (ts.isIdentifier(target) && motionNamespaces.has(target.text)) {
        const reason = MOTION_BANNED_NAMES.get(node.name.text);
        if (reason) add(node, "motion", reason);
      } else if (node.name.text === "domMax") {
        add(node, "motion", "domMax isn't allowed; the one morph is a FLIP (PLAN.md D10a)");
      }
    }

    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const [first, second] = node.arguments;
      if (callee.kind === ts.SyntaxKind.ImportKeyword && first && ts.isStringLiteralLike(first)) checkModule(first.text, node);
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : "";
      if (name === "animate") {
        // element.animate(keyframes) is WAAPI; animate(target, keyframes) is Motion.
        if (ts.isPropertyAccessExpression(callee) && objectsOf(first).length > 0) checkTarget(first, WAAPI_KEYFRAME_ALLOWED, "animate() keyframe");
        else if (second) checkTarget(second, MOTION_TARGET_ALLOWED, "animate()");
      }
      if (name === "start" && ts.isPropertyAccessExpression(callee)) checkTarget(first, MOTION_TARGET_ALLOWED, "controls.start()");
    }

    if (ts.isVariableDeclaration(node) && node.initializer) {
      const type = typeName(node.type);
      if (type && MOTION_VARIANT_TYPES.has(type)) checkVariants(node.initializer);
      if (type && MOTION_TARGET_TYPES.has(type)) checkTarget(node.initializer, MOTION_TARGET_ALLOWED, type);
    }
    if (ts.isSatisfiesExpression(node) || ts.isAsExpression(node)) {
      const type = typeName(node.type);
      if (type && MOTION_VARIANT_TYPES.has(type)) checkVariants(node.expression);
      if (type && MOTION_TARGET_TYPES.has(type)) checkTarget(node.expression, MOTION_TARGET_ALLOWED, type);
    }

    // Style objects: { transition: "height 200ms" }, { WebkitTransition }, { ["willChange"]: "transform" }.
    if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) {
      const key = keyOf(node.name);
      const property = key === null ? "" : cssPropertyName(key);
      if (["transition", "transition-property", "will-change", "animation", "animation-name"].includes(property)) {
        const values = ts.isPropertyAssignment(node) ? stringsOf(node.initializer) : stringsOf(node.name);
        for (const value of values) {
          const why = declarationViolation(property, value, false);
          if (why) add(node, "animation", why);
        }
      }
    }

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      checkString(node, node, node.text);
    } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const template = ts.isTemplateHead(node) ? node.parent : node.parent.parent;
      checkString(node, template, node.text);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  const unique = new Map(violations.map((v) => [`${v.line}|${v.rule}|${v.detail}`, v]));
  return [...unique.values()];
}

// ---------------------------------------------------------------------------------------------
// HTML

export function checkHtml(file: string, source: string): Violation[] {
  const violations: Violation[] = [];
  const addCopy = (index: number, text: string) => {
    for (const detail of copyViolations(text)) violations.push({ file, line: lineAt(source, index), rule: "copy", detail });
  };

  for (const match of source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    const bodyStart = match.index + match[0].indexOf(">") + 1;
    violations.push(...checkCss(file, match[1] ?? "", lineAt(source, bodyStart)));
  }
  for (const match of source.matchAll(/\sstyle=(["'])([\s\S]*?)\1/gi)) {
    violations.push(...checkCss(file, `.inline{${match[2] ?? ""}}`, lineAt(source, match.index)));
  }
  for (const match of source.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const strings: string[] = [];
    try {
      JSON.parse(match[1] ?? "", (_key: string, value: unknown) => {
        if (typeof value === "string") strings.push(value);
        return value;
      });
    } catch {
      strings.push(match[1] ?? "");
    }
    for (const text of strings) addCopy(match.index, text);
  }

  const markup = source.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, (block) => block.replace(/[^\n]/g, " "));
  for (const match of markup.matchAll(/>([^<]+)</g)) addCopy(match.index, match[1] ?? "");
  for (const match of markup.matchAll(/\b(?:content|title|alt|aria-label|placeholder)=(["'])([\s\S]*?)\1/gi)) addCopy(match.index, match[2] ?? "");

  for (const match of source.matchAll(new RegExp(BANNED_FONT, "g"))) {
    violations.push({ file, line: lineAt(source, match.index), rule: "font", detail: `${match[1]} is not an allowed font` });
  }
  return violations;
}

// ---------------------------------------------------------------------------------------------
// package.json

export function checkPackageJson(file: string, source: string): Violation[] {
  const manifest = JSON.parse(source) as Record<string, unknown>;
  const violations: Violation[] = [];
  for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    const dependencies = manifest[field];
    if (!dependencies || typeof dependencies !== "object") continue;
    for (const name of Object.keys(dependencies)) {
      const reason = bannedModule(name, true);
      if (reason) violations.push({ file, line: lineAt(source, source.indexOf(`"${name}"`)), rule: "dependency", detail: `${name}: ${reason}` });
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------------------------
// Project

/**
 * The README is the repository's front page, and it is user-facing copy like any other — but it
 * sat outside every scan, so it opened with "Find the best date to start your SIP" for as long
 * as it existed, using a word this very file bans. Fenced and inline code are commands rather
 * than copy and are skipped.
 */
export function checkMarkdown(file: string, source: string): Violation[] {
  const violations: Violation[] = [];
  let fenced = false;
  source.split("\n").forEach((line, index) => {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    for (const detail of copyViolations(line.replace(/`[^`]*`/g, " "))) {
      violations.push({ file, line: index + 1, rule: "copy", detail });
    }
  });
  return violations;
}

export function checkProject(root: string): Violation[] {
  const sourceFiles = (readdirSync(join(root, "src"), { recursive: true }) as string[]).map((entry) => join("src", entry));
  const scripts = join(root, "scripts");
  const prerenderTemplates = existsSync(scripts)
    ? readdirSync(scripts).filter((name) => /^prerender.*\.tsx?$/.test(name)).map((name) => join("scripts", name))
    : [];

  const violations: Violation[] = [];
  for (const path of [...sourceFiles, ...prerenderTemplates].sort()) {
    if (!/\.(tsx?|css)$/.test(path) || /\.test\.tsx?$/.test(path)) continue;
    const text = readFileSync(join(root, path), "utf8");
    violations.push(...(path.endsWith(".css") ? checkCss(path, text) : checkTsx(path, text)));
  }
  violations.push(...checkHtml("index.html", readFileSync(join(root, "index.html"), "utf8")));
  violations.push(...checkPackageJson("package.json", readFileSync(join(root, "package.json"), "utf8")));
  violations.push(...checkMarkdown("README.md", readFileSync(join(root, "README.md"), "utf8")));
  return violations;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const violations = checkProject(process.cwd());
  for (const v of violations) console.error(`${v.file}:${v.line} [${v.rule}] ${v.detail}`);
  console.log(violations.length === 0 ? "No rule violations." : `${violations.length} rule violation(s).`);
  process.exitCode = violations.length === 0 ? 0 : 1;
}
