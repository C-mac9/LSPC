#!/usr/bin/env node
/* Regenerates the derived copies from the single source file.
 *
 *   node scripts/sync.js          write the copies
 *   node scripts/sync.js --check  verify they are current (used by CI)
 *
 * This exists because the copies were previously produced by hand in
 * PowerShell, where `Get-Content -Raw` reads as ANSI and silently corrupted
 * every dash and apostrophe in the file. Doing it here makes the step
 * reproducible and lets CI fail when someone edits the source and forgets
 * to regenerate.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'rrif-spending-power-calculator.html');
const DEPLOY = path.join(ROOT, 'deploy', 'index.html');
const HOSTED = path.join(ROOT, 'csic-calculator-hosted.html');

const check = process.argv.includes('--check');

const source = fs.readFileSync(SOURCE, 'utf8');

// Guard against the corruption that prompted this script
if (source.includes('â€')) {
  console.error('FAIL: the source file contains mojibake (mis-encoded characters).');
  process.exit(1);
}
if (!source.includes('data:image/png;base64,iVBOR')) {
  console.error('FAIL: the CSIC logo is missing from the source file.');
  process.exit(1);
}

/* The Artifact host wraps page content in its own document shell, so that
   copy has the doctype, head and body tags stripped. */
const hosted = source
  .replace(/^[\s\S]*?<title>/, '<title>')
  .replace(/<\/head>\s*<body>/, '')
  .replace(/<\/body>\s*<\/html>\s*$/, '')
  .trim();

const outputs = [
  { file: DEPLOY, content: source, label: 'deploy/index.html' },
  { file: HOSTED, content: hosted, label: 'csic-calculator-hosted.html' }
];

let stale = 0;
for (const out of outputs) {
  const current = fs.existsSync(out.file) ? fs.readFileSync(out.file, 'utf8') : null;
  const matches = current === out.content;

  if (check) {
    console.log(`${matches ? 'ok  ' : 'STALE'}  ${out.label}`);
    if (!matches) stale++;
  } else {
    if (matches) {
      console.log(`unchanged  ${out.label}`);
    } else {
      fs.writeFileSync(out.file, out.content, 'utf8');
      console.log(`written    ${out.label}`);
    }
  }
}

if (check && stale) {
  console.error(`\n${stale} generated file(s) are out of date. Run: node scripts/sync.js`);
  process.exit(1);
}

const version = (source.match(/APP_VERSION\s*=\s*'([^']+)'/) || [])[1] || 'unknown';
console.log(`\nCalculator version ${version}`);
