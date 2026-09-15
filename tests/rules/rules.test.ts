import { describe, expect, it } from "vitest";
import { checkCss, checkHtml, checkProject, checkTsx, classViolation } from "../../scripts/check-rules";

const rulesIn = (violations: { rule: string }[]) => violations.map((v) => v.rule);

describe("the project", () => {
  it("has no rule violations in src/ and index.html", () => {
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
    "data-[state=open]:animate-accordion-down",
    "animate-pulse",
    "will-change-transform",
    "!transition-colors",
  ])("flags %s", (token) => {
    expect(classViolation(token)).not.toBeNull();
  });

  it.each(["transition-transform", "transition-opacity", "transition-[transform,opacity]", "transition-none", "animate-none", "active:scale-[0.98]", "duration-150"])(
    "allows %s",
    (token) => {
      expect(classViolation(token)).toBeNull();
    },
  );
});

describe("animation rule: CSS", () => {
  it.each([
    [".a { transition: height 200ms; }"],
    [".a { transition: 200ms ease; }"],
    [".a { transition: transform 200ms, background-color 200ms; }"],
    [".a { transition-property: color; }"],
    [".a { will-change: transform; }"],
    ["@keyframes grow { from { height: 0 } to { height: 10px } }"],
    [".a { @apply transition-colors; }"],
  ])("flags %s", (css) => {
    expect(rulesIn(checkCss("x.css", css))).toContain("animation");
  });

  it("allows transform and opacity transitions and keyframes", () => {
    const css = `
      .a { transition: transform 200ms ease, opacity 150ms; transition-property: transform, opacity; }
      @keyframes fade { from { opacity: 0; transform: scale(0.96); animation-timing-function: ease-out } to { opacity: 1 } }
      /* transition: height 1s in a comment is fine */
    `;
    expect(checkCss("x.css", css)).toEqual([]);
  });
});

describe("animation and motion rules: TSX", () => {
  it.each([
    ['<div style={{ transition: "height 200ms" }} />', "animation"],
    ['<div style={{ willChange: "transform" }} />', "animation"],
    ['<m.div animate={{ backgroundColor: "#fff" }} />', "animation"],
    ['<m.div variants={{ open: { height: 100 } }} />', "animation"],
    ['el.animate([{ opacity: 0 }, { width: "10px" }], 200);', "animation"],
    ['import { motion } from "motion/react";', "motion"],
    ['import { domMax } from "motion/react";', "motion"],
    ['import { m } from "framer-motion";', "motion"],
    ["const a = <motion.div />;", "motion"],
    ['const a = <m.div layoutId="hero" />;', "motion"],
    ["const a = <m.div whileInView={{ opacity: 1 }} />;", "motion"],
  ])("flags %s", (code, rule) => {
    expect(rulesIn(checkTsx("x.tsx", code))).toContain(rule);
  });

  it("allows the approved motion setup", () => {
    const code = `
      import { LazyMotion, m, useReducedMotion } from "motion/react";
      const load = () => import("./features").then((r) => r.default);
      export const A = () => (
        <LazyMotion features={load} strict>
          <m.div className="transition-transform active:scale-[0.98]" initial={{ opacity: 0, transform: "scale(0.96)" }}
            animate={{ opacity: 1, scale: 1, transition: { type: "spring", stiffness: 400, damping: 30, mass: 0.8 } }} />
        </LazyMotion>
      );
      export function flip(el: HTMLElement) {
        el.style.willChange = "transform";
        el.animate([{ transform: "translate(0, 8px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 200 });
      }
    `;
    expect(checkTsx("x.tsx", code)).toEqual([]);
  });
});

describe("copy rule", () => {
  it.each([
    "const a = <p>The best date for you</p>;",
    'const s = "We recommend the 7th";',
    'const s = `Your safe window`;',
    "const a = <p>The 7th has a real advantage.</p>;",
    'const a = <button aria-label="Top performing funds" />;',
    'const s = "The winner is the 26th";',
  ])("flags %s", (code) => {
    expect(rulesIn(checkTsx("x.tsx", code))).toContain("copy");
  });

  it("allows the compliance disclaimer and non-copy attributes", () => {
    const code = `
      const a = (
        <footer className="justify-center-safe">
          <p>Not a recommendation to buy, sell or hold any scheme. Not registered with SEBI.</p>
        </footer>
      );
      const safeWindow = [3, 12];
    `;
    expect(checkTsx("x.tsx", code)).toEqual([]);
  });

  it("checks index.html text and meta content", () => {
    expect(rulesIn(checkHtml("index.html", '<meta name="description" content="Find the best SIP date" />'))).toContain("copy");
    expect(rulesIn(checkHtml("index.html", "<title>The recommended fund</title>"))).toContain("copy");
    expect(checkHtml("index.html", "<title>SIP Date Planner</title>")).toEqual([]);
  });
});

describe("font rule", () => {
  it("flags Inter and Geist but not words that contain them", () => {
    expect(rulesIn(checkCss("x.css", 'body { font-family: "Inter", sans-serif; }'))).toContain("font");
    expect(rulesIn(checkTsx("x.tsx", 'const f = "Geist Variable";'))).toContain("font");
    expect(checkTsx("x.tsx", 'const s = "Interval funds are excluded";')).toEqual([]);
  });
});
