/**
 * #704 — free-fly 카메라 감도 4축 계수 store 슬라이스 + localStorage 영속 (무패키지 직접 구현).
 *
 * ADR `docs/decisions/20260618-704-freefly-sensitivity-settings-ui.md` §결정 2/3
 * (+ §Amendment 2026-06-18 SSR 격리).
 *
 * ## 4축 + default SSoT (SSR 격리 — 리터럴 + drift 가드 테스트)
 *
 * default 값은 **숫자 리터럴로 직접 정의**한다. camera.ts named const(`scene.WASD_DELTA_PERCENTAGE`
 * 등) 를 **값 import** 하면 `scene` 네임스페이스가 babylon(`@babylonjs/core`) → physics_wasm 체인을
 * Next.js server component 그래프에 끌어들여 SSR prerender 가 `physics_wasm_bg.wasm` ENOENT 로 500
 * (qa #704 회귀 진단: develop=SSR 200 / pre-fix=SSR 500 직접 대조). 따라서 babylon 의존을 제거하고
 * 값을 리터럴로 박제하되, SSoT 보존은 **drift 가드 단위 테스트**(`free-fly-sensitivity.test.ts`)가
 * 담당한다 — 리터럴이 camera.ts const 와 어긋나면 테스트 FAIL (테스트는 SSR 아니라 babylon import 무방).
 *
 * | 축            | 리터럴 default | camera.ts const (drift 가드 대조 SSoT)  |
 * | ------------- | -------------- | --------------------------------------- |
 * | wasd          | 0.015          | scene.WASD_DELTA_PERCENTAGE             |
 * | zoomoutFactor | 5              | (camera.ts const 아님 — sim-canvas 와 동일 SSoT) |
 * | panning       | 0.01           | scene.PANNING_DELTA_PERCENTAGE          |
 * | zoom          | 0.01           | scene.ZOOM_DELTA_PERCENTAGE             |
 *
 * ## 4축 주입 경로 (sim-canvas/camera.ts)
 *
 *  | 축            | 리터럴 default | 주입 경로 (sim-canvas/camera.ts)                       |
 *  | ------------- | -------------- | ------------------------------------------------------ |
 *  | wasd          | 0.015          | attachWasdControl getter pull (매 프레임 최신)          |
 *  | zoomoutFactor | 5              | free-fly 활성 중 store 구독 push → upperRadiusLimit 재산정 |
 *  | panning       | 0.01           | computePanningSensibility(camera, pct)                 |
 *  | zoom          | 0.01           | camera.wheelDeltaPercentage/pinchDeltaPercentage set   |
 *
 * ## localStorage 영속 3종 방어 (ADR §결정 3, agy "오염 영속 데이터 유입 완벽 차단")
 *
 *  1. **SSR 가드** — `typeof window === 'undefined'` 면 default 반환(Next.js 서버 렌더 시 부재).
 *  2. **스키마 버전** — `SENSITIVITY_SCHEMA_VERSION` 불일치 → default(구버전 폴백).
 *  3. **범위·타입 가드** — 각 축 파싱값이 `Number.isFinite` + min/max 범위 내가 아니면 해당 축만
 *     default 로 정정(silent 흡수 아님 — 명시 clamp, fail-fast). spread 미사용 + 축별 명시 할당으로
 *     `__proto__` 등 임의 키 주입 차단(agy 부분 수용 — sanitizer 라이브러리는 과잉이라 기각).
 *
 * **Hydration 안전** — 본 모듈은 store 초기값을 const default 로 두고, 실제 localStorage 로드는
 * `loadPersistedSensitivity()` 를 호출하는 클라이언트 컴포넌트의 mount 후 `useEffect` 가 담당한다
 * (store 생성 시 직접 호출 금지 — Next.js SSR/CSR mismatch 차단, ADR §결정 3 Hydration 안전).
 */

