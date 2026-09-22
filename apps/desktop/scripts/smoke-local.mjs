import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    const path = resolve(root, `.${decodeURIComponent(new URL(request.url, 'http://localhost').pathname)}`);
    if (path !== root && !path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    const target = extname(path) ? path : resolve(root, 'index.html');
    response.setHeader('Content-Type', types[extname(target)] ?? 'application/octet-stream');
    response.end(await readFile(target));
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1200, height: 720 } });
  const external = [];
  await context.route('**/*', (route) => {
    if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('button', { name: 'Español', exact: true }).click();
  await page.getByLabel('Tu nombre', { exact: true }).fill('QA Noite');
  await page.getByRole('button', { name: 'Entrar a Noite', exact: true }).click();
  await page.locator('[data-noite-shell]').waitFor();
  assert.equal(await page.locator('[data-noite-shell]').evaluate((element) => getComputedStyle(element).colorScheme), 'light');
  const screenshotDir = resolve(root, '../../../artifacts/qa');
  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({ path: resolve(screenshotDir, 'home-light.png') });
  // All external requests are blocked above; bundled assets remain reachable
  // just as Tauri's local asset protocol does without an Internet connection.
  await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }); window.dispatchEvent(new Event('offline')); });
  assert.ok(await page.getByText('Guardado en esta computadora', { exact: false }).count());
  for (const path of ['/biblioteca/juegos', '/calendario', '/musica', '/galeria', '/settings', '/juegos/instalados']) {
    await page.evaluate((next) => { history.pushState({}, '', next); window.dispatchEvent(new PopStateEvent('popstate')); }, path);
    await page.waitForFunction((next) => location.pathname === next && document.querySelector('[data-noite-shell]'), path);
    await page.waitForTimeout(350);
    assert.equal(await page.getByText('Algo salió mal', { exact: true }).count(), 0, path);
    if (path === '/musica' || path === '/settings') await page.screenshot({ path: resolve(screenshotDir, path === '/musica' ? 'music-light.png' : 'settings-light.png') });
  }
  await page.evaluate(() => { history.pushState({}, '', '/settings?section=data'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByRole('button', { name: 'Crear respaldo', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Abrir respaldo', exact: true }).waitFor();
  const help = page.getByRole('button', { name: 'Ayuda para compartir datos en pareja' });
  await help.click();
  const tutorial = page.getByRole('dialog', { name: 'Cómo compartir sus datos' });
  await tutorial.waitFor();
  assert.equal(await tutorial.locator('li').count(), 6);
  assert.ok((await tutorial.innerText()).includes('Importar reemplaza datos; no combina dos bibliotecas'));
  await page.screenshot({ path: resolve(screenshotDir, 'couple-transfer-help.png') });
  await page.keyboard.press('Escape');
  await tutorial.waitFor({ state: 'hidden' });
  await help.click();
  await tutorial.getByRole('button', { name: 'Entendido' }).click();
  await tutorial.waitFor({ state: 'hidden' });
  await page.evaluate(() => { history.pushState({}, '', '/settings?section=profile'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByLabel('Segunda persona', { exact: true }).fill('QA Pareja');
  const saveNames = page.getByRole('button', { name: 'Guardar nombres de pareja' });
  assert.equal(await saveNames.isDisabled(), true);
  await page.getByRole('checkbox', { name: /Confirmo los nombres:/ }).check();
  await saveNames.click();
  await page.waitForFunction(() => {
    const input = document.querySelector('input[aria-label="Segunda persona"]');
    const form = input?.closest('form');
    return input?.value === 'QA Pareja' && form?.textContent.includes('Guardar nombres de pareja') && !form.querySelector('input[type="checkbox"]')?.checked;
  });
  await page.evaluate(() => { history.pushState({}, '', '/actividades/nueva?section=juegos'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByLabel('Idea de:').selectOption('QA Pareja');
  await page.getByLabel('Idea de:').selectOption('Ambos');
  await page.evaluate(() => { history.pushState({}, '', '/settings?section=data'); window.dispatchEvent(new PopStateEvent('popstate')); });
  const backup = JSON.stringify({ version: 1, data: { settings: { onboardingComplete: true, userName: 'Ana', partnerName: 'Luz' }, libraryItems: [] } });
  const chooseBackup = async () => page.locator('input[type=file][accept=".noche,application/x-noite"]').setInputFiles({ name: 'test.noche', mimeType: 'application/x-noite', buffer: Buffer.from(backup) });
  await chooseBackup();
  const preview = page.getByRole('dialog', { name: 'Revisar respaldo' });
  await preview.getByText('En el respaldo: Ana y Luz', { exact: true }).waitFor();
  await preview.getByRole('checkbox', { name: /Entiendo que los datos locales/ }).check();
  await preview.getByRole('textbox').fill('REEMPLAZAR');
  const replace = preview.getByRole('button', { name: 'Reemplazar datos' });
  assert.equal(await replace.isDisabled(), true);
  await preview.getByRole('checkbox', { name: /Confirmo que este respaldo/ }).check();
  assert.equal(await replace.isEnabled(), true);
  await preview.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await chooseBackup();
  await preview.waitFor();
  assert.equal(await preview.getByRole('checkbox', { name: /Confirmo que este respaldo/ }).isChecked(), false);
  assert.equal(await replace.isDisabled(), true);
  await preview.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.evaluate(() => { history.pushState({}, '', '/settings?section=profile'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByLabel('Usar Noite como').selectOption({ label: 'QA Pareja' });
  const changePerson = page.getByRole('button', { name: 'Confirmar persona y reiniciar' });
  assert.equal(await changePerson.isDisabled(), true);
  await page.getByRole('checkbox', { name: 'Confirmo que soy QA Pareja.' }).check();
  await changePerson.click();
  await page.getByRole('heading', { name: 'Configura el acceso local' }).waitFor();
  await page.getByRole('button', { name: 'Contraseña', exact: true }).click();
  await page.getByPlaceholder('Contraseña', { exact: true }).fill('Noite-QA-only-2026');
  await page.getByRole('button', { name: 'Configurar', exact: true }).click();
  await page.getByRole('button', { name: 'Ya lo guardé' }).click();
  await page.locator('[data-noite-shell]').waitFor();
  await page.evaluate(() => { history.pushState({}, '', '/settings?section=profile'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByText('Ahora: QA Pareja.', { exact: false }).waitFor();
  assert.equal(await page.getByLabel('Usar Noite como').inputValue(), await page.evaluate(() => localStorage.getItem('noite.device-profile')));
  assert.equal(external.filter((url) => !['https://www.themoviedb.org/', 'https://image.tmdb.org/', 'https://images.igdb.com/', 'https://open.spotify.com/'].some((prefix) => url.startsWith(prefix))).length, 0);
  assert.deepEqual(errors, []);
  console.log('PASS: local onboarding, light theme, six offline routes, couple tutorial, offline name changes, partner/both idea options, import confirmation/reset, device-person switch with access setup, no unexpected requests and zero uncaught page errors.');
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
