/* Interface tests: the things an advisor actually touches.
 These cover the failures found in QA - a silent save, a negative figure
 producing a plausible wrong answer, and a report built on stale tax data. */
const { test, expect } = require('@playwright/test');

const set = async (page, id, value) => {
  await page.evaluate(([i, v]) => {
    const el = document.getElementById(i);
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, [id, value]);
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();
});

test('page loads with no console errors', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});

test('the primary flow produces a figure', async ({ page }) => {
  /* Higher than the engine's bare baseline because the form ships with
     "Include OAS" set to Yes. Was $41,272 before the age and pension credits
     were added in v1.2.0. */
  await page.click('#calcBtn');
  await expect(page.locator('#rSpend')).toHaveText('$42,533');
  await expect(page.locator('#reconBox')).not.toHaveClass(/bad/);
  await expect(page.locator('#reconBox')).toContainText('reconciled');
});

test('results update automatically after the first calculation', async ({ page }) => {
  await page.click('#calcBtn');
  const before = await page.locator('#rSpend').textContent();
  await set(page, 'rrspAssets', '1500000');
  await expect(page.locator('#rSpend')).not.toHaveText(before, { timeout: 2000 });
});

test.describe('Invalid input', () => {
  test('a negative asset blocks the calculation', async ({ page }) => {
    await page.click('#calcBtn');
    await set(page, 'rrspAssets', '-500000');
    await page.waitForTimeout(400);
    await expect(page.locator('#inputError')).toHaveClass(/show/);
    await expect(page.locator('#inputError')).toContainText('cannot be negative');
    await expect(page.locator('#resultBlock')).toBeHidden();
    await expect(page.locator('#rrspAssets')).toHaveClass(/bad/);
  });

  test('no report can be produced while an input is invalid', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.click('#calcBtn');
    await expect(page.locator('#reportBtn')).toBeVisible();

    await set(page, 'rrspAssets', '-100');
    await expect(page.locator('#inputError')).toHaveClass(/show/);

    // The results block is hidden entirely, so the report button is unreachable
    await expect(page.locator('#reportBtn')).toBeHidden();

    // And forcing the call still refuses, rather than building from stale data
    await page.evaluate(() => buildReport());
    await expect(page.locator('body')).not.toHaveClass(/report-open/);
  });

  test('correcting the input restores the original figure', async ({ page }) => {
    await page.click('#calcBtn');
    const good = await page.locator('#rSpend').textContent();
    await set(page, 'rrspAssets', '-500000');
    await page.waitForTimeout(400);
    await set(page, 'rrspAssets', '500000');
    await page.waitForTimeout(400);
    await expect(page.locator('#inputError')).not.toHaveClass(/show/);
    await expect(page.locator('#rSpend')).toHaveText(good);
  });

  test('life expectancy below current age is refused', async ({ page }) => {
    await set(page, 'curAge', '80');
    await set(page, 'lifeExp', '70');
    await page.click('#calcBtn');
    await expect(page.locator('#inputError')).toHaveClass(/show/);
    await expect(page.locator('#inputError')).toContainText('greater than the current age');
  });
});

test('a realistic client plan reconciles and reports', async ({ page }) => {
  await set(page, 'clientName', 'Margaret Chen');
  await set(page, 'advisorName', 'Craig');
  await set(page, 'curAge', '62');
  await set(page, 'income', '180000');
  await set(page, 'incomeStop', '65');
  await set(page, 'pensionAmt', '42000');
  await set(page, 'pensionIndex', 'partial');
  await set(page, 'cppFull', 'yes');
  await set(page, 'oasInclude', 'yes');
  await set(page, 'oasClawback', 'yes');
  await set(page, 'rrspAssets', '850000');
  await set(page, 'liraAssets', '320000');
  await set(page, 'nonRegAssets', '450000');
  await set(page, 'nonRegYield', '2.5');
  await set(page, 'txLabel0', 'Rental income');
  await set(page, 'txAmt0', '18000');
  await set(page, 'ntLabel0', 'Long-term care');
  await set(page, 'ntAmt0', '-75000');
  await set(page, 'ntFrom0', '85');
  await page.click('#calcBtn');

  await expect(page.locator('#reconBox')).not.toHaveClass(/bad/);
  await expect(page.locator('#rSerial')).toContainText(/CSIC-\d{8}-\d{2}-[A-Z0-9]{4}/);

  await page.click('#reportBtn');
  await expect(page.locator('body')).toHaveClass(/report-open/);
  await expect(page.locator('#reportView .basis')).toContainText('Notes and Assumptions memorandum');
  await expect(page.locator('#reportView')).not.toContainText('Your Situation');
  await expect(page.locator('#reportView th.spcol')).toHaveText('Indexed Spending Power');
});

