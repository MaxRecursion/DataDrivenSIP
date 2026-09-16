/**
 * mfapi.in. One request lists every scheme with its latest NAV, which covers both the scheme
 * master and the liveness check; histories are fetched per code, optionally as a tail.
 */
import { dayFromNavDate, isoFromDay, type DayNum } from "../analysis/dates";
import { fetchJson } from "../fetch";
import type { NavSource, RawNavRow, SchemeSummary } from "./types";

const BASE = "https://api.mfapi.in/mf";

type LatestEntry = {
  schemeCode: number;
  schemeName: string;
  fundHouse: string;
  schemeType: string;
  schemeCategory: string;
  nav: string | null;
  date: string | null;
};

type HistoryResponse = {
  meta: { scheme_code: number };
  data: RawNavRow[];
};

function parseNumber(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseDay(value: string | null): DayNum | null {
  if (!value) return null;
  try {
    return dayFromNavDate(value);
  } catch {
    return null;
  }
}

export function mfapiSource(fetcher?: typeof fetch): NavSource {
  const options = fetcher ? { fetcher } : {};
  return {
    async listSchemes() {
      const result = await fetchJson<LatestEntry[]>(`${BASE}/latest`, options);
      if (!result.ok) throw new Error(`Couldn't list schemes from mfapi (${result.reason})`);
      return result.value.map(
        (entry): SchemeSummary => ({
          code: entry.schemeCode,
          name: entry.schemeName ?? "",
          house: entry.fundHouse ?? "",
          // Upstream sometimes leaks a raw AMFI CSV line into these fields; eligibility only
          // accepts the exact string it expects, so a corrupt value simply fails the check.
          type: entry.schemeType ?? "",
          category: entry.schemeCategory ?? "",
          latestNav: parseNumber(entry.nav),
          latestNavDate: parseDay(entry.date),
        }),
      );
    },

    async history(code, since) {
      const url = since === undefined ? `${BASE}/${code}` : `${BASE}/${code}?startDate=${isoFromDay(since)}`;
      const result = await fetchJson<HistoryResponse>(url, options);
      if (!result.ok) return result.reason === "not-found" ? null : Promise.reject(new Error(result.reason));
      // An unknown code answers 200 with an empty payload rather than a 404.
      if (!result.value?.data?.length || result.value.meta?.scheme_code === 0) return null;
      return result.value.data;
    },
  };
}
