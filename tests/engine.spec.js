/* Calculation engine tests.
 These are the ones that matter. The tool produces figures that go to clients,
 so the reference cases below are locked: if a future change moves any of them,
 the build fails and someone has to explain why. */
const { test, expect } = require('@playwright/test');

/* Builds a parameter object the way readInputs() does, so the engine is
   exercised exactly as the UI drives it. */
const P = (o = {}) => ({
  curAge: 65, income: 0, incomeStop: 65,
  pensionAmt: 0, pensionStart: 65, pensionIndex: 'none',
  cppAmt: 0, cppStart: 65,
  oasInclude: false, oasStart: 65, oasClawback: false,
  rrspAssets: 500000, liraAssets: 0, nonRegAssets: 250000, nonRegYield: 0,
  inflation: 0.025, lifeExp: 95, ret: 0.05, lifRate: 0.0349,
  targetOn: false, targetAmt: 0, targetFrom: 0, targetTo: 0, targetIndexed: true,
  custom: [],
  oas65: 751.97 * 12, oasUplift: 10, clawThresh: 95323, clawRate: 15,
  ...o
});

// Reset to built-in figures so a stored settings change can never skew a test
async function freshEngine(page) {
  await page.goto('/');
  await page.evaluate(() => { SETTINGS = DEFAULT_SETTINGS(); });
}

const solve = (page, p) => page.evaluate(
  (params) => {
    const r = solve(params);
    return {
      spend: Math.round(r.spend),
      yearsFunded: r.detail.yearsFunded,
      rows: r.detail.rows.length,
      maxRecErr: r.detail.maxRecErr,
      endAssets: Math.round(r.detail.endAssets),
      lastNominal: Math.round(r.detail.lastNominalSpend)
    };
  }, p);

test.beforeEach(async ({ page }) => { await freshEngine(page); });

test.describe('Locked reference cases', () => {
  /* Each figure below was verified by hand. Treat a failure as a real
     regression until proven otherwise - do not update the number to match
     new output without understanding why it moved.

     These rose in v1.2.0 when the age amount and pension income credits were
     added. The tool had been charging more tax than a client over 65 actually
     pays, so every figure was understated. The previous values are recorded
     alongside for traceability. */
  const CASES = [
    { name: 'baseline 500k registered / 250k non-registered',
      input: {}, spend: 34207, years: 31, wasBeforeCredits: 32851 },
    { name: 'with 400k LIRA/LIF',
      input: { liraAssets: 400000 }, spend: 50338, years: 31, wasBeforeCredits: 48781 },
    {
      name: "CSIC June 2026 reference plan",
      input: { curAge: 60, income: 200000, incomeStop: 65, inflation: 0.02, ret: 0.06 },
      spend: 67068, years: 36, wasBeforeCredits: 66671
    },
    {
      name: 'target income period 200k from 65 to 74',
      input: {
        targetOn: true, targetAmt: 200000, targetFrom: 65, targetTo: 74,
        rrspAssets: 1500000, liraAssets: 300000, nonRegAssets: 800000
      },
      spend: 23030, years: 31, wasBeforeCredits: 21307
    },
    {
      name: 'custom taxable income and non-taxable expense',
      input: {
        custom: [
          { label: 'Rent', amount: 24000, taxable: true, from: 65, to: 85, indexed: true },
          { label: 'LTC', amount: -40000, taxable: false, from: 85, to: 95, indexed: true }
        ]
      },
      spend: 38270, years: 31, wasBeforeCredits: 36767
    }
  ];

  for (const c of CASES) {
    test(c.name, async ({ page }) => {
      const r = await solve(page, P(c.input));
      expect(r.spend).toBe(c.spend);
      expect(r.yearsFunded).toBe(c.years);
      expect(r.maxRecErr).toBeLessThan(0.01);
    });
  }
});

