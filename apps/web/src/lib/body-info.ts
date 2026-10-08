// #1305 — `twoBodyMu` 는 루트 named import (`physics` namespace 경유 금지 — body-distance.ts 와 같은 SSR 사유).
import { twoBodyMu, type ephemeris } from '@astro-simulator/core';
import { AU } from '@astro-simulator/shared';

/**
 * #1281 — 천체 정보 공용 모듈.
 *
 * 연구 모드 우 패널(`celestial-info-panel.tsx`)과 관찰 모드 정보 카드(`body-info-card.tsx`)가
 * 같은 라벨·조회·주기 계산·차단 문구를 쓰도록 패널에서 추출했다 (이슈 #1281 §재사용 대상).
 * 카드 전용 사람 단위 포맷터(km 한국어 단위 · AU · 반지름 · 조사)도 여기 둔다.
 */

export type LoadedCelestialBody = ephemeris.LoadedCelestialBody;

export const KIND_LABEL: Record<string, string> = {
  star: '항성',
  planet: '행성',
  'dwarf-planet': '왜소행성',
  asteroid: '소행성', // #1318
  moon: '위성',
  comet: '혜성',
};

/** 종류 라벨. 미등록 kind 는 원문을 그대로 보인다 (조용히 빈 값으로 흡수하지 않는다). */
export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind;
}

const SECONDS_PER_DAY = 86_400;
const DAYS_PER_YEAR = 365.25;
const DAYS_PER_YEAR_THRESHOLD = 365;

export function formatDays(seconds: number): string {
  const days = seconds / SECONDS_PER_DAY;
  if (days < DAYS_PER_YEAR_THRESHOLD) return `${days.toFixed(2)} 일`;
  return `${(days / DAYS_PER_YEAR).toFixed(3)} 년`;
}

export interface BodyAndParent {
  data: LoadedCelestialBody | null;
  parent: LoadedCelestialBody | null;
}

/** #841 — 공전주기 μ 계산에 모체 질량이 필요하므로 parentId 를 데이터 SSoT 에서 함께 해석한다. */
export function findBodyAndParent(
  bodies: readonly LoadedCelestialBody[],
  id: string | null,
): BodyAndParent {
  if (!id) return { data: null, parent: null };
  const body = bodies.find((b) => b.id === id) ?? null;
  const parent =
    body?.parentId != null ? (bodies.find((b) => b.id === body.parentId) ?? null) : null;
  return { data: body, parent };
}

/**
 * #841 — 공전주기: 케플러 제3법칙 T = 2π√(a³/μ). orbit.semiMajorAxis 는 모체(parentId) 중심
 * 거리(loader 계약)이므로 μ 도 반드시 모체 기준 — 태양 질량 하드코딩은 위성 주기를 수백 배
 * 오계산했다 (달 27.3일 → 약 1.1시간, 이슈 #841). 2체 문제 정확식 μ = G·(M_parent + m) 사용 —
 * 달은 모체 대비 질량비 1.2% 라 M_parent 단독이면 27.49일로 어긋난다 (실제 항성월 27.32일).
 *
 * #1305 — 위성은 scene Kepler 경로 · 실시간 거리(`body-distance.ts`)도 같은 μ (`orbitMu` → `twoBodyMu`) 를
 * 써서 카드 주기와 화면 공전 주기가 일치한다. 태양 직속 body 는 scene 이 G·M_sun 을 유지하므로 카드
 * 주기(G(M_sun + m)) 와 최대 0.05% (목성) 다르다 — 행성 μ 변경은 #1305 범위 밖.
 *
 * @returns 궤도가 없거나 모체 미해석이면 `null`. 호출부는 조용히 태양 질량으로 흡수하지 않고
 *   fail-visible 로 표기한다 (#841 계약).
 */
export function orbitalPeriodSeconds(
  body: LoadedCelestialBody,
  parent: LoadedCelestialBody | null,
): number | null {
  if (!body.orbit || !parent) return null;
  return 2 * Math.PI * Math.sqrt(body.orbit.semiMajorAxis ** 3 / twoBodyMu(parent.mass, body.mass));
}

/** #841 fail-visible — orbit 존재 + 모체 미해석 시 공전주기 자리 문구. */
export const PERIOD_UNAVAILABLE_TEXT = '계산 불가 (모체 질량 미상)';

