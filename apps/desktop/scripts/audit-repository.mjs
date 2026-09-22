import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean))];
const problems = [];
for (const file of files) {
  const path = resolve(root, file);
  if (!existsSync(path)) continue;
  if (/(^|\/)(\.env(?:\.[^/]+)?)(?!example)$/.test(file) && !file.endsWith('.example')) problems.push([file, 'environment file']);
  if (/\.(?:pfx|p12|key|pem|keystore|sqlite3?|db|noche)$/i.test(file)) problems.push([file, 'private data or key file']);
  if (statSync(path).size > 50 * 1024 * 1024) problems.push([file, 'oversized source artifact']);
  if (!/\.(?:ts|tsx|js|mjs|json|rs|toml|md|txt|yml|yaml|sql|ps1|html|example)$/.test(file)) continue;
  const source = readFileSync(path, 'utf8');
  if (/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,}|sb_secret_[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(source)) problems.push([file, 'credential signature']);
  for (const token of source.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? []) {
    try { if (JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).role === 'service_role') problems.push([file, 'service role token']); } catch { /* not a JWT */ }
  }
}
if (problems.length) { console.error(JSON.stringify(problems)); process.exitCode = 1; }
else console.log(`PASS: ${files.length} source paths reviewed; no private data/key files or known credential signatures.`);