test.describe('Cash flow reconciliation', () => {
  /* Shannon's item 5. Every year's inflows less tax, clawback and any
     reinvested surplus must equal the spending figure shown. This is checked
     across randomised inputs rather than a handful of cases, because the
     original bug only appeared when income exceeded the spending target. */
  test('holds across 200 randomised scenarios', async ({ page }) => {
    const worst = await page.evaluate(() => {
      let seed = 20260818;
      const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      const pick = (lo, hi) => lo + rnd() * (hi - lo);
      let worst = 0, worstCase = null;

      for (let i = 0; i < 200; i++) {
        const curAge = Math.round(pick(50, 75));
        const p = {
          curAge,
          income: rnd() < 0.5 ? Math.round(pick(0, 300000)) : 0,
          incomeStop: curAge + Math.round(pick(0, 10)),
          pensionAmt: rnd() < 0.4 ? Math.round(pick(0, 90000)) : 0,
          pensionStart: curAge + Math.round(pick(0, 5)),
          pensionIndex: ['none', 'partial', 'full'][Math.floor(rnd() * 3)],
          cppAmt: rnd() < 0.6 ? Math.round(pick(0, 18092)) : 0,
          cppStart: Math.round(pick(60, 70)),
          oasInclude: rnd() < 0.7,
          oasStart: Math.round(pick(65, 70)),
          oasClawback: rnd() < 0.8,
          rrspAssets: Math.round(pick(0, 3000000)),
          liraAssets: rnd() < 0.5 ? Math.round(pick(0, 900000)) : 0,
          nonRegAssets: Math.round(pick(0, 2000000)),
          nonRegYield: pick(0, 0.05),
          inflation: pick(0, 0.06),
          lifeExp: curAge + Math.round(pick(5, 40)),
          ret: pick(0, 0.09),
          lifRate: pick(0.01, 0.06),
          targetOn: rnd() < 0.35,
          targetAmt: Math.round(pick(20000, 300000)),
          targetFrom: curAge,
          targetTo: curAge + Math.round(pick(1, 15)),
          targetIndexed: rnd() < 0.7,
          custom: rnd() < 0.5 ? [
            { label: 'Extra', amount: Math.round(pick(-80000, 80000)), taxable: rnd() < 0.5,
              from: curAge, to: curAge + Math.round(pick(1, 25)), indexed: rnd() < 0.5 }
          ] : [],
          oas65: 751.97 * 12, oasUplift: 10, clawThresh: 95323, clawRate: 15
        };
        const err = solve(p).detail.maxRecErr;
        if (err > worst) { worst = err; worstCase = p; }
      }
      return { worst, worstCase };
    });
    expect(worst.worst, `worst reconciliation error, case: ${JSON.stringify(worst.worstCase)}`)
      .toBeLessThan(0.01);
  });
});

test.describe('Tax calculation', () => {
  test('is zero on zero income and never negative', async ({ page }) => {
    const r = await page.evaluate(() => [
      taxOnIncome(0, 1), taxOnIncome(-5000, 1), taxOnIncome(5000, 1)
    ]);
    expect(r[0]).toBe(0);
    expect(r[1]).toBe(0);
    expect(r[2]).toBeGreaterThanOrEqual(0);
  });

  test('rises monotonically with income', async ({ page }) => {
    const ok = await page.evaluate(() => {
      let prev = -1;
      for (let inc = 0; inc <= 400000; inc += 2500) {
        const t = taxOnIncome(inc, 1);
        if (t < prev - 1e-9) return false;
        prev = t;
      }
      return true;
    });
    expect(ok).toBe(true);
  });

  test('never exceeds the top marginal rate overall', async ({ page }) => {
    const top = await page.evaluate(() => {
      const rate = SETTINGS.brackets[SETTINGS.brackets.length - 1].rate / 100;
      return taxOnIncome(1000000, 1) / 1000000 < rate;
    });
    expect(top).toBe(true);
  });
});

