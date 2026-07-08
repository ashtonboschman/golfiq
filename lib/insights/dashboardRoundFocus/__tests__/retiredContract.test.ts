import { existsSync, readFileSync, readdirSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SOURCE_ROOTS = ['app', 'components', 'lib'];
const RETIRED_SHADOW_FIELD = ['round', 'Focus', 'V2'].join('');
const RETIRED_MODULE = ['dashboard', 'Focus'].join('');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.(ts|tsx)$/.test(entry.name) ? [absolute] : [];
  });
}

describe('Dashboard Round Focus retired contract cleanup', () => {
  it('has no temporary field or retired engine module remaining in source', () => {
    const files = SOURCE_ROOTS.flatMap((directory) => sourceFiles(path.join(ROOT, directory)));
    const offenders = files.filter((file) => readFileSync(file, 'utf8').includes(RETIRED_SHADOW_FIELD));

    expect(offenders).toEqual([]);
    expect(existsSync(path.join(ROOT, 'lib', 'insights', `${RETIRED_MODULE}.ts`))).toBe(false);
  });
});
