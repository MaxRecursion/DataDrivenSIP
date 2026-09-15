> Incremental notes from a research agent that was cut off by a usage limit before its final summary. Findings marked VERIFIED were checked; treat the rest as leads.

# stack-probe REPORT (incremental)
Resumed run. Prior run left: app/ (Vite 6.4.3 + React 19.3.0 + TS 5.9.3 + TW 4.3.3 + shadcn 4.21.0 init, components added, built dist/ + stats.html), probes/ (not yet built), bin/pnpm -> npx pnpm@10.34.5. Node v22.22.2, npm 10.9.7.

## 1. npm view (2026-09-15 16:23, files in npmview/*.json)
- LATEST dist-tags have moved past the spec's majors: vite 8.3.0 (previous tag 7.3.6), typescript 7.0.2, motion 13.3.0, react-router 8.3.1 (version-7 tag = 7.18.3), @vitejs/plugin-react 6.1.1 (peer vite ^8.0.0 ONLY), vitest 5.0.1.
- react/react-dom 19.3.0 (react-dom peer react ^19.3.0); @types/react(-dom) 19.3.0.
- tailwindcss / @tailwindcss/vite 4.3.3; @tailwindcss/vite peer vite "^5.2.0 || ^6 || ^7 || ^8" -> covers Vite 6.
- vitest 5.0.1 peer vite "^6.4.0 || ^7.0.0 || ^8.0.0", @types/node "^22.0.0 || >=24.0.0", engines node "^22.12.0 || ^24.0.0 || >=26.0.0" -> Vite 6 requires vite >= 6.4.0.
- cmdk 1.1.1 (peer react ^18||^19). radix-ui 1.6.7. shadcn 4.21.0 (engines node >=20.18.1). @playwright/test 1.63.0 (node >=20). @lhci/cli 0.15.1 (last publish 2025-06). uplot 1.6.32 (last publish 2025-03). lucide-react 1.46.0. tw-animate-css 1.4.0. cva 0.7.1. @base-ui/react 1.8.0. `cn` 0.3.0 (published 2026-09-12).
- react-router 8.3.1 peer react >=19.2.7, engines node >=22.22.0.
- Latest within spec majors: vite 6.4.3 (node ^18||^20||>=22; esbuild ^0.25, rollup ^4.34.9); @vitejs/plugin-react 5.2.0 (peer vite ^4.2||^5||^6||^7||^8 -> last line supporting Vite 6; 6.x is Vite 8-only); @vitejs/plugin-react-swc 4.3.3 (peer vite ^4..^8); typescript 5.9.3 (latest 5.x); motion 12.43.0 / framer-motion 12.43.0 / motion-dom 12.43.0 / motion-utils 12.39.0; react-router 7.18.3 (peer react >=18, node >=20, deps cookie+set-cookie-parser); vitest 4.1.11 also supports vite ^6.0.0 (node ^20||^22||>=24).
- cmdk@1.1.1 dependencies: @radix-ui/react-dialog ^1.1.6, react-id, react-primitive, react-compose-refs -> YES it pulls react-dialog.
- shadcn@4.21.0 depends on `cn` ^0.2.4; generated components import `{ cn } from "cn"` directly (package "cn" = "Fast, small, compiled class-name merging for Tailwind CSS. Drop-in replacement for clsx + tailwind-merge", repo github.com/shadcn-ui/cn, maintainer shadcn). src/lib/utils.ts is just `export { cn } from "cn"`.
- pnpm install (pnpm 10.34.5) on the probe app: no peer-dependency warnings; only "Ignored build scripts: esbuild@0.25.12" (needs `pnpm.onlyBuiltDependencies: ["esbuild"]` or approve-builds).

