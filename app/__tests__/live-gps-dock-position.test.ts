import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(path.resolve(process.cwd(), 'app/app.css'), 'utf8');

function declarations(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1];
  if (!block) throw new Error(`Missing CSS block for ${selector}`);

  return block;
}

function property(block: string, name: string): string {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const value = block.match(new RegExp(`${escapedName}\\s*:\\s*([^;]+);`))?.[1];
  if (!value) throw new Error(`Missing ${name}`);

  return value.trim();
}

describe('immersive GPS dock vertical position', () => {
  it('anchors the map and score-sheet docks to the same bottom token', () => {
    expect(property(declarations('.live-round-score-sheet'), 'bottom')).toBe('0');
    expect(property(declarations('.live-round-gps-controls'), 'bottom')).toBe(
      'var(--live-round-gps-dock-bottom)',
    );
    expect(property(declarations('.live-round-score-sheet-dock'), 'margin-bottom')).toBe(
      'var(--live-round-gps-dock-bottom)',
    );
  });

  it('keeps both modes on the shared fixed-height dock', () => {
    expect(property(declarations('.gps-hole-dock'), 'min-height')).toBe(
      'var(--live-round-gps-dock-height, 60px)',
    );
    expect(property(declarations('.live-round-score-sheet-dock'), 'flex')).toBe('0 0 auto');
  });

  it('removes the score-sheet transform after opening to avoid subpixel text drift', () => {
    const openSheet = declarations('.live-round-score-sheet.is-open');

    expect(property(openSheet, 'transform')).toBe('none');
    expect(property(openSheet, 'will-change')).toBe('auto');
  });
});
