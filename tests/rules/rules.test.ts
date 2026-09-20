import { describe, expect, it } from "vitest";
import { checkCss, checkHtml, checkMarkdown, checkPackageJson, checkProject, checkTsx, classViolation } from "../../scripts/check-rules";

const rulesIn = (violations: { rule: string }[]) => violations.map((v) => v.rule);

describe("the project", () => {
  it("has no rule violations in src/, index.html and package.json", () => {
    expect(checkProject(process.cwd())).toEqual([]);
  });
});

describe("animation rule: Tailwind classes", () => {
  it.each([
    "transition",
    "transition-all",
    "transition-colors",
    "hover:transition-shadow",
    "md:focus-visible:transition-[color,box-shadow]",
    "transition-[transform,height]",
    "transition-(--my-props)",
    "[transition:height_200ms]",
    "hover:[transition-property:background-color]",
    "[will-change:transform]",
    "[animation:spin_1s_linear_infinite]",
    "data-[state=open]:animate-accordion-down",
    "animate-pulse",
    "will-change-transform",
    "!transition-colors",
  ])("flags %s", (token) => {
    expect(classViolation(token)).not.toBeNull();
  });

  it.each([
    "transition-transform",
    "transition-opacity",
    "transition-[transform,opacity]",
    "transition-[opacity,_transform]",
    "transition-[translate,scale]",
    "[transition:transform_200ms]",
    "transition-none",
    "animate-none",
    "will-change-auto",
    "active:scale-[0.98]",
    "duration-150",
  ])("allows %s", (token) => {
    expect(classViolation(token)).toBeNull();
  });
});

describe("animation rule: CSS", () => {
  it.each([
    ".a { transition: height 200ms; }",
    ".a { transition: 200ms ease; }",
    ".a { transition: transform 200ms, background-color 200ms; }",
    ".a { -webkit-transition: height 1s; }",
    ".a { transition-property: color; }",
    ".a { will-change: transform; }",
    ".a { &:hover { transition: color 1s } }",
    "@layer utilities { .b { transition: all 1s } }",
    "@utility fade { transition: background-color 1s; }",
    "@keyframes grow { from { height: 0 } to { height: 10px } }",
    ".a { @apply transition-colors; }",
    ".a {\n  @apply transition-colors\n}",
    "@theme { --animate-accordion-down: accordion-down 0.2s ease-out; }",
  ])("flags %s", (css) => {
    expect(rulesIn(checkCss("x.css", css))).toContain("animation");
  });

  it("allows transform and opacity motion, reduced-motion resets and will-change: auto", () => {
    const css = `
      .a { transition: transform 200ms ease, opacity 150ms; transition-property: transform, opacity; }
      .b { transition: translate 200ms; will-change: auto; animation: fade 200ms ease-out; }
      @keyframes fade { from { opacity: 0; transform: scale(0.96); translate: 0 8px; animation-timing-function: ease-out } to { opacity: 1 } }
      @media (prefers-reduced-motion: reduce) { *, ::before { transition: none !important; animation: none !important; } }
      /* transition: height 1s in a comment is fine */
    `;
    expect(checkCss("x.css", css)).toEqual([]);
  });

  it.each([
    ['@import "tw-animate-css";', "dependency"],
    ['@import "shadcn/tailwind.css";', "dependency"],
    ['@import "@fontsource-variable/geist";', "dependency"],
  ])("flags stripped imports: %s", (css, rule) => {
    expect(rulesIn(checkCss("x.css", css))).toContain(rule);
  });
});