test.describe('RRIF and LIF withdrawal rules', () => {
  test('RRIF factors match the CRA prescribed table', async ({ page }) => {
    const f = await page.evaluate(() => ({
      a71: rrifFactor(71), a80: rrifFactor(80), a94: rrifFactor(94), a95: rrifFactor(95)
    }));
    expect(f.a71).toBeCloseTo(0.0528, 6);
    expect(f.a80).toBeCloseTo(0.0682, 6);
    expect(f.a94).toBeCloseTo(0.1879, 6);
    expect(f.a95).toBeCloseTo(0.20, 6);
  });

  test('LIF maximum factor matches the published Ontario figure at 65', async ({ page }) => {
    const pct = await page.evaluate(() => lifMaxFactor(65, 0.0349) * 100);
    // FSRA / harmonized table publishes ~6.03% for 2026
    expect(pct).toBeGreaterThan(5.9);
    expect(pct).toBeLessThan(6.2);
  });

  test('LIF maximum rises with age and releases the balance at 89', async ({ page }) => {
    const r = await page.evaluate(() => {
      const vals = [];
      for (let a = 55; a <= 88; a++) vals.push(lifMaxFactor(a, 0.0349));
      const rising = vals.every((v, i) => i === 0 || v > vals[i - 1]);
      return { rising, at89: lifMaxFactor(89, 0.0349), at95: lifMaxFactor(95, 0.0349) };
    });
    expect(r.rising).toBe(true);
    expect(r.at89).toBe(1);
    expect(r.at95).toBe(1);
  });

  test('the LIF cap actually restricts withdrawals', async ({ page }) => {
    /* With everything locked in a LIF, the maximum should prevent the account
       being fully drained, leaving a residual balance. If this ever returns
       zero the cap has stopped being enforced. */
    const r = await solve(page, P({ rrspAssets: 0, liraAssets: 800000, nonRegAssets: 0 }));
    expect(r.endAssets).toBeGreaterThan(0);
  });
});

test.describe('OAS', () => {
  test('no clawback below the threshold', async ({ page }) => {
    const claw = await page.evaluate(() => {
      const p = { curAge: 65, income: 0, incomeStop: 65, pensionAmt: 0, pensionStart: 65,
        pensionIndex: 'none', cppAmt: 0, cppStart: 65, oasInclude: true, oasStart: 65,
        oasClawback: true, rrspAssets: 100000, liraAssets: 0, nonRegAssets: 400000,
        nonRegYield: 0, inflation: 0.02, lifeExp: 90, ret: 0.04, lifRate: 0.0349,
        targetOn: false, targetAmt: 0, targetFrom: 0, targetTo: 0, targetIndexed: true,
        custom: [], oas65: 751.97 * 12, oasUplift: 10, clawThresh: 95323, clawRate: 15 };
      return solve(p).detail.rows.reduce((m, r) => Math.max(m, r.clawback), 0);
    });
    expect(claw).toBe(0);
  });

  test('clawback never exceeds the OAS received', async ({ page }) => {
    const ok = await page.evaluate(() => {
      const p = { curAge: 65, income: 0, incomeStop: 65, pensionAmt: 0, pensionStart: 65,
        pensionIndex: 'none', cppAmt: 18092, cppStart: 65, oasInclude: true, oasStart: 65,
        oasClawback: true, rrspAssets: 4000000, liraAssets: 0, nonRegAssets: 0,
        nonRegYield: 0, inflation: 0.025, lifeExp: 95, ret: 0.05, lifRate: 0.0349,
        targetOn: false, targetAmt: 0, targetFrom: 0, targetTo: 0, targetIndexed: true,
        custom: [], oas65: 751.97 * 12, oasUplift: 10, clawThresh: 95323, clawRate: 15 };
      return solve(p).detail.rows.every(r => r.clawback <= r.oas + 1e-6);
    });
    expect(ok).toBe(true);
  });

  test('steps up at age 75', async ({ page }) => {
    const r = await page.evaluate(() => {
      const p = { curAge: 70, income: 0, incomeStop: 70, pensionAmt: 0, pensionStart: 70,
        pensionIndex: 'none', cppAmt: 0, cppStart: 70, oasInclude: true, oasStart: 70,
        oasClawback: false, rrspAssets: 300000, liraAssets: 0, nonRegAssets: 300000,
        nonRegYield: 0, inflation: 0, lifeExp: 80, ret: 0.03, lifRate: 0.0349,
        targetOn: false, targetAmt: 0, targetFrom: 0, targetTo: 0, targetIndexed: true,
        custom: [], oas65: 751.97 * 12, oasUplift: 10, clawThresh: 95323, clawRate: 15 };
      const rows = solve(p).detail.rows;
      return { at74: rows.find(x => x.age === 74).oas, at75: rows.find(x => x.age === 75).oas };
    });
    expect(r.at75 / r.at74).toBeCloseTo(1.10, 4);
  });
});

