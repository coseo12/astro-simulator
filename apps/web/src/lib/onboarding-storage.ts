/**
 * #737 — 첫 진입 온보딩 "다시 보지 않기" 영속 박제 SSoT.
 *
 * 첫 방문 사용자에게 조작 가이드 모달을 1회 자동 표시하고, 사용자가 "다시 보지 않기" 를 선택하면
 * localStorage 에 박제해 재방문 시 자동 표시를 막는다. 도움말 버튼으로는 언제든 재호출 가능.
 *
 * ## 스키마 — `{version, value}` (free-fly-sensitivity 패턴 답습, satellite-storage 의 단순 flag X)
 *
 *   `astro:onboarding-dismissed` → `{"version":1,"value":true}`
 *
 *   단순 `'1'` flag 대신 `{version, value}` 를 쓰는 이유: 온보딩 콘텐츠를 버전업(조작 추가/변경) 했을
 *   때 `ONBOARDING_SCHEMA_VERSION` 을 올리면 기존 dismiss 한 유저에게도 갱신 안내를 재노출할 수 있다.
 *   버전 불일치 시 "안 봤음"(false) 으로 판정 → 자동 표시 재개. 미미한 비용으로 확장성 확보
 *   (이슈 #737 architect 핵심결정 5, agy 이견 수용).
 *
 * ## SSR / localStorage 차단 환경 안전 (free-fly-sensitivity 3종 방어 정합)
 *
 *   1. **SSR 가드** — `typeof window === 'undefined'` (Next.js 서버 렌더 단계)
 *   2. **try/catch** — private mode / 사용자 차단 / quota / JSON 손상 → silent fallback
 *   3. 두 fallback 모두 `getOnboardingDismissed` → false 반환 (default = "안 봤음" → 자동 표시).
 *      dismiss 박제 실패 시도 silent — 다음 세션에서 다시 표시 (영구 학습 기회 박탈 회피, 시크릿 모드 안전)
 *
 * ## 관련 이슈 / ADR
 *
 *   - 이슈 #737 — architect 설계 코멘트 (핵심결정 5 — `{version,value}` 스키마)
 *   - `apps/web/src/store/free-fly-sensitivity.ts` — `{version,value}` 스키마 + 3종 방어 선례
 *   - `apps/web/src/lib/satellite-onboarding-storage.ts` — localStorage 가드 패턴 선례
 */

/** #737 — localStorage 키 (`astro:` 네임스페이스 정합 — sensitivity 와 동일 규약). */
export const ONBOARDING_STORAGE_KEY = 'astro:onboarding-dismissed';

/**
 * #737 — 온보딩 콘텐츠 스키마 버전. 조작 가이드 콘텐츠를 갱신(조작 추가/변경)할 때 1 증가시키면
 * 기존 dismiss 유저에게도 재노출된다 (버전 불일치 → "안 봤음" 판정).
 */
export const ONBOARDING_SCHEMA_VERSION = 1;

/**
 * 온보딩을 "다시 보지 않기"(dismiss) 박제했는지 검사.
 *
 * @returns 현재 스키마 버전으로 dismiss 박제되어 있으면 true, 아니면 false.
 *          SSR / localStorage 차단 / JSON 손상 / 버전 불일치 시 false (= 자동 표시).
 */
export function getOnboardingDismissed(): boolean {
  // (1) SSR 가드 — 서버 렌더 시 localStorage 부재.
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (raw === null) return false;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return false;
    const record = parsed as Record<string, unknown>;
    // (2) 스키마 버전 불일치 → false (구버전 dismiss 유저에게 갱신 콘텐츠 재노출).
    if (record.version !== ONBOARDING_SCHEMA_VERSION) return false;
    return record.value === true;
  } catch {
    // private mode / 사용자 차단 / quota / JSON 손상 등 — silent fallback (= 자동 표시).
    return false;
  }
}

/**
 * 온보딩 "다시 보지 않기"(dismiss) 박제.
 *
 * 현재 스키마 버전으로 `{version, value:true}` 를 저장한다. SSR / 쓰기 실패는 silent
 * (다음 세션에서 재표시 — 영구 학습 기회 박탈 회피).
 */
export function markOnboardingDismissed(): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  try {
    const payload = JSON.stringify({ version: ONBOARDING_SCHEMA_VERSION, value: true });
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, payload);
  } catch {
    // quota 초과 / private mode 등 — silent (다음 세션에서 재표시).
  }
}

/**
 * 테스트 / 디버그 helper — dismiss 박제 제거.
 *
 * 단위 테스트 정합 박제 + dev tools 에서 사용자가 "온보딩을 다시 보고 싶다" 요청 시 활용 가능.
 */
export function clearOnboardingDismissed(): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  try {
    window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
  } catch {
    // silent.
  }
}

/**
 * #737 — free-fly 진입 키 힌트 toast "글로벌 1회" 박제 키 (architect 핵심결정 6, agy 합의).
 *
 * free-fly 는 빈번히 진출입하는 모드라 진입마다 toast 는 피로 → 글로벌 최초 1회만 표시 후 박제.
 * 재학습은 "조작 가이드" 도움말 버튼으로 이원화. satellite-tooltip 의 per-body 키와 달리 글로벌 단일.
 * onboarding-dismissed 와 독립된 키 (별도 학습 경험) — 단순 flag `'1'` 로 충분 (콘텐츠 버전 무관).
 */
export const FREE_FLY_HINT_STORAGE_KEY = 'astro:free-fly-hint-shown';

/** free-fly 진입 키 힌트를 이미 표시했는지 검사. SSR / 차단 / 손상 시 false (= 다시 표시). */
export function getFreeFlyHintShown(): boolean {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return false;
  try {
    return window.localStorage.getItem(FREE_FLY_HINT_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** free-fly 진입 키 힌트 표시 완료 박제. SSR / 쓰기 실패는 silent (다음 진입 시 재표시). */
export function markFreeFlyHintShown(): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  try {
    window.localStorage.setItem(FREE_FLY_HINT_STORAGE_KEY, '1');
  } catch {
    // silent.
  }
}

/** 테스트 / 디버그 helper — free-fly 힌트 박제 제거. */
export function clearFreeFlyHintShown(): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  try {
    window.localStorage.removeItem(FREE_FLY_HINT_STORAGE_KEY);
  } catch {
    // silent.
  }
}
