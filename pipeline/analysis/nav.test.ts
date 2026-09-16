import { describe, expect, it } from "vitest";
import { dayFromIso, isoFromDay } from "./dates";
import { buildHistory, navAt, navOnOrAfter, parseNavRows } from "./nav";

const rows = (entries: [string, string][]) => entries.map(([date, nav]) => ({ date, nav }));

describe("parseNavRows", () => {
  it("drops zero, negative and unparseable NAVs, then sorts ascending", () => {
    const parsed = parseNavRows(
      rows([
        ["03-01-2013", "14.052"],
        ["04-01-2013", "0"],
        ["07-01-2013", "abc"],
        ["02-01-2013", "13.900"],
        ["05-01-2013", "-1"],
        ["06-01-2013", "0.0000"],
      ]),
    );
    expect(parsed.map((row) => isoFromDay(row.day))).toEqual(["2013-01-02", "2013-01-03"]);
    expect(parsed.map((row) => row.nav)).toEqual([13.9, 14.052]);
  });

  it("keeps one row per date", () => {
    const parsed = parseNavRows(rows([["03-01-2013", "14.052"], ["03-01-2013", "14.052"]]));
    expect(parsed).toHaveLength(1);
  });
});

describe("navOnOrAfter", () => {
  // NAVs on 1, 9 and 20 January: gaps of 8 and 11 days.
  const history = buildHistory(
    parseNavRows(rows([["01-01-2020", "10"], ["09-01-2020", "11"], ["20-01-2020", "12"]])),
  );

  it("returns the NAV on the target day itself", () => {
    const found = navOnOrAfter(history, dayFromIso("2020-01-01"));
    expect(found?.nav).toBe(10);
    expect(isoFromDay(found?.day ?? -1)).toBe("2020-01-01");
  });

  it("rolls forward up to seven days", () => {
    // 2 January + 7 = 9 January, the last day still allowed.
    expect(isoFromDay(navOnOrAfter(history, dayFromIso("2020-01-02"))?.day ?? -1)).toBe("2020-01-09");
  });

  it("gives up past seven days rather than reaching further", () => {
    // 10 January + 7 = 17 January, and the next NAV is the 20th.
    expect(navOnOrAfter(history, dayFromIso("2020-01-10"))).toBeNull();
  });

  it("never rolls backward", () => {
    expect(navOnOrAfter(history, dayFromIso("2020-01-25"))).toBeNull();
  });

  it("never interpolates", () => {
    expect(navAt(history, dayFromIso("2020-01-05"))).toBeNull();
    expect(navAt(history, dayFromIso("2020-01-09"))).toBe(11);
  });
});

describe("buildHistory", () => {
  const history = buildHistory(parseNavRows(rows([["03-01-2013", "14.052"], ["11-09-2026", "169.773"]])));

  it("records the first and last day", () => {
    expect(isoFromDay(history.first)).toBe("2013-01-03");
    expect(isoFromDay(history.last)).toBe("2026-09-11");
  });

  it("rejects an empty history", () => {
    expect(() => buildHistory([])).toThrow();
  });
});