test.describe('Age amount and pension income credits', () => {
  test('the age amount applies from 65 and not before', async ({ page }) => {
    const r = await page.evaluate(() => ({
      at64: taxOnIncome(50000, 1, { age: 64, eligiblePension: 0 }),
      at65: taxOnIncome(50000, 1, { age: 65, eligiblePension: 0 })
    }));
    expect(r.at65).toBeLessThan(r.at64);
  });

  test('the age amount phases out as income rises', async ({ page }) => {
    const r = await page.evaluate(() => {
      const saving = (inc) => taxOnIncome(inc, 1, { age: 70, eligiblePension: 0 })
        - taxOnIncome(inc, 1, { age: 60, eligiblePension: 0 });
      return { low: -saving(40000), mid: -saving(70000), high: -saving(150000) };
    });
    expect(r.low).toBeGreaterThan(r.mid);
    expect(r.mid).toBeGreaterThan(0);
    expect(r.high).toBeCloseTo(0, 6); // fully phased out
  });

  test('the age amount credit is worth the expected amount at low income', async ({ page }) => {
    const saving = await page.evaluate(() =>
      taxOnIncome(40000, 1, { age: 60, eligiblePension: 0 })
      - taxOnIncome(40000, 1, { age: 65, eligiblePension: 0 }));
    // 9208 x 14% + 6342 x 5.05%
    expect(saving).toBeCloseTo(9208 * 0.14 + 6342 * 0.0505, 2);
  });

  test('the pension income credit caps at the statutory maximum', async ({ page }) => {
    const r = await page.evaluate(() => {
      const base = taxOnIncome(60000, 1, { age: 60, eligiblePension: 0 });
      return {
        small: base - taxOnIncome(60000, 1, { age: 60, eligiblePension: 800 }),
        atCap: base - taxOnIncome(60000, 1, { age: 60, eligiblePension: 2000 }),
        beyond: base - taxOnIncome(60000, 1, { age: 60, eligiblePension: 50000 })
      };
    });
    expect(r.small).toBeLessThan(r.atCap);
    expect(r.beyond).toBeCloseTo(r.atCap, 6); // no further benefit above the cap
    expect(r.atCap).toBeCloseTo(2000 * 0.14 + 1796 * 0.0505, 2);
  });

  test('CPP and OAS alone do not attract the pension credit', async ({ page }) => {
    const eligible = await page.evaluate(() => {
      const p = { curAge: 68, income: 0, incomeStop: 68, pensionAmt: 0, pensionStart: 68,
        pensionIndex: 'none', cppAmt: 15000, cppStart: 68, oasInclude: true, oasStart: 68,
        oasClawback: false, rrspAssets: 0, liraAssets: 0, nonRegAssets: 600000,
        nonRegYield: 0, inflation: 0, lifeExp: 80, ret: 0.03, lifRate: 0.0349,
        targetOn: false, targetAmt: 0, targetFrom: 0, targetTo: 0, targetIndexed: true,
        custom: [], oas65: 751.97 * 12, oasUplift: 10, clawThresh: 95323, clawRate: 15 };
      // No registered money and no DB pension, so nothing qualifies
      return solve(p).detail.rows.every(r => r.rrifW === 0 && r.lifW === 0 && r.pension === 0);
    });
    expect(eligible).toBe(true);
  });

  test('credits never push tax below zero', async ({ page }) => {
    const r = await page.evaluate(() =>
      [0, 500, 5000, 15000].map(i => taxOnIncome(i, 1, { age: 75, eligiblePension: i })));
    expect(r.every(t => t >= 0)).toBe(true);
  });
});

