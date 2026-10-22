/**
 * Copy the answer as a sentence. Returns the control alone — the caller places it, because it
 * sits in the hero card in a reading column and moves into the calendar's card on the wide
 * dashboard, where the hero has no room for it.
 */
import { useEffect, useState } from "react";
import { shareCopy } from "../lib/compare";
import type { FundArtifact } from "../../shared/artifacts";
import type { Answer } from "../lib/answer";
import { cn } from "../lib/utils";

export function CopyAnswer({
  fund,
  answer,
  className,
}: {
  fund: FundArtifact;
  answer: Answer;
  className?: string | undefined;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const onCopy = async () => {
    const text = shareCopy(fund, answer);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-line",
        "bg-surface px-[1.125rem] font-display text-sm text-ink",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marigold",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="block"
      >
        <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
      </svg>
      {copied ? "Copied" : "Copy this answer"}
    </button>
  );
}