/** #704 — 감도 4축 식별자 (컴파일 시점 오타 차단 — ADR §결정 1 axis 리터럴 유니온). */
export type FreeFlySensitivityAxis = 'wasd' | 'zoomoutFactor' | 'panning' | 'zoom';

/** #704 — 감도 4축 값 객체 (store 상태 + localStorage 직렬화 단위). */
export interface FreeFlySensitivity {
  /** WASD/QE 키보드 이동 속도 (radius 비례 %). default WASD_DELTA_PERCENTAGE. */
  wasd: number;
  /** free-fly 진입 후 줌아웃 한계 배율 (upperRadiusLimit = entryRadius × factor). default 5. */
  zoomoutFactor: number;
  /** 패닝 감도 (radius 비례 %). default PANNING_DELTA_PERCENTAGE. */
  panning: number;
  /** 줌(휠/핀치) 감도 (radius 비례 %). default ZOOM_DELTA_PERCENTAGE. */
  zoom: number;
}

/** #704 — sim-canvas FREE_FLY_ZOOMOUT_FACTOR default SSoT (camera.ts const 가 아니므로 본 모듈에 박제). */
export const FREE_FLY_ZOOMOUT_FACTOR_DEFAULT = 5;

/**
 * #704 — 4축 default SSoT. 숫자 리터럴 직접 정의 (SSR 격리 — babylon 값 import 금지).
 *
 * 각 리터럴은 camera.ts named const 와 **반드시 일치**해야 하며 (wasd=WASD_DELTA_PERCENTAGE,
 * panning=PANNING_DELTA_PERCENTAGE, zoom=ZOOM_DELTA_PERCENTAGE), 일치 보증은 `free-fly-sensitivity.test.ts`
 * 의 drift 가드 단위 테스트가 담당한다 (값 import 대신 리터럴을 쓰는 이유 = babylon→wasm 체인을 SSR
 * server component 그래프에서 배제 — qa #704 회귀 fix, ADR §Amendment SSR 격리).
 * Object.freeze 로 default 객체 mutation 사고 차단(reset 시 spread 복제하므로 참조 공유 안전).
 */
export const FREE_FLY_SENSITIVITY_DEFAULT: Readonly<FreeFlySensitivity> = Object.freeze({
  wasd: 0.015, // = scene.WASD_DELTA_PERCENTAGE (drift 가드 테스트로 대조)
  zoomoutFactor: FREE_FLY_ZOOMOUT_FACTOR_DEFAULT, // = 5 (sim-canvas FREE_FLY_ZOOMOUT_FACTOR_DEFAULT)
  panning: 0.01, // = scene.PANNING_DELTA_PERCENTAGE (drift 가드 테스트로 대조)
  zoom: 0.01, // = scene.ZOOM_DELTA_PERCENTAGE (drift 가드 테스트로 대조)
});

/**
 * #704 — 축별 슬라이더 범위/스텝 (ADR §축 4 표, 1차 제안값 — D-T2 튜닝 지점).
 *
 * localStorage 역직렬화 시 범위 clamp 의 SSoT 이자 모달 슬라이더 min/max/step SSoT 이다(이원화 방지).
 */
export const FREE_FLY_SENSITIVITY_RANGES: Record<
  FreeFlySensitivityAxis,
  { min: number; max: number; step: number; label: string; unit: string }
> = {
  // default ⅓~3배. max 0.05 = #699 측정 "과대" 구 계수 상한(그 이상 방어).
  wasd: { min: 0.005, max: 0.05, step: 0.001, label: 'WASD 이동 속도', unit: '' },
  // default 0.4~4배. max 20 = 빈 공간 진입 직전 안전망.
  zoomoutFactor: { min: 2, max: 20, step: 1, label: '줌아웃 배율', unit: '×' },
  // default 0.5~3배.
  panning: { min: 0.005, max: 0.03, step: 0.001, label: '패닝 감도', unit: '' },
  // default 0.5~3배. wheelDeltaPercentage 비례.
  zoom: { min: 0.005, max: 0.03, step: 0.001, label: '줌 감도', unit: '' },
};

