# Maintenance Guide

Who this is for: whoever owns the annual update. **This must be a named person.**

---

## The one thing that matters

The calculator relies on government figures that **change every January**. When they go
stale the tool does not break — it keeps producing confident, professional-looking numbers
that are quietly wrong.

Two safeguards exist, but neither replaces someone actually doing the update:

1. The banner at the top of the tool turns amber 60 days before expiry, then red
2. Reports produced after expiry carry a visible warning on the page itself

**If nobody owns this task, the tool should not be used for live client advice.**

---

## The annual update (about 20 minutes, every January)

### 1. Collect the new figures

| Figure | Where to find it |
|---|---|
| Combined Federal + Ontario tax brackets | TaxTips.ca — combined marginal rates, "other income" column |
| Federal basic personal amount + credit rate | CRA |
| Ontario basic personal amount + credit rate | CRA |
| CPP maximum (age 65) | Canada.ca — CPP & OAS maximum amounts. **Monthly figure × 12** |
| OAS maximum, ages 65–74 | Canada.ca — OAS payment amounts. **Monthly × 12**. Note OAS is indexed *quarterly* |
| OAS recovery tax threshold | CRA |
| LIF maximum reference rate | FSRA Ontario / OSFI — reset each January from long-term Government of Canada bond yields |

### 2. Enter them in the tool

1. Open the calculator, press **Annual settings**
2. Press **Unlock to edit** and enter the passcode (`csic`)
3. Update the figures, set the **tax year** and **valid through** date (usually 31 December)
4. Put your name in **Updated by**
5. Press **Save & lock**

The results recalculate immediately and the banner returns to green.

### 3. Make sure both advisors get the update

Settings are stored **per browser, per computer**. Shannon updating her laptop does not
update Craig's.

- **Preferred:** update `deploy/index.html` and redeploy (below). Everyone gets it automatically.
- **Alternative:** in Annual settings, open *"Share these settings with a colleague"*,
  press **Copy code**, send it over, and the other person pastes it in and presses **Apply code**.

---

## Deploying an update

If the repo is connected to Netlify, pushing to GitHub deploys automatically:

```bash
git add -A
git commit -m "Update statutory figures for 2027"
git push
```

Netlify rebuilds within about a minute. The URL never changes.

If you're not using GitHub, drag the `deploy` folder onto your Netlify site's
**Deploys** tab instead.

---

## File map

| File | What it is |
|---|---|
| `rrif-spending-power-calculator.html` | **The source of truth.** Edit this one |
| `deploy/index.html` | Copy of the above, named for web hosting |
| `deploy/robots.txt`, `deploy/_headers` | Keep the tool out of search results |
| `csic-calculator-hosted.html` | Generated copy for Claude Artifact hosting |
| `CSIC-Spending-Power-Calculator.zip` | Emailable copy |
| `HOW-TO-USE.md` | Guide for Shannon and Craig |
| `CHANGELOG.md` | What changed, when |

Everything except the source is generated. **Always edit the source, then regenerate.**

---

## Editing the code

It's a single self-contained HTML file — no build step, no server, no dependencies.
Open it in any text editor, or hand it to Claude and describe the change.

Landmarks in the file:

- `APP_VERSION` — bump when you change anything. It prints on every report
- `SETTINGS_PASSCODE` — the settings gate
- `DEFAULT_SETTINGS()` — the built-in fallback figures. Worth updating alongside the
  in-app settings so a fresh machine starts correct
- `RRIF_FACTORS` — CRA prescribed minimums. These rarely change
- `lifMaxFactor()` — computes the Ontario LIF maximum from the reference rate
- `simulate()` — the year-by-year engine
- `buildColumns()` — controls which columns appear, and the condensed/detailed split

### After any change, run the tests

```bash
npm test
```

51 tests across three browsers. They cover the engine, the interface, invalid
input, scenarios, settings and the mobile layout, and include locked reference
cases plus a reconciliation check across 200 randomly generated plans.

If a locked reference case fails, treat it as a real regression. Do not update the
expected figure to match the new output without understanding why it moved. Those
numbers were verified by hand and one of them is CSIC's own June 2026 plan.

Then regenerate the copies:

```bash
node scripts/sync.js
```

### A trap worth knowing

If you script anything against these files in **Windows PowerShell 5.1**, do not use
`Get-Content -Raw` — it reads as ANSI and corrupts the UTF-8 characters (dashes and
apostrophes turn into `â€"`). Use:

```powershell
[System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
```

---

## Known limitations

Carried deliberately. Review before relying on the tool for anything beyond planning estimates.

- **Not compliance-reviewed.** The disclosure wording has not been checked by a qualified
  compliance officer against Ontario requirements. **This is outstanding.**
- **Ontario only.** Tax brackets and LIF rules are Ontario-specific.
- **LIF maximum is computed, not tabulated.** It uses the harmonized formula against the
  reference rate. Verify against FSRA's published table each January.
- **Non-registered yield defaults to 0%,** which lets that account compound tax-free and
  overstates spending power for a taxable account. CSIC should set a realistic figure.
- **No sequence-of-returns modelling.** A single blended return every year.
- **TFSA is grouped with non-registered.** No distinction between interest, dividends and
  capital gains.
- **Single life only.** No spousal or estate optimisation, no income splitting.
- **Storage needs real hosting.** Saved scenarios and settings rely on browser storage,
  which is blocked in some contexts when a file is opened directly from disk. Over the
  Netlify URL this works normally, and the tool now says so on screen and disables the
  save controls when storage is unavailable.
- **Saved scenarios are not a backup.** They live in one browser on one machine. Use
  "Back up all" to write them to a file for the client folder.
- **Ontario surtax interacts with credits imprecisely.** The combined bracket table already
  includes the surtax, but credits actually reduce basic provincial tax before surtax is
  calculated. The Ontario portion of the age and pension credits is therefore slightly
  understated for clients in the surtax range. The tool charges marginally more tax than
  it should, never less.
- **The Ontario basic personal amount needs confirming.** The tool uses $12,989, consistent
  with indexing the 2025 figure. One published source quotes $12,132 for 2026. Verify
  against CRA before the next client-facing use.
- **Spousal planning is not modelled.** No income splitting, no pension credit sharing,
  no survivor benefits. Single-life projections only.
- **A LIRA is treated as already convertible.** The tool allows withdrawals from the
  LIRA/LIF box at any age, subject to the LIF maximum. A true LIRA cannot be drawn from
  before conversion.