test.describe('OAS recovery tax timing', () => {
  /* The recovery tax is assessed on the prior year's net income, so a drop in
     income shows up in the clawback a year later. */
  test('a fall in income relieves the clawback a year later', async ({ page }) => {
    const rows = await page.evaluate(() => {
      const p = { curAge: 65, income: 250000, incomeStop: 68, pensionAmt: 0, pensionStart: 65,
        pensionIndex: 'none', cppAmt: 0, cppStart: 65, oasInclude: true, oasStart: 65,
        oasClawback: true, rrspAssets: 400000, liraAssets: 0, nonRegAssets: 900000,
        nonRegYield: 0, inflation: 0, lifeExp: 80, ret: 0.03, lifRate: 0.0349,
        targetOn: false, targetAmt: 0, targetFrom: 0, targetTo: 0, targetIndexed: true,
        custom: [], oas65: 751.97 * 12, oasUplift: 10, clawThresh: 95323, clawRate: 15 };
      return solve(p).detail.rows
        .filter(r => r.age >= 67 && r.age <= 70)
        .map(r => ({ age: r.age, income: Math.round(r.income), claw: Math.round(r.clawback) }));
    });
    const lastWorking = rows.find(r => r.age === 67); // income still coming in
    const firstAfter = rows.find(r => r.age === 68);  // income stopped this year
    expect(lastWorking.claw).toBeGreaterThan(0);
    // Income stopped at 68 but the prior year was high, so the clawback persists
    expect(firstAfter.claw).toBeGreaterThan(0);
    expect(firstAfter.income).toBe(0);
  });
});

test.describe('CPP and OAS start age adjustments', () => {
  /* Both benefits are quoted at age 65. Taking CPP early or deferring either
     benefit permanently changes the amount, so the tool has to adjust rather
     than paying the age-65 figure at every start age. */
  test('CPP factors match the statutory rates', async ({ page }) => {
    const f = await page.evaluate(() => ({
      at60: cppStartFactor(60), at65: cppStartFactor(65), at70: cppStartFactor(70)
    }));
    expect(f.at60).toBeCloseTo(0.64, 6);   // 36% reduction
    expect(f.at65).toBe(1);
    expect(f.at70).toBeCloseTo(1.42, 6);   // 42% increase
  });

  test('OAS factors match the statutory rates', async ({ page }) => {
    const f = await page.evaluate(() => ({
      at65: oasStartFactor(65), at70: oasStartFactor(70)
    }));
    expect(f.at65).toBe(1);
    expect(f.at70).toBeCloseTo(1.36, 6);   // 36% increase
  });

  test('deferring OAS to 70 pays more than taking it at 65', async ({ page }) => {
    const amounts = await page.evaluate(() => {
      const base = (oasStart) => ({
        curAge: 70, income: 0, incomeStop: 70, pensionAmt: 0, pensionStart: 70,
        pensionIndex: 'none', cppAmt: 0, cppStart: 70, oasInclude: true, oasStart,
        oasClawback: false, rrspAssets: 200000, liraAssets: 0, nonRegAssets: 200000,
        nonRegYield: 0, inflation: 0, lifeExp: 85, ret: 0.03, lifRate: 0.0349,
        targetOn: false, targetAmt: 0, targetFrom: 0, targetTo: 0, targetIndexed: true,
        custom: [], oas65: 751.97 * 12, oasUplift: 10, clawThresh: 95323, clawRate: 15
      });
      const at = (s) => solve(base(s)).detail.rows.find(r => r.age === 72).oas;
      return { standard: at(65), deferred: at(70) };
    });
    expect(amounts.deferred / amounts.standard).toBeCloseTo(1.36, 3);
  });

  test('full CPP deferred to 70 uses the increased maximum', async ({ page }) => {
    const r = await page.evaluate(() => {
      document.getElementById('cppFull').value = 'yes';
      document.getElementById('cppStart').value = '70';
      const deferred = readInputs().cppAmt;
      document.getElementById('cppStart').value = '65';
      const standard = readInputs().cppAmt;
      return { standard, deferred };
    });
    expect(r.deferred / r.standard).toBeCloseTo(1.42, 4);
  });

  test('a manually entered CPP amount is used exactly as given', async ({ page }) => {
    const amt = await page.evaluate(() => {
      document.getElementById('cppFull').value = 'no';
      document.getElementById('cppAmt').value = '11000';
      document.getElementById('cppStart').value = '70';
      return readInputs().cppAmt;
    });
    expect(amt).toBe(11000);
  });
});

