'use client';

import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { getOnboardingDismissed, markOnboardingDismissed } from '@/lib/onboarding-storage';

/**
 * #737 — 첫 진입 온보딩 + 조작 가이드 모달.
 *
 * 첫 방문 사용자가 핵심 조작(천체 이동/선택/줌/회전/free-fly)을 즉시 이해하고, "조작 가이드"
 * 버튼으로 언제든 다시 볼 수 있게 한다. v3 완주(27 body) 이후 만들어둔 기능의 도달률(discoverability)
 * 을 높이기 위한 트랙 B 최우선(no-regret) 항목.
 *
 * ## 패턴 (#848 이후 — 공용 `Modal` 셸 위임)
 *
 *   portal(body) + `z-[100]` + `role="dialog"`/`aria-modal`/`aria-labelledby` + `data-modal-open`
 *   + Esc/backdrop 닫기 + 초기 focus/복원은 전부 `@/components/ui/modal` 의 계약이다. 본 컴포넌트는
 *   **자동 표시 판정 + 콘텐츠 + dismiss 영속** 만 책임진다.
 *
 *   #737 당시 "raw 패턴이라 완전 focus-trap 은 axe 결과로 판단" 으로 유예했던 항목이 #848 에서
 *   해소됐다 — axe 정적 검사는 Tab 탈출을 보지 못하는 사각이었고(a11y-baseline 0 위반 유지),
 *   전수 감사(2026-07-18)에서 키보드 사각으로 재발견됐다.
 *
 *   `fallbackFocusRef` 로 trigger 버튼을 넘긴다: 자동 표시 경로는 열림 시점 활성 요소가 `body` 라
 *   복원 대상이 없으므로 "조작 가이드" 버튼으로 되돌린다(수동 열기는 trigger 가 직전 포커스라 동일 결과).
 *
 * ## Esc 충돌 가드 (architect 핵심결정 1 — `data-modal-open` 컨벤션 SSoT)
 *
 *   모달 컨테이너의 `data-modal-open="true"` 속성(공용 `Modal` 이 박제)을 focus-quick-buttons 의 Esc
 *   핸들러가 검사한다. 그쪽은 native `window.addEventListener('keydown')` 라 React `stopPropagation`
 *   으로 차단 불가 → `document.querySelector('[data-modal-open="true"]')` 가드로 free-fly 오발화를
 *   막는다 (about/sensitivity/onboarding 3 모달 일괄 정합).
 *
 * ## 콘텐츠 SSoT (camera.ts / sim-canvas.tsx 실측 바인딩 — 임의 변경 금지)
 *
 *   WASD_KEYS = w/a/s/d/q/e (camera.ts:116) / ArcRotate 화살표 회전 / wheelDeltaPercentage 줌 /
 *   PANNING(우클릭 드래그) / Esc = selectedBodyId!==null 일 때 free-fly 진입.
 *   모바일/터치 분기: 터치 기기엔 WASD/우클릭 무의미 → "마우스·키보드 / 터치" 섹션 분리.
 *
 * ## 관련 이슈
 *
 *   - 이슈 #737 — architect 설계 코멘트 (핵심결정 1·2·4·5 / 조작 안내 콘텐츠 표)
 */

/** 마우스·키보드 조작 안내 (데스크톱). */
const POINTER_GUIDE: ReadonlyArray<{ action: string; how: string }> = [
  { action: '천체 이동', how: '상단 단축 바의 천체 버튼 클릭' },
  { action: '천체 선택', how: '화면의 천체를 직접 클릭 (같은 위치 반복 클릭 = 뒤 천체 순환)' },
  { action: '줌', how: '마우스 휠 위/아래' },
  { action: '회전', how: '드래그 또는 방향키 ←↑↓→' },
  { action: '처음으로', how: '단축 바 "reset" 버튼' },
];

/** 탐색(free-fly) 모드 조작 안내 (마우스·키보드 전용). */
const FREE_FLY_GUIDE: ReadonlyArray<{ action: string; how: string }> = [
  { action: '탐색 모드 진입', how: '단축 바 "탐색" 버튼, 또는 천체 선택 중 Esc' },
  { action: '이동', how: 'W/S 전후진 · A/D 좌우 · Q/E 상하' },
  { action: '패닝', how: '우클릭 드래그' },
  { action: '줌', how: '마우스 휠' },
];

/** 터치(모바일) 조작 안내 — WASD/우클릭 대신 터치 제스처. */
const TOUCH_GUIDE: ReadonlyArray<{ action: string; how: string }> = [
  { action: '천체 이동', how: '상단 단축 바의 천체 버튼 탭' },
  { action: '천체 선택', how: '화면의 천체를 탭' },
  { action: '줌', how: '두 손가락 핀치 (오므리기/벌리기)' },
  { action: '회전', how: '한 손가락 드래그' },
];

