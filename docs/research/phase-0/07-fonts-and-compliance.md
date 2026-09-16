> Incremental notes from a research agent that was cut off by a usage limit before its final summary. Findings marked VERIFIED were checked; treat the rest as leads.

# Fonts + compliance research (Phase 0) — incremental notes
(Resumed run. Prior run left: raw/ CDN woff2, zips/ official download zips, subset/, inspect_raw.json, sebi/ PDF, amfi_terms, mfapi html.)

## 1. License (VERIFIED from shipped file)
Source: License/FFL.txt inside both official zips (Satoshi_Complete.zip, CabinetGrotesk_Complete.zip, served by Fontshare CDN 2026-09-14; md5 identical 4f54907e48230de36ebc963f372c0daf).
Title: "ITF Free Font License (FFL) Version 2.0 - 17 Aug 2026". Font name table licenseURL = https://fontshare.com/terms.
- Self-host on own site: EXPLICITLY ALLOWED (§01: "You may self-host the Font Software on your own servers ... including through standard webfont technologies such as CSS @font-face"; §02 closing carve-out).
- Subsetting / format conversion: PROHIBITED without prior written consent (§02 "This includes modifying or replacing glyphs, subsetting, format conversion..."; Definitions: Derivative Work includes "subsetting, format conversion"; §05 no derivative without consent).
- Redistribution: PROHIBITED incl. via "repository ... publicly accessible servers, file-sharing services" (§02). => committing font files to a PUBLIC GitHub repo is redistribution; not covered by self-host carve-out. GPL-3.0 cannot apply to them anyway.
- Attribution: NOT required ("You may, but are not required to, identify or credit ITF or Fontshare").
- Governing law India, courts Ahmedabad. Termination on breach (30-day cure; immediate for deliberate unauthorized modification/redistribution).

## 2. Font inspection (VERIFIED with fontkit 2.0.4 on CDN woff2 from api.fontshare.com css + zip WEB woff2)
- Cabinet Grotesk v1.000 (ITF, designer Shiva Nallaperumal): static 100,200,300,400,500,700,800,900 + variable wght 100-900 (default 900). No italics. 465-466 glyphs, 406 cmap. U+20B9 PRESENT. GSUB: aalt case ccmp dlig frac liga locl ordn salt ss01-ss05 sups. GPOS: kern mark mkmk. **NO tnum, NO lnum, NO pnum** — digits proportional only (700 kern-off advances: 655,323,595,615,624,623,606,507,606,611). Digits are lining (yMax 670-680 = capHeight 670). CSS font-variant-numeric: tabular-nums is a no-op.
- Satoshi v2.000 (ITF, designer Deni Anggara): static 300,400,500,700,900 + italics; variable wght 300-900 (+ variable italic). 504-506 glyphs, 432 cmap. **U+20B9 ABSENT.** GSUB includes tnum, pnum, frac, numr, dnom, sinf, subs, sups, case, ss01-ss04. GPOS kern mark. tnum => all digits 660 units (kern off). Digits lining (yMax 716-730 vs capHeight 716 @400). NOTE: with kern ON, tnum digit pairs still get kerned (fontkit shows '7' at 630) — browsers apply kern by default; use font-kerning:none or font-feature-settings "tnum" 1, "kern" 0 on aligned numeric columns (UNVERIFIED in-browser).
- Neither font has U+2007 figure space, U+2009 thin space, U+202F narrow nbsp. Both have U+2212 minus, en/em dash, curly quotes, U+00A0 in Cabinet; Satoshi subset reported U+00A0 missing from cmap (check).
- Metrics: Cabinet upem 1000, hhea/typo asc 870 desc -280 gap 90, useTypoMetrics on, capH 670, xH 484-490. Satoshi upem 1000, asc 1010 desc -240 gap 100, useTypo on, capH 716-731, xH 484-494.
- fsType: installable (no embedding restrictions, subsetting bit not set) — but the EULA text governs.

