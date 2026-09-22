import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';

// Attach only to a test process started with a temporary, loopback CDP port.
// This is not a production setting and does not modify the user's library.
const port = Number(process.argv[2]);
assert.ok(Number.isInteger(port) && port > 1024 && port < 65536);
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 15_000 });
try {
  const pages = browser.contexts().flatMap((context) => context.pages());
  const page = pages.find((candidate) => /^https?:\/\/tauri\.localhost|^tauri:\/\//.test(candidate.url()));
  assert.ok(page, 'Noite WebView was not found');
  await page.waitForFunction(() => document.querySelector('[data-noite-shell]') || /Elige tu idioma|Make Noite yours|Configura el acceso local|Te damos la bienvenida|Quick settings|Ajustes rápidos/.test(document.body.innerText), null, { timeout: 20_000 });
  const state = await page.evaluate(() => ({
    mounted: document.getElementById('root').childElementCount > 0,
    recovery: /No se pudieron abrir tus datos|Algo salió mal/.test(document.body.innerText),
    colorScheme: getComputedStyle(document.querySelector('[data-noite-shell]') ?? document.documentElement).colorScheme,
    native: '__TAURI_INTERNALS__' in window,
  }));
  assert.equal(state.mounted, true); assert.equal(state.recovery, false); assert.equal(state.native, true); assert.equal(state.colorScheme, 'light');
  if (process.argv.includes('--screenshot')) {
    await mkdir('artifacts/qa', { recursive: true });
    await page.screenshot({ path: 'artifacts/qa/native-startup.png' });
  }
  console.log(JSON.stringify({ nativeStartup: 'PASS', ...state }));
} finally { await browser.close(); }