## 2. Measured sizes (gzip -9 via zlib; vite 6.4.3 prod build; per-probe entry builds in out/<probe>, table in probe-sizes.txt)
| probe | JS gz bytes | delta vs React baseline |
|---|---|---|
| p00 empty | 34 | - |
| p01 react+react-dom 19.3.0 (createRoot+useState) | 68,985 | baseline |
| p02 + react-router 7.18.3 declarative (BrowserRouter/Routes/Route/useNavigate/useParams/useSearchParams/Link) | 83,137 | +14,152 |
| p03 + cmdk 1.1.1 raw (Command shouldFilter=false) | 86,356 | +17,371 (includes @radix-ui/react-dialog, dismissable-layer, focus-scope, react-remove-scroll, aria-hidden) |
| p04 + motion 12.43.0 MotionConfig+LazyMotion(domAnimation, sync)+m.div | 96,185 | +27,200 |
| p05 + LazyMotion(domMax, sync)+m.div layoutId | 110,256 | +41,271 |
| p06 LazyMotion async domAnimation: main / features chunk | 84,112 / 14,211 | +15,127 initial, +14,211 lazy |
| p07 LazyMotion async domMax: main / features chunk | 84,050 / 28,249 | +15,065 initial, +28,249 lazy |
| p08 full `motion.div` (no LazyMotion) | 109,970 | +40,985 |
| p09 uplot 1.6.32 bars (no React) | 23,218 JS + 704 CSS | +23,218 |
| p10 radix-ui Accordion+Collapsible | 77,821 | +8,836 |
| p11 shadcn utils: cn + cva + 4 lucide icons | 82,152 | +13,167 (cn pkg alone ~13.3 KB gz sum-of-modules, 42.6 KB rendered) |
| p12 shadcn Command wrapper (cmdk+dialog+input-group+button+textarea+cn+lucide) | 100,281 | +31,296 |
| p13 shadcn Button+Input | 82,719 | +13,734 |
- Motion's own shipped size rollups (framer-motion/dist/size-rollup-*.js, gzip -9): m 6,426; dom-animation-m 3,150; dom-animation 14,025; dom-max 27,471; motion 39,415; waapi-animate 3,256; animate 22,127.
- motion.dev/docs/react-reduce-bundle-size claims m "just under 4.6kb", domAnimation "+15kb", domMax "+25kb". Measured in a real Vite build: m+LazyMotion+MotionConfig = 15.1 KB initial (async features) and domAnimation = 14.2 KB -> SPEC's "~6 KB" is WRONG; realistic 27-29 KB for m+domAnimation.
- Prior full probe app (dist/, before fixes): initial index.js 143,120 gz; Chart (uplot) lazy 23,584 + 704 CSS; Disclosure lazy 5,806; index.css 8,167 gz. JS total 172,510 gz -> only 7.5 KB headroom under 180 KB with a trivial app.
- Rebuilt app after moving visualizer output out of Tailwind's scan root (stats.html was being scanned): `tsc -b && vite build` exit 0, Vite 6.4.3 + @vitejs/plugin-react 5.2.0, NO @react-router/dev plugin. initial index.js 143,117 gz (434,954 raw); lazy Chart.js 23,582 + Chart.css 704; lazy Disclosure.js 5,805; index.css 9,062 gz (50,506 raw). JS total 172,504 gz.
- CSS isolation (probe builds, source("../src")): Tailwind v4.3.3 preflight+utilities used by src = 5,527 gz; + tw-animate-css + shadcn/tailwind.css + theme tokens = 7,708 gz; + @fontsource-variable/geist @font-face = 9,062 gz (woff2 files separate: latin 29.4 KB).
- vitest 5.0.0 `vitest run` against vite 6.4.3 config: 1 test passed (cn("px-2","px-3") === "px-3").
- Playwright 1.63.0 CLI ok; chromium-1243 + headless_shell present in ~/Library/Caches/ms-playwright (pre-existing). lhci 0.15.1 CLI ok.

