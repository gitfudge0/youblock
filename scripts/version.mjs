import {readFile} from 'node:fs/promises';

export function validateVersion(version) {
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error('Version must be a stable X.Y.Z version without leading zeros');
  }
  const parts = version.split('.').map(Number);
  if (parts.some(part => part > 65535) || parts.every(part => part === 0)) {
    throw new Error('Version must fit browser manifest limits (0–65535 per component, not all zero)');
  }
  return version;
}

export async function readVersion(root = '.') {
  const pkg = JSON.parse(await readFile(`${root}/package.json`, 'utf8'));
  return validateVersion(pkg.version);
}

export function validateRelease(tag, pkg, lock) {
  const version = validateVersion(pkg.version);
  if (tag !== `v${version}`) throw new Error(`Release tag must be v${version}; received ${tag}`);
  if (lock.version !== version || lock.packages?.['']?.version !== version) {
    throw new Error('package-lock.json versions must match package.json');
  }
  return version;
}