describe("animation rule: TSX", () => {
  it.each([
    ['<div style={{ transition: "height 200ms" }} />'],
    ['<div style={{ willChange: "transform" }} />'],
    ['const d = 200; const a = <div style={{ transition: `height ${d}ms` }} />;'],
    ['const transition = "height 1s"; const a = <div style={{ transition }} />;'],
    ['const a = <div style={{ ["willChange"]: "transform" }} />;'],
    ['const a = <div style={{ WebkitTransition: "height 1s" }} />;'],
    ['<m.div animate={{ backgroundColor: "#fff" }} />'],
    ['const t = { backgroundColor: "#f00" }; const a = <m.div animate={t} />;'],
    ['const t = { backgroundColor: "#f00" }; const a = <m.div animate={{ ...t, opacity: 1 }} />;'],
    ['const a = <m.div animate={open ? { height: "auto" } : { height: 0 }} />;'],
    ["const a = <m.div initial={{ height: 0 } as const} />;"],
    ['<m.div variants={{ open: { height: 100 } }} />'],
    ['const v = { open: { backgroundColor: "red" } } satisfies Variants; const a = <m.div variants={v} />;'],
    ['const v: Variants = { open: (i: number) => ({ backgroundColor: "red", opacity: i }) };'],
    ['const [scope, animate] = useAnimate(); animate(scope.current, { backgroundColor: "#fff" });'],
    ['import { animate } from "motion"; animate(el, { height: 100 });'],
    ["controls.start({ height: 0 });"],
    ['el.animate([{ opacity: 0 }, { width: "10px" }], 200);'],
    ['const a = <div className={`p-4 ${open ? "transition-colors" : ""}`} />;'],
    ['const button = cva("inline-flex transition-colors", { variants: {} });'],
    ['const base = "rounded-md transition-all";'],
  ])("flags %s", (code) => {
    expect(rulesIn(checkTsx("x.tsx", code))).toContain("animation");
  });
});

describe("motion rule", () => {
  it.each([
    ['import { motion } from "motion/react";'],
    ['import { motion as Mo } from "motion/react-client";'],
    ['import { domMax } from "motion/react";'],
    ['import { useInView } from "motion/react";'],
    ['import { useScroll } from "motion/react";'],
    ['import { m } from "framer-motion";'],
    ['export { domMax as default } from "motion/react";'],
    ['const load = () => import("motion/react").then((r) => r.domMax);'],
    ['import * as M from "motion/react"; const a = <M.motion.div />;'],
    ["const a = <motion.div />;"],
    ['const a = <m.div layoutId="hero" />;'],
    ["const a = <m.div layout />;"],
    ["const a = <m.div whileInView={{ opacity: 1 }} />;"],
  ])("flags %s", (code) => {
    expect(rulesIn(checkTsx("x.tsx", code))).toContain("motion");
  });

  it("allows the approved motion setup", () => {
    const code = `
      import { LazyMotion, m, useReducedMotion, type Variants } from "motion/react";
      const load = () => import("./features").then((r) => r.default);
      const cells: Variants = { hidden: { opacity: 0, transform: "scale(0.96)" }, shown: (i: number) => ({ opacity: 1, scale: 1, transition: { delay: i * 0.008 } }) };
      export const A = () => (
        <LazyMotion features={load} strict>
          <m.div className="transition-transform active:scale-[0.98]" variants={cells} initial="hidden" animate="shown"
            exit={{ opacity: 0, transition: { duration: 0 } }} />
        </LazyMotion>
      );
      export function flip(el: HTMLElement) {
        el.style.willChange = "transform";
        const keyframes = [{ transform: "translate(0, 8px)", opacity: 0 }, { transform: "none", opacity: 1 }];
        el.animate(keyframes, { duration: 200 });
      }
    `;
    expect(checkTsx("x.tsx", code)).toEqual([]);
  });
});

describe("dependency rule", () => {
  it.each([
    ['import { twMerge } from "tailwind-merge";'],
    ['import clsx from "clsx";'],
    ['import { cn } from "cn";'],
    ['import { Check } from "lucide-react";'],
    ['import { LineChart } from "recharts";'],
  ])("flags %s", (code) => {
    expect(rulesIn(checkTsx("x.tsx", code))).toContain("dependency");
  });

  it("allows cn/lite", () => {
    expect(checkTsx("x.ts", 'export { default as cn } from "cn/lite";')).toEqual([]);
  });

  it("flags banned packages in package.json but not the cn package behind cn/lite", () => {
    const manifest = JSON.stringify({ dependencies: { cn: "0.3.0", "lucide-react": "1.0.0" }, devDependencies: { "tw-animate-css": "1.4.0" } }, null, 2);
    expect(checkPackageJson("package.json", manifest).map((v) => v.detail.split(":")[0])).toEqual(["lucide-react", "tw-animate-css"]);
  });
});