## 3. Motion 12.43.0 facts from installed source (paths relative to app/node_modules/.pnpm/)
- (a) layoutId/layout REQUIRE domMax: framer-motion/dist/es/render/dom/features-animation.mjs = {renderer, ...animations, ...gestureAnimations}; features-max.mjs = {...domAnimation, ...drag, ...layout}; motion/features/layout.mjs = { layout: { ProjectionNode: HTMLProjectionNode, MeasureLayout } }. motion/index.mjs gets ProjectionNode via getProjectionFunctionality() from loaded feature definitions -> with domAnimation no projection node is created, layoutId is inert. Docs (motion.dev/docs/react-reduce-bundle-size): domAnimation = "animations, variants, exit animations, and tap/hover/focus gestures"; domMax = "all of the above, plus pan/drag gestures and layout animations".
- (c) WAAPI eligibility: motion-dom/dist/es/animation/waapi/utils/accelerated-values.mjs = Set["opacity","clipPath","filter","transform","backgroundColor"]; animation/waapi/supports/waapi.mjs supportsBrowserAnimation() requires name in that set (or color prop with oklch/lab-style browser-only colors), element instanceof HTMLElement/SVGElement, no transformTemplate (for transform), no onUpdate, no repeatDelay, repeatType!=="mirror", damping!==0, type!=="inertia". Called from animation/AsyncMotionValueAnimation.mjs:104 with the motion value key as name -> independent x/y/scale/rotate keys are NOT in the set -> JSAnimation on main thread (rAF, writes style.transform). Only `opacity`, a full `transform` string, backgroundColor, filter, clipPath go to WAAPI. motion.dev/docs/performance: independent transforms "currently these are not accelerated, even though they're being applied to transform".
- (d) Springs -> linear(): animation/generators/spring.mjs:311-313 toString() uses generateLinearEasing(...); waapi/utils/apply-generator.mjs applies generator.applyToOptions only if supportsLinearEasing(), else falls back to duration 300 + easeOut; waapi/utils/linear.mjs emits `linear(...)`.
- (e) Keyframe arrays + spring: animation/JSAnimation.mjs:66-69 dev-only invariant "Only two keyframes currently supported with spring and inertia animations" (id spring-two-frames). -> [0.8, 1.06, 1] with type "spring" is NOT supported; use 2-keyframe spring with bounce/low damping for overshoot, or duration keyframes with `times`.
- (f) Reduced motion: framer-motion/dist/es/utils/reduced-motion/use-reduced-motion-config.mjs ("never"->false, "always"->true, else OS pref). motion-dom/dist/es/animation/interfaces/visual-element-target.mjs:84-85 forces {type:false} (instant) only when `positionalKeys.has(key)`; render/utils/keys-position.mjs = width,height,top,left,right,bottom + transformPropOrder (x,y,z,translateX/Y/Z,scale,scaleX/Y,rotate*,skew*,transformPerspective). projection/node/create-projection-node.mjs:327-330 layout animations instant. => reducedMotion="user" does NOT disable opacity, backgroundColor, or a `transform` string value. Docs (motion.dev/docs/react-accessibility): "automatically disable transform and layout animations, while preserving the animation of other values like opacity and backgroundColor".
- (g) will-change: motion-dom/dist/es/value/will-change/add-will-change.mjs only adds when a WillChangeMotionValue is present or MotionGlobalConfig.WillChange is set; no assignment of MotionGlobalConfig.WillChange found in framer-motion/motion-dom/motion-utils es dist (grep). useWillChange() is exported (framer-motion/dist/es/index.mjs:35). Runtime check pending.
- Motion's shipped size-rollups: m 6.4 KB, dom-animation 14.0 KB, dom-max 27.5 KB gz.

