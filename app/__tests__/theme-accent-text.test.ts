import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(path.resolve(process.cwd(), 'app/app.css'), 'utf8');

function declarations(selector: string): Map<string, string> {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1];
  if (!block) throw new Error(`Missing CSS block for ${selector}`);

  return new Map(
    [...block.matchAll(/(--[\w-]+)\s*:\s*(#[\da-f]{6})\s*;/gi)]
      .map((match) => [match[1], match[2]]),
  );
}

function requireToken(tokens: Map<string, string>, token: string): string {
  const value = tokens.get(token);
  if (!value) throw new Error(`Missing ${token}`);
  return value;
}

describe('global theme accent text colors', () => {
  it.each([
    'dark',
    'light',
    'sunrise',
    'twilight',
    'classic',
    'oceanic',
    'floral',
  ])('uses pure white instead of off-white for %s accent surfaces', (theme) => {
    expect(requireToken(
      declarations(`.theme-${theme}`),
      '--color-accent-text',
    )).toBe('#FFFFFF');
  });

  it.each([
    ['metallic', '#1E1E1E'],
    ['aurora', '#1B1D2C'],
    ['forest', '#122018'],
  ])('preserves dark accent text for %s', (theme, expected) => {
    expect(requireToken(
      declarations(`.theme-${theme}`),
      '--color-accent-text',
    )).toBe(expected);
  });

  it('does not introduce a second button-only accent text token', () => {
    expect(css).not.toContain('--color-button-accent-text');
  });
});
