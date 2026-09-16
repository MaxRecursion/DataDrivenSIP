/**
 * Which schemes get an answer (spec §4.2, PLAN.md D4). Two stages: what the scheme list can
 * tell us, and what only the NAV history can.
 */
import { addMonths, type DayNum } from "./analysis/dates";
import { buildHistory, type NavHistory } from "./analysis/nav";
import type { SchemeSummary } from "./sources/types";

export type ExclusionReason =
  | "not-direct-growth"
  | "income-option"
  | "not-open-ended"
  | "etf"
  | "overnight-or-liquid"
  | "target-maturity"
  | "no-nav"
  | "stale";

export type HistoryRejection = "too-short" | "flat-nav";

export const MAX_NAV_AGE_DAYS = 12;
export const MIN_MONTHS = 36;
const OPEN_ENDED = "Open Ended Schemes";

/** "Direct" is case-sensitive on purpose: /direct/i adds no live funds and matches "Indirect". */
const DIRECT = /Direct/;
const GROWTH = /growth/i;
/** The spec's regex dropped live "Dividend Yield" growth funds, so that phrase is excepted. */
const INCOME_OPTION = /IDCW|dividend(?! yield)|payout|reinvest|bonus|unclaim/i;
const ETF = /\bETFs?\b|exchange traded/i;
const CASH_LIKE = /\bovernight\b|\bliquid\b/i;
/** Target-maturity debt funds: a maturity year next to bond or SDL wording. */
const MATURITY_YEAR = /(?:^|[^\d])20\d\d(?:[^\d]|$)/;
const DEBT_LADDER = /\bsdl\b|\bbond\b|\bg-?sec\b|\bgilt\b|\bpsu\b|\bcpse\b|target maturity/i;

export function checkScheme(
  scheme: SchemeSummary,
  today: DayNum,
): { ok: true; reason?: undefined } | { ok: false; reason: ExclusionReason } {
  const name = scheme.name ?? "";

  if (!DIRECT.test(name) || !GROWTH.test(name)) return { ok: false, reason: "not-direct-growth" };
  if (INCOME_OPTION.test(name)) return { ok: false, reason: "income-option" };

  if (scheme.type !== OPEN_ENDED) return { ok: false, reason: "not-open-ended" };
  if (ETF.test(name)) return { ok: false, reason: "etf" };
  if (CASH_LIKE.test(name)) return { ok: false, reason: "overnight-or-liquid" };
  if (MATURITY_YEAR.test(name) && DEBT_LADDER.test(name)) return { ok: false, reason: "target-maturity" };

  if (scheme.latestNav === null || scheme.latestNav <= 0 || scheme.latestNavDate === null) {
    return { ok: false, reason: "no-nav" };
  }
  if (today - scheme.latestNavDate > MAX_NAV_AGE_DAYS) return { ok: false, reason: "stale" };

  return { ok: true };
}

export function filterSchemes(
  schemes: readonly SchemeSummary[],
  today: DayNum,
): { eligible: SchemeSummary[]; excluded: Map<ExclusionReason, number> } {
  const eligible: SchemeSummary[] = [];
  const excluded = new Map<ExclusionReason, number>();

  for (const scheme of schemes) {
    const result = checkScheme(scheme, today);
    if (result.ok) eligible.push(scheme);
    else excluded.set(result.reason, (excluded.get(result.reason) ?? 0) + 1);
  }
  return { eligible, excluded };
}

/**
 * A NAV that changes by more than half between published days is a re-denomination or a
 * reconstitution, not a market move: money market funds in this data jump 13 → 1,336 in a
 * day. Left alone the engine reads that as a hundredfold gain, and the dates either side of
 * it get wildly different rates, which is enough to grade pure accrual funds "meaningful".
 * Anything before the last such jump is a different series, so it goes.
 */
export const MAX_DAILY_MOVE = 0.5;

export function trimAtDiscontinuity(history: NavHistory): { history: NavHistory; trimmedAt: DayNum | null } {
  const rows = history.rows;
  let cut = -1;
  for (let index = 1; index < rows.length; index++) {
    const previous = rows[index - 1];
    const row = rows[index];
    if (!previous || !row || previous.nav <= 0) continue;
    if (Math.abs(row.nav - previous.nav) / previous.nav > MAX_DAILY_MOVE) cut = index;
  }
  if (cut === -1) return { history, trimmedAt: null };
  return { history: buildHistory(rows.slice(cut)), trimmedAt: rows[cut]?.day ?? null };
}

/** Enough rows for "the NAV never moves" to mean anything. */
const FLAT_CHECK_MIN_ROWS = 20;
const FLAT_CHECK_WINDOW = 60;

export function checkHistory(
  history: NavHistory,
): { ok: true; reason?: undefined } | { ok: false; reason: HistoryRejection } {
  if (addMonths(history.first, MIN_MONTHS) > history.last) return { ok: false, reason: "too-short" };

  if (history.rows.length >= FLAT_CHECK_MIN_ROWS) {
    const recent = history.rows.slice(-FLAT_CHECK_WINDOW);
    if (new Set(recent.map((row) => row.nav)).size <= 2) return { ok: false, reason: "flat-nav" };
  }
  return { ok: true };
}