## 4. shadcn 4.21.0 facts
- CLI: `shadcn init [components...]` flags: -t/--template (next,start,vite,react-router,laravel,astro), -b/--base (base, radix, aria), -p/--preset [name], -y (default true), -d/--defaults (= --template=next --preset=base-nova), -f, -c/--cwd, -s, --css-variables, --rtl/--no-rtl, --pointer/--no-pointer, --monorepo/--no-monorepo, --reinstall. `shadcn add` flags: -y, -o/--overwrite, -a, -p/--path, -s, --dry-run, --diff, --view. Presets found in dist: nova, vega, maia, lyra, mira, luma, sera. Styles are "<base>-<preset>" e.g. radix-nova / base-nova.
- components.json generated: {"$schema","style":"radix-nova","rsc":false,"tsx":true,"tailwind":{"config":"","css":"src/index.css","baseColor":"neutral","cssVariables":true,"prefix":""},"iconLibrary":"lucide","rtl":false,"aliases":{components,utils,ui,lib,hooks},"menuColor":"default","menuAccent":"subtle","registries":{}}.
- radix style uses the `radix-ui` monopackage (import { Accordion as AccordionPrimitive } from "radix-ui"); Base UI offered via -b base (base-nova). Registry (ui.shadcn.com/r/styles/<style>/<item>.json, fetched into registry/): command deps ["cn","cmdk"] regDeps ["dialog","input-group"] in BOTH radix-nova and base-nova -> command always drags dialog + input-group (+ textarea, button).
- index.css imports: tailwindcss, tw-animate-css, shadcn/tailwind.css, @fontsource-variable/geist -> `shadcn` becomes a runtime dependency (CSS only) and `tw-animate-css` too.

## 5. Motion runtime verification (Playwright 1.63 headless chromium-1243, prod build out/harness, results out/harness-results.json; harness app/harness/main.tsx, runner app/harness/runharness.mjs)
Spring = {type:"spring",stiffness:400,damping:30,mass:0.8}; sampled getComputedStyle + el.getAnimations() every rAF for 1.2 s.
- opacity 0->1 spring: WAAPI (element.getAnimations() non-empty 28 frames), easing "linear(0 0%, 0.023 2.27%, ...)", duration 450 ms. -> springs ARE compiled to linear().
- scale 0.8->1 (independent key): NO WAAPI animation (0 frames), transform written per frame by JS -> main thread.
- y 20->0: NO WAAPI -> main thread.
- transform "scale(0.8)"->"scale(1)": WAAPI, linear() easing, 450 ms -> off-main-thread-capable.
- backgroundColor rgb->rgb (duration 0.5): WAAPI (easing ease-out).
- scale [0.8,1.06,1] + spring (independent key): middle keyframe silently DROPPED (max scale 1.0014), same in development build (no console error/invariant observed).
- transform ["scale(0.8)","scale(1.06)","scale(1)"] + spring: WAAPI with 3 evenly spaced keyframes and the spring linear() applied as ONE global easing (max 1.0567) -> not a true spring per segment.
- scale [0.8,1.06,1] with {duration:0.4, times:[0,0.6,1], ease:"easeOut"}: reaches exactly 1.06, JS path.
- scale 0.8->1 {type:"spring", visualDuration:0.3, bounce:0.5}: natural overshoot to 1.0326 (JS path).
- layoutId under domAnimation: element jumps (left 8 -> 408, no transform) = no layout animation. Under domMax: 30 distinct interpolated transforms = animates. CONFIRMED layoutId needs domMax.
- MotionConfig reducedMotion="user" + OS prefers-reduced-motion: opacity STILL animates (WAAPI 450 ms); independent scale jumps instantly; a `transform` STRING value STILL animates (WAAPI). -> "user" only kills positional keys (x/y/scale/rotate/width/height/top/left...) and layout; spec §8.5 "instant state changes" needs explicit handling (useReducedMotion() -> transition {duration:0}/type:false, or skip initial).
- will-change: element.style.willChange stayed "" and computed "auto" in EVERY case (opacity, scale, transform, bg, layout) -> Motion 12.43 does NOT manage will-change automatically for m components; spec rule 6 must be hand-implemented (onAnimationStart/onAnimationComplete or useWillChange - latter UNVERIFIED re removal).
- cn/lite (clsx only) 178 B gz; clsx 2.1.1 270 B gz; `cn` full merge engine 10,687 B gz.
