import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, fundPath, paramsToSearch, parseParams } from "./url";

const parse = (search: string) => parseParams(new URLSearchParams(search));

describe("parseParams", () => {
  it("defaults to the last working day and a two-day buffer", () => {
    expect(parse("")).toEqual({ salary: "last", buffer: 2 });
    expect(parse("")).toEqual(DEFAULT_PARAMS);
  });

  it("reads a salary day and a buffer", () => {
    expect(parse("salary=28&buffer=3")).toEqual({ salary: 28, buffer: 3 });
    expect(parse("salary=last")).toEqual({ salary: "last", buffer: 2 });
  });

  it("clamps rather than rejecting, so a hand-edited URL still renders", () => {
    expect(parse("salary=0").salary).toBe(1);
    expect(parse("salary=99").salary).toBe(31);
    expect(parse("buffer=-4").buffer).toBe(0);
    expect(parse("buffer=40").buffer).toBe(7);
  });

  it("falls back to the defaults on nonsense", () => {
    expect(parse("salary=tuesday&buffer=soon")).toEqual(DEFAULT_PARAMS);
    expect(parse("salary=&buffer=")).toEqual(DEFAULT_PARAMS);
    expect(parse("salary=15.7").salary).toBe(15);
  });
});

describe("paramsToSearch", () => {
  it("leaves defaults out of the URL", () => {
    expect(paramsToSearch(DEFAULT_PARAMS).toString()).toBe("");
    expect(paramsToSearch({ salary: "last", buffer: 2 }).toString()).toBe("");
  });

  it("writes only what differs", () => {
    expect(paramsToSearch({ salary: 28, buffer: 2 }).toString()).toBe("salary=28");
    expect(paramsToSearch({ salary: "last", buffer: 0 }).toString()).toBe("buffer=0");
    expect(paramsToSearch({ salary: 15, buffer: 5 }).toString()).toBe("salary=15&buffer=5");
  });

  it("round-trips", () => {
    for (const params of [
      { salary: "last" as const, buffer: 2 },
      { salary: 1 as const, buffer: 0 },
      { salary: 31, buffer: 7 },
    ]) {
      expect(parseParams(paramsToSearch(params))).toEqual(params);
    }
  });
});

describe("fundPath", () => {
  it("builds a shareable link", () => {
    expect(fundPath(119775, DEFAULT_PARAMS)).toBe("/f/119775");
    expect(fundPath(119775, { salary: 28, buffer: 2 })).toBe("/f/119775?salary=28");
  });
});
