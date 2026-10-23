// #1341 PR2 — 루트 named import (`scene` namespace 경유 금지 — 카드는 SSR 평가 대상, body-distance.ts 와 같은 사유).
import { getOrbitVisualScale } from '@astro-simulator/core';
import { AU, SPEED_OF_LIGHT } from '@astro-simulator/shared';
import {
  formatKmKo,
  formatSunDistance,
  groupThousands,
  type LoadedCelestialBody,
} from './body-info';

/**
 * #1341 PR2 — 두 천체 거리 자의 표시 문자열 (ADR `docs/decisions/20261015-1341-trail-ruler.md` 결정 R5 · R6).
 *
 * 거리 계산 자체는 `body-distance.ts` (`computeBodyPairDistance` — 물리 거리, 시각 배율 미적용) 가 한다. 여기는 그 값을
 * 사람이 읽는 문자열로 바꾸고, 화면 선이 물리 거리와 다르게 보이는 이유 (위성 궤도 시각 배율) 를 고지한다.
 */

/**
 * AU 표기 하한 (AU). 이 값 이상이면 `x.xx AU · y억 km`, 미만이면 km 만 (결정 R5 · Q-R4 (a)).
 * `formatSunDistance` 는 소수 2자리라 이 값 미만은 유효 숫자가 1자리 이하다 (`0.005 AU` 미만은 `0.00 AU` — 지구–달 거리가 그 예다).
 */
export const RULER_AU_DISPLAY_MIN = 0.01;

/**
 * 두 천체 거리 — `≥ 0.01 AU` 는 `1.52 AU · 2.28억 km`, 미만은 `38.4만 km`. 입력은 m.
 * `auDigits` 는 AU 소수 자리 ({@link formatSunDistance} — 기본 2). km 경계 (`RULER_AU_DISPLAY_MIN`) 는 자리 수와 무관하다.
 */
export function formatRulerDistance(meters: number, auDigits?: number): string {
  if (meters >= RULER_AU_DISPLAY_MIN * AU) return formatSunDistance(meters, auDigits);
  return formatKmKo(meters / 1000);
}

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3_600;

/**
 * 광시간 (연구 모드 — 결정 R5 · Q-R6 (a)) = 거리 / `SPEED_OF_LIGHT`.
 *
 * - 1분 미만 → 소수 2자리 초 (`1.28초` — 지구–달)
 * - 1시간 미만 → 정수 분 · 초 (`4분 20초`)
 * - 그 이상 → 정수 시간 · 분 (`4시간 10분`) — 해왕성 이원 천체는 수 시간이라 「분 · 초」 만으로는 수백 분이 된다.
 *
 * 단위 경계는 **반올림 후** 값으로 판정한다 (`formatKmKo` 와 같은 규칙 — 59.996 초가 `60.00초` 로 나오지 않게).
 */
export function formatLightTime(meters: number): string {
  const seconds = meters / SPEED_OF_LIGHT;
  if (Number(seconds.toFixed(2)) < SECONDS_PER_MINUTE) return `${seconds.toFixed(2)}초`;
  const total = Math.round(seconds);
  if (total < SECONDS_PER_HOUR) {
    return `${Math.floor(total / SECONDS_PER_MINUTE)}분 ${total % SECONDS_PER_MINUTE}초`;
  }
  const totalMinutes = Math.round(seconds / SECONDS_PER_MINUTE);
  return `${Math.floor(totalMinutes / 60)}시간 ${totalMinutes % 60}분`;
}

/**
 * 위성 시각 배율 고지 (결정 R6 · Q-R5 (a)). A · B 중 위성 (모체가 계 중심이 아닌 천체) 이고 그 시각 배율이 1 이 아니면
 * 천체마다 한 줄. N 은 장면과 같은 SSoT `getOrbitVisualScale(parentId, id)` — 하드코딩하지 않는다.
 *
 * 화면 선은 장면 메시 위치 (위성은 모체로부터 ×N) 를 잇고, 수치는 물리 거리라 둘이 다르게 보이는 이유를 알린다.
 *
 * **Kepler 엔진에서만** (ADR Amendment 1, PR #1344 리뷰 B1) — 시각 배율은 장면 Kepler 경로 (`resolveWorld`) 만 곱한다.
 * N-body 경로 (Newton · Barnes-Hut · WebGPU) 는 엔진 위치를 그대로 그려 위성이 물리 거리에 있으므로 「×N 떨어져」 는
 * 거짓이 된다 (리뷰 실측: Newton 에서 지구–달 메시 거리 비 `30.00`).
 *
 * @param keplerEngine 활성 물리 엔진이 Kepler 인가. false 면 고지 0.
 */
export function rulerVisualScaleNotices(
  bodiesById: ReadonlyMap<string, LoadedCelestialBody>,
  ids: readonly string[],
  keplerEngine: boolean,
): string[] {
  const notices: string[] = [];
  if (!keplerEngine) return notices;
  for (const id of ids) {
    const body = bodiesById.get(id);
    const parent = body?.parentId != null ? bodiesById.get(body.parentId) : undefined;
    // 모체가 계 중심 (태양) 이면 위성이 아니다 — 카드의 모체 거리 행과 같은 판정.
    if (!body || !parent || parent.parentId == null) continue;
    const scale = getOrbitVisualScale(parent.id, body.id);
    if (scale === 1) continue;
    const n = Number.isInteger(scale) ? groupThousands(scale) : String(scale);
    notices.push(`화면의 ${body.nameKo} 위치는 모체로부터 ×${n} 떨어져 그려집니다`);
  }
  return notices;
}