## 2b. CDN vs zip files (VERIFIED)
- Zip download URLs: https://api.fontshare.com/v2/fonts/download/satoshi and .../cabinet-grotesk (HTTP 200, application/zip, Satoshi_Complete.zip 2,168,134 B; CabinetGrotesk_Complete.zip 1,261,849 B).
- CSS API https://api.fontshare.com/v2/css?f[]=satoshi@...&f[]=cabinet-grotesk@... returns @font-face with cdn.fontshare.com/wf/<hash>/<hash>/<hash>.woff2 (+woff, ttf). Real URLs in urls.txt.
- CDN static woff2 = TrueType (glyf) outlines; zip WEB static woff2 = CFF outlines (same design, same cmap/features; outline data differs). Variable woff2 identical glyphs in both.
- Sizes (bytes) CDN: Cabinet 100 19732, 200 20376, 300 20332, 400 20332, 500 20260, 700 20300, 800 20204, 900 19376, Variable 41920. Satoshi 300 22800, 400 25516, 400i 26456, 500 25596, 700 25328, 900 23484, Variable 42588, VariableItalic 43844.
- Zip WEB: Cabinet Medium 20480, Bold 20896, Extrabold 20960, Variable 41860; Satoshi Regular 27184, Medium 27260, Bold 26728, Variable 42588.
- Satoshi cmap lacks U+00A0 (nbsp) and U+00AD in addition to U+20B9. Cabinet has all three.

## 3. Subsetting test (VERIFIED technically; LICENSE-PROHIBITED without ITF written consent)
Tool: subset-font 2.x (harfbuzzjs), npm local. Charset: U+0020-007E, U+00A0-00BF, U+00D7, U+00F7, U+2013, U+2014, U+2018, U+2019, U+201C, U+201D, U+2026, U+2212, U+20B9 (137 cps requested).
| subset | src B | subset woff2 B | glyphs | tnum kept | kern kept | features dropped |
|---|---|---|---|---|---|---|
| cabinet-500 | 20260 | 8716 | 156 | n/a (none in source) | yes | case ccmp ss02 ss03 mark mkmk |
| cabinet-700 | 20300 | 8720 | 156 | n/a | yes | same |
| cabinet-800 | 20204 | 8668 | 156 | n/a | yes | same |
| cabinet-var 100-900 | 41920 | 24812 | 164 | n/a | yes | same |
| cabinet-var pinned 500-800 | 41920 | 25964 (larger! axis-limiting via instancer adds data) | 164 | n/a | yes | same |
| cabinet-700 digits+space only | 20300 | 1504 | 15 | n/a | yes | nearly all |
| satoshi-400 | 25516 | 12136 | 202 | YES (digits all 660) | yes | case ccmp |
| satoshi-500 | 25596 | 12120 | 202 | YES | yes | case ccmp |
| satoshi-700 | 25328 | 11988 | 202 | YES | yes | case ccmp |
| satoshi-var 300-900 | 42588 | 22956 | 202 | YES | yes | case ccmp |
| satoshi-var 400-700 | 42588 | 22296 | 202 | YES | yes | case ccmp |
Missing from subset (not in source): Cabinet U+00A4 U+00B5; Satoshi U+00A0 U+00AA U+00AD U+00BA U+20B9.
Subset saves ~57% (Cabinet ~11.5 KB/file, Satoshi ~13.4 KB/file) — but requires ITF consent under FFL 2.0.