function GuideTable({
  rows,
  testId,
}: {
  rows: ReadonlyArray<{ action: string; how: string }>;
  testId: string;
}) {
  return (
    <ul className="flex flex-col gap-2" data-testid={testId}>
      {rows.map((r) => (
        <li key={r.action} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
          <span className="text-body-sm font-semibold text-fg-primary shrink-0 sm:w-28">
            {r.action}
          </span>
          <span className="text-body-sm text-fg-secondary">{r.how}</span>
        </li>
      ))}
    </ul>
  );
}

export function OnboardingModal() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // 첫 방문 자동 표시 — mount 후 1회 localStorage 판정 (서버 렌더는 항상 닫힘 → Hydration 안전,
  // sensitivity Hydration 선례). 빈 deps = 마운트 1회만. dismiss 미박제 시 자동 open.
  //
  // ## 자동화 환경 가드 (navigator.webdriver) — #737 / #739
  //
  //   Playwright/WebDriver 등 자동화 브라우저(`navigator.webdriver === true`)에서는 자동표시를
  //   스킵한다. 자동표시 모달의 backdrop(`fixed inset-0 z-[100] backdrop-blur`)이 UI 클릭/픽셀
  //   verify 를 가로채는 것을 차단하기 위함이다. 실측: `verify:r-phase-allowlist` 의 focus-sun 버튼
  //   클릭이 `backdrop intercepts pointer events` 로 TimeoutError exit 2 (699-freefly-unified 의
  //   context 6곳+도 동일 영향). 테스트별 dismiss 는 context 8곳+ 분산이라 비효율 → production 1곳
  //   가드로 근본 해결. r1-ui-regression-guard.mjs 의 localStorage dismiss(176af2c)와 이중 방어.
  //   수동 호출("조작 가이드" 버튼)은 본 가드와 무관하게 정상 작동한다(가드는 자동표시 useEffect 한정).
  //   SSR 안전: 자동표시 useEffect 는 클라이언트 전용이나 방어적으로 typeof navigator 가드.
  useEffect(() => {
    const isAutomation = typeof navigator !== 'undefined' && navigator.webdriver;
    if (!isAutomation && !getOnboardingDismissed()) {
      // 외부 시스템(localStorage) 동기화 결과를 React 상태로 1회 반영 — 마운트 1회라 cascading
      // 무한루프 없음 (satellite-zoom-tooltip 의 외부 store sync 선례와 동일 정당 false-positive).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(true);
    }
  }, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        data-testid="onboarding-button"
        title="조작 가이드 (천체 이동 / 선택 / 줌 / 탐색)"
        aria-label="조작 가이드 열기"
        className="num text-caption bg-bg-surface/80 backdrop-blur border border-border-subtle rounded-sm px-2 py-1 text-fg-secondary hover:bg-bg-elevated transition-colors"
        style={{ transitionDuration: 'var(--duration-fast)' }}
      >
        조작 가이드
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="조작 가이드"
        titleId="onboarding-title"
        testId="onboarding-modal"
        closeTestId="onboarding-close"
        panelClassName="max-w-2xl max-h-[85vh]"
        fallbackFocusRef={triggerRef}
      >
        <p className="text-caption text-fg-secondary mb-5">
          태양계 시뮬레이터에 오신 걸 환영합니다. 아래 조작으로 27개 천체를 자유롭게 둘러볼 수
          있습니다. 이 안내는 우측 상단 &quot;조작 가이드&quot; 버튼으로 언제든 다시 볼 수 있습니다.
        </p>

        <section className="mb-5">
          <h3 className="text-body-sm text-fg-secondary mb-2">마우스 · 키보드</h3>
          <GuideTable rows={POINTER_GUIDE} testId="onboarding-pointer-guide" />
        </section>

        <section className="mb-5 pt-4 border-t border-border-subtle">
          <h3 className="text-body-sm text-fg-secondary mb-2">탐색 모드 (자유시점)</h3>
          <GuideTable rows={FREE_FLY_GUIDE} testId="onboarding-freefly-guide" />
        </section>

        <section className="mb-6 pt-4 border-t border-border-subtle">
          <h3 className="text-body-sm text-fg-secondary mb-2">터치 (모바일 · 태블릿)</h3>
          <GuideTable rows={TOUCH_GUIDE} testId="onboarding-touch-guide" />
        </section>

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-border-subtle">
          <button
            type="button"
            onClick={() => {
              markOnboardingDismissed();
              setOpen(false);
            }}
            data-testid="onboarding-dismiss"
            className="text-body-sm bg-bg-elevated hover:bg-bg-base border border-border-subtle rounded-sm px-3 py-1.5 text-fg-secondary transition-colors"
            style={{ transitionDuration: 'var(--duration-fast)' }}
          >
            다시 보지 않기
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            data-testid="onboarding-start"
            className="text-body-sm bg-primary/20 hover:bg-primary/30 border border-primary/40 rounded-sm px-3 py-1.5 text-fg-primary transition-colors"
            style={{ transitionDuration: 'var(--duration-fast)' }}
          >
            시작하기
          </button>
        </div>
      </Modal>
    </>
  );
}
