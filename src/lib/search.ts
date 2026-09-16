/**
 * Typeahead scoring over index.json (spec §6.1).
 *
 * Ordering is text relevance only — never a return, a spread or a verdict (CLAUDE.md). Every
 * query word has to match, in order, so adding a word always narrows the list.
 */
import type { IndexRow } from "../../shared/artifacts";

/** Words nearly every scheme carries, which would otherwise dominate the match. */
const PLAN_WORDS = new Set(["direct", "plan", "growth", "option", "fund", "funds", "scheme", "the", "of", "and"]);

/**
 * Below this length a typo allowance would match almost anything. Three is low enough to
 * catch a transposed short word ("mdi" for "mid") and safe because every query word still
 * has to match something, in order.
 */
const FUZZY_MIN_LENGTH = 3;

export function tokenise(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9&]+/g) ?? []).filter((token) => !PLAN_WORDS.has(token));
}

/** True when `candidate` is `target` with at most one insertion, deletion or swap. */
function withinOneEdit(query: string, candidate: string): boolean {
  if (Math.abs(query.length - candidate.length) > 1) return false;
  let q = 0;
  let c = 0;
  let edits = 0;
  while (q < query.length && c < candidate.length) {
    if (query[q] === candidate[c]) {
      q++;
      c++;
      continue;
    }
    if (++edits > 1) return false;
    // A swapped pair counts as one edit: "mdi" for "mid".
    if (query[q] === candidate[c + 1] && query[q + 1] === candidate[c]) {
      q += 2;
      c += 2;
    } else if (query.length > candidate.length) q++;
    else if (query.length < candidate.length) c++;
    else {
      q++;
      c++;
    }
  }
  return edits + (query.length - q) + (candidate.length - c) <= 1;
}

type Scored = { row: IndexRow; score: number };

function scoreRow(row: IndexRow, queryTokens: readonly string[], allowTypos: boolean): number | null {
  // Name tokens first, then house: a match earlier in the name counts for more.
  const haystack = [...tokenise(row[1]), ...tokenise(row[2])];
  let score = 0;
  let from = 0;

  for (const token of queryTokens) {
    let matched = -1;
    for (let index = from; index < haystack.length; index++) {
      const candidate = haystack[index] ?? "";
      if (candidate.startsWith(token)) {
        matched = index;
        score += candidate === token ? 5 : 0;
        break;
      }
      if (allowTypos && token.length >= FUZZY_MIN_LENGTH && withinOneEdit(token, candidate)) {
        matched = index;
        score -= 4; // a typo match is worth less than a clean one
        break;
      }
    }
    if (matched === -1) return null;
    score += Math.max(0, 20 - matched);
    from = matched + 1;
  }

  // Among equally good matches, prefer the shorter, more specific name.
  return score - row[1].length / 40;
}

export function searchFunds(rows: readonly IndexRow[], query: string, limit = 8): IndexRow[] {
  const queryTokens = tokenise(query);
  if (queryTokens.length === 0) return [];

  const collect = (allowTypos: boolean): Scored[] => {
    const hits: Scored[] = [];
    for (const row of rows) {
      const score = scoreRow(row, queryTokens, allowTypos);
      if (score !== null) hits.push({ row, score });
    }
    return hits;
  };

  // Typos are only worth allowing when a clean match found nothing much.
  let hits = collect(false);
  if (hits.length === 0) hits = collect(true);

  return hits
    .sort((a, b) => b.score - a.score || a.row[1].length - b.row[1].length || a.row[0] - b.row[0])
    .slice(0, limit)
    .map((hit) => hit.row);
}
