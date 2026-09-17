import type { RoundShareData } from './shareData';
import { getScoreResultKind } from './scoreResult';

export const SHARE_IMAGE_WIDTH = 1080;
export const SHARE_IMAGE_HEIGHT = 1350;
export const ROUND_SHARE_RENDER_VERSION = 49;

// Fixed export coordinates keep the PNG deterministic across screen sizes. Visual
// values are read from the same app.css tokens used by the round stats page.
const fallbackColors = { background: '#0F131A', surface: '#171C26', secondarySurface: '#1E242F', text: '#EDEFF2', muted: '#9AA3B2', blue: '#2D6CFF', green: '#28A065', red: '#E74C3C', border: '#2A313D', black: '#000000', gray: '#888888', white: '#EDEFF2', yellow: '#FACB10', gold: '#DFBD00' };
// The modal's desktop content box is 460 CSS px. Scaling app.css values from that
// reference width keeps a 10px token visually equal to 10px in the preview.
const SHARE_CARD_CSS_WIDTH = 460;
const SHARE_EXPORT_SCALE = SHARE_IMAGE_WIDTH / SHARE_CARD_CSS_WIDTH;
const SCORE_RESULT_EXPORT_SCALE = 2;

function cssToken(styles: CSSStyleDeclaration, name: string, fallback: string) {
  return styles.getPropertyValue(name).trim() || fallback;
}

function cssPixelValue(styles: CSSStyleDeclaration, name: string, fallback: number) {
  const raw = styles.getPropertyValue(name).trim();
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const rootFontSize = Number.parseFloat(styles.fontSize) || 16;
  return raw.endsWith('rem') ? parsed * rootFontSize : parsed;
}

function cssPixelToken(styles: CSSStyleDeclaration, name: string, fallback: number) {
  return cssPixelValue(styles, name, fallback) * SHARE_EXPORT_SCALE;
}

