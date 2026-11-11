import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir, writeFile, mkdtemp, mkdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {unzipSync, strFromU8} from 'fflate';
import {validateRelease, validateVersion, readVersion} from './version.mjs';

const version = await readVersion();
test('release tags and lockfile versions must agree', () => {
  const pkg = {version: '1.2.3'};
  const lock = {version: '1.2.3', packages: {'': {version: '1.2.3'}}};
  assert.equal(validateRelease('v1.2.3', pkg, lock), '1.2.3');
  for (const tag of ['v.1.2.3', '1.2.3', 'v1.2.4', 'v1.2.3-beta.1']) {
    assert.throws(() => validateRelease(tag, pkg, lock));
  }
  assert.throws(() => validateRelease('v1.2.3', pkg, {...lock, version: '1.2.2'}));
  assert.throws(() => validateRelease('v1.2.3', pkg, {...lock, packages: {'': {version: '1.2.2'}}}));
  for (const invalid of ['01.2.3', '1.2.3-beta', '0.0.0', '65536.0.0', undefined]) assert.throws(() => validateVersion(invalid));
});

test('release ZIPs contain root manifests, browser entrypoints, and verified checksums', async () => {
  const names = ['chrome', 'firefox'].map(browser => `youblock-${browser}-${version}.zip`);
  assert.deepEqual((await readdir('artifacts')).sort(), [...names, 'SHA256SUMS'].sort());
  const sums = await readFile('artifacts/SHA256SUMS', 'utf8');
  let expectedSums = '';
  for (const [index, name] of names.entries()) {
    const data = await readFile(`artifacts/${name}`);
    expectedSums += `${createHash('sha256').update(data).digest('hex')}  ${name}\n`;
    const files = unzipSync(data);
    const manifest = JSON.parse(strFromU8(files['manifest.json']));
    assert.equal(manifest.version, version);
    assert.equal(manifest.manifest_version, 3);
    for (const file of ['popup.html', 'options.html', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'scripts/content.js', 'scripts/page.js', 'scripts/conceal.js', 'assets/icons/128.png']) assert.ok(files[file], `${name} missing ${file}`);
    const background = index === 0 ? manifest.background.service_worker : manifest.background.scripts[0];
    assert.ok(files[background]);
    if (index === 1) assert.equal(manifest.browser_specific_settings.gecko.id, 'youblock@gitfudge0');
    assert.ok(Object.keys(files).every(path => !path.startsWith('/') && !path.split('/').includes('..')));
  }
  assert.equal(sums, expectedSums);
});

test('packaging uses a changed version, removes stale assets, is repeatable, and rejects stale builds', async () => {
  const root = await mkdtemp(join(tmpdir(), 'youblock-package-'));
  const script = resolve('scripts/package.mjs');
  const run = () => execFileSync(process.execPath, [script], {cwd: root, stdio: 'pipe'});
  try {
    await writeFile(join(root, 'package.json'), JSON.stringify({version: '2.3.4'}));
    for (const browser of ['chrome', 'firefox']) {
      await mkdir(join(root, 'dist', browser), {recursive: true});
      await writeFile(join(root, 'dist', browser, 'manifest.json'), JSON.stringify({version: '2.3.4'}));
    }
    await mkdir(join(root, 'artifacts'));
    await writeFile(join(root, 'artifacts', 'old.zip'), 'stale');
    run();
    assert.deepEqual((await readdir(join(root, 'artifacts'))).sort(), ['SHA256SUMS', 'youblock-chrome-2.3.4.zip', 'youblock-firefox-2.3.4.zip']);
    const sums = await readFile(join(root, 'artifacts', 'SHA256SUMS'), 'utf8');
    run();
    assert.equal(await readFile(join(root, 'artifacts', 'SHA256SUMS'), 'utf8'), sums);
    const archive = unzipSync(await readFile(join(root, 'artifacts', 'youblock-chrome-2.3.4.zip')));
    assert.equal(JSON.parse(strFromU8(archive['manifest.json'])).version, '2.3.4');
    await writeFile(join(root, 'dist', 'firefox', 'manifest.json'), JSON.stringify({version: '1.0.0'}));
    assert.throws(run, /build version differs/);
    assert.equal(await readFile(join(root, 'artifacts', 'SHA256SUMS'), 'utf8'), sums);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
