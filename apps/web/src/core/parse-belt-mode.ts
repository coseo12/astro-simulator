/**
 * #1319 PR3 — `?belt=` · `?kuiper=` URL 파라미터 → 소행성대 · 카이퍼 벨트 초기 상태 파싱 순수 함수
 * (ADR `docs/decisions/20261008-1319-asteroid-belt-gpu.md` 결정 6 · 사용자 결정 Q5).
 *
 * `?belt=` 어휘 — 기존 숫자 의미(`?belt=N` = 입자 수, bench 스윕 · verify 스크립트가 쓴다) 를 유지하고 `off` 를 더한다:
 *  - 미지정 / `on`: 켜짐 · 수 미지정 (장면 기본 수) · 강제 아님 (소프트웨어 렌더 게이트 대상 — 결정 3)
 *  - `off` (대소문자 무시): 꺼짐
 *  - 숫자 `N` (내림 후) `≥ 1`: 켜짐 · 수 `min(N, ASTEROID_BELT_MAX_N)` · **강제 생성** (소프트웨어 렌더에서도 만든다 —
 *    bench 스윕 · `verify:belt-nbody` · `verify:webgpu` 무수정 호환)
 *  - 숫자 `N` (내림 후) `≤ 0` (`0` · 음수 · `0.5`): 꺼짐. `0` · 음수는 구 파서 (`[0, 10000]` clamp, 내림 없음) 도 `0` 이라
 *    만들지 않았다 — 의미 보존. `0 < N < 1` 은 다르다: 구 파서는 `0.5` 를 그대로 넘겨 생성 경로로 갔다 (PR2 기준 소행성대
 *    0 개 + 카이퍼 1500). 이제 내림 후 `0` 으로 꺼짐이다 — 소수 입자 수는 뜻이 없어 정수 판정으로 통일했다.
 *  - 그 외: 켜짐 (기본) + `console.warn` — 기존 `parse-*-mode.ts` 의 「모르는 값 → 기본 동작」 과 같은 처리
 *
 * `?kuiper=` 는 기존 `parse-*-mode.ts` 와 같은 on/off 어휘다 (미지정 · `on` → 켜짐 / `off` → 꺼짐 / 그 외 → 켜짐 + warn).
 *
 * URL 초기값만 결정한다. 런타임 토글은 표시 패널이 `useDisplayToggle` 로 발행하며, 그때 URL 은 역방향
 * `serializeDisplayToggle` (ON = 키 삭제 / OFF = `off`) 로 쓴다 — round-trip 은 `display-toggles.test.ts` 가 고정한다.
 * ⚠️ 그래서 `?belt=1000` 으로 로드한 뒤 패널에서 껐다 켜면 URL 의 수는 지워진다 (ON = 키 삭제 규약). 장면의 메시는
 * 그대로라 화면은 같고, 새로고침하면 기본 수로 돌아간다.
 */

import { ASTEROID_BELT_MAX_N } from '@astro-simulator/core';

export interface BeltParam {
  /** 소행성대 표시 의도. */
  visible: boolean;
  /** 명시 입자 수 (`?belt=N`, clamp 후). `null` = 미지정 → 장면 기본 수. */
  count: number | null;
  /** 명시 수가 있으면 소프트웨어 렌더에서도 생성한다 (결정 3). `count !== null` 과 같다. */
  forced: boolean;
}

const BELT_DEFAULT: BeltParam = { visible: true, count: null, forced: false };
const BELT_OFF: BeltParam = { visible: false, count: null, forced: false };

export function parseBeltParam(urlParam: string | null | undefined): BeltParam {
  if (urlParam === null || urlParam === undefined || urlParam.trim() === '') return BELT_DEFAULT;
  const normalized = urlParam.trim().toLowerCase();
  if (normalized === 'off') return BELT_OFF;
  if (normalized === 'on') return BELT_DEFAULT;
  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) {
    const n = Math.floor(numeric);
    if (n < 1) return BELT_OFF;
    const count = Math.min(n, ASTEROID_BELT_MAX_N);
    return { visible: true, count, forced: true };
  }
  console.warn(`[parse-belt-mode] 알 수 없는 ?belt=${urlParam} — ON (기본) 으로 폴백`);
  return BELT_DEFAULT;
}

/** 표시 토글 표의 역방향 파서 (`DisplayToggleDef.parse`) — 의도만. */
export function parseBeltVisible(urlParam: string | null | undefined): boolean {
  return parseBeltParam(urlParam).visible;
}

export function parseKuiperVisible(urlParam: string | null | undefined): boolean {
  if (urlParam === null || urlParam === undefined || urlParam === '') return true;
  const normalized = urlParam.toLowerCase();
  if (normalized === 'off') return false;
  if (normalized === 'on') return true;
  console.warn(`[parse-belt-mode] 알 수 없는 ?kuiper=${urlParam} — ON (기본) 으로 폴백`);
  return true;
}

/**
 * 띠 메시를 로드 시 만들지 — 소프트웨어 렌더 게이트 (결정 3). `resolveStarfieldVisible` 과 같은 레이어 분리: 판정은
 * web 이 하고 core 에는 결과 boolean 만 넘긴다 (ADR §교차검증 이견 수용 5).
 *
 * @param visible URL 의도
 * @param forced 명시 `?belt=N` (소프트웨어에서도 생성)
 * @param allowBelt 렌더러가 띠 생성을 허용하는가 (`!isSoftwareRenderer`)
 */
export function resolveBeltAtLoad(visible: boolean, forced: boolean, allowBelt: boolean): boolean {
  return visible && (forced || allowBelt);
}