export async function renderShareImage(data: RoundShareData): Promise<Blob> {
  await document.fonts.ready;
  const rootStyles = getComputedStyle(document.documentElement);
  const bodyFont = cssToken(rootStyles, '--font-inter', 'Inter');
  const headingFont = cssToken(rootStyles, '--font-space-grotesk', '"Space Grotesk"');
  const colors = {
    background: cssToken(rootStyles, '--color-primary-bg', fallbackColors.background),
    surface: cssToken(rootStyles, '--color-primary-surface', fallbackColors.surface),
    secondarySurface: cssToken(rootStyles, '--color-secondary-surface', fallbackColors.secondarySurface),
    text: cssToken(rootStyles, '--color-primary-text', fallbackColors.text),
    muted: cssToken(rootStyles, '--color-secondary-text', fallbackColors.muted),
    blue: cssToken(rootStyles, '--color-accent', fallbackColors.blue),
    green: cssToken(rootStyles, '--color-green', fallbackColors.green),
    red: cssToken(rootStyles, '--color-red', fallbackColors.red),
    border: cssToken(rootStyles, '--color-border', fallbackColors.border),
    black: cssToken(rootStyles, '--color-black', fallbackColors.black),
    gray: cssToken(rootStyles, '--color-gray', fallbackColors.gray),
    white: cssToken(rootStyles, '--color-white-text', fallbackColors.white),
    yellow: cssToken(rootStyles, '--color-yellow', fallbackColors.yellow),
    gold: cssToken(rootStyles, '--color-gold', fallbackColors.gold),
  };
  const spacing = {
    small: cssPixelToken(rootStyles, '--gap-small', 5),
    gap: cssPixelToken(rootStyles, '--gap', 10),
    padding: cssPixelToken(rootStyles, '--padding', 10),
    paddingSmall: cssPixelToken(rootStyles, '--padding-small', 5),
    radius: cssPixelToken(rootStyles, '--border-radius', 8),
  };
  const baseFontSize = cssPixelValue(rootStyles, '--font-base', 16);
  const typography = {
    course: baseFontSize * 1.4 * SHARE_EXPORT_SCALE,
    name: baseFontSize * 0.9 * SHARE_EXPORT_SCALE,
    subtitle: baseFontSize * 0.9 * SHARE_EXPORT_SCALE,
    calendarIcon: 14 * SHARE_EXPORT_SCALE,
  };
  const scoreResult = {
    size: cssPixelValue(rootStyles, '--score-result-size', 18) * SCORE_RESULT_EXPORT_SCALE,
    outlineSize: cssPixelValue(rootStyles, '--score-result-outline-size', 24) * SCORE_RESULT_EXPORT_SCALE,
    borderWidth: cssPixelValue(rootStyles, '--score-result-border-width', 1) * SCORE_RESULT_EXPORT_SCALE,
    squareRadius: cssPixelValue(rootStyles, '--score-result-square-radius', 2) * SCORE_RESULT_EXPORT_SCALE,
    fontSize: cssPixelValue(rootStyles, '--score-result-font-size', 12.48) * SCORE_RESULT_EXPORT_SCALE,
    valueOffset: cssPixelValue(rootStyles, '--score-result-value-offset', 0.5) * SCORE_RESULT_EXPORT_SCALE,
  };
  const scorecardLayout = {
    rowHeight: scoreResult.outlineSize + scoreResult.borderWidth * 2 + spacing.paddingSmall * 2 + spacing.small - 7,
  };
  const scorecardBandHeight = scorecardLayout.rowHeight * 4;
  const scorecardStepY = scorecardBandHeight + spacing.small;
  const contentX = spacing.padding;
  const contentWidth = SHARE_IMAGE_WIDTH - contentX * 2;
  const logo = new Image();
  const activeAppLogo = Array.from(document.querySelectorAll<HTMLImageElement>('.header .logo'))
    .find(element => getComputedStyle(element).display !== 'none');
  logo.src = activeAppLogo?.currentSrc || activeAppLogo?.src || '/logos/wordmark/golfiq-wordmark.png';
  await logo.decode();
  const canvas = document.createElement('canvas');
  canvas.width = SHARE_IMAGE_WIDTH;
  canvas.height = SHARE_IMAGE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image rendering is unavailable.');
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.textBaseline = 'top';

  const text = (value: string, x: number, y: number, size: number, color = colors.text, weight = 500, family: 'body' | 'heading' = 'body') => {
    ctx.font = `${weight} ${size}px ${family === 'heading' ? headingFont : bodyFont}`;
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
  };
  const rightText = (value: string, rightX: number, y: number, size: number, color = colors.text, weight = 500, family: 'body' | 'heading' = 'body') => {
    ctx.font = `${weight} ${size}px ${family === 'heading' ? headingFont : bodyFont}`;
    ctx.fillStyle = color;
    ctx.fillText(value, rightX - ctx.measureText(value).width, y);
  };
  const centeredMiddleText = (value: string, centerX: number, centerY: number, size: number, color = colors.text, weight = 500, family: 'body' | 'heading' = 'body', offsetY = 0) => {
    ctx.save();
    ctx.font = `${weight} ${size}px ${family === 'heading' ? headingFont : bodyFont}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(value, Math.round(centerX), Math.round(centerY + offsetY));
    ctx.restore();
  };
  const bottomAlignedText = (value: string, x: number, bottomY: number, size: number, color = colors.text, weight = 500, align: CanvasTextAlign = 'left', family: 'body' | 'heading' = 'body') => {
    ctx.save();
    ctx.font = `${weight} ${size}px ${family === 'heading' ? headingFont : bodyFont}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, Math.round(x), Math.round(bottomY));
    ctx.restore();
  };
  const drawScoreGroup = (
    score: string,
    relativeToPar: string | null,
    rightX: number,
    visibleBottomY: number,
    minimumTopY: number,
  ) => {
    const scoreSize = 140;
    const relativeToParSize = 64;
    const rasterizeText = (value: string, size: number, color: string) => {
      const padding = Math.ceil(size * 0.25);
      const source = document.createElement('canvas');
      const measureContext = source.getContext('2d');
      if (!measureContext) throw new Error('Score rendering is unavailable.');
      measureContext.font = `700 ${size}px ${headingFont}`;
      const measuredWidth = Math.ceil(measureContext.measureText(value).width);
      source.width = measuredWidth + padding * 2;
      source.height = Math.ceil(size * 1.5) + padding * 2;
      const sourceContext = source.getContext('2d');
      if (!sourceContext) throw new Error('Score rendering is unavailable.');
      sourceContext.font = `700 ${size}px ${headingFont}`;
      sourceContext.fillStyle = color;
      sourceContext.textBaseline = 'alphabetic';
      sourceContext.fillText(value, padding, padding + size);

      const pixels = sourceContext.getImageData(0, 0, source.width, source.height).data;
      let minX = source.width;
      let minY = source.height;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < source.height; y += 1) {
        for (let x = 0; x < source.width; x += 1) {
          if (pixels[(y * source.width + x) * 4 + 3] === 0) continue;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
      if (maxX < minX || maxY < minY) throw new Error('Score text could not be rendered.');

      const glyph = document.createElement('canvas');
      glyph.width = maxX - minX + 1;
      glyph.height = maxY - minY + 1;
      const glyphContext = glyph.getContext('2d');
      if (!glyphContext) throw new Error('Score rendering is unavailable.');
      glyphContext.drawImage(source, minX, minY, glyph.width, glyph.height, 0, 0, glyph.width, glyph.height);
      return glyph;
    };
    const scoreGlyph = rasterizeText(score, scoreSize, colors.text);
    const relativeToParGlyph = relativeToPar ? rasterizeText(relativeToPar, relativeToParSize, colors.blue) : null;
    const itemGap = relativeToPar ? spacing.small : 0;
    const groupWidth = scoreGlyph.width + itemGap + (relativeToParGlyph?.width ?? 0);
    const groupCanvas = document.createElement('canvas');
    groupCanvas.width = Math.ceil(groupWidth);
    groupCanvas.height = scoreSize;
    const groupContext = groupCanvas.getContext('2d');
    if (!groupContext) throw new Error('Score rendering is unavailable.');
    const tallestGlyph = Math.max(scoreGlyph.height, relativeToParGlyph?.height ?? 0);
    const sharedPixelBottom = Math.round((groupCanvas.height + tallestGlyph) / 2);

    // Compose actual rendered pixels instead of relying on browser font metrics.
    // The last non-transparent pixel of both values lands on the same row.
    groupContext.drawImage(scoreGlyph, 0, sharedPixelBottom - scoreGlyph.height);
    if (relativeToParGlyph) {
      groupContext.drawImage(
        relativeToParGlyph,
        scoreGlyph.width + itemGap,
        sharedPixelBottom - relativeToParGlyph.height,
      );
    }
    const groupTop = Math.max(visibleBottomY - sharedPixelBottom, minimumTopY);
    ctx.drawImage(groupCanvas, Math.round(rightX - groupCanvas.width), Math.round(groupTop));

    return {
      layoutBottom: groupTop + sharedPixelBottom,
      width: groupCanvas.width,
      height: groupCanvas.height,
    };
  };
  const metadataPills = (values: Array<{ value: string; kind: 'neutral' | 'tee' | 'context' }>, y: number) => {
    const statsPillContainer = document.querySelector<HTMLElement>('.stats-holes-tees-container');
    const containerStyles = statsPillContainer ? getComputedStyle(statsPillContainer) : null;
    const pillGap = (Number.parseFloat(containerStyles?.columnGap || containerStyles?.gap || '') || 5) * SHARE_EXPORT_SCALE;
    const normalizedText = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim().toUpperCase() ?? '';
    const classNameFor = (kind: 'neutral' | 'tee' | 'context', value: string) => {
      if (kind === 'neutral') return 'round-holes-tag';
      if (kind === 'tee') return `tee-tag tee-${value.toLowerCase()}`;
      return `round-context-tag round-context-${value.toLowerCase()}`;
    };
    const selectorFor = (kind: 'neutral' | 'tee' | 'context') => {
      if (kind === 'neutral') return '.round-holes-tag';
      if (kind === 'tee') return '.tee-tag';
      return '.round-context-tag';
    };
    const readPill = (kind: 'neutral' | 'tee' | 'context', value: string) => {
      const candidates = Array.from(statsPillContainer?.querySelectorAll<HTMLElement>(selectorFor(kind)) ?? []);
      let element = candidates.find(candidate => normalizedText(candidate.textContent) === normalizedText(value)) ?? candidates[0];
      let probe: HTMLParagraphElement | null = null;
      if (!element) {
        probe = document.createElement('p');
        probe.className = classNameFor(kind, value);
        probe.textContent = value;
        probe.style.position = 'fixed';
        probe.style.left = '-10000px';
        probe.style.top = '0';
        probe.style.visibility = 'hidden';
        document.body.appendChild(probe);
        element = probe;
      }
      const styles = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      const fontSize = Number.parseFloat(styles.fontSize) || baseFontSize * 0.75;
      const borderTop = Number.parseFloat(styles.borderTopWidth) || 0;
      const borderBottom = Number.parseFloat(styles.borderBottomWidth) || 0;
      const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
      const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
      const contentHeight = Math.max(bounds.height - borderTop - borderBottom - paddingTop - paddingBottom, fontSize);
      const lineHeight = styles.lineHeight === 'normal'
        ? contentHeight
        : Number.parseFloat(styles.lineHeight) || contentHeight;
      const result = {
        width: bounds.width * SHARE_EXPORT_SCALE,
        height: bounds.height * SHARE_EXPORT_SCALE,
        fontSize: fontSize * SHARE_EXPORT_SCALE,
        fontFamily: bodyFont,
        fontWeight: styles.fontWeight || '700',
        letterSpacing: styles.letterSpacing,
        lineHeight: lineHeight * SHARE_EXPORT_SCALE,
        paddingTop: paddingTop * SHARE_EXPORT_SCALE,
        paddingBottom: paddingBottom * SHARE_EXPORT_SCALE,
        borderTop: borderTop * SHARE_EXPORT_SCALE,
        borderBottom: borderBottom * SHARE_EXPORT_SCALE,
        borderWidth: (Number.parseFloat(styles.borderLeftWidth) || 0) * SHARE_EXPORT_SCALE,
        borderColor: styles.borderLeftColor,
        radius: (Number.parseFloat(styles.borderRadius) || 0) * SHARE_EXPORT_SCALE,
        background: styles.backgroundColor,
        color: styles.color,
        opacity: Number.parseFloat(styles.opacity) || 1,
      };
      probe?.remove();
      return result;
    };
    const pills = values.map(({ value, kind }) => ({ value, metrics: readPill(kind, value) }));
    let x = contentX;
    pills.forEach(({ value, metrics }) => {
      ctx.save();
      ctx.globalAlpha = metrics.opacity;
      ctx.fillStyle = metrics.background;
      ctx.beginPath();
      ctx.roundRect(x, y, metrics.width, metrics.height, metrics.radius);
      ctx.fill();
      if (metrics.borderWidth > 0) {
        ctx.strokeStyle = metrics.borderColor;
        ctx.lineWidth = metrics.borderWidth;
        ctx.stroke();
      }
      ctx.font = `${metrics.fontWeight} ${metrics.fontSize}px ${metrics.fontFamily}`;
      ctx.fillStyle = metrics.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      if ('letterSpacing' in ctx && metrics.letterSpacing !== 'normal') {
        ctx.letterSpacing = metrics.letterSpacing;
      }
      const textMetrics = ctx.measureText(value);
      const ascent = textMetrics.fontBoundingBoxAscent || textMetrics.actualBoundingBoxAscent;
      const descent = textMetrics.fontBoundingBoxDescent || textMetrics.actualBoundingBoxDescent;
      const contentTop = y + metrics.borderTop + metrics.paddingTop;
      const contentHeight = metrics.height - metrics.borderTop - metrics.borderBottom - metrics.paddingTop - metrics.paddingBottom;
      const lineTop = contentTop + (contentHeight - metrics.lineHeight) / 2;
      const baseline = lineTop + (metrics.lineHeight - ascent - descent) / 2 + ascent;
      ctx.fillText(value, Math.round(x + metrics.width / 2), Math.round(baseline));
      ctx.restore();
      x += metrics.width + pillGap;
    });
    return Math.max(...pills.map(pill => pill.metrics.height), 0);
  };
  const calendarIcon = (x: number, y: number) => {
    const size = typography.calendarIcon;
    const iconScale = size / 24;
    const point = (value: number) => value * iconScale;
    ctx.save();
    ctx.strokeStyle = colors.muted;
    ctx.lineWidth = point(2);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // CalendarDays from Lucide, matching the round stats header icon.
    ctx.beginPath();
    ctx.moveTo(x + point(8), y + point(2));
    ctx.lineTo(x + point(8), y + point(6));
    ctx.moveTo(x + point(16), y + point(2));
    ctx.lineTo(x + point(16), y + point(6));
    ctx.roundRect(x + point(3), y + point(4), point(18), point(18), point(2));
    ctx.moveTo(x + point(3), y + point(10));
    ctx.lineTo(x + point(21), y + point(10));
    for (const [dotX, dotY] of [[8, 14], [12, 14], [16, 14], [8, 18], [12, 18], [16, 18]]) {
      ctx.moveTo(x + point(dotX), y + point(dotY));
      ctx.lineTo(x + point(dotX + 0.01), y + point(dotY));
    }
    ctx.stroke();
    ctx.restore();
    return size;
  };
  const lines = (value: string, width: number): string[] => {
    const result: string[] = [];
    let line = '';
    // Character wrapping also handles unbroken long course names.
    for (const word of value.split(' ')) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= width) { line = candidate; continue; }
      if (line) result.push(line);
      line = '';
      for (const char of word) {
        if (ctx.measureText(line + char).width > width && line) { result.push(line); line = ''; }
        line += char;
      }
    }
    if (line) result.push(line);
    return result;
  };
  const paragraph = (value: string, x: number, y: number, width: number, initialSize: number, maxLines: number, family: 'body' | 'heading' = 'body', weight = 500) => {
    let size = initialSize;
    let wrapped: string[];
    do {
      ctx.font = `${weight} ${size}px ${family === 'heading' ? headingFont : bodyFont}`;
      wrapped = lines(value, width);
      if (wrapped.length <= maxLines) break;
      size -= 1;
    } while (size > 20);
    wrapped.forEach((line, index) => text(line, x, y + index * size * 1.25, size, colors.text, weight, family));
    return {
      bottom: y + (wrapped.length - 1) * size * 1.25 + size,
      lineCount: wrapped.length,
      size,
    };
  };
  const scoreMark = (score: number, scoreToPar: number, centerX: number, centerY: number) => {
    const kind = getScoreResultKind(scoreToPar);
    const drawCircle = (contentSize: number) => {
      const pathRadius = (contentSize + scoreResult.borderWidth) / 2;
      ctx.beginPath();
      ctx.arc(Math.round(centerX), Math.round(centerY), pathRadius, 0, Math.PI * 2);
      ctx.stroke();
    };
    const drawSquare = (contentSize: number) => {
      const pathSize = contentSize + scoreResult.borderWidth;
      ctx.beginPath();
      ctx.roundRect(Math.round(centerX) - pathSize / 2, Math.round(centerY) - pathSize / 2, pathSize, pathSize, scoreResult.squareRadius);
      ctx.stroke();
    };
    ctx.lineWidth = scoreResult.borderWidth;
    if (kind === 'birdie' || kind === 'eagle-plus') {
      ctx.strokeStyle = colors.green;
      if (kind === 'eagle-plus') drawCircle(scoreResult.size);
      drawCircle(scoreResult.outlineSize);
    } else if (kind === 'bogey' || kind === 'double-plus') {
      ctx.strokeStyle = colors.red;
      if (kind === 'double-plus') drawSquare(scoreResult.size);
      drawSquare(scoreResult.outlineSize);
    }
    centeredMiddleText(String(score), centerX, centerY, scoreResult.fontSize, colors.text, 600, 'body', scoreResult.valueOffset);
  };
  const scorecardBand = (band: NonNullable<RoundShareData['scorecard']>[number], y: number) => {
    const x = contentX;
    const width = contentWidth;
    const height = scorecardBandHeight;
    const cellWidth = width / 10;
    ctx.fillStyle = colors.surface;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, spacing.radius);
    ctx.fill();
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = scoreResult.borderWidth;
    for (const rowOffset of [scorecardLayout.rowHeight, scorecardLayout.rowHeight * 2, scorecardLayout.rowHeight * 3]) {
      const rowY = Math.round(y + rowOffset);
      ctx.beginPath(); ctx.moveTo(x, rowY); ctx.lineTo(x + width, rowY); ctx.stroke();
    }
    for (let index = 1; index < 10; index += 1) {
      const lineX = Math.round(x + index * cellWidth);
      ctx.beginPath(); ctx.moveTo(lineX, y); ctx.lineTo(lineX, y + height); ctx.stroke();
    }
    const rowCenter = (row: number) => y + scorecardLayout.rowHeight * row + scorecardLayout.rowHeight / 2;
    band.holes.forEach((hole, index) => {
      const centerX = x + cellWidth * index + cellWidth / 2;
      centeredMiddleText(String(hole.holeNumber), centerX, rowCenter(0), scoreResult.fontSize, colors.muted, 600, 'body');
      if (hole.yardage != null) centeredMiddleText(String(hole.yardage), centerX, rowCenter(1), scoreResult.fontSize, colors.muted, 500, 'body');
      centeredMiddleText(String(hole.par), centerX, rowCenter(2), scoreResult.fontSize, colors.muted, 600, 'body');
      scoreMark(hole.score, hole.scoreToPar, centerX, rowCenter(3));
    });
    const totalCenterX = x + cellWidth * 9 + cellWidth / 2;
    centeredMiddleText(band.totalLabel, totalCenterX, rowCenter(0), scoreResult.fontSize, colors.muted, 700, 'body');
    if (band.yardageTotal != null) centeredMiddleText(String(band.yardageTotal), totalCenterX, rowCenter(1), scoreResult.fontSize, colors.muted, 700, 'body');
    centeredMiddleText(String(band.parTotal), totalCenterX, rowCenter(2), scoreResult.fontSize, colors.muted, 700, 'body');
    centeredMiddleText(String(band.scoreTotal), totalCenterX, rowCenter(3), scoreResult.fontSize, colors.text, 700, 'body');
  };

  const metricLabelLines = (label: string) => label === 'GREENSIDE BUNKER' ? ['GREENSIDE', 'BUNKER'] : [label];
  const metricRowHeight = (items: Array<{ label: string }>, valueSize: number, labelSize: number) => {
    const maxLabelLines = Math.max(...items.map(item => metricLabelLines(item.label).length), 1);
    return valueSize + spacing.small + labelSize * maxLabelLines;
  };
  const metricRow = (
    items: Array<{ label: string; value: string; color?: string }>,
    y: number,
    valueSize: number,
    labelSize: number,
  ) => {
    if (items.length === 0) return y;
    const columnWidth = contentWidth / items.length;
    items.forEach((item, index) => {
      const centerX = contentX + columnWidth * index + columnWidth / 2;
      centeredMiddleText(item.value, centerX, y + valueSize / 2, valueSize, item.color ?? colors.text, 700, 'heading');
      const labelLines = metricLabelLines(item.label);
      labelLines.forEach((line, lineIndex) => {
        centeredMiddleText(line, centerX, y + valueSize + spacing.small + labelSize / 2 + lineIndex * labelSize, labelSize, colors.muted, 600);
      });
    });
    return y + metricRowHeight(items, valueSize, labelSize);
  };

  const logoWidth = 280;
  const logoHeight = logoWidth * logo.naturalHeight / logo.naturalWidth;
  const headerTopY = 40;
  const logoX = contentX + contentWidth - logoWidth;
  ctx.drawImage(logo, logoX, headerTopY, logoWidth, logoHeight);
  const detailWidth = logoX - contentX - spacing.gap;
  const golferNameY = headerTopY;
  const golferNameSize = typography.name;
  if (data.golferName) text(data.golferName, contentX, golferNameY, golferNameSize, colors.muted, 600);
  let headerStackY = data.golferName ? golferNameY + golferNameSize + spacing.small : golferNameY;
  const courseY = headerStackY;
  const courseLayout = paragraph(data.course, contentX, courseY, detailWidth, typography.course, 2, 'heading', 700);
  headerStackY = courseLayout.bottom;
  const dateY = data.date ? headerStackY + spacing.small : headerStackY;
  if (data.date) {
    const iconWidth = calendarIcon(contentX, dateY);
    text(data.date, contentX + iconWidth + spacing.small, dateY, typography.subtitle, colors.muted, 500);
    headerStackY = dateY + Math.max(typography.calendarIcon, typography.subtitle);
  }
  const metadataY = headerStackY + spacing.small;
  const metadataHeight = metadataPills([
    { value: data.metadata.holes, kind: 'neutral' },
    ...(data.metadata.tee ? [{ value: data.metadata.tee, kind: 'tee' as const }] : []),
    ...(data.metadata.ratingSlope ? [{ value: data.metadata.ratingSlope, kind: 'neutral' as const }] : []),
    ...(data.metadata.roundContext ? [{ value: data.metadata.roundContext, kind: 'context' as const }] : []),
  ], metadataY);
  const metadataBottom = metadataY + metadataHeight;
  const scoreGroup = drawScoreGroup(
    data.score,
    data.relativeToPar,
    contentX + contentWidth,
    metadataBottom,
    headerTopY + logoHeight + spacing.gap,
  );

  const scoreBottom = scoreGroup.layoutBottom;
  const headerBottom = Math.max(metadataBottom, scoreBottom);
  const footerDividerY = 1270;
  const metricValueSize = 48;
  const metricLabelSize = scoreResult.fontSize;
  const strokesGainedTitleSize = typography.subtitle;
  const strokesGainedComparisonSize = scoreResult.fontSize * 0.8;
  const statsHeight = data.stats.length > 0 ? metricRowHeight(data.stats, metricValueSize, metricLabelSize) : 0;
  const strokesGainedRowHeight = data.strokesGained.length > 0
    ? metricRowHeight(data.strokesGained, metricValueSize, metricLabelSize)
    : 0;
  const strokesGainedHeight = data.strokesGained.length > 0
    ? strokesGainedTitleSize + spacing.gap + strokesGainedRowHeight
    : 0;
  const scorecardHeight = data.scorecard
    ? (data.scorecard.length - 1) * scorecardStepY + scorecardBandHeight
    : 0;
  const sectionCount = Number(scorecardHeight > 0) + Number(statsHeight > 0) + Number(strokesGainedHeight > 0);
  const availableSectionHeight = footerDividerY - headerBottom;
  const sectionContentHeight = scorecardHeight + statsHeight + strokesGainedHeight;
  const sectionSpace = sectionCount > 0
    ? Math.max(availableSectionHeight - sectionContentHeight, 0) / (sectionCount + 1)
    : 0;
  let sectionY = headerBottom + sectionSpace;
  let scorecardBottomY = headerBottom;

  if (scorecardHeight > 0) {
    data.scorecard?.forEach((band, index) => {
      scorecardBand(band, sectionY + index * scorecardStepY);
    });
    scorecardBottomY = sectionY + scorecardHeight;
    sectionY += scorecardHeight + sectionSpace;
  }

  let statsY: number | null = null;
  let strokesGainedY: number | null = null;
  let separatorY: number | null = null;

  if (statsHeight > 0 && strokesGainedHeight > 0) {
    separatorY = sectionY + statsHeight + sectionSpace / 2;
    statsY = scorecardBottomY + (separatorY - scorecardBottomY - statsHeight) / 2;
    strokesGainedY = separatorY + (footerDividerY - separatorY - strokesGainedHeight) / 2;
  } else {
    if (statsHeight > 0) {
      statsY = sectionY;
      sectionY += statsHeight + sectionSpace;
    }
    if (strokesGainedHeight > 0) {
      separatorY = sectionY - sectionSpace / 2;
      strokesGainedY = sectionY;
    }
  }

  if (statsY != null) metricRow(data.stats, statsY, metricValueSize, metricLabelSize);

  if (strokesGainedY != null && separatorY != null) {
    ctx.fillStyle = colors.border;
    ctx.fillRect(contentX, separatorY, contentWidth, 1);
    const sectionHeaderY = strokesGainedY;
    const sectionHeaderBottom = sectionHeaderY + strokesGainedTitleSize;
    bottomAlignedText('STROKES GAINED', SHARE_IMAGE_WIDTH / 2, sectionHeaderBottom, strokesGainedTitleSize, colors.muted, 700, 'center');
    if (data.strokesGainedComparison) {
      bottomAlignedText(data.strokesGainedComparison, contentX + contentWidth, sectionHeaderBottom, strokesGainedComparisonSize, colors.muted, 500, 'right');
    }
    const strokesGainedRowY = sectionHeaderBottom + spacing.gap;
    metricRow(data.strokesGained.map(item => ({
      label: item.label,
      value: item.value,
      color: item.numericValue > 0 ? colors.green : item.numericValue < 0 ? colors.red : colors.text,
    })), strokesGainedRowY, metricValueSize, metricLabelSize);
  }
  ctx.fillStyle = colors.border;
  ctx.fillRect(contentX, footerDividerY, contentWidth, 1);
  text('Track Your Round. Understand Your Game.', contentX, 1301, 23, colors.muted);
  const footerHostname = new URL(data.publicUrl).hostname.replace(/^www\./, '');
  const footerBrand = footerHostname.toLowerCase() === 'golfiq.ca' ? 'GolfIQ.ca' : footerHostname;
  rightText(footerBrand, contentX + contentWidth, 1301, scoreResult.fontSize, colors.text, 600);

  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob);
    else reject(new Error('Could not generate the share image.'));
  }, 'image/png'));
}
