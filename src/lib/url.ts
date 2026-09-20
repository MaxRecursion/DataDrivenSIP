/**
 * Fund URLs.
 *
 * There is no state in the URL beyond which fund is being shown. `?salary=` and `?buffer=` used
 * to choose a ten-date window the answer was picked from; the answer is now the fund's own
 * highest-XIRR date, which no parameter can change. Old links still work — the query string is
 * simply ignored rather than redirected, which is the stable thing to do for a link someone may
 * have bookmarked or shared.
 */

export function fundPath(code: number): string {
  return `/f/${code}`;
}
