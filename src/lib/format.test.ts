import { describe, expect, it } from "vitest";
import {
  formatLakh,
  formatNavDate,
  formatPercentOfValue,
  formatPp,
  formatRupees,
  formatSignedPp,
  formatYears,
  formatYearsOfMonths,
  ordinal,
} from "./format";

/** U+2212, spelled out so a test failure shows which character was actually produced. */
const MINUS = "−";

describe("formatNavDate", () => {
  it("uses the long month name, not en-IN's short 'Sept'", () => {
    expect(formatNavDate("2026-09-11")).toBe("11 September 2026");
  });

  it("doesn't shift the date across timezones", () => {
    expect(formatNavDate("2013-01-01")).toBe("1 January 2013");
    expect(formatNavDate("2024-02-29")).toBe("29 February 2024");
  });

  it("rejects anything that isn't YYYY-MM-DD", () => {
    expect(() => formatNavDate("11-09-2026")).toThrow();
  });
});

describe("formatRupees", () => {
  it("groups by the Indian system, so a lakh reads as a lakh", () => {
    expect(formatRupees(60869)).toBe("₹60,869");
    expect(formatRupees(1640000)).toBe("₹16,40,000");
    expect(formatRupees(12345678)).toBe("₹1,23,45,678");
  });

  it("drops paise, which are noise beside a corpus", () => {
    expect(formatRupees(60869.49)).toBe("₹60,869");
    expect(formatRupees(60868.5)).toBe("₹60,869");
  });

  it("puts a negative sign outside the symbol and uses the real minus", () => {
    expect(formatRupees(-60869)).toBe(`${MINUS}₹60,869`);
    expect(formatRupees(-60869)).not.toContain("-");
  });

  it("never prints a signed zero, however the value got there", () => {
    expect(formatRupees(0)).toBe("₹0");
    expect(formatRupees(-0)).toBe("₹0");
    // A value that rounds away to zero must not keep its sign either.
    expect(formatRupees(-0.2)).toBe("₹0");
  });

  it("throws rather than rendering '₹NaN' onto the page", () => {
    expect(() => formatRupees(Number.NaN)).toThrow();
    expect(() => formatRupees(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe("formatLakh", () => {
  it("speaks in the unit an Indian reader already holds in their head", () => {
    expect(formatLakh(1640000)).toBe("₹16.4 lakh");
    expect(formatLakh(1650000)).toBe("₹16.5 lakh");
    expect(formatLakh(100000)).toBe("₹1.0 lakh");
  });

  it("falls back to exact rupees below a lakh, where the unit would hide the number", () => {
    // Kotak's whole-period rupee spread lands here.
    expect(formatLakh(59476)).toBe("₹59,476");
    expect(formatLakh(99999)).toBe("₹99,999");
    expect(formatLakh(0)).toBe("₹0");
  });

  it("switches to crore at a crore", () => {
    expect(formatLakh(10000000)).toBe("₹1.0 crore");
    expect(formatLakh(12345678)).toBe("₹1.2 crore");
  });

  it("promotes a figure that would otherwise read as '₹100.0 lakh'", () => {
    // 99.95 lakh rounds to 100.0 at one decimal, and nobody says "a hundred lakh".
    expect(formatLakh(9995000)).toBe("₹1.0 crore");
  });

  it("keeps the real minus sign on the way down to rupees", () => {
    expect(formatLakh(-1640000)).toBe(`${MINUS}₹16.4 lakh`);
    expect(formatLakh(-59476)).toBe(`${MINUS}₹59,476`);
  });
});

describe("ordinal", () => {
  it("gets the teens right, where a naive last-digit rule would say '11st'", () => {
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(12)).toBe("12th");
    expect(ordinal(13)).toBe("13th");
  });

  it("suffixes the single digits and the twenties the way English does", () => {
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(2)).toBe("2nd");
    expect(ordinal(3)).toBe("3rd");
    expect(ordinal(4)).toBe("4th");
    expect(ordinal(21)).toBe("21st");
    expect(ordinal(22)).toBe("22nd");
    expect(ordinal(23)).toBe("23rd");
  });

  it("covers the whole SIP range, which stops at 28", () => {
    const suffixed = Array.from({ length: 28 }, (_, i) => ordinal(i + 1));
    expect(suffixed[27]).toBe("28th");
    expect(suffixed).toHaveLength(28);
    expect(suffixed.every((text) => /^\d+(st|nd|rd|th)$/.test(text))).toBe(true);
  });
});

describe("formatPp", () => {
  it("shows two decimals, the resolution the verdict threshold is judged at", () => {
    // Kotak's spread: 0.112 pp, comfortably under the 0.25 pp threshold.
    expect(formatPp(0.112)).toBe("0.11 pp");
    expect(formatPp(0.25)).toBe("0.25 pp");
    expect(formatPp(1)).toBe("1.00 pp");
  });

  it("separates 'too small to show' from 'exactly nothing'", () => {
    // "0.00 pp" would claim a real difference is no difference at all.
    expect(formatPp(0.004)).toBe("<0.01 pp");
    expect(formatPp(0.0001)).toBe("<0.01 pp");
    expect(formatPp(0)).toBe("0.00 pp");
    expect(formatPp(-0)).toBe("0.00 pp");
  });

  it("starts printing a figure as soon as one rounds to 0.01", () => {
    expect(formatPp(0.006)).toBe("0.01 pp");
    expect(formatPp(0.01)).toBe("0.01 pp");
  });

  it("uses the real minus sign, never a hyphen", () => {
    expect(formatPp(-0.112)).toBe(`${MINUS}0.11 pp`);
    expect(formatPp(-2.5)).toBe(`${MINUS}2.50 pp`);
    expect(formatPp(-0.112)).not.toContain("-");
  });

  it("throws rather than rendering 'NaN pp' onto the page", () => {
    expect(() => formatPp(Number.NaN)).toThrow();
  });
});

describe("formatYearsOfMonths", () => {
  it("dates a sentence from the instalments its rupees were simulated over", () => {
    // 164 instalments is Kotak's common month set, and 13.7 years is what formatYears gives for
    // its NAV span — they agree here, which is exactly why the worked example never caught the
    // two spans being different quantities.
    expect(formatYearsOfMonths(164)).toBe("13.7 years");
    expect(formatYearsOfMonths(12)).toBe("1.0 years");
  });

  it("differs from the NAV span where a fund's months and its history disagree", () => {
    // Fund 149329: 52 instalments over a 4.8-year history. Ten thousand a month for 4.8 years
    // would be 5.76 lakh, but only 5.2 lakh was invested; the sentence must date itself from
    // the instalments or its own numbers contradict each other.
    expect(formatYearsOfMonths(52)).toBe("4.3 years");
    expect(formatYears("2021-12-14", "2026-09-15")).toBe("4.8 years");
  });
});

describe("formatSignedPp", () => {
  it("marks a gain with a sign, so a grid of these reads as differences and not as levels", () => {
    expect(formatSignedPp(0.031)).toBe("+0.03");
    expect(formatSignedPp(1)).toBe("+1.00");
  });

  it("drops the unit, because the cell it goes in states it once alongside", () => {
    expect(formatSignedPp(0.031)).not.toContain("pp");
  });

  it("keeps the real minus sign on a loss", () => {
    expect(formatSignedPp(-0.031)).toBe(`${MINUS}0.03`);
    expect(formatSignedPp(-0.031)).not.toContain("-");
  });

  it("carries the same floor as formatPp, so noise never prints as a clean zero", () => {
    // A signed "+0.00" would read as a real but tiny gain; "<0.01" says what is actually known.
    expect(formatSignedPp(0.004)).toBe("<0.01");
    expect(formatSignedPp(-0.004)).toBe("<0.01");
    expect(formatSignedPp(0)).toBe("0.00");
  });
});

describe("formatPercentOfValue", () => {
  it("takes a fraction, because that's what the artifact stores", () => {
    expect(formatPercentOfValue(0.008)).toBe("0.8%");
    expect(formatPercentOfValue(0.155)).toBe("15.5%");
    expect(formatPercentOfValue(1)).toBe("100.0%");
  });

  it("always shows one decimal, so a column of these lines up", () => {
    expect(formatPercentOfValue(0)).toBe("0.0%");
    expect(formatPercentOfValue(0.5)).toBe("50.0%");
  });

  it("uses the real minus sign, never a hyphen", () => {
    expect(formatPercentOfValue(-0.008)).toBe(`${MINUS}0.8%`);
    expect(formatPercentOfValue(-0.008)).not.toContain("-");
  });
});

describe("formatYears", () => {
  it("reports Kotak's history as the 13.7 years the artifact covers", () => {
    expect(formatYears("2013-01-03", "2026-09-15")).toBe("13.7 years");
  });

  it("counts leap days, so a span isn't short by the leap years inside it", () => {
    // 2016-01-01 to 2020-01-01 is 1461 days, not 1460.
    expect(formatYears("2016-01-01", "2020-01-01")).toBe("4.0 years");
    expect(formatYears("2013-01-01", "2014-01-01")).toBe("1.0 years");
  });

  it("measures in UTC, so the span never depends on where the reader sits", () => {
    expect(formatYears("2026-09-15", "2026-09-15")).toBe("0.0 years");
    expect(formatYears("2026-03-01", "2026-09-15")).toBe("0.5 years");
  });

  it("rejects anything that isn't YYYY-MM-DD", () => {
    expect(() => formatYears("2013-1-3", "2026-09-15")).toThrow();
    expect(() => formatYears("2013-01-03", "15 September 2026")).toThrow();
  });
});