test('every row of the projection adds up to the spending figure', async ({ page }) => {
  await set(page, 'liraAssets', '300000');
  await set(page, 'cppFull', 'yes');
  await set(page, 'oasInclude', 'yes');
  await page.click('#calcBtn');
  await page.click('#toggleTable');

  const worst = await page.evaluate(() => {
    const hd = [...document.querySelectorAll('#projTable thead th')].map(h => h.textContent);
    const spIdx = hd.indexOf('Indexed Spending Power');
    const balances = new Set(['Age', 'RRSP/RRIF start', 'RRIF min', 'LIRA/LIF start',
      'LIF max allowed', 'Assets end', 'Indexed Spending Power']);
    const num = s => parseFloat(s.replace(/[$,]/g, '')) || 0;
    let worst = 0;
    for (const tr of document.querySelectorAll('#projTable tbody tr')) {
      const tds = [...tr.querySelectorAll('td')].map(t => t.textContent);
      let sum = 0;
      hd.forEach((h, j) => { if (!balances.has(h)) sum += num(tds[j]); });
      worst = Math.max(worst, Math.abs(sum - num(tds[spIdx])));
    }
    return worst;
  });
  // Cells are rounded to whole dollars, so allow a couple of dollars of display rounding
  expect(worst).toBeLessThanOrEqual(2);
});

test('an underfunded year is marked in text, not colour alone', async ({ page }) => {
  /* Accessibility: red text is invisible to a colour-blind reader and lost in a
     black-and-white printout, so the marker has to be readable too. */
  await set(page, 'rrspAssets', '200000');
  await set(page, 'nonRegAssets', '50000');
  await set(page, 'targetOn', 'yes');
  await set(page, 'targetAmt', '400000');
  await set(page, 'targetFrom', '65');
  await set(page, 'targetTo', '80');
  await page.click('#calcBtn');
  await page.click('#toggleTable');
  await expect(page.locator('#projTable tbody tr.depleted').first()).toContainText('short');
});

test.describe('Scenarios', () => {
  test('save, reload the page, and the scenario is still there', async ({ page }) => {
    await set(page, 'clientName', 'Test Client');
    await set(page, 'rrspAssets', '777000');
    page.once('dialog', d => d.accept('Test Client'));
    await page.click('#saveScenarioBtn');
    await page.reload();
    await expect(page.locator('#scenarioList option[value="Test Client"]')).toHaveCount(1);
  });

  test('loading a scenario restores the figures', async ({ page }) => {
    // Both the save prompt and the "start new client" confirm need accepting
    page.on('dialog', d => d.accept('Restore Me'));
    await set(page, 'clientName', 'Restore Me');
    await set(page, 'rrspAssets', '777000');
    await page.click('#saveScenarioBtn');
    await page.click('#newClientBtn');
    await expect(page.locator('#rrspAssets')).toHaveValue('500000');
    await page.selectOption('#scenarioList', 'Restore Me');
    await expect(page.locator('#rrspAssets')).toHaveValue('777000');
  });

  test('a backup file round-trips', async ({ page }) => {
    await set(page, 'clientName', 'Backup Me');
    await set(page, 'nonRegAssets', '654000');
    page.once('dialog', d => d.accept('Backup Me'));
    await page.click('#saveScenarioBtn');

    const download = await Promise.all([
      page.waitForEvent('download'),
      page.click('#exportScenariosBtn')
    ]).then(([d]) => d);
    expect(download.suggestedFilename()).toMatch(/^csic-scenarios-\d{4}-\d{2}-\d{2}\.json$/);

    // Wipe everything, then restore from the file
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('#scenarioList option')).toHaveCount(1); // placeholder only
    await page.setInputFiles('#importFile', await download.path());
    page.once('dialog', d => d.accept());
    await expect(page.locator('#scenarioList option[value="Backup Me"]')).toHaveCount(1);
  });
});

