/**
 * XIRR by bisection only (spec §5.2, CLAUDE.md). Newton-Raphson is never used: it fails to
 * converge on some SIP cash-flow shapes, and Excel itself returns #NUM! or ~0 on a few of them.
 *
 * Bracket [-0.99, 3.0], 100 iterations, ACT/365 from the earliest flow. When NPV has the same
 * sign at both ends there is no root in range, and the answer is null with a reason rather
 * than a bracket end silently passed off as a rate.
 */
import type { DayNum } from "./dates";

export type CashFlow = { day: DayNum; amount: number };

export type XirrFailure =
  | "too-few-flows"
  | "no-positive-flow"
  | "no-negative-flow"
  | "npv-not-finite"
  | "no-sign-change";

export type XirrResult = { rate: number } | { rate: null; reason: XirrFailure };

const LOWEST_RATE = -0.99;
const HIGHEST_RATE = 3;
const ITERATIONS = 100;

/** Net present value, discounted from the earliest flow on an ACT/365 basis. */
export function npv(flows: readonly CashFlow[], rate: number): number {
  if (flows.length === 0) return 0;
  let start = Infinity;
  for (const flow of flows) if (flow.day < start) start = flow.day;
  let total = 0;
  for (const flow of flows) total += flow.amount / (1 + rate) ** ((flow.day - start) / 365);
  return total;
}

export function xirr(flows: readonly CashFlow[]): XirrResult {
  if (flows.length < 2) return { rate: null, reason: "too-few-flows" };
  if (!flows.some((flow) => flow.amount > 0)) return { rate: null, reason: "no-positive-flow" };
  if (!flows.some((flow) => flow.amount < 0)) return { rate: null, reason: "no-negative-flow" };

  const atLowest = npv(flows, LOWEST_RATE);
  const atHighest = npv(flows, HIGHEST_RATE);
  if (!Number.isFinite(atLowest) || !Number.isFinite(atHighest)) return { rate: null, reason: "npv-not-finite" };
  if (Math.sign(atLowest) === Math.sign(atHighest)) return { rate: null, reason: "no-sign-change" };

  // Track the sign at the low end instead of assuming NPV falls as the rate rises.
  const lowSign = Math.sign(atLowest);
  let low = LOWEST_RATE;
  let high = HIGHEST_RATE;
  for (let i = 0; i < ITERATIONS; i++) {
    const mid = (low + high) / 2;
    const value = npv(flows, mid);
    if (value === 0) return { rate: mid };
    if (Math.sign(value) === lowSign) low = mid;
    else high = mid;
  }
  return { rate: (low + high) / 2 };
}
