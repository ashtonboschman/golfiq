import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const repoRoot = process.cwd();
const npmCli = process.env.npm_execpath;
const eslintBin = join(repoRoot, 'node_modules', 'eslint', 'bin', 'eslint.js');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(`[verify:fast] Unable to run ${command}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) process.exit(result.status ?? 1);
}

function runNpm(args) {
  if (!npmCli) {
    console.error('[verify:fast] npm_execpath is unavailable; run this helper through npm run verify:fast.');
    process.exit(1);
  }

  run(process.execPath, [npmCli, ...args]);
}

function gitOutput(args) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function gitFiles(args) {
  const result = spawnSync('git', [...args, '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  if (result.status !== 0) return null;
  return result.stdout.split('\0').filter(Boolean).map((file) => file.replaceAll('\\', '/'));
}

function resolvePrimaryRef() {
  const remoteHead = gitOutput([
    'symbolic-ref',
    '--quiet',
    '--short',
    'refs/remotes/origin/HEAD',
  ]);
  const candidates = [remoteHead, 'origin/main', 'main', 'origin/master', 'master'].filter(Boolean);

  for (const candidate of candidates) {
    if (gitOutput(['rev-parse', '--verify', '--quiet', `${candidate}^{commit}`])) {
      return candidate;
    }
  }

  return null;
}

function collectChangedFiles() {
  const primaryRef = resolvePrimaryRef();
  let committed = [];
  let comparison = 'working tree only';
  const fallbackReasons = [];

  if (primaryRef) {
    const mergeBase = gitOutput(['merge-base', 'HEAD', primaryRef]);
    if (mergeBase) {
      const branchFiles = gitFiles([
        'diff',
        '--name-only',
        '--diff-filter=ACMRD',
        `${mergeBase}...HEAD`,
      ]);
      if (branchFiles === null) {
        fallbackReasons.push(`unable to compare HEAD with ${primaryRef}`);
      } else {
        committed = branchFiles;
        comparison = `${mergeBase.slice(0, 12)}...HEAD (${primaryRef} merge base)`;
      }
    } else {
      fallbackReasons.push(`unable to resolve a merge base with ${primaryRef}`);
    }
  } else {
    fallbackReasons.push('no primary branch reference is available');
  }

  const staged = gitFiles(['diff', '--cached', '--name-only', '--diff-filter=ACMRD']);
  const unstaged = gitFiles(['diff', '--name-only', '--diff-filter=ACMRD']);
  const untracked = gitFiles(['ls-files', '--others', '--exclude-standard']);

  if (staged === null || unstaged === null || untracked === null) {
    fallbackReasons.push('unable to inspect staged, unstaged, or untracked files');
  }

  return {
    files: [...new Set([
      ...committed,
      ...(staged ?? []),
      ...(unstaged ?? []),
      ...(untracked ?? []),
    ])].sort(),
    comparison,
    fallbackReasons,
  };
}

const lintablePattern = /\.(?:c|m)?(?:j|t)sx?$/i;
const documentationPattern = /(?:^|\/)(?:AGENTS\.md|README(?:\.[^/]*)?|[^/]+\.md|[^/]+\.txt)$/i;
const broadPatterns = [
  /(?:^|\/)package(?:-lock)?\.json$/,
  /(?:^|\/)jest(?:\.[^/]*)?\.config\.[^/]+$/,
  /(?:^|\/)tsconfig(?:\.[^/]*)?\.json$/,
  /(?:^|\/)eslint\.config\.[^/]+$/,
  /(?:^|\/)\.eslintrc(?:\.[^/]*)?$/,
  /(?:^|\/)next\.config\.[^/]+$/,
  /(?:^|\/)prisma\.config\.[^/]+$/,
  /^prisma\/schema\.prisma$/,
  /^prisma\/migrations\//,
  /^scripts\/verify-fast\.mjs$/,
  /^\.github\/workflows\//,
  /^\.nvmrc$/,
];

const changeSet = collectChangedFiles();
const fallbackReasons = [...changeSet.fallbackReasons];

for (const file of changeSet.files) {
  if (broadPatterns.some((pattern) => pattern.test(file))) {
    fallbackReasons.push(`repository-wide configuration changed: ${file}`);
    continue;
  }

  if (!existsSync(join(repoRoot, file))) {
    fallbackReasons.push(`changed file was deleted or is unavailable: ${file}`);
    continue;
  }

  if (!lintablePattern.test(file) && !documentationPattern.test(file)) {
    fallbackReasons.push(`change cannot be safely bounded: ${file}`);
  }
}

const lintableFiles = changeSet.files.filter(
  (file) => lintablePattern.test(file) && existsSync(join(repoRoot, file)),
);

if (lintableFiles.length > 100) {
  fallbackReasons.push(`too many changed source files for a targeted check (${lintableFiles.length})`);
}

console.log(`[verify:fast] Comparison: ${changeSet.comparison}`);
console.log(`[verify:fast] Changed files: ${changeSet.files.length}`);

runNpm(['run', 'typecheck']);

if (fallbackReasons.length > 0) {
  console.log('[verify:fast] Running broad fallback checks:');
  for (const reason of [...new Set(fallbackReasons)]) console.log(`  - ${reason}`);
  runNpm(['run', 'lint']);
  runNpm(['run', 'test:ci']);
  process.exit(0);
}

if (lintableFiles.length === 0) {
  console.log('[verify:fast] No changed JavaScript or TypeScript files require targeted checks.');
  process.exit(0);
}

console.log(`[verify:fast] Linting ${lintableFiles.length} changed source file(s).`);
run(process.execPath, [eslintBin, ...lintableFiles]);

console.log('[verify:fast] Running related Jest tests.');
runNpm(['run', 'test:related', '--', ...lintableFiles]);
