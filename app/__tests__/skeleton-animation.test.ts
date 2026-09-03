import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(path.resolve(process.cwd(), 'app/app.css'), 'utf8');

function cssBlock(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = css.match(new RegExp(`^\\s*${escapedSelector}\\s*\\{([^}]*)\\}`, 'm'))?.[1];
  if (!block) throw new Error(`Missing CSS block for ${selector}`);
  return block;
}

describe('global skeleton loading animation', () => {
  it('applies the dashboard shimmer to every shared skeleton', () => {
    expect(cssBlock('.skeleton')).toMatch(
      /animation:\s*skeleton-base-shimmer\s+2\.6s\s+linear\s+infinite/,
    );
    expect(cssBlock('.skeleton::after')).toMatch(
      /animation:\s*skeleton-shimmer\s+2s\s+linear\s+infinite/,
    );
  });

  it('keeps both global shimmer keyframes available', () => {
    expect(css).toContain('@keyframes skeleton-base-shimmer');
    expect(css).toContain('@keyframes skeleton-shimmer');
  });
});
