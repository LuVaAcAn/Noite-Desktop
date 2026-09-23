import { createReadStream } from 'node:fs';
import assert from 'node:assert/strict';

const markers = ['BEGIN PRIVATE KEY', 'BEGIN RSA PRIVATE KEY', 'BEGIN OPENSSH PRIVATE KEY', 'C:\\Users\\', '/home/runner/', '/Users/'];
const patterns = markers.flatMap(value => ['utf8', 'utf16le'].map(encoding => Buffer.from(value, encoding)));
const overlap = Math.max(...patterns.map(value => value.length)) - 1;

async function inspect(chunks) {
  let tail = Buffer.alloc(0);
  for await (const chunk of chunks) {
    const data = Buffer.concat([tail, chunk]);
    if (patterns.some(pattern => data.includes(pattern))) return false;
    tail = Buffer.from(data.subarray(Math.max(0, data.length - overlap)));
  }
  return true;
}

if (process.argv[2] === '--self-test') {
  for (const pattern of patterns) {
    for (let split = 1; split < pattern.length; split++) {
      assert.equal(await inspect([pattern.subarray(0, split), pattern.subarray(split)]), false);
    }
  }
  assert.equal(await inspect([Buffer.from('Noite application artifact')]), true);
  console.log('Artifact scanner tests passed.');
} else {
  const files = process.argv.slice(2);
  if (!files.length) throw new Error('No artifacts supplied for inspection.');
  for (const file of files) {
    if (!await inspect(createReadStream(file))) throw new Error(`Artifact contains a prohibited marker: ${file}`);
  }
  console.log(`Inspected ${files.length} artifacts.`);
}
