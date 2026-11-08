/**
 * #1428 — 태양 활동 효과 공용 광과민성 감쇠 (흑점 · 홍염 · 플레어).
 *
 * **설계 근거**: ADR `docs/decisions/20261107-1428-solar-flares-prominences.md` 결정 3 · 축 4
 *   - ADR 1412 결정 3 · Amendment 1 의 흑점 감쇠 상태기계를 그대로 옮기고, 효과마다 다른 것은 **실효 주파수 계수 `c`
 *     (cycles/일) 하나뿐**이다. 실효 주파수 `f = |Δjd| / Δt × c` 를 직전 `1/6 s` 창으로 재고, 3 Hz 초과가 `1/6 s`
 *     이어지면 목표 가시도를 0 으로, 변화율 6 /s 로 움직인다.
 *   - 효과마다 「가장 빠른 밝기 전이 시간 T」 에서 `c = 1/(2T)` 를 쓴다 — 지속 시간 T 의 전이 1 회는 주파수 `1/(2T)` 진동의
 *     반주기와 같다 (축 4). 흑점은 자전 주파수 `ω(0)/360` (`sunspots.ts` 의 래퍼가 넘긴다 — 동작 불변, DoD D4).
 *   - 결정 7 — 문턱 · 창 · 변화율 상수의 SSoT 는 본 모듈이다 (흑점 모듈에서 옮겼다 — 흑점 쪽 이름은 같은 값의 별칭).
 *
 * **호출당 할당 0** — 프레임 위상에서 매 프레임 효과마다 1 회 호출된다. 상태는 호출자 소유 (효과 1 개당 1 개).
 */

/** 광과민성 문턱 [Hz] — WCAG 2.2 SC 2.3.1 「1 초에 3 회를 넘는 섬광 금지」 (ADR 1412 결정 3). */
export const ACTIVITY_MAX_FLICKER_HZ = 3;
/**
 * 목표 전환 지속 시간 [s] = `1/(2·3)` — 같은 3 Hz 에서 나온다 (새 시상수 0). 실효 주파수 판정 창의 길이도 이 값이다
 * (ADR 1412 Amendment 1). 점프 하나 = 무늬 변화 1 회라 창 안에 점프가 끊기지 않는 열 (1 초 6 회 = 섬광 3 쌍 초과) 이 걸린다.
 */
export const ACTIVITY_VISIBILITY_PERSIST_S = 1 / (2 * ACTIVITY_MAX_FLICKER_HZ);
/** 가시도 최대 변화율 [1/s] = `2·3` — 켜짐↔꺼짐 1 왕복이 1/3 s 이상. */
export const ACTIVITY_VISIBILITY_RATE_PER_S = 2 * ACTIVITY_MAX_FLICKER_HZ;

/**
 * 실효 주파수 [Hz] = `|Δjd| / Δt × c` — 효과가 한 번 바뀌는 빈도. 역재생은 `|Δjd|` 라 같다.
 *
 * {@link stepActivityVisibility} 는 이 식을 **프레임 하나가 아니라 직전 `1/6 s` 창** (Δt = 창 길이, Δjd = 창 양 끝 jd 차) 에
 * 적용한다 (ADR 1412 Amendment 1). 재생은 프레임마다 jd 가 움직여 창 평균 = 프레임 값이다. 스크러버 드래그 · 키 반복은
 * 입력 이벤트가 프레임보다 드물어 (ADR 1412 실측 14~30 회/s) jd 가 움직이는 프레임과 멈춘 프레임이 섞이는데, 창 평균이 그 둘을 묶어 지속 조건을 채운다.
 * 창보다 짧게 끝나는 **단발 점프**는 지속 조건을 채우지 못해 무시하는 대상이다.
 *
 * @param cyclesPerDay 효과의 실효 주파수 계수 `c` [cycles/일]
 */
export function activityEffectiveHz(
  deltaJd: number,
  deltaSec: number,
  cyclesPerDay: number,
): number {
  return (Math.abs(deltaJd) / deltaSec) * cyclesPerDay;
}

/**
 * 판정 창 표본 이력 용량. 창 `1/6 s` 를 덮으려면 프레임률 × 1/6 + 1 개가 필요하다 — 64 는 약 380 fps 까지.
 * 그보다 빠르면 가장 오래된 표본까지만 보아 창이 짧아진다 (단발 점프는 여전히 지속 조건 미달 — 보수 쪽).
 */
const VISIBILITY_HISTORY = 64;
/** 판정 창 = 지속 시간 [ms] (같은 값 — 창 경계와 지속 조건을 한 식으로 비교하려고 ms 로 한 번만 만든다). */
const VISIBILITY_WINDOW_MS = ACTIVITY_VISIBILITY_PERSIST_S * 1000;

/** 감쇠 상태 — 호출자 소유 (효과 1 개당 1 개). 표본 이력은 고정 길이 링 버퍼 (할당 0). */
export interface ActivityVisibilityState {
  /** 표본 시각 [ms] · 장면 시계 jd 링 버퍼. */
  sampleMs: Float64Array;
  sampleJd: Float64Array;
  /** 다음에 쓸 index · 채워진 표본 수. */
  head: number;
  count: number;
  /** 현재 연속 구간의 판정 (창 평균 `f > 3`). */
  fast: boolean;
  /** 그 판정이 처음 나온 표본 시각 [ms]. */
  fastSinceMs: number;
  /** 목표 가시도 (0 · 1). */
  target: number;
  /** 실제 가시도 0~1 — 셰이더에 곱하는 값. */
  visibility: number;
}

