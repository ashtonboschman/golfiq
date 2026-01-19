/**
 * Get today's date in the user's local timezone formatted as YYYY-MM-DD
 * This fixes the issue where toISOString() converts to UTC, causing the date
 * to be off by a day when adding rounds near midnight in timezones behind UTC
 */
export function getLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
