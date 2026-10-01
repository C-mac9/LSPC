# Changelog

## v1.2.1 - 18 August 2026

Rewrote the tool's on-screen wording for clarity.

### Changed
- Every prompt, field hint and message is now written in full sentences. The copy
  previously used clipped notes such as "No maximum.", "Locked-in." and "Today's
  dollars.", which read as shorthand rather than guidance.
- Plain wording replaces technical phrasing where an advisor would not use it.
  The storage notice no longer refers to "local storage" or "opening a file from
  disk", and explains the situation in terms of what the advisor should do.
- Underfunded years are now marked "(short)" beside the age.

### Fixed
- A syntax error introduced during the rewrite, where an apostrophe in "client's"
  broke the surrounding code and stopped the whole tool loading. Caught by the test
  suite within seconds of being introduced.


---

## v1.2.0 — 18 August 2026

Closes the two modelling gaps flagged in v1.1.0. **These change the figures.**

### Changed — affects results
- **The age amount credit is now applied.** Clients aged 65 and over receive the
  federal ($9,208) and Ontario ($6,342) age amounts, each reduced by 15% of net
  income above their thresholds and gone by roughly $105,000. The tool previously
  ignored this entirely and so overstated tax for every retired client.
- **The pension income credit is now applied.** Up to $2,000 federally and $1,796
  in Ontario, against a defined-benefit pension at any age plus RRIF and LIF
  withdrawals from 65. CPP and OAS do not qualify, and registered withdrawals
  before 65 are treated as RRSP income, which does not qualify either.
- **The OAS recovery tax now uses the prior year's income**, as it does in
  practice, rather than the current year's. A change in income now affects the
  clawback a year later.

### Effect on the reference cases

| Case | Before | After |
|---|---|---|
| Baseline (65, $500k registered, $250k non-registered) | $32,851 | **$34,207** |
| With $400k LIRA/LIF | $48,781 | **$50,338** |
| CSIC June 2026 reference plan | $66,671 | **$67,068** |
| Target income period | $21,307 | **$23,030** |
| With custom income and expense lines | $36,767 | **$38,270** |

Figures rose by roughly 4% for a typical retired client, and by less where income
is high enough to phase the age amount out. The June 2026 plan moves only $397
because the client is under 65 for the first five years and earning $200,000,
so the age amount does not apply until later.

### Added
- The new credit amounts and thresholds are editable in Annual settings, so they
  can be updated each January like every other statutory figure.
- 9 further tests covering the credits, their phase-out, the pension credit cap,
  and the OAS timing lag. **174 test runs** now pass across three browsers.

### Known approximation
The combined bracket table already includes Ontario's surtax. In reality credits
reduce basic provincial tax before surtax is calculated, so the Ontario portion of
these credits is slightly understated for clients in the surtax range. The tool
therefore charges marginally more tax than it should, never less.

---

## v1.1.0 — 18 August 2026

Adds an automated test suite, scenario backup, and correct benefit amounts for
clients taking CPP or OAS early or late.

### Fixed — affects results
- **CPP and OAS were paid at the age-65 amount regardless of start age.** The tool
  accepted a CPP start age of 60 to 70 and an OAS start age of 65 to 70, but never
  adjusted the benefit. A client deferring OAS to 70 should receive 36% more, and
  full CPP deferred to 70 should be 42% higher. Both adjustments are now applied
  (CPP 0.6% per month before 65, 0.7% per month after; OAS 0.6% per month after 65),
  and the effect is shown under each field.
  A manually entered CPP amount is still used exactly as given, since that is the
  amount the client will actually receive.

### Added
- **Automated test suite.** 44 tests running against Chromium, Firefox and WebKit
  (132 runs in total). Covers the calculation engine, the interface, invalid input,
  saved scenarios, the settings panel and the mobile layout.
  - Five reference cases are locked. If the June 2026 plan ever stops returning
    $66,671 over 36 years, the build fails.
  - Cash-flow reconciliation is checked across 200 randomly generated scenarios
    rather than a handful of examples, because the original bug only appeared when
    income exceeded the spending target.
  - Regression guards for every bug found so far: the $2,000,000 solver ceiling,
    the false depletion warning, the LIF cap, and the OAS clawback bounds.
- **Continuous integration.** Tests run automatically on every push via GitHub
  Actions. A failing run blocks the change.
- **Scenario backup and restore.** "Back up all" writes every saved scenario to a
  file that can be kept in the client folder or moved to another computer.
  "Restore" reads it back. Saved scenarios previously existed only in one browser
  on one machine, with no way to move or preserve them.
- **`scripts/sync.js`** regenerates the deploy and hosted copies from the single
  source file, and verifies them in CI. This replaces a manual PowerShell step
  that silently corrupted the file's punctuation in v1.0.0.
- **Underfunded years are marked in text**, not by red colour alone, so the
  shortfall is visible to a colour-blind reader and survives a mono printout.

### Fixed
- **Correcting an invalid entry left the error on screen.** The negative-value
  guard added in v1.0.1 cleared the internal result, and live updating was keyed
  to that result, so fixing the typo did nothing until the advisor pressed
  Calculate again. Found by the new test suite.