## 4. Metric-matched fallbacks (VERIFIED computation; capsize @capsizecss/unpack fromBuffer on CDN woff2 + @capsizecss/metrics for Arial/Helvetica/Roboto; formula as next/font: sizeAdjust = (xWidthAvg/upem)/(fbXWidthAvg/fbUpem); overrides = metric/(upem*sizeAdjust))
| face | size-adjust (Arial) | ascent-override | descent-override | line-gap-override |
|---|---|---|---|---|
| Satoshi 400 | 98.92% | 102.10% | 24.26% | 10.11% |
| Satoshi 500 | 101.84% | 99.18% | 23.57% | 9.82% |
| Satoshi 700 | 105.20% | 96.00% | 22.81% | 9.51% |
| Cabinet 500 | 97.58% | 89.16% | 28.70% | 9.22% |
| Cabinet 700 | 98.92% | 87.95% | 28.30% | 9.10% |
| Cabinet 800 | 100.27% | 86.77% | 27.92% | 8.98% |
Roboto (Android) values within ~0.2% of Arial: Satoshi400 99.14/101.88/24.21/10.09; Cabinet700 99.14/87.75/28.24/9.08. Helvetica identical to Arial (capsize metrics).
xWidthAvg: Satoshi 441/454/469, Cabinet 435/441/447 (per 1000 upem); Arial 913/2048.

