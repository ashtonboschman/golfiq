import type { ValueState } from './types';

export const SUPPORTED_HOLE_COUNTS = new Set([9, 18]);

export function readString(
  record: Record<string, unknown>,
  key: string,
  { required = false, maxLength = 255 }: { required?: boolean; maxLength?: number } = {},
): ValueState<string> {
  if (!(key in record)) return { state: 'absent', value: null };
  const raw = record[key];
  if (raw === null) return { state: 'null', value: null };
  if (typeof raw !== 'string') return { state: 'invalid', value: null, issue: `${key} must be a string.` };
  const value = raw.trim();
  if ((required && !value) || value.length > maxLength) {
    return { state: 'invalid', value: null, issue: `${key} is missing or too long.` };
  }
  return { state: 'valid', value };
}

export function readNumber(
  record: Record<string, unknown>,
  key: string,
  options: { integer?: boolean; minimum?: number; maximum?: number } = {},
): ValueState<number> {
  if (!(key in record)) return { state: 'absent', value: null };
  const raw = record[key];
  if (raw === null) return { state: 'null', value: null };
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return { state: 'invalid', value: null, issue: `${key} must be a finite number.` };
  }
  if (options.integer && !Number.isInteger(raw)) {
    return { state: 'invalid', value: null, issue: `${key} must be an integer.` };
  }
  if (options.minimum !== undefined && raw < options.minimum) {
    return { state: 'invalid', value: null, issue: `${key} is below the supported minimum.` };
  }
  if (options.maximum !== undefined && raw > options.maximum) {
    return { state: 'invalid', value: null, issue: `${key} exceeds the supported maximum.` };
  }
  return { state: 'valid', value: raw };
}

export function isValidState<T>(state: ValueState<T>): state is ValueState<T> & { state: 'valid'; value: T } {
  return state.state === 'valid';
}
