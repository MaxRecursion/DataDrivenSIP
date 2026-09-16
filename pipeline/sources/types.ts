/**
 * The seam between the pipeline and whoever publishes NAVs. Today that's mfapi.in; AMFI's
 * own NAVAll.txt can be dropped in behind the same interface without touching analysis.
 */
import type { DayNum } from "../analysis/dates";

/** One scheme as the list endpoint describes it, before any history is fetched. */
export type SchemeSummary = {
  code: number;
  name: string;
  house: string;
  type: string;
  category: string;
  /** Null when upstream gives no usable date. */
  latestNavDate: DayNum | null;
  /** Null when upstream gives no usable NAV. */
  latestNav: number | null;
};

/** A NAV row exactly as published: DD-MM-YYYY and a decimal string. */
export type RawNavRow = { date: string; nav: string };

export interface NavSource {
  listSchemes(): Promise<SchemeSummary[]>;
  /** Rows newest first, or null when the code isn't known. `since` asks for a tail only. */
  history(code: number, since?: DayNum): Promise<RawNavRow[] | null>;
}
