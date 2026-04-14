import { J2000_JD } from '@astro-simulator/shared';

/**
 * 시간 컨트롤러 — 현재 Julian Date와 시간 속도 배율을 관리.
 *
 * ADR: 시뮬레이션 초 = 실제 초 × scale
 *  - scale = 1: 실시간
 *  - scale = 86400: 1초 = 1일
 *  - scale = 31_557_600: 1초 = 1년 (Julian year)
 *  - scale = 3.15576e9: 1초 = 100년
 *  - scale < 0: 시간 역행
 *
 * 시간 진행은 외부 렌더 루프에서 tick(dtSeconds)을 호출하여 누적.
 */
export class TimeController {
  #jd: number;
  #scale: number;
  #running: boolean;

  constructor(initialJd: number = J2000_JD, initialScale = 86_400) {
    this.#jd = initialJd;
    this.#scale = initialScale;
    this.#running = true;
  }

  get julianDate(): number {
    return this.#jd;
  }

  get scale(): number {
    return this.#scale;
  }

  get running(): boolean {
    return this.#running;
  }

  /** 현재 시각을 JD로 직접 설정 */
  setJulianDate(jd: number): void {
    if (!Number.isFinite(jd)) throw new Error('Julian Date must be finite number');
    this.#jd = jd;
  }

  /** 시간 배율 설정 (음수 = 역행, 0 = 정지와 동등하지만 running 플래그는 유지) */
  setScale(scale: number): void {
    if (!Number.isFinite(scale)) throw new Error('Scale must be finite number');
    this.#scale = scale;
  }

  /** 재생 시작 */
  play(): void {
    this.#running = true;
  }

  /** 일시정지 */
  pause(): void {
    this.#running = false;
  }

  /**
   * 시간을 전진시킨다.
   * @param dtSeconds 실제 경과 시간 (초). 렌더 루프의 프레임 델타.
   * @returns 시간이 변경되었는지 여부 (running이 false면 false)
   */
  tick(dtSeconds: number): boolean {
    if (!this.#running || this.#scale === 0) return false;
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return false;
    // 시뮬레이션 초 = 실제 초 × scale → 일 수로 환산
    const simSeconds = dtSeconds * this.#scale;
    this.#jd += simSeconds / 86_400;
    return true;
  }
}

/**
 * 일반적으로 사용되는 시간 배율 프리셋.
 */
export const TimeScalePreset = {
  /** 실시간 */
  REAL_TIME: 1,
  /** 1초 = 1분 */
  MIN_PER_SEC: 60,
  /** 1초 = 1시간 */
  HOUR_PER_SEC: 3_600,
  /** 1초 = 1일 */
  DAY_PER_SEC: 86_400,
  /** 1초 = 1주 */
  WEEK_PER_SEC: 604_800,
  /** 1초 = 1개월 (30일) */
  MONTH_PER_SEC: 2_592_000,
  /** 1초 = 1년 */
  YEAR_PER_SEC: 31_557_600,
  /** 1초 = 10년 */
  DECADE_PER_SEC: 315_576_000,
  /** 1초 = 100년 */
  CENTURY_PER_SEC: 3_155_760_000,
} as const;
