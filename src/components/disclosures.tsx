/**
 * The three disclosure sections (PLAN.md §6.5), collapsed by default.
 *
 * Radix Collapsible renders nothing at all for a closed section, which is stronger than
 * `content-visibility` and is the reason the chart can live in here: uPlot is not imported, not
 * parsed and not run until a reader opens the first section, so a page nobody opens never pays
 * for it. Open bodies then get `content-visibility: auto` so the browser can skip laying out
 * what has scrolled away.
 *
 * Nothing here animates. Radix ships height recipes for exactly this component and they are not
 * used: a height transition is neither transform nor opacity, and `scripts/check-rules.ts` fails
 * the build over it. A disclosure that opens instantly is also simply faster to read.
 *
 * Every sentence rendered here comes from `disclosure.ts` already written and already formatted.
 * This file decides what is behind which heading, and nothing else.
 */
import { Suspense, lazy, type ReactNode } from "react";
import { Collapsible } from "radix-ui";
import type { FundArtifact } from "../../shared/artifacts";
import type { Answer } from "../lib/answer";
import type { DisclosureCopy } from "../lib/disclosure";
import { ConfidenceGlyph, CurveGlyph } from "./glance-icons";

/** The heavy one. Loaded when the section holding it is opened, never before. */
const SpreadChart = lazy(() => import("./spread-chart"));

/**
 * The ApexCharts visuals — lazier still. Apex is ~250 KB gzipped, so these chunks are only
 * requested when the section holding them opens (Radix renders a closed section as nothing),
 * and a page nobody opens a section on never downloads it. Never import these statically.
 */
const ConfidenceGauge = lazy(() => import("./charts/confidence-gauge"));
const StretchesLed = lazy(() => import("./charts/stretches-led"));
const MattersBars = lazy(() => import("./charts/matters-bars"));

type SectionProps = {
  id: string;
  title: string;
  /**
   * Held open, with no toggle: the wide dashboard, where every section is on screen at once.
   * Undefined leaves it an ordinary disclosure that starts closed.
   */
  open?: boolean | undefined;
  /** A small, silent preview of what this section says — see glance-icons.tsx. */
  preview?: ReactNode;
  children: ReactNode;
};

function Chevron() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      className="shrink-0 text-mute-text group-data-[state=open]:rotate-180"
    >
      {/* Inline, because lucide-react was stripped (PLAN.md D18). */}
      <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * One card per section.
 *
 * The prototype draws these with their charts always on screen and only the prose behind a
 * toggle. That is not available here: ApexCharts is ~175 KB gzipped and is only affordable
 * because Radix renders a closed section as nothing at all, so a reader who never opens one
 * never downloads it (CLAUDE.md; an e2e test asserts no Apex request before a section opens).
 * So the card keeps its collapsible — and on the wide dashboard, where `open` holds every
 * section open, it looks exactly as drawn anyway.
 */
