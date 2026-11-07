#!/usr/bin/env node
// Checks that everything needed to run the shop is installed and configured.
// Run with:  npm run doctor
import { existsSync, readFileSync } from 'node:fs';

const ok = (msg) => console.log(`  ✅ ${msg}`);
const warn = (msg) => console.log(`  ⚠️  ${msg}`);
const bad = (msg) => console.log(`  ❌ ${msg}`);
let problems = 0;

console.log('\nTrendcart setup check\n');

// 1. Node.js version (Next.js 14 needs 18.18 or newer)
const [major, minor] = process.versions.node.split('.').map(Number);
if (major > 18 || (major === 18 && minor >= 18)) ok(`Node.js ${process.versions.node}`);
else {
  bad(`Node.js ${process.versions.node} is too old. Install the LTS version from https://nodejs.org`);
  problems++;
}

// 2. Dependencies
if (existsSync('node_modules/next') && existsSync('node_modules/@anthropic-ai/sdk')) ok('Dependencies installed');
else {
  bad('Dependencies missing. Run:  npm install');
  problems++;
}

// 3. Settings file
const env = {};
const file = existsSync('.env.local') ? '.env.local' : existsSync('.env') ? '.env' : null;
if (file) {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  ok(`Settings file found (${file})`);
} else {
  warn('No .env.local yet. Copy the template:  cp .env.example .env.local   (Windows: copy .env.example .env.local)');
}
const get = (k) => env[k] || process.env[k] || '';

// 4. Claude API key
const key = get('ANTHROPIC_API_KEY');
if (key.startsWith('sk-ant-')) ok('Claude API key set: agents will run for real (this costs API credits)');
else if (key) {
  warn('ANTHROPIC_API_KEY does not look like a Claude key (it should start with sk-ant-)');
} else warn('No ANTHROPIC_API_KEY: agents run in SIMULATE mode (scripted, free). Fine for trying it out.');

// 5. Admin password
if (get('ADMIN_PASSWORD')) ok('ADMIN_PASSWORD set: the control room is password protected');
else warn('No ADMIN_PASSWORD: anyone who can reach the site can open /admin. Set one before putting it online.');

// 6. Autopilot
if (get('AUTOPILOT') === '1') ok('Autopilot on: agents run on a schedule while the server is running');
else warn('Autopilot off: agents only run when you click "Run agent". Set AUTOPILOT=1 to automate.');

// 7. Marketplaces
const channels = (get('CHANNELS') || 'store,ebay,amazon,walmart,tiktok').split(',').map((s) => s.trim());
const creds = {
  ebay: ['EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET', 'EBAY_REFRESH_TOKEN'],
  amazon: ['AMAZON_LWA_CLIENT_ID', 'AMAZON_LWA_CLIENT_SECRET', 'AMAZON_REFRESH_TOKEN', 'AMAZON_SELLER_ID'],
  walmart: ['WALMART_CLIENT_ID', 'WALMART_CLIENT_SECRET'],
  tiktok: ['TIKTOK_APP_KEY', 'TIKTOK_APP_SECRET', 'TIKTOK_REFRESH_TOKEN', 'TIKTOK_SHOP_CIPHER'],
};
for (const ch of channels) {
  if (ch === 'store') continue;
  if (!creds[ch]) {
    bad(`Unknown channel "${ch}" in CHANNELS`);
    problems++;
    continue;
  }
  const missing = creds[ch].filter((k) => !get(k));
  if (missing.length === 0) ok(`${ch}: credentials set (LIVE)`);
  else console.log(`  ℹ️  ${ch}: dry run (no real listings). Add ${missing.join(', ')} to go live.`);
}

// 8. Supplier
if ((get('SUPPLIER') || 'mock') === 'mock') console.log('  ℹ️  Supplier: demo catalog (fake products, nothing is really ordered)');

console.log(problems ? `\n${problems} problem(s) to fix above.\n` : '\nReady. Start it with:  npm run dev   then open http://localhost:3000/admin\n');
process.exit(problems ? 1 : 0);
