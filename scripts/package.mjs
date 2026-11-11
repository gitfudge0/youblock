import {zipSync} from 'fflate';
import {readdir, readFile, writeFile, mkdir, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readVersion} from './version.mjs';

async function entries(path, prefix = '') {
  const result = {};
  for (const entry of (await readdir(path, {withFileTypes: true})).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) Object.assign(result, await entries(`${path}/${entry.name}`, `${name}/`));
    else result[name] = new Uint8Array(await readFile(`${path}/${entry.name}`));
  }
  return result;
}

const version = await readVersion();
// Validate both builds before replacing the previous output.
const archives = [];
for (const browser of ['chrome', 'firefox']) {
  const files = await entries(`dist/${browser}`);
  const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
  if (manifest.version !== version) throw new Error(`${browser} build version differs from package.json; rebuild first`);
  archives.push({name: `youblock-${browser}-${version}.zip`, data: zipSync(files, {level: 9, mtime: new Date('2020-01-01T00:00:00Z')})});
}
await rm('artifacts', {recursive: true, force: true});
await mkdir('artifacts', {recursive: true});
const sums = [];
for (const {name, data} of archives) {
  await writeFile(`artifacts/${name}`, data);
  sums.push(`${createHash('sha256').update(data).digest('hex')}  ${name}`);
}
await writeFile('artifacts/SHA256SUMS', `${sums.join('\n')}\n`);
console.log(sums.join('\n'));