describe("copy rule", () => {
  it.each([
    "const a = <p>The best date for you</p>;",
    'const s = "We recommend the 7th";',
    "const s = `Your safe window`;",
    'const s = "a safer date";',
    "const a = <p>The 7th has a real advantage.</p>;",
    "const a = <p>A real <em>advantage</em></p>;",
    "const a = <p>The top {n} performing funds</p>;",
    'const a = <button aria-label="Top performing funds" />;',
    'const s = "The winner is the 26th";',
    'const s = "the winning date";',
    'const s = "Top performer";',
  ])("flags %s", (code) => {
    expect(rulesIn(checkTsx("x.tsx", code))).toContain("copy");
  });

  it("allows code strings, prose about transitions, the disclaimer and class names", () => {
    const code = `
      type Rank = "best" | "worst";
      const label = labels["best"];
      if (rank === "best") throw new Error("not safe to call before init");
      console.warn("best effort fallback");
      switch (rank) { case "best": break; }
      const safeWindow = [3, 12];
      const a = (
        <footer className="justify-center-safe" data-state="best">
          <p>Rates changed during the transition to direct plans.</p>
          <p>Not a recommendation to buy, sell or hold any scheme. Not registered with SEBI.</p>
        </footer>
      );
    `;
    expect(checkTsx("x.tsx", code)).toEqual([]);
  });
});

describe("HTML", () => {
  it.each([
    ["<style>.x{transition:height 1s}</style>", "animation"],
    ['<div style="transition:background-color 1s; will-change:transform"></div>', "animation"],
    ['<meta name="description" content="Find the best SIP date" />', "copy"],
    ["<meta content='The best SIP date'>", "copy"],
    ['<input placeholder="best fund">', "copy"],
    ['<script type="application/ld+json">{"description":"The best SIP date"}</script>', "copy"],
    ["<title>The recommended fund</title>", "copy"],
  ])("flags %s", (html, rule) => {
    expect(rulesIn(checkHtml("index.html", html))).toContain(rule);
  });

  it("allows a clean page", () => {
    expect(checkHtml("index.html", '<title>SIP Date Planner</title><style>.x{transition:opacity 1s}</style>')).toEqual([]);
  });
});

describe("font rule", () => {
  it("flags Inter and Geist but not words that contain them", () => {
    expect(rulesIn(checkCss("x.css", 'body { font-family: "Inter", sans-serif; }'))).toContain("font");
    expect(rulesIn(checkTsx("x.tsx", 'const f = "Geist Variable";'))).toContain("font");
    expect(checkTsx("x.tsx", 'const s = "Interval funds are excluded";')).toEqual([]);
  });
});

describe("Markdown", () => {
  it("catches the banned word the README actually shipped with", () => {
    // The literal line README.md carried until it was rewritten. It passed every check for as
    // long as it existed, because nothing scanned the file.
    const violations = checkMarkdown("README.md", "# DataDrivenSIP\nFind the best date to start your SIP\n");
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ file: "README.md", line: 2, rule: "copy" });
    expect(violations[0]?.detail).toContain("best");
  });

  it("reads fenced and inline code as commands rather than as copy", () => {
    // `pnpm run best` would be a command; prose about the best date would not.
    const fenced = "Run it:\n\n```\npnpm run best-guess\n```\n";
    expect(checkMarkdown("README.md", fenced)).toEqual([]);
    expect(checkMarkdown("README.md", "Use `--best` to override.\n")).toEqual([]);
    expect(checkMarkdown("README.md", "Pick the best one.\n")).toHaveLength(1);
  });
});