function Section({ id, title, preview, open, children }: SectionProps) {
  const held = open === true;
  return (
    <Collapsible.Root
      data-disclosure={id}
      className="rounded-[2rem] bg-raised px-5 py-4 md:px-7 md:py-6 2xl:px-5 2xl:py-3"
      {...(held ? { open: true, onOpenChange: () => {} } : {})}
    >
      {/* §8.1's response-to-action motion: transform only, and instant under reduced motion. */}
      <Collapsible.Trigger
        disabled={held}
        className="group flex w-full items-center gap-3 py-1 text-left font-display text-xl text-ink outline-none transition-transform duration-100 active:scale-[0.99] disabled:cursor-default disabled:active:scale-100 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <span className="flex flex-1 items-center gap-2.5">
          {title}
          {preview}
        </span>
        {held ? null : <Chevron />}
      </Collapsible.Trigger>
      <Collapsible.Content>
        {/*
         * The padding is not decoration: a focus ring on the first control inside a section with
         * `content-visibility` set would otherwise be clipped by the containment box.
         */}
        <div
          className="max-w-[65ch] px-0.5 pt-3 2xl:max-w-none 2xl:pt-2"
          style={
            held
              ? undefined
              : { contentVisibility: "auto", containIntrinsicSize: "auto 480px" }
          }
        >
          {children}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

const paragraphs = (lines: string[]) =>
  lines.map((line) => (
    <p
      key={line}
      className="mt-3 text-sm leading-relaxed text-mute-text first:mt-0 2xl:mt-2 2xl:text-[0.8125rem] 2xl:leading-[1.45]"
    >
      {line}
    </p>
  ));

/**
 * The prose at the foot of a card, behind a toggle of its own on the wide dashboard.
 *
 * Below 2xl the whole card is already a disclosure, so a second one inside it would make a
 * reader open two things to read one: the prose is simply there. On the dashboard every card
 * is held open to show its chart, and five paragraphs of confidence copy below that chart is
 * what pushed the layout past one screen — so there, and only there, the prose folds away.
 * This is how the prototype draws it too (`confOpen` starts false in the wide layout).
 */
function Prose({ inset, label, children }: { inset: boolean; label: string; children: ReactNode }) {
  if (!inset) return <>{children}</>;
  return (
    <Collapsible.Root className="group/prose">
      <Collapsible.Content>
        <div className="pb-1">{children}</div>
      </Collapsible.Content>
      <Collapsible.Trigger className="mt-1 inline-flex min-h-9 items-center gap-1.5 rounded-full px-1.5 text-[0.8125rem] font-semibold text-down-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        <span className="group-data-[state=open]/prose:hidden">{label}</span>
        <span className="hidden group-data-[state=open]/prose:inline">Show less</span>
        <svg
          viewBox="0 0 16 16"
          width="13"
          height="13"
          aria-hidden="true"
          className="shrink-0 group-data-[state=open]/prose:rotate-180"
        >
          <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </Collapsible.Trigger>
    </Collapsible.Root>
  );
}

type SectionPartProps = {
  fund: FundArtifact;
  answer: Answer;
  copy: DisclosureCopy;
  /** True on the wide dashboard: shown open, with no toggle. */
  open?: boolean | undefined;
};

/*
 * Three sections, exported separately so the fund page can place them: stacked in order on a
 * phone or a laptop, spread across columns on a large screen (routes/fund.tsx).
 */

export function CurveSection({ fund, answer, copy, open }: SectionPartProps) {
  return (
    <Section
      id="curve"
      title="The full curve"
      open={open}
      preview={<CurveGlyph xirrs={fund.dates.map((row) => row.xirr)} />}
    >
      <Suspense fallback={<div className="h-[13rem] 2xl:h-[8.75rem]" />}>
        <SpreadChart fund={fund} answer={answer.date} />
      </Suspense>
      <p className="mt-3 text-sm leading-relaxed text-mute-text 2xl:mt-2 2xl:text-[0.8125rem] 2xl:leading-[1.45]">{copy.chartCaption}</p>
    </Section>
  );
}

export function ConfidenceSection({ fund, answer, copy, open }: SectionPartProps) {
  return (
    <Section
      id="confidence"
      title="How confident is this?"
      open={open}
      preview={<ConfidenceGlyph confidence={fund.confidence} />}
    >
      {/* On a wide screen the gauges and the columns sit side by side, and the paragraphs run in
          two columns beneath them, so the whole section fits the height it has. */}
      <div className="2xl:grid 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] 2xl:items-end 2xl:gap-6">
        {/* Fallbacks are sized to the charts they stand in for, so nothing shifts when they land. */}
        <Suspense fallback={<div style={{ height: 190 }} />}>
          <ConfidenceGauge fund={fund} answer={answer} />
        </Suspense>
        <Suspense fallback={<div style={{ height: 190 }} />}>
          <StretchesLed fund={fund} answer={answer} />
        </Suspense>
      </div>
      <Prose inset={open === true} label="What these mean">
        <div className="2xl:columns-2 2xl:gap-6 [&>p]:break-inside-avoid">{paragraphs(copy.confidence)}</div>
      </Prose>
    </Section>
  );
}

export function MattersSection({ fund, answer, copy, open }: SectionPartProps) {
  return (
    <Section id="matters" title="What actually matters" open={open}>
      {/*
       * On a wide screen, two balanced columns: the bars with the sentence that prices them,
       * then the rest. Stacked, the same DOM reads in the same order as before.
       */}
      <div className="2xl:grid 2xl:grid-cols-1 2xl:items-start 2xl:gap-0">
        <div>
          <Suspense fallback={<div style={{ height: 150 }} />}>
            <MattersBars fund={fund} answer={answer} />
          </Suspense>
          {paragraphs(copy.matters.slice(0, 1))}
        </div>
        <div className="mt-3 2xl:mt-2">
          <Prose inset={open === true} label="More on this">
            {paragraphs(copy.matters.slice(1))}
          </Prose>
        </div>
      </div>
    </Section>
  );
}