test.describe('Annual settings', () => {
  test('locked by default and the wrong passcode is refused', async ({ page }) => {
    // One handler for both dialogs: the passcode prompt, then the rejection alert
    page.on('dialog', d => d.type() === 'prompt' ? d.accept('wrong') : d.accept());
    await page.click('#settingsBtn');
    await expect(page.locator('#setForm')).toHaveClass(/locked/);
    await page.click('#unlockBtn');
    await expect(page.locator('#setForm')).toHaveClass(/locked/);
  });

  test('changed figures survive a page reload and change the result', async ({ page }) => {
    await page.click('#calcBtn');
    await set(page, 'oasInclude', 'yes');
    const before = await page.locator('#rSpend').textContent();

    await page.click('#settingsBtn');
    page.once('dialog', d => d.accept('csic'));
    await page.click('#unlockBtn');
    await page.fill('#setTaxYear', '2027');
    await page.fill('#setValidThrough', '2027-12-31');
    await page.fill('#setUpdatedBy', 'Shannon');
    await page.fill('#setOas65', '9300');
    await page.click('#saveSetBtn');

    await expect(page.locator('#rSpend')).not.toHaveText(before);
    await page.reload();
    await expect(page.locator('#statusBanner')).toContainText('2027');
    await expect(page.locator('#statusBanner')).toContainText('Shannon');
  });

  test('out-of-date figures warn on screen and on the report', async ({ page }) => {
    await page.evaluate(() => {
      SETTINGS = Object.assign(DEFAULT_SETTINGS(),
        { taxYear: '2020', validThrough: '2020-12-31', updatedOn: 'January 5, 2020', updatedBy: 'Craig' });
      renderStatusBanner();
      calculate(false, true);
    });
    await expect(page.locator('#statusBanner')).toHaveClass(/expired/);
    await page.click('#reportBtn');
    await expect(page.locator('#reportView .stale')).toContainText('may since have changed');
  });
});

test.describe('Table views', () => {
  test('condensed view is narrower than detailed and both reconcile', async ({ page }) => {
    await set(page, 'liraAssets', '300000');
    await set(page, 'cppFull', 'yes');
    await set(page, 'oasInclude', 'yes');
    await page.click('#calcBtn');
    await page.click('#toggleTable');
    const detailed = await page.locator('#projTable thead th').count();
    await page.click('#viewToggle');
    const condensed = await page.locator('#projTable thead th').count();
    expect(condensed).toBeLessThan(detailed);
  });

  test('client report defaults to the condensed layout', async ({ page }) => {
    await set(page, 'liraAssets', '300000');
    await set(page, 'cppFull', 'yes');
    await page.click('#calcBtn');
    await page.click('#reportBtn');
    const reportCols = await page.locator('#reportView thead th').count();
    await page.click('#repBack');
    await page.click('#toggleTable');
    const screenCols = await page.locator('#projTable thead th').count();
    expect(reportCols).toBeLessThan(screenCols);
  });
});

test.describe('Mobile layout', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the page never scrolls sideways', async ({ page }) => {
    await page.click('#calcBtn');
    const overflows = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
    expect(overflows).toBe(false);
  });

  test('custom income rows stack and stay readable', async ({ page }) => {
    await set(page, 'txLabel0', 'Rental income');
    const r = await page.evaluate(() => {
      const lbl = document.getElementById('txLabel0');
      return {
        headHidden: getComputedStyle(document.querySelector('.cust-head')).display === 'none',
        labelWidth: Math.round(lbl.getBoundingClientRect().width),
        truncated: lbl.scrollWidth > lbl.clientWidth + 2
      };
    });
    expect(r.headHidden).toBe(true);
    expect(r.labelWidth).toBeGreaterThan(200);
    expect(r.truncated).toBe(false);
  });

  test('no tap target is smaller than 32px', async ({ page }) => {
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('.wrap button, .wrap select, .wrap input:not([type=range]):not([type=checkbox])')]
        .filter(el => { const r = el.getBoundingClientRect(); return r.height > 0 && r.height < 32; }).length);
    expect(small).toBe(0);
  });
});
