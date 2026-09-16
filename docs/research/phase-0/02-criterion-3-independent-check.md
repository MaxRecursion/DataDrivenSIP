> Incremental notes from a research agent that was cut off by a usage limit before its final summary. Findings marked VERIFIED were checked; treat the rest as leads.

# VERIFY C3 (independent reimplementation) — incremental notes
- verify-c3 did not exist at start (no prior partial outputs). Only spike-c3/119775.json read (132442 B).
- Spec sections read: 5.1-5.6, 13 (criterion 3).

## F1 base reproduction (verify.mjs, LOOK=7, NAV-dated flows, floor split) — VERIFIED
- 28/28 rows match their table within display rounding: max |dxirr| 0.00049 (their 3dp), max |dcorpus| 0.49 (their rounding), max |dmeanPct| 0.050 (their 1dp), max |dtopQ| 0. n per date identical. Zero flags.
- best d26 20.38932, worst d9 20.27571, spreadPp raw 0.1136073 -> 0.114, spreadRupees 123186.74 -> 123187 (max corpus d3, min d2), stability 0.5446086 -> 0.545, metricsAgree false, verdict noise, W=128 (2013-02-01..2023-09-01), 0 tied windows, safe pick 12 (58.854), win counts identical to theirs.
- N=3369, cut between 2019-11-15 / 2019-11-18. Runtime 236 ms whole analyse (theirs 477 ms).
## F2 sensitivities reproduced
- LOOK 6/5 identical to 7. LOOK 4: changes (spreadRupees 203084, instalments 163, stability 0.577) -> matches their "+4 changes spreadRupees".
- SPLIT ceil: stability 0.54297 (theirs 0.5430). Target-dated flows: stability 0.55501 (theirs 0.5550).
- Data: 3369 rows, no dups/zeros, gap histogram {1:2555,2:95,3:628,4:81,5:8,6:1} -> max gap 6 confirmed.
## F3 diag.mjs (second, Date.UTC-based mini-implementation as cross-check) — VERIFIED
- Their sensitivity rows reproduced exactly: a1 common Jan2013-Aug2026: best 26/20.3893 worst 9/20.2758 spread 0.1135 d1 20.2961/7569425 spreadRs 60869 maxC d1. a2 (no navFrom guard): d1 20.2958/7579273 spreadRs 70716. Common 163 (Feb2013-Aug2026): 20.3908/20.2853/0.1055, d1 20.3044/7448608, spreadRs 62543. Target-dated: 20.3859/20.2724, d1 20.3005.
- spreadRupees 123187 is an instalment-set artifact: d3 has 165 flows incl. 2013-01-03 (worth Rs120,818 at navTo) + 2026-09-03 (Rs9,836); d2 has 164 and lacks Jan 2013 (target 2 Jan < navFrom). On any common month set spread is Rs60.9k-62.5k and max corpus is d1. metricsAgree stays false in every variant (argmax xirr d26 always).
- Rolling: 0 instalments NAV-dated after terminal; 4 on the terminal day (zero-duration, harmless); 46/128 windows have terminal later than the 1st.
- 1503 of 4601 full-history targets fall on non-NAV days -> target-dating would date cash flows on days nothing could be bought; NAV-dating (their convention) avoids that. Only d=11 Sep-2026 instalment lands on navTo.
