import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

interface ReleaseAssetExpectation {
  platform: string;
  filename: string;
}

interface PackageJson {
  version: string;
}

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, '..', '..', '..', '..');
const version = (JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf-8')) as PackageJson).version;

function extractDownloadExpectations(readmePath: string): ReleaseAssetExpectation[] {
  const markdown = readFileSync(readmePath, 'utf-8');
  const tableRows = markdown
    .split('\n')
    .map((line) => line.trim().match(/^\| \*\*([^*]+)\*\* \| `([^`]+)` \|$/))
    .filter((match): match is RegExpMatchArray => match !== null);

  return tableRows.map((match) => ({
    platform: match[1],
    filename: match[2],
  }));
}

test.describe('README release download filenames', () => {
  test('documents expected Windows, macOS, and Linux release assets', () => {
    const expectations = extractDownloadExpectations(resolve(repoRoot, 'README.md'));

    expect(expectations).toEqual([
      { platform: 'Windows', filename: `UniPet.Setup.${version}.exe` },
      { platform: 'macOS', filename: `UniPet-${version}-arm64.dmg` },
      { platform: 'Linux', filename: `UniPet-${version}.AppImage` },
    ]);
  });
});
