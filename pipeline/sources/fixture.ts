/**
 * The frozen NAV fixtures as a source, so the pipeline can be run end to end in tests and so
 * acceptance criterion 3 is reproducible without the network.
 */
import { readFileSync } from "node:fs";
import { dayFromNavDate } from "../analysis/dates";
import type { NavSource, RawNavRow, SchemeSummary } from "./types";

type MfapiFile = {
  meta: {
    scheme_code: number;
    scheme_name: string;
    fund_house: string;
    scheme_type: string;
    scheme_category: string;
  };
  data: RawNavRow[];
};

const FIXTURES = ["119775.nav.json", "151713.nav.json"];

function load(): MfapiFile[] {
  return FIXTURES.map(
    (file) => JSON.parse(readFileSync(new URL(`../fixtures/${file}`, import.meta.url), "utf8")) as MfapiFile,
  );
}

export function fixtureSource(): NavSource {
  const files = load();
  return {
    async listSchemes(): Promise<SchemeSummary[]> {
      return files.map((file) => {
        const newest = file.data[0];
        return {
          code: file.meta.scheme_code,
          name: file.meta.scheme_name,
          house: file.meta.fund_house,
          type: file.meta.scheme_type,
          category: file.meta.scheme_category,
          latestNav: newest ? Number.parseFloat(newest.nav) : null,
          latestNavDate: newest ? dayFromNavDate(newest.date) : null,
        };
      });
    },

    async history(code: number): Promise<RawNavRow[] | null> {
      return files.find((file) => file.meta.scheme_code === code)?.data ?? null;
    },
  };
}
