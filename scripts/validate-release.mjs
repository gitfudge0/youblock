import {readFile} from 'node:fs/promises';
import {validateRelease} from './version.mjs';
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const version = validateRelease(process.argv[2] ?? process.env.GITHUB_REF_NAME, pkg, lock);
console.log(`Validated release v${version}`);
