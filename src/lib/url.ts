/**
 * The URL is the state (spec §6.6). Everything here is total: a hand-edited or stale link
 * clamps to something sensible rather than erroring, and defaults never appear in the URL.
 */

export const DEFAULT_BUFFER = 2;
export const MAX_BUFFER = 7;

/** "last" is the last working day of the month; otherwise the day salary lands. */
export type Salary = "last" | number;
export type AppParams = { salary: Salary; buffer: number };

export const DEFAULT_PARAMS: AppParams = { salary: "last", buffer: DEFAULT_BUFFER };

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

function parseSalary(raw: string | null): Salary {
  if (raw === null || raw === "" || raw === "last") return "last";
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? clamp(value, 1, 31) : "last";
}

function parseBuffer(raw: string | null): number {
  if (raw === null || raw === "") return DEFAULT_BUFFER;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? clamp(value, 0, MAX_BUFFER) : DEFAULT_BUFFER;
}

export function parseParams(search: URLSearchParams): AppParams {
  return { salary: parseSalary(search.get("salary")), buffer: parseBuffer(search.get("buffer")) };
}

export function paramsToSearch(params: AppParams): URLSearchParams {
  const search = new URLSearchParams();
  if (params.salary !== DEFAULT_PARAMS.salary) search.set("salary", String(params.salary));
  if (params.buffer !== DEFAULT_PARAMS.buffer) search.set("buffer", String(params.buffer));
  return search;
}

export function fundPath(code: number, params: AppParams): string {
  const search = paramsToSearch(params).toString();
  return search ? `/f/${code}?${search}` : `/f/${code}`;
}