- **The plan reference number changed after correcting a typo.** It now stays
  fixed across an error and correction, so the same piece of work keeps one reference.

### Verified
- 51 tests, 153 runs, passing across Chromium, Firefox and WebKit.
- Browser storage behaviour confirmed over real HTTP, which the earlier manual
  testing could not reach.

---

## v1.0.1 — 14 August 2026

Fixes from the pre-deployment QA pass.

### Fixed
- **Saving no longer reports false success.** When the browser blocks local storage
  (private browsing, or a file opened directly from disk), pressing *Save scenario*
  previously displayed "Saved scenario: …" while storing nothing. The tool now detects
  storage at startup, shows a notice, and disables the save controls rather than
  pretending they worked.
- **Negative amounts are refused instead of silently producing a wrong figure.** A typed
  minus sign in an asset field turned $32,851 into a plausible-looking $11,877 with no
  warning. Negative values in any money field now block the calculation, flag the offending
  field, hide the result, and prevent a report being produced.
- **"Other income & expenses" is usable on a phone.** The five-column row squeezed labels to
  the point of truncation ("Rental incor") and the index checkbox to 13px. Rows now stack
  into cards below 700px, with full-width fields and a visible "Index to inflation" label.
- **Tap targets.** All form fields are now at least 40px tall (was 31px in the custom rows).
- **Stale warnings cleared from the DOM** rather than only hidden.

### Verified
- All reference scenarios return identical figures; reconciliation $0.00 throughout.
- Desktop layout unchanged.
- No console errors.

---

## v1.0.0 — 14 August 2026

First version-stamped release. Adds the tooling needed to hand the calculator over
and keep it maintainable.

### Added
- **Annual settings panel** — the government figures that change each January (tax brackets,
  basic personal amounts, CPP maximum, OAS amount and clawback, LIF reference rate) are now
  editable in the tool, with source notes. Locked by default behind a passcode to prevent
  accidental edits.
- **Expiry warnings** — a "valid through" date drives a banner that is green when current,
  amber within 60 days of expiry, and red once expired. Expired figures also print a visible
  warning on the client report, so a stale report identifies itself.
- **Settings sharing code** — export/import so figures can be copied between machines.
- **Scenario save / load / delete** — store a client's figures by name and reload them.
- **Autosave** — work in progress survives a browser crash or accidental close.
- **Start new client** — clears the form without touching saved scenarios.
- **Input sanity warnings** — flags a return below inflation, benefit start ages before the
  client's current age, a target period outside the plan years, and similar.
- **Version stamp** — the calculator version and tax year print in the footer and on every report.

### Fixed
- UTF-8 corruption in generated copies caused by `Get-Content -Raw` defaulting to ANSI in
  PowerShell 5.1. Dashes and apostrophes rendered as `â€"`.

### Verified
- All reference scenarios return figures identical to the previous build.
- Cash flow reconciles to $0.00 across every scenario tested.
- June 2026 reference plan reproduces exactly: **$66,671**, 36 years funded.

---

## Pre-release work — August 2026

Client feedback round 1 (13 items) and the correctness pass before it.

### Added
- Split RRSP/RRIF from LIRA/LIF, with the Ontario **LIF maximum withdrawal** enforced
  (computed from the harmonized formula and reference rate).
- **CPP** — full/partial prompt, using the statutory maximum or an advisor-entered amount.
- **OAS** — including the age-75 step-up and the recovery tax (clawback).
- **Eight labelled custom lines** — four taxable, four non-taxable, income or expense.
- **Target income period** — funds a defined objective for part of the plan, then solves the
  remaining years as a level amount.
- **"Indexed Spending Power"** column, highlighted green.
- **Condensed and detailed table views.** Client reports print condensed by default,
  matching the June 2026 report layout.
- **Plan reference numbers** — several scenarios per client per day stay distinguishable.
- Automatic **cash-flow reconciliation check** on every calculation.
- Basis-of-calculation statement on the report; the assumptions table was removed.

### Fixed
- **Rows did not add up.** Surplus income was reinvested invisibly, so a year's components
  did not equal the spending figure. Now shown as a "Surplus reinvested" line.
- **Silent $2,000,000 ceiling** in the solver, capping larger portfolios without warning.
- **False depletion warning** — the final row of every projection rendered in red on fully
  funded plans, caused by comparing a nominal shortfall against a present-value tolerance.
- **Redundant statistic** — "Yr-1 nominal spending" was always identical to the headline
  figure. Replaced with spending at the plan-end age.
- **Stale results** — changing an input after calculating left old figures on screen.
- **Unescaped client name** in the report, allowing HTML injection.
- Report generation switched from a blocked file download to an in-page view with real
  Print / Save as PDF.
- Methodology text corrected — it described flat average tax rates while the code used
  marginal brackets.

### Known outstanding
- Disclosure wording is **not compliance-reviewed** against Ontario requirements.
- Non-registered taxable yield defaults to 0%; CSIC to advise a realistic figure.
- LIF maximum factors to be verified against FSRA's published table.
