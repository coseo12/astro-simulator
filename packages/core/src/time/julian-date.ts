/**
 * Julian Date ↔ JavaScript Date 변환.
 *
 * Unix epoch(1970-01-01 00:00 UTC) = JD 2440587.5
 */

export const UNIX_EPOCH_JD = 2_440_587.5;
export const MILLIS_PER_DAY = 86_400_000;

/** JavaScript Date → Julian Date (UTC 기반) */
export function dateToJulianDate(date: Date): number {
  return UNIX_EPOCH_JD + date.getTime() / MILLIS_PER_DAY;
}

/** Julian Date → JavaScript Date (UTC 기반) */
export function julianDateToDate(jd: number): Date {
  return new Date((jd - UNIX_EPOCH_JD) * MILLIS_PER_DAY);
}

/** ISO 8601 UTC 문자열 → Julian Date */
export function isoToJulianDate(iso: string): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ISO datetime: ${iso}`);
  }
  return dateToJulianDate(d);
}

/** Julian Date → ISO 8601 UTC 문자열 */
export function julianDateToIso(jd: number): string {
  return julianDateToDate(jd).toISOString();
}
