export const formatNumber = (num: number | null | undefined) =>
  num == null || isNaN(num) ? '-' : num % 1 === 0 ? num.toString() : num.toFixed(1);

export const formatToPar = (num: number | null | undefined) => {
  if (num == null || isNaN(num)) return '-';
  const absValue = Math.abs(num);
  const formatted = absValue % 1 === 0 ? absValue.toString() : absValue.toFixed(1);
  if (num > 0) return `+${formatted}`;
  if (num < 0) return `-${formatted}`;
  return 'E';
};

export const formatPercent = (num: number | null | undefined) =>
  num == null || isNaN(num) ? '-' : `${num.toFixed(1)}%`;

export const formatDate = (dateStr: string) => {
  if (!dateStr) return '-';
  const datePart = dateStr.split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const formatHandicap = (num: number | null) => {
  if (num == null || isNaN(num) || !Number.isFinite(num)) return '-';
  const rounded = Math.round(num * 10) / 10;
  if (rounded === 0 || Object.is(rounded, -0)) return '0';
  if (rounded < 0) {
    const abs = Math.abs(rounded);
    return abs % 1 === 0 ? `+${abs.toString()}` : `+${abs.toFixed(1)}`;
  }
  return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(1);
};
