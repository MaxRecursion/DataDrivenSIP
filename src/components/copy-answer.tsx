import { useEffect, useState } from "react";
import { shareCopy } from "../lib/compare";
import type { FundArtifact } from "../../shared/artifacts";
import type { Answer } from "../lib/answer";

export function CopyAnswer({ fund, answer }: { fund: FundArtifact; answer: Answer }) {
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
    <p className="mt-4 2xl:mt-2">
      <button
        type="button"
        onClick={() => void onCopy()}
        className="rounded-lg border border-line bg-raised px-3 py-1.5 text-sm text-ink focus-visible:ring-2 focus-visible:ring-teal"
      >
        {copied ? "Copied" : "Copy this answer"}
      </button>
    </p>
  );
}
