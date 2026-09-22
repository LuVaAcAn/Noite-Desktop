import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, '..', '..', '..');
const records = [];
const texts = new Map();

function clean(value) {
  return String(value ?? '').replaceAll('|', '\\|').replace(/\s+/g, ' ').trim() || 'No declarado';
}

function noticesAt(directory) {
  let names = [];
  try {
    names = readdirSync(directory).filter((name) => /^(licen[cs]e|copying|notice)(\..*)?$/i.test(name));
  } catch {
    return [];
  }
  const ids = [];
  for (const name of names.sort()) {
    const path = join(directory, name);
    let content;
    try {
      content = readFileSync(path, 'utf8').trim();
    } catch {
      continue;
    }
    if (!content || content.length > 512_000) continue;
    const id = createHash('sha256').update(content).digest('hex').slice(0, 16);
    if (!texts.has(id)) texts.set(id, { content, sources: [] });
    ids.push(id);
  }
  return [...new Set(ids)];
}

const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
for (const [relative, entry] of Object.entries(lock.packages ?? {})) {
  if (!relative.startsWith('node_modules/') || entry.dev === true) continue;
  const directory = join(root, relative);
  const manifest = join(directory, 'package.json');
  if (!existsSync(manifest)) throw new Error(`Falta ${relative}/package.json; ejecuta npm ci.`);
  const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
  if (pkg.private === true || pkg.name?.startsWith('@proyecto-noche/')) continue;
  records.push({
    ecosystem: 'npm',
    name: pkg.name,
    version: pkg.version,
    license: typeof pkg.license === 'string' ? pkg.license : entry.license,
    repository: typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url,
    noticeIds: noticesAt(directory),
  });
}

const cargo = join(process.env.USERPROFILE ?? '', '.cargo', 'bin', 'cargo.exe');
if (!existsSync(cargo)) throw new Error('No se encontró cargo.exe.');
const metadata = JSON.parse(execFileSync(cargo, [
  'metadata', '--manifest-path', join(root, 'apps', 'desktop', 'src-tauri', 'Cargo.toml'),
  '--locked', '--format-version', '1', '--filter-platform', 'x86_64-pc-windows-msvc',
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
const activePackages = new Set(metadata.resolve.nodes.map((node) => node.id));
for (const pkg of metadata.packages) {
  if (!pkg.source || !activePackages.has(pkg.id)) continue;
  records.push({
    ecosystem: 'Cargo',
    name: pkg.name,
    version: pkg.version,
    license: pkg.license,
    repository: pkg.repository,
    noticeIds: noticesAt(dirname(pkg.manifest_path)),
  });
}

records.sort((a, b) => `${a.ecosystem}:${a.name}:${a.version}`.localeCompare(`${b.ecosystem}:${b.name}:${b.version}`));
for (const record of records) {
  for (const id of record.noticeIds) texts.get(id).sources.push(`${record.ecosystem}:${record.name}@${record.version}`);
}

const lines = [
  '# Inventario y licencias de terceros',
  '',
  'Archivo generado por `apps/desktop/scripts/generate-third-party-notices.mjs` desde `package-lock.json`, `Cargo.lock` y los paquetes instalados para Windows x64. No editar manualmente.',
  '',
  `Paquetes inventariados: ${records.length}. Textos únicos de licencia/NOTICE: ${texts.size}.`,
  '',
  '| Ecosistema | Paquete | Versión | Licencia declarada | Repositorio | Textos |',
  '|---|---|---:|---|---|---|',
];
for (const record of records) {
  const links = record.noticeIds.length ? record.noticeIds.map((id) => `[${id}](#license-${id})`).join(', ') : '—';
  lines.push(`| ${clean(record.ecosystem)} | ${clean(record.name)} | ${clean(record.version)} | ${clean(record.license)} | ${clean(record.repository)} | ${links} |`);
}

lines.push('', '# Textos de licencia y NOTICE deduplicados', '');
for (const [id, item] of [...texts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const fence = '`'.repeat(Math.max(3, ...[...item.content.matchAll(/`{3,}/g)].map((match) => match[0].length + 1)));
  lines.push(`<a id="license-${id}"></a>`, '', `## ${id}`, '', `Usado por: ${item.sources.sort().join(', ')}`, '', `${fence}text`, item.content, fence, '');
}

writeFileSync(join(root, 'THIRD_PARTY_LICENSES.md'), `${lines.join('\n').split('\n').map((line) => line.trimEnd()).join('\n').trimEnd()}\n`, 'utf8');
console.log(`Generated THIRD_PARTY_LICENSES.md: ${records.length} packages, ${texts.size} unique texts.`);