test.describe('Solver behaviour', () => {
  test('has no hidden ceiling on large portfolios', async ({ page }) => {
    /* A previous build silently capped spending at $2,000,000. */
    const r = await solve(page, P({ rrspAssets: 80000000, nonRegAssets: 40000000 }));
    expect(r.spend).toBeGreaterThan(2000000);
  });

  test('returns zero with no assets and no income', async ({ page }) => {
    const r = await solve(page, P({ rrspAssets: 0, liraAssets: 0, nonRegAssets: 0 }));
    expect(r.spend).toBe(0);
  });

  test('more assets never reduce spending power', async ({ page }) => {
    const a = await solve(page, P({ rrspAssets: 500000 }));
    const b = await solve(page, P({ rrspAssets: 900000 }));
    expect(b.spend).toBeGreaterThan(a.spend);
  });

  test('registered money yields less than the same non-registered amount', async ({ page }) => {
    const reg = await solve(page, P({ rrspAssets: 1000000, nonRegAssets: 0 }));
    const non = await solve(page, P({ rrspAssets: 0, nonRegAssets: 1000000 }));
    expect(non.spend).toBeGreaterThan(reg.spend);
  });

  test('no year is flagged as depleted on a solved plan', async ({ page }) => {
    /* A previous build painted the final row red on fully funded plans. */
    const flagged = await page.evaluate(() => {
      const p = { curAge: 65, income: 0, incomeStop: 65, pensionAmt: 0, pensionStart: 65,
        pensionIndex: 'none', cppAmt: 0, cppStart: 65, oasInclude: false, oasStart: 65,
        oasClawback: false, rrspAssets: 500000, liraAssets: 0, nonRegAssets: 250000,
        nonRegYield: 0, inflation: 0.025, lifeExp: 95, ret: 0.05, lifRate: 0.0349,
        targetOn: false, targetAmt: 0, targetFrom: 0, targetTo: 0, targetIndexed: true,
        custom: [], oas65: 751.97 * 12, oasUplift: 10, clawThresh: 95323, clawRate: 15 };
      return solve(p).detail.rows.filter(r => r.depleted).length;
    });
    expect(flagged).toBe(0);
  });

  test('genuine overspending is still detected', async ({ page }) => {
    const r = await page.evaluate(() => {
      const p = { curAge: 65, income: 0, incomeStop: 65, pensionAmt: 0, pensionStart: 65,
        pensionIndex: 'none', cppAmt: 0, cppStart: 65, oasInclude: false, oasStart: 65,
        oasClawback: false, rrspAssets: 500000, liraAssets: 0, nonRegAssets: 250000,
        nonRegYield: 0, inflation: 0.025, lifeExp: 95, ret: 0.05, lifRate: 0.0349,
        targetOn: false, targetAmt: 0, targetFrom: 0, targetTo: 0, targetIndexed: true,
        custom: [], oas65: 751.97 * 12, oasUplift: 10, clawThresh: 95323, clawRate: 15 };
      const bad = simulate(80000, p, true); // far above the sustainable ~32,851
      return { flagged: bad.rows.filter(r => r.depleted).length, funded: bad.yearsFunded };
    });
    expect(r.flagged).toBeGreaterThan(0);
    expect(r.funded).toBeLessThan(31);
  });
});