/** #704 — localStorage 키 + 스키마 버전 (구버전/오염 데이터 폴백 SSoT). */
export const SENSITIVITY_STORAGE_KEY = 'astro:free-fly-sensitivity';
export const SENSITIVITY_SCHEMA_VERSION = 1;

const AXES: readonly FreeFlySensitivityAxis[] = ['wasd', 'zoomoutFactor', 'panning', 'zoom'];

/**
 * #704 — 단일 축 값 범위 clamp + 타입 가드. 손상값/범위 이탈 → default 로 정정(명시, silent 아님).
 *
 * @returns 유효하면 clamp 한 값, NaN/Infinity/타입 불일치면 해당 축 default.
 */
export function clampSensitivityAxis(axis: FreeFlySensitivityAxis, raw: unknown): number {
  const { min, max } = FREE_FLY_SENSITIVITY_RANGES[axis];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return FREE_FLY_SENSITIVITY_DEFAULT[axis];
  return Math.min(max, Math.max(min, raw));
}

/**
 * #704 — localStorage 에서 감도 4축 로드 (3종 방어). 클라이언트 mount 후 useEffect 에서만 호출.
 *
 * 실패(SSR/미존재/JSON 손상/버전 불일치/축 손상)는 모두 default 폴백(throw 없음 — 가드 fail-fast).
 * 부분 손상(한 축만 범위 이탈)도 해당 축만 default 로 정정하고 나머지는 보존한다.
 */
export function loadPersistedSensitivity(): FreeFlySensitivity {
  // (1) SSR 가드 — 서버 렌더 시 localStorage 부재.
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return { ...FREE_FLY_SENSITIVITY_DEFAULT };
  }
  let parsed: unknown;
  try {
    const raw = window.localStorage.getItem(SENSITIVITY_STORAGE_KEY);
    if (raw === null) return { ...FREE_FLY_SENSITIVITY_DEFAULT };
    parsed = JSON.parse(raw);
  } catch {
    // JSON 손상 → default (가드 fail-fast, silent 흡수 아님 — caller 가 default 로 덮어쓰면 다음
    // commit 시 정상 데이터로 자가 복구).
    return { ...FREE_FLY_SENSITIVITY_DEFAULT };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ...FREE_FLY_SENSITIVITY_DEFAULT };
  }
  const record = parsed as Record<string, unknown>;
  // (2) 스키마 버전 불일치 → default (구버전 폴백).
  if (record.version !== SENSITIVITY_SCHEMA_VERSION) {
    return { ...FREE_FLY_SENSITIVITY_DEFAULT };
  }
  const value = record.value;
  if (typeof value !== 'object' || value === null) {
    return { ...FREE_FLY_SENSITIVITY_DEFAULT };
  }
  const valueRecord = value as Record<string, unknown>;
  // (3) 4축 속성별 명시 할당 + clamp (spread 미사용 — __proto__ 등 임의 키 주입 차단, agy 부분 수용).
  const result = { ...FREE_FLY_SENSITIVITY_DEFAULT };
  for (const axis of AXES) {
    result[axis] = clampSensitivityAxis(axis, valueRecord[axis]);
  }
  return result;
}

/**
 * #704 — 감도 4축 localStorage 저장. setter/reset 의 commit 시점(슬라이더 onValueCommit)에 호출.
 *
 * SSR 가드 + 쓰기 실패(quota 초과 등) try/catch — 영속 실패가 런타임 카메라 거동을 막지 않는다
 * (저장은 best-effort, store 메모리 상태가 SSoT).
 */
export function savePersistedSensitivity(value: FreeFlySensitivity): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  try {
    const payload = JSON.stringify({ version: SENSITIVITY_SCHEMA_VERSION, value });
    window.localStorage.setItem(SENSITIVITY_STORAGE_KEY, payload);
  } catch {
    // quota 초과/프라이빗 모드 등 — 영속 실패는 무시(메모리 상태 유지).
  }
}
