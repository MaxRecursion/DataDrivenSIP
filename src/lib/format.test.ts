import { describe, expect, it } from "vitest";
import { formatNavDate } from "./format";

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