/**
 * #403 R-Phase Allowlist 가드 차단 문구 (ADR `20260506-403-r-phase-ui-guard.md`).
 * i18n 키 분기 신설 금지 (ADR §명시적 비-범위) — 한국어 하드코딩.
 */
export function rPhaseBlockedMessage(nameKo: string): string {
  return `${nameKo} 은(는) R-Phase 미진입 — 후속 R-Phase 에서 활성화 예정입니다.`;
}

// ---------------------------------------------------------------------------
// 사람 단위 포맷터 (관찰 모드 카드) — mAU·지수 표기는 일반 사용자에게 낯설어 쓰지 않는다.
// ---------------------------------------------------------------------------

const MAN = 1e4; // 만
const EOK = 1e8; // 억
/** 이 값 미만의 「만」 단위는 소수 1자리 (38.4만), 이상은 정수 콤마 (5,791만). */
const MAN_DECIMAL_LIMIT = 1e6;
/** 반지름이 이 값(km) 미만이면 소수 1자리 (5.5 km). */
const RADIUS_DECIMAL_LIMIT_KM = 100;

/** 정수 천 단위 콤마. `toLocaleString` 은 런타임 ICU 유무에 따라 출력이 갈려 쓰지 않는다. */
export function groupThousands(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  return sign + String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * km 를 한국어 단위로 — ≥1억 → `억` 소수 2자리 / ≥1만 → `만` (100만 미만 소수 1자리, 이상 정수
 * 콤마) / 미만 → 정수 콤마.
 *
 * 단위 경계는 **반올림 후** 값으로 판정한다 — 반올림 전 값으로 가르면 99,999,999 km 가
 * `10,000만 km`, 9,999.6 km 가 `10,000 km` 로 표기된다 (상위 단위로 올라가야 한다).
 */
export function formatKmKo(km: number): string {
  if (Math.round(km / MAN) >= MAN) {
    return `${(km / EOK).toFixed(2)}억 km`;
  }
  if (Math.round(km) >= MAN) {
    const man = km / MAN;
    if (Number(man.toFixed(1)) < MAN_DECIMAL_LIMIT / MAN) {
      return `${man.toFixed(1)}만 km`;
    }
    return `${groupThousands(man)}만 km`;
  }
  return `${groupThousands(km)} km`;
}

/** 태양 거리 — `1.01 AU · 1.51억 km`. 입력은 m. */
export function formatSunDistance(meters: number): string {
  return `${(meters / AU).toFixed(2)} AU · ${formatKmKo(meters / 1000)}`;
}

/** 반지름 — km. 100 미만 소수 1자리, 이상 정수 콤마. 입력은 m. */
export function formatRadiusKm(meters: number): string {
  const km = meters / 1000;
  if (km < RADIUS_DECIMAL_LIMIT_KM) return `${km.toFixed(1)} km`;
  return `${groupThousands(km)} km`;
}

const HANGUL_SYLLABLE_START = 0xac00;
const HANGUL_SYLLABLE_END = 0xd7a3;
const JONGSEONG_COUNT = 28;
/** 종성 인덱스 8 = ㄹ. 「ㄹ」 받침 뒤에는 「으로」가 아니라 「로」가 온다. */
const JONGSEONG_RIEUL = 8;

/**
 * 「(으)로」 조사 — 받침이 있고 ㄹ 이 아니면 `으로`, 그 밖은 `로`.
 * 마지막 글자가 한글 음절이 아니면 `(으)로` (추측하지 않는다).
 */
export function josaRo(word: string): string {
  const last = word.charCodeAt(word.length - 1);
  if (!(last >= HANGUL_SYLLABLE_START && last <= HANGUL_SYLLABLE_END)) return '(으)로';
  const jong = (last - HANGUL_SYLLABLE_START) % JONGSEONG_COUNT;
  return jong === 0 || jong === JONGSEONG_RIEUL ? '로' : '으로';
}

/** 위성 카드의 모체 거리 라벨 — `지구로부터 거리` / `목성으로부터 거리`. */
export function parentDistanceLabel(parentNameKo: string): string {
  return `${parentNameKo}${josaRo(parentNameKo)}부터 거리`;
}