test.describe('Target income period', () => {
  test('delivers the requested amount, indexed, then levels off', async ({ page }) => {
    const r = await page.evaluate(() => {
      const p = { curAge: 65, income: 0, incomeStop: 65, pensionAmt: 0, pensionStart: 65,
        pensionIndex: 'none', cppAmt: 0, cppStart: 65, oasInclude: false, oasStart: 65,
        oasClawback: false, rrspAssets: 1500000, liraAssets: 300000, nonRegAssets: 800000,
        nonRegYield: 0, inflation: 0.025, lifeExp: 95, ret: 0.05, lifRate: 0.0349,
        targetOn: true, targetAmt: 200000, targetFrom: 65, targetTo: 74, targetIndexed: true,
        custom: [], oas65: 751.97 * 12, oasUplift: 10, clawThresh: 95323, clawRate: 15 };
      const rows = solve(p).detail.rows;
      return {
        first: Math.round(rows[0].spend),
        tenth: Math.round(rows[9].spend),
        eleventh: Math.round(rows[10].spend)
      };
    });
    expect(r.first).toBe(200000);
    expect(r.tenth).toBe(Math.round(200000 * Math.pow(1.025, 9)));
    expect(r.eleventh).toBeLessThan(r.tenth); // drops to the solved level
  });

  test('an unaffordable target is reported rather than quietly scaled down', async ({ page }) => {
    const r = await page.evaluate(() => {
      const p = { curAge: 65, income: 0, incomeStop: 65, pensionAmt: 0, pensionStart: 65,
        pensionIndex: 'none', cppAmt: 0, cppStart: 65, oasInclude: false, oasStart: 65,
        oasClawback: false, rrspAssets: 200000, liraAssets: 0, nonRegAssets: 50000,
        nonRegYield: 0, inflation: 0.025, lifeExp: 95, ret: 0.05, lifRate: 0.0349,
        targetOn: true, targetAmt: 400000, targetFrom: 65, targetTo: 80, targetIndexed: true,
        custom: [], oas65: 751.97 * 12, oasUplift: 10, clawThresh: 95323, clawRate: 15 };
      const out = solve(p);
      return {
        spend: Math.round(out.spend),
        flagged: out.detail.rows.filter(r => r.depleted).length,
        yearsFunded: out.detail.yearsFunded
      };
    });
    expect(r.spend).toBe(0);              // nothing left over for other years
    expect(r.flagged).toBeGreaterThan(0); // and the shortfall is visible
    expect(r.yearsFunded).toBeLessThan(31);
  });

  test('a flat target stays flat', async ({ page }) => {
    const same = await page.evaluate(() => {
      const p = { curAge: 65, income: 0, incomeStop: 65, pensionAmt: 0, pensionStart: 65,
        pensionIndex: 'none', cppAmt: 0, cppStart: 65, oasInclude: false, oasStart: 65,
        oasClawback: false, rrspAssets: 2000000, liraAssets: 0, nonRegAssets: 500000,
        nonRegYield: 0, inflation: 0.025, lifeExp: 95, ret: 0.05, lifRate: 0.0349,
        targetOn: true, targetAmt: 120000, targetFrom: 65, targetTo: 70, targetIndexed: false,
        custom: [], oas65: 751.97 * 12, oasUplift: 10, clawThresh: 95323, clawRate: 15 };
      const rows = solve(p).detail.rows.slice(0, 6).map(r => Math.round(r.spend));
      return rows.every(v => v === 120000);
    });
    expect(same).toBe(true);
  });
});
