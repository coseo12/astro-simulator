/**
 * P7-E #210 / #220 — 모바일 기기 감지 유틸.
 *
 * 기존: `sim-canvas.tsx` 내부 `/Mobi|Android|iPhone|iPad/i.test(ua)` 인라인 체크.
 *
 * 문제 (#220):
 *   iPadOS 13+ 는 기본적으로 "Mac Safari" UA 를 보낸다 (`Macintosh; Intel Mac OS X ...`).
 *   → iPad가 데스크톱으로 오인되어 P7-D 모바일 best-effort 경고가 표시되지 않는다.
 *
 * 완화 (Apple 공식 권고):
 *   - UA `Macintosh` + `navigator.maxTouchPoints > 1` 조합이면 iPadOS 로 판정.
 *   - 실제 데스크톱 Mac 은 터치 지원이 없어 `maxTouchPoints === 0` — 오탐 없음.
 *
 * 테스트 용이성을 위해 navigator 객체를 인자로 받는 순수 함수로 분리.
 * 런타임 호출자는 `detectIsMobile(navigator)` 형태로 호출한다.
 */
export interface NavigatorLike {
  userAgent: string;
  /** iPadOS 13+ desktop UA 감지용. 최근 Safari/Chrome 은 모두 지원. */
  maxTouchPoints?: number;
}

export function detectIsMobile(nav: NavigatorLike): boolean {
  const ua = nav.userAgent ?? '';
  // 전통 모바일 UA (Android, iPhone, iPad 명시적 UA).
  if (/Mobi|Android|iPhone|iPad/i.test(ua)) return true;
  // iPadOS 13+ desktop UA 우회 — Macintosh UA + 다중 터치 포인트.
  const maxTouchPoints = typeof nav.maxTouchPoints === 'number' ? nav.maxTouchPoints : 0;
  if (maxTouchPoints > 1 && /Macintosh/i.test(ua)) return true;
  return false;
}
