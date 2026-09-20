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

/** The heavy one. Loaded when the section holding it is opened, never before. */
const SpreadChart = lazy(() => import("./spread-chart"));

/** Matches the chart's own reserved height, so the fallback doesn't resize when it lands. */
const CHART_HEIGHT = 208;

type SectionProps = {
  id: string;
  title: string;
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

function Section({ id, title, children }: SectionProps) {
  return (
    <Collapsible.Root data-disclosure={id} className="border-t border-line">
      {/* §8.1's response-to-action motion: transform only, and instant under reduced motion. */}
      <Collapsible.Trigger className="group flex w-full items-center justify-between gap-3 py-4 text-left font-display text-base font-bold text-ink outline-none transition-transform duration-100 active:scale-[0.99] motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-teal">
        {title}
        <Chevron />
      </Collapsible.Trigger>
      <Collapsible.Content>
        {/*
         * The padding is not decoration: a focus ring on the first control inside a section with
         * `content-visibility` set would otherwise be clipped by the containment box.
         */}
        <div
          className="max-w-[65ch] px-0.5 pb-6"
          style={{ contentVisibility: "auto", containIntrinsicSize: "auto 480px" }}
        >
          {children}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

const paragraphs = (lines: string[]) =>
  lines.map((line) => (
    <p key={line} className="mt-3 text-sm leading-relaxed text-mute-text first:mt-0">
      {line}
    </p>
  ));

type DisclosuresProps = {
  fund: FundArtifact;
  answer: Answer;
  window: number[];
  copy: DisclosureCopy;
};

export default function Disclosures({ fund, answer, window: windowDates, copy }: DisclosuresProps) {
  return (
    <section className="mt-10">
      <Section id="curve" title="The full curve">
        <Suspense fallback={<div style={{ height: CHART_HEIGHT }} />}>
          <SpreadChart fund={fund} window={windowDates} answer={answer.date} />
        </Suspense>
        <p className="mt-3 text-sm leading-relaxed text-mute-text">{copy.chartCaption}</p>
      </Section>

      <Section id="confidence" title="How confident is this?">
        {paragraphs(copy.confidence)}
      </Section>

      <Section id="matters" title="What actually matters">
        {paragraphs(copy.matters)}
      </Section>
    </section>
  );
}