## 5. SEBI (VERIFIED from primary PDFs downloaded to sebi/ and parsed with pdf-parse)
### 5a. IA Regulations 2013, as amended to 16-Dec-2024 (https://www.sebi.gov.in/sebi_data/attachdocs/dec-2024/1735037757673.pdf ; page https://www.sebi.gov.in/legal/regulations/dec-2024/securities-and-exchange-board-of-india-investment-advisers-regulations-2013-last-amended-on-december-16-2024-_90151.html)
- Reg 2(1)(l) "investment advice" = advice on investing in/dealing in securities ... "for the benefit of the client" and includes financial planning. PROVISO RETAINED: advice via "any electronic or broadcasting or telecommunications medium, which is widely available to the public shall not be considered as investment advice".
- Reg 2(1)(m) "investment adviser" = person who "for consideration" is in the business of providing investment advice ... "and includes ... any person who holds out himself as an investment adviser".
- Implication: free, public, non-personalised web tool is outside the IA definition on two counts (no consideration; widely available public medium). Risk rises if: monetised (ads/affiliate/referral to AMC/distributor = "consideration" arguable), personalised per-user inputs framed as advice ("for you"), or holding out as adviser. Salary-date input is personalisation of a scheduling choice, not of security selection — grey but low.
### 5b. RA Regulations 2014, as amended to 10-Feb-2025 (https://www.sebi.gov.in/sebi_data/attachdocs/feb-2025/1740726945457.pdf)
- Reg 2(1)(u) "research analyst" = person who "for consideration" provides research services. 2(1)(wa) research services (report, buy/sell/hold, price target, model portfolio, trading calls...) "with respect to securities that are listed or proposed to be listed in a stock exchange".
- 2(1)(w) "research report" excludes e.g. "(vii) statistical summaries of financial data of the companies", general market trends, broad indices, "(viii) technical analysis relating to the demand and supply in a sector or the index".
- Implication: open-ended MF units are not exchange-listed (ETFs are — exclude ETFs/listed closed-end schemes from the universe or treat carefully); no consideration; no buy/sell/hold. RA regs very unlikely to apply. (Opinion, not legal advice.)
### 5c. "Finfluencer" association rules — Intermediaries Regs Reg 16A (Gazette 29-Aug-2024); SEBI circulars 22-Oct-2024 (https://www.sebi.gov.in/legal/circulars/oct-2024/association-of-persons-regulated-by-the-board-and-their-agents-with-certain-persons_87837.html) and SEBI/HO/MIRSD/MIRSD-PoD-1/P/CIR/2025/11 of 29-Jan-2025 (https://www.sebi.gov.in/legal/circulars/jan-2025/details-clarifications-on-provisions-related-to-association-of-persons-regulated-by-the-board-miis-and-their-agents-with-persons-engaged-in-prohibited-activities_91356.html ; text read from APMI mirror PDF)
- Binds REGULATED entities (AMCs, brokers, IAs, RAs, MIIs) and their AGENTS (MFDs, employees): no "association" (money or money's worth, client referral, "interaction of information technology systems", or similar) with a person who (i) gives advice/recommendation on securities without registration, or (ii) "makes any claim, of returns or performance expressly or impliedly, in respect of or related to a security" without SEBI permission.
- Investor-education carve-out (FAQ 7-8): allowed if not doing (i)/(ii); a person "engaged solely in education ... should not be using the market price data of the preceding three months to speak/talk/display the name of any security ... indicating the future price, advice or recommendation".
- Direct effect on this app: none by itself (the app is not regulated). Indirect: any AMC / MFD / RIA / broker partnership, sponsorship, affiliate link, referral, or API integration would be "association" and would force the partner to vet the app for (i)/(ii). A per-fund "this date gave +0.31 pp XIRR" is arguably an implied "claim of returns or performance related to a security". Keep it framed as historical statistics, with no forward-looking wording.
- NAV freshness: the app shows NAV data up to navAsOf (latest day). The 3-month rule is framed for education content naming a security "indicating the future price, advice or recommendation"; the app names funds and uses recent NAVs. Low risk if no forward-looking/recommendation framing; a reviewer should confirm. (UNVERIFIED legal interpretation.)
### 5d. Other (secondary sources, not read in primary)
- PaRRVA (CARE Ratings + NSE data centre): pilot 8-Dec-2025, full ops 4-May-2026 per SEBI circular HO/38/14/(4)2026-MIRSD-POD/I/10557/2026 dated 29-Apr-2026 (via taxguru). Applies to registered IAs/RAs/algo providers communicating performance; not to unregistered/educational tools. Source https://taxguru.in/sebi/sebi-operationalises-parrva-due-verified-performance-disclosure-securities-market.html (UNVERIFIED primary).
- SEBI circular HO/(79)2026-MIRSD-PODMMC dated 26-Feb-2026: regulated entities + agents must show registered name/number on social-media securities content from 1-May-2026 (via search results; UNVERIFIED primary). N/A to the app unless the operator is a registered person/agent.
- SEBI/HO/MIRSD/MIRSD-PoD/P/CIR/2025/132 (30-Sep-2025) checked: it is about retail algo trading timelines — irrelevant.
- MF advertisement code (applies to AMCs, not the app; best-practice only): returns shown must carry "past performance may or may not be sustained in future"; SIP returns via XIRR; no assured returns; standard "Mutual Fund investments are subject to market risks, read all scheme related documents carefully". (Secondary: https://www.sebi.gov.in/sebi_data/commondocs/cirmf42000_h.html is the old 2000 guideline; current text is in SEBI MF Regulations Sixth Schedule / MF Master Circular — UNVERIFIED current wording.)

## 6. Data terms (VERIFIED from live pages 2026-09-15)
- mfapi.in homepage (https://www.mfapi.in/): "Completely Free No authentication, no API keys, no rate limiting"; footer "© 2025 MFapi.in. All rights reserved | Privacy Policy | Terms of Service" but BOTH links are href="#" placeholders; /terms, /terms-of-service, /privacy return 404. Docs (https://www.mfapi.in/docs/) say "The API implements rate limiting ... Please cache responses". No license, no attribution requirement, no SLA published. No public GitHub repo for the service found (GitHub API search).
- AMFI Terms of Use (https://www.amfiindia.com/terms-of-use, HTTP 200): licence is "personal and non-commercial use only"; Prohibited: "publicly display, transmit, publish ... modify, or create derivative works based on anything available through the Site"; "shall not store electronically any significant portion of any part of the Site"; linking only to home page, no framing, must not imply AMFI endorsement, AMFI logo only with written permission.
- NAVAll.txt: https://www.amfiindia.com/spages/NAVAll.txt 302 -> https://portal.amfiindia.com/spages/NAVAll.txt (200 text/plain).

## 7. Shaping checks (VERIFIED with harfbuzzjs = shaper used by Chrome/Firefox/Android; script hbtest.mjs)
- Satoshi (400 & 700) tnum + default kern: sequence "1234567890" -> all 660 except tnum '7' before '8' = 630 (GPOS kern pair tnum7/tnum8 = -30). With "tnum,-kern" all 660. => CSS for aligned numbers MUST disable kerning: `font-variant-numeric: tabular-nums; font-kerning: none;` (Safari/CoreText UNVERIFIED).
- Cabinet 700 "tnum" = no-op (identical advances). '1' = 323 vs '0' = 655 — proportional; 2-digit dates vary in width (11 = 646 units, 28 = 1187 units). Grid cells must center numerals in fixed-size cells; do not rely on tnum for Cabinet.
- Satoshi U+00A0 -> HarfBuzz substitutes space glyph (gid 3, 277) — renders fine despite missing cmap entry.
- Satoshi U+20B9 -> gid 0 (.notdef) => browser font fallback. Cabinet 700 has ₹ (gid 386, adv 553).

## 8. Recommendations (typography)
License-clean baseline (unmodified official woff2, self-hosted, NOT committed to the public repo):
- Grid numerals + headline: Cabinet Grotesk 700 static (CDN woff2 20,300 B). One weight for both; answer cell emphasis via scale/colour, not a heavier file. Optional 800 (+20,204 B) not worth it.
- UI/body: Satoshi Variable wght 300-900 (42,588 B) — cheaper than 2+ statics (400+500 = 51,112 B; 400+500+700 = 76,440 B).
- Total: 62,888 B (61.4 KiB). woff2 is already Brotli-compressed — HTTP compression adds ~0.
- Preload: only Cabinet Grotesk 700 (hero grid + headline = LCP). Satoshi: font-display: swap + metric-matched fallback.
- ₹ in Satoshi text: add `@font-face { font-family: "Satoshi"; src: url(cabinet-grotesk-700.woff2); font-weight: 300 900; unicode-range: U+20B9; }` declared AFTER the Satoshi face, reusing the preloaded file (0 extra bytes). Visual weight match at 400 UNVERIFIED — check. Alternative: Cabinet Variable (41,920 B) gives matched-weight ₹ and headline flexibility; total 84,508 B.
- Aligned numbers: Satoshi with `font-variant-numeric: tabular-nums; font-kerning: none`.
If ITF grants written subsetting consent: Cabinet 700 subset 8,720 B + Satoshi var(400-700) subset 22,296 B = 31,016 B; or + Satoshi 400/500 statics subset 12,136+12,120 = 32,976 B.
Repo handling: .gitignore the font dir; a `pnpm fonts:fetch` build step downloads from https://api.fontshare.com/v2/fonts/download/{satoshi,cabinet-grotesk} (or pinned cdn.fontshare.com URLs) and verifies sha256 before copying into public/fonts; cache it in CI (backup copies allowed). Contributors fetch their own copy from Fontshare (FFL requires third parties to get their own copy). README/NOTICE: fonts are not covered by the repo's GPL-3.0 licence; © Indian Type Foundry, ITF FFL 2.0.

## 9. Compliance guidance (analysis, NOT legal advice)
### Footer adequacy
Spec footer covers: educational, not advice, past performance, data source. Gaps:
1. No statement that the operator is not SEBI-registered (IA/RA) — the "holds out" limb of IA Reg 2(1)(m) makes this worth stating.
2. No "not a recommendation to buy, sell or hold any scheme".
3. No as-is / accuracy / data-freshness caveat tied to navAsOf.
4. No non-affiliation statement (AMFI ToU forbids implying AMFI endorsement; also mfapi.in, AMCs).
5. No modelling-limits caveat (ignores taxes, exit load, stamp duty, TER changes, holidays/NAV-date rules, failed instalments).
6. Indian idiom is "Past performance may or may not be sustained in future" (MF ad code wording).
Proposed footer (short): "Educational tool, not investment advice or a recommendation to buy, sell or hold any mutual fund. Not registered with SEBI. Historical simulation using AMFI-published NAVs via mfapi.in, data as of {navAsOf}. Past performance may or may not be sustained in future. Not affiliated with AMFI, mfapi.in or any fund house."
Plus a /about or disclosure panel with full text (limits, no warranty, contact).
Plus near the answer (not only footer): "Based on this fund's NAVs from {navFrom} to {navTo}. Past patterns may not repeat."

### Words/phrases to avoid in UI, og: tags, titles
recommended / recommendation / we recommend / our pick; best date / best day / best time to invest / optimal / ideal / perfect; guaranteed / assured / sure / certain / risk-free / proven; "returns you will get" / you will earn / you'll make / extra returns / boost / maximise returns / beat the market / outperform; top / best / top-performing fund; winner / winning date (spec metric "rolling-window winner counts" -> UI "how often this date led"); "real advantage" (spec 6.4 meaningful copy) -> "was ahead by +0.31 pp XIRR from 2013 to 2026"; should (imperative about investing) — "Which date should I run my SIP" as the product question is OK-ish but answer copy should be "Your date: the 7th" / "A date that fits your salary: the 7th"; "safe window" — "safe" next to investing reads as safety of returns: prefer "funded window" / "after-salary window" / "your window".
Prefer: historically, in past data, was ahead by, the difference was small, fits after your salary lands, any date in your window.
Other: never sort/filter/label funds by XIRR, spread or verdict (search order = match score or alphabetical); no cross-fund leaderboards ("funds where the date matters most"); per-fund og:description neutral (no return numbers); don't show AMFI logo; no affiliate/referral/sponsorship links to AMCs/MFDs/brokers/RIAs (Reg 16A association would pull the partner into vetting the app).
Consider showing per-date results relative (pp vs window median) rather than absolute fund XIRR (e.g. 20.304%) — absolute per-scheme XIRR/corpus numbers read as a "claim of returns or performance related to a security".

### Get professional review of (Indian securities lawyer)
1. Whether a per-fund concrete date + absolute historical XIRR/corpus figures is "investment advice" or an implied "claim of returns" — especially if the app is ever monetised (ads, donations, affiliate), which erodes the "no consideration" footing.
2. Final disclaimer text and all UI/og copy.
3. AMFI Terms of Use exposure for publishing derived data + scheme master in static JSON; whether to seek AMFI permission.
4. Any future partnership with an AMC, MFD, broker, RIA or fintech (Reg 16A / Jan-2025 FAQ "association").
5. PFUTP Regulations 2003 (misleading statements) exposure — UNVERIFIED primary, from general knowledge.
6. Privacy policy / DPDP Act 2023 if analytics, cookies or logs are added (salary day in URL query is low-sensitivity but shareable).
7. ITF font licence handling: written consent for subsetting; repo arrangement.

## 10. Browser verification (VERIFIED, Chromium 152 / macOS, browsertest/test.html with data-URI fonts, served on localhost)
- Satoshi Variable, 100px, tabular-nums: "78" = 129px, "77" = 132px, "78" + font-kerning:none = 132px. => kerning breaks tnum alignment in real Chrome; font-kerning:none fixes it.
- ₹ via unicode-range face (Cabinet 700 file inside "Satoshi" family): width 55.3px = Cabinet ₹ (55.3px); plain Satoshi stack falls to system font (51.95px). Works. Line box grew 135 -> 138.5px when ₹ is present (mixed ascent/descent): use an explicit line-height on those elements.
- NBSP in Satoshi: "a b" = "a b" = 138.3px. OK.
- Fallback overrides (local Arial): 16px paragraph @320px: Satoshi 129px tall, "Sat Fallback" 129px (exact), plain Arial 111px. Headline 40px/700 @360px: Cabinet 99px, "Cab Fallback" 99px (exact), Arial 92px. Single-line width 16px: Satoshi 1624.32px, Fallback 1642.80px (+1.14%), Arial 1660.97px (+2.26%).
- Empirically tuned Satoshi-400 fallback for this sample copy: size-adjust 97.81%, ascent-override 103.26%, descent-override 24.54%, line-gap-override 10.22% (sample-specific; capsize values also fine).