export function createActivityVisibilityState(): ActivityVisibilityState {
  return {
    sampleMs: new Float64Array(VISIBILITY_HISTORY),
    sampleJd: new Float64Array(VISIBILITY_HISTORY),
    head: 0,
    count: 0,
    fast: false,
    fastSinceMs: Number.NaN,
    target: 1,
    visibility: 1,
  };
}

/**
 * 감쇠 한 걸음 — 장면 시계 jd 와 실시간 `nowMs` (performance.now) 로 가시도를 갱신해 반환한다 (할당 0).
 *
 * - 판정량: 직전 `W = 1/6 s` 창의 실효 주파수 {@link activityEffectiveHz}. 기준 표본 = `nowMs − W` 이전의 가장 최근 표본
 *   (없으면 가장 오래된 표본). 재생은 창 평균 = 순간값이고, 스크러버처럼 jd 가 멈춘 프레임이 섞인 입력도 창 안에서 묶인다.
 * - 목표: 그 판정이 연속 `W` 이상 「빠름」 이면 0, 「느림」 이 같은 시간 이어지면 1, 그 사이는 직전 목표 유지. 연속 구간의
 *   시작은 그 판정이 **처음 나온 표본 시각**이다 (프레임 간격을 소급하지 않는다 — 긴 프레임 하나가 혼자 지속 조건을 채우지 않게).
 * - 단발 점프 (날짜 입력 · 스크러버 1회): 점프 표본이 창 안에 있는 동안만 「빠름」 이고, 그 기간은 `W` 보다 짧다 → 목표 불변.
 *   점프 프레임이 길어도 (무거운 점프) 같다. 점프 둘이 `W` 안에 이어지면 「빠름」 이 `W` 를 넘겨 감쇠한다 — 점프 하나가 무늬를
 *   한 번 바꾸므로, 1 초 6 회 (= 3 쌍) 를 넘는 점프 열이 여기에 걸린다.
 * - 실제 값은 목표를 향해 초당 최대 `6` 으로만 움직인다 → 켜짐↔꺼짐 1 왕복 ≥ 1/3 s (1 초에 3 회 이하).
 * - 일시정지 (`Δjd = 0`): 창이 비워진 뒤 (`W`) 「느림」 이 `W` 이어져 목표 1, 다시 1/6 s 에 걸쳐 1 로 돌아온다.
 * - `Δt ≤ 0` (같은 시각의 재호출 · 시계 역행) 표본은 버린다. 같은 프레임의 2회째 호출은 같은 jd 의 표본 하나를 더할 뿐이라
 *   창 평균이 바뀌지 않는다.
 * - 탭 복귀: `TimeController.tick` 이 실시간 dt 를 자르지 않아 복귀 프레임의 Δjd/Δt 는 재생 속도와 같다 — 급등이 아니다.
 *
 * @param cyclesPerDay 효과의 실효 주파수 계수 `c` [cycles/일] — 효과마다 상수 (ADR 1428 축 4 표)
 */
export function stepActivityVisibility(
  state: ActivityVisibilityState,
  cyclesPerDay: number,
  jd: number,
  nowMs: number,
): number {
  const cap = state.sampleMs.length;
  const lastIdx = (state.head - 1 + cap) % cap;
  if (state.count > 0 && !(nowMs > state.sampleMs[lastIdx]!)) return state.visibility;
  const prevMs = state.count > 0 ? state.sampleMs[lastIdx]! : Number.NaN;
  // 비유한 jd 는 직전 표본 jd 로 대신한다 (Δjd 0 — 판정에 기여하지 않음).
  const sampleJd = Number.isFinite(jd) ? jd : state.count > 0 ? state.sampleJd[lastIdx]! : 0;
  state.sampleMs[state.head] = nowMs;
  state.sampleJd[state.head] = sampleJd;
  state.head = (state.head + 1) % cap;
  if (state.count < cap) state.count++;
  if (state.count === 1) {
    state.fastSinceMs = nowMs;
    return state.visibility;
  }

  // 기준 표본 — `nowMs − W` 이전의 가장 최근 표본, 없으면 가장 오래된 표본.
  // ⚠️ 창 경계와 지속 조건은 **같은 식** (`nowMs − 표본 시각 >= W`) 으로 잰다. 둘을 다른 식으로 반올림하면 단발 점프의 「빠름」
  // 마지막 표본에서 지속 조건만 먼저 참이 되는 경계가 생긴다 (183 ms 간격 점프 열 테스트가 그 경계를 잡았다 — ADR 1412).
  let ref = (state.head - state.count + cap) % cap;
  for (let k = 2; k <= state.count; k++) {
    const idx = (state.head - k + cap) % cap;
    if (nowMs - state.sampleMs[idx]! >= VISIBILITY_WINDOW_MS) {
      ref = idx;
      break;
    }
  }
  const spanSec = (nowMs - state.sampleMs[ref]!) / 1000;
  const fast =
    activityEffectiveHz(sampleJd - state.sampleJd[ref]!, spanSec, cyclesPerDay) >
    ACTIVITY_MAX_FLICKER_HZ;
  if (fast !== state.fast) {
    state.fast = fast;
    state.fastSinceMs = nowMs;
  }
  if (nowMs - state.fastSinceMs >= VISIBILITY_WINDOW_MS) {
    state.target = fast ? 0 : 1;
  }
  const maxStep = ACTIVITY_VISIBILITY_RATE_PER_S * ((nowMs - prevMs) / 1000);
  const diff = state.target - state.visibility;
  state.visibility += Math.max(-maxStep, Math.min(maxStep, diff));
  return state.visibility;
}
