# CSIC Lifetime Spending Power Calculator

An internal planning tool for **CS Investment Counsel Corporation**. Advisors enter a client's
assets, income and assumptions; the tool works out the sustainable after-tax annual spending
that draws the accounts down to approximately zero at the chosen life expectancy, and produces
a branded client report.

**Users:** Shannon and Craig at CSIC. Their clients never use the tool — they receive only the
printed report.

---

## Start here

| You want to… | Read |
|---|---|
| Use the calculator | [HOW-TO-USE.md](HOW-TO-USE.md) |
| Update the annual figures, or change the code | [MAINTENANCE.md](MAINTENANCE.md) |
| See what changed and when | [CHANGELOG.md](CHANGELOG.md) |

---

## What it is

A single self-contained HTML file. No build step, no server, no dependencies, no database.
Open it in a browser and it works — including offline.

That is a deliberate choice: the tool stores no client data, has no logins, and does no
server-side work, so anything heavier would add cost and fragility for no benefit.

## Layout

```
rrif-spending-power-calculator.html   ← the source of truth; edit this
deploy/
  index.html                          ← copy for web hosting (Netlify)
  robots.txt, _headers                ← keep it out of search results
csic-calculator-hosted.html           ← generated copy for Claude Artifact hosting
CSIC-Spending-Power-Calculator.zip    ← emailable copy
```

Everything except the source file is generated. Always edit the source, then regenerate.

## Testing

51 tests run against Chromium, Firefox and WebKit. They cover the calculation
engine, the interface, invalid input, saved scenarios, the settings panel and the
mobile layout. Five reference cases are locked, so if the June 2026 plan ever stops
returning $66,671 over 36 years, the build fails.

```bash
npm install
npx playwright install
npm test
```

`npm run test:chromium` runs one browser only, which is quicker while working.
`npm run test:ui` opens Playwright's interactive runner.

Tests also run automatically on every push through GitHub Actions, and a failing
run blocks the change.

After editing the source file, regenerate the copies:

```bash
node scripts/sync.js
```

CI verifies they are current, so a forgotten regeneration fails the build rather
than shipping a stale site.

## Deploying

Connected to Netlify, a push deploys automatically and the URL never changes:

```bash
git add -A
git commit -m "Describe the change"
git push
```

## Before relying on it

- The disclosure wording is **not compliance-reviewed** against Ontario requirements
- Government figures **expire every January** — see MAINTENANCE.md
- Ontario tax and LIF rules only
- Planning estimates, not financial, tax or investment advice

Built with Anthropic's Claude Opus 5 (`claude-opus-5`) via Claude Code.
