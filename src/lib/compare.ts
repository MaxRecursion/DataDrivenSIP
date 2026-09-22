/**
 * Short decision copy: verdict chip, a tapped date vs the named day, today vs the named day,
 * and a one-line share string. Pure. None of this chooses the date — pickAnswer still does.
 */
import type { DateResult, FundArtifact, Verdict } from "../../shared/artifacts";
import type { Answer } from "./answer";
import { formatPp, formatRupees, ordinal } from "./format";

export function verdictLabel(verdict: Verdict): string {
  if (verdict === "noise") return "Noise";
  if (verdict === "marginal") return "Thin edge";
  return "Date effect";
}

/** Dates with the highest and lowest XIRR. Ties go to the earlier date. */
export function xirrExtremes(fund: FundArtifact, answer: Answer): { highest: DateResult; lowest: DateResult } {
  let highest = fund.dates[0] ?? answer.result;
  let lowest = highest;
  for (const date of fund.dates) {
    if (date.xirr > highest.xirr || (date.xirr === highest.xirr && date.d < highest.d)) highest = date;
    if (date.xirr < lowest.xirr || (date.xirr === lowest.xirr && date.d < lowest.d)) lowest = date;
  }
  return { highest, lowest };
}

/**
 * A second sentence after the corpus rupee line, only when the XIRR extremes are a different
 * pair of dates. The rupee line stays about final value (D1); this names the rate extremes.
 */
export function xirrExtremesLine(fund: FundArtifact, answer: Answer): string | null {
  const { highest, lowest } = xirrExtremes(fund, answer);
  if (highest.d === lowest.d) return null;
  return `The highest and lowest XIRR were on the ${ordinal(highest.d)} and the ${ordinal(lowest.d)}.`;
}

export function mattersGlance(perInstalment: number, edgeRupees: number): string {
  if (perInstalment > Math.abs(edgeRupees)) {
    return "Missing one instalment costs more than picking this date over a typical one.";
  }
  return "For this fund a missed instalment and the date spread are closer than usual.";
}

export function compareDayCopy(named: DateResult, other: DateResult): string {
  const nthNamed = ordinal(named.d);
  const nthOther = ordinal(other.d);
  if (other.d === named.d) return `The ${nthNamed} is the named day.`;

  const xirrGap = other.xirr - named.xirr;
  const rupeeGap = other.corpus - named.corpus;
  if (xirrGap === 0) {
    return `The ${nthOther} and the ${nthNamed} have the same full-history XIRR.`;
  }
  const side = xirrGap < 0 ? "below" : "above";
  const money =
    rupeeGap === 0
      ? "The notional SIP ended in the same rupees."
      : `On the notional SIP that ended ${formatRupees(Math.abs(rupeeGap))} ${rupeeGap < 0 ? "lower" : "higher"}.`;
  return `The ${nthOther} sits ${formatPp(Math.abs(xirrGap))} ${side} the ${nthNamed}. ${money}`;
}

export function todayCopy(
  today: number,
  named: DateResult,
  todayRow: DateResult | undefined,
): string {
  const nthToday = ordinal(today);
  if (today > 28 || todayRow === undefined) {
    return `Today is the ${nthToday}, which is not a SIP date. The named day is the ${ordinal(named.d)}.`;
  }
  if (today === named.d) return `Today is the named day, the ${ordinal(named.d)}.`;
  return `Today is the ${nthToday}. ${compareDayCopy(named, todayRow)}`;
}

export function shareCopy(fund: FundArtifact, answer: Answer): string {
  const nth = ordinal(answer.date);
  const label = verdictLabel(fund.verdict).toLowerCase();
  return `${fund.name}: the ${nth}, ${label}, ${formatPp(fund.spreadPp)} range. Not advice.`;
}

export function stickyCopy(fund: FundArtifact, answer: Answer): string {
  return `The ${ordinal(answer.date)} · ${verdictLabel(fund.verdict)} · ${formatPp(fund.spreadPp)} range`;
}
