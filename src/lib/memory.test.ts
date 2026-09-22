import { describe, expect, it } from "vitest";
import {
  MAX_RECENTS,
  type MemoryStore,
  readRecents,
  readSipDay,
  rememberFund,
  writeSipDay,
} from "./memory";

function memory(): MemoryStore {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe("recents", () => {
  it("puts the latest fund first and drops duplicates", () => {
    const store = memory();
    rememberFund({ code: 1, name: "A", house: "H", category: "E" }, store);
    rememberFund({ code: 2, name: "B", house: "H", category: "E" }, store);
    rememberFund({ code: 1, name: "A", house: "H", category: "E" }, store);
    expect(readRecents(store).map((row) => row.code)).toEqual([1, 2]);
  });

  it("caps the list", () => {
    const store = memory();
    for (let code = 1; code <= MAX_RECENTS + 3; code++) {
      rememberFund({ code, name: `F${code}`, house: "H", category: "E" }, store);
    }
    expect(readRecents(store)).toHaveLength(MAX_RECENTS);
    expect(readRecents(store)[0]?.code).toBe(MAX_RECENTS + 3);
  });

  it("survives junk in the store", () => {
    const store = memory();
    store.setItem("sip-date-planner.recents.v1", "nope");
    expect(readRecents(store)).toEqual([]);
  });
});

describe("sip day", () => {
  it("round-trips a date from 1 to 28", () => {
    const store = memory();
    expect(readSipDay(store)).toBeNull();
    expect(writeSipDay(7, store)).toBe(7);
    expect(readSipDay(store)).toBe(7);
  });

  it("rejects 29–31 and junk, so it cannot become a second SIP calendar", () => {
    const store = memory();
    writeSipDay(12, store);
    expect(writeSipDay(31, store)).toBe(12);
    store.setItem("sip-date-planner.sip-day.v1", "salary");
    expect(readSipDay(store)).toBeNull();
  });
});
