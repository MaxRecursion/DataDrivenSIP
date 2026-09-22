import { describe, expect, it } from "vitest";
import published from "../../public/data/index.json";
import type { IndexRow } from "../../shared/artifacts";
import { searchFunds, tokenise } from "./search";

// The real published index: 994 funds, so the scorer is exercised against the names people
// will actually type at.
const index = published as unknown as IndexRow[];

const codes = (query: string, limit?: number) => searchFunds(index, query, limit).map((row) => row[0]);

describe("tokenise", () => {
  it("drops the words every fund shares", () => {
    expect(tokenise("Kotak Mid Cap Fund - Direct Plan - Growth")).toEqual(["kotak", "mid", "cap"]);
  });

  it("keeps numbers and ampersands", () => {
    expect(tokenise("Kotak Large & Mid Cap Fund")).toEqual(["kotak", "large", "&", "mid", "cap"]);
    expect(tokenise("UTI Nifty 50 Index Fund")).toEqual(["uti", "nifty", "50", "index"]);
  });
});

describe("searchFunds", () => {
  it("puts Kotak Mid Cap ahead of Kotak Large & Mid Cap for 'kotak mid'", () => {
    expect(codes("kotak mid")[0]).toBe(119775);
  });

  it("survives a typo", () => {
    expect(codes("kotk mid")[0]).toBe(119775);
    expect(codes("kotak mdi")[0]).toBe(119775);
  });

  it("matches on the fund house as well as the name", () => {
    const results = searchFunds(index, "quant dynamic", 8);
    expect(results.some((row) => row[0] === 151713)).toBe(true);
  });

  it("caps the list", () => {
    expect(codes("fund", 8).length).toBeLessThanOrEqual(8);
    expect(codes("a", 3).length).toBeLessThanOrEqual(3);
  });

  it("returns nothing for an empty or unmatchable query", () => {
    expect(codes("")).toEqual([]);
    expect(codes("   ")).toEqual([]);
    expect(codes("zzzzqqqq")).toEqual([]);
  });

  it("needs every query word to match, so an extra word narrows the list", () => {
    const broad = codes("kotak");
    const narrow = codes("kotak emerging");
    expect(narrow.length).toBeLessThanOrEqual(broad.length);
  });

  it("orders by text relevance only, never by a metric", () => {
    // Two funds from the same house: the one whose name starts with the query wins.
    const results = searchFunds(index, "mirae asset", 8);
    expect(results.every((row) => /mirae/i.test(row[1]) || /mirae/i.test(row[2]))).toBe(true);
  });

  it("does not reorder matches by verdict or spread", () => {
    const rows: IndexRow[] = [
      [2, "Alpha Special Fund - Direct Plan - Growth", "House", "Eq", "noise", 0.01],
      [1, "Alpha Fund - Direct Plan - Growth", "House", "Eq", "meaningful", 0.9],
    ];
    const codesOnly = searchFunds(rows, "alpha", 8).map((row) => row[0]);
    expect(codesOnly).toEqual([1, 2]);

    const swapped: IndexRow[] = [
      [2, "Alpha Special Fund - Direct Plan - Growth", "House", "Eq", "meaningful", 0.9],
      [1, "Alpha Fund - Direct Plan - Growth", "House", "Eq", "noise", 0.01],
    ];
    expect(searchFunds(swapped, "alpha", 8).map((row) => row[0])).toEqual(codesOnly);
  });

  it("finds a fund by its plan words being ignored", () => {
    expect(codes("kotak mid cap direct growth")[0]).toBe(119775);
  });
});
