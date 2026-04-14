import { describe, expect, it } from 'vitest';
import {
  dateToJulianDate,
  isoToJulianDate,
  julianDateToDate,
  julianDateToIso,
} from './julian-date.js';
import { TimeController, TimeScalePreset } from './time-controller.js';

describe('Julian Date 변환', () => {
  it('Unix epoch → JD 2440587.5', () => {
    expect(dateToJulianDate(new Date(0))).toBeCloseTo(2_440_587.5, 6);
  });

  it('J2000.0 (2000-01-01T12:00:00Z) → JD 2451545.0', () => {
    const jd = isoToJulianDate('2000-01-01T12:00:00Z');
    expect(jd).toBeCloseTo(2_451_545.0, 6);
  });

  it('라운드트립: ISO → JD → ISO', () => {
    const iso = '2026-04-13T00:00:00.000Z';
    const jd = isoToJulianDate(iso);
    expect(julianDateToIso(jd)).toBe(iso);
  });

  it('라운드트립: Date → JD → Date (밀리초 1 이내 정밀도)', () => {
    // JD는 double이라 현대 날짜의 ms 절대 정확 유지는 한계. ±1ms 허용.
    const d = new Date('2024-06-15T12:34:56.789Z');
    const jd = dateToJulianDate(d);
    const diff = Math.abs(julianDateToDate(jd).getTime() - d.getTime());
    expect(diff).toBeLessThanOrEqual(1);
  });

  it('잘못된 ISO 거부', () => {
    expect(() => isoToJulianDate('not-a-date')).toThrow();
  });
});

describe('TimeController', () => {
  it('기본 초기값 — J2000.0, 1일/초', () => {
    const t = new TimeController();
    expect(t.julianDate).toBeCloseTo(2_451_545.0, 6);
    expect(t.scale).toBe(86_400);
    expect(t.running).toBe(true);
  });

  it('tick — 1초 경과 × 86400 배율 = 1일 JD 증가', () => {
    const t = new TimeController(2_451_545.0, 86_400);
    t.tick(1);
    expect(t.julianDate).toBeCloseTo(2_451_546.0, 6);
  });

  it('tick — 스케일 0은 시간 진행 안 함', () => {
    const t = new TimeController(2_451_545.0, 0);
    const changed = t.tick(1);
    expect(changed).toBe(false);
    expect(t.julianDate).toBe(2_451_545.0);
  });

  it('pause 상태에서는 tick 무시', () => {
    const t = new TimeController(2_451_545.0, 86_400);
    t.pause();
    t.tick(10);
    expect(t.julianDate).toBe(2_451_545.0);
    t.play();
    t.tick(1);
    expect(t.julianDate).toBeCloseTo(2_451_546.0);
  });

  it('음수 스케일 — 시간 역행', () => {
    const t = new TimeController(2_451_545.0, -86_400);
    t.tick(1);
    expect(t.julianDate).toBeCloseTo(2_451_544.0);
  });

  it('setJulianDate / setScale 직접 설정', () => {
    const t = new TimeController();
    t.setJulianDate(2_460_000);
    t.setScale(TimeScalePreset.YEAR_PER_SEC);
    expect(t.julianDate).toBe(2_460_000);
    expect(t.scale).toBe(TimeScalePreset.YEAR_PER_SEC);
  });

  it('유한하지 않은 값 거부', () => {
    const t = new TimeController();
    expect(() => t.setJulianDate(Number.NaN)).toThrow();
    expect(() => t.setJulianDate(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => t.setScale(Number.NaN)).toThrow();
  });

  it('YEAR_PER_SEC 배율 — 1초 tick 후 JD 365.25 증가', () => {
    const t = new TimeController(2_451_545.0, TimeScalePreset.YEAR_PER_SEC);
    t.tick(1);
    expect(t.julianDate - 2_451_545.0).toBeCloseTo(365.25, 2);
  });
});
