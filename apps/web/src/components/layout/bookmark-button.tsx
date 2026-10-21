'use client';

import { useSimStore } from '@/store/sim-store';
import { useCallback, useState } from 'react';

/**
 * 현재 시뮬 상태(t/focus/speed/engine/mode)를 담은 URL을 클립보드에 복사 (#108).
 *
 * URL sync는 기본 쓰기를 t에 대해 하지 않는다(매 프레임 쓰기 → 렌더 폭주).
 * 대신 이 버튼으로 "지금 이 순간"의 스냅샷을 URL로 고정해 공유/복원 가능.
 */
export function BookmarkButton() {
  const julianDate = useSimStore((s) => s.julianDate);
  const mode = useSimStore((s) => s.mode);
  const selectedBodyId = useSimStore((s) => s.selectedBodyId);
  const timeScale = useSimStore((s) => s.timeScale);
  const physicsEngine = useSimStore((s) => s.physicsEngine);
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    if (typeof window === 'undefined' || julianDate === null) return;
    const url = new URL(window.location.href);
    const sp = url.searchParams;
    sp.set('t', julianDate.toFixed(5));
    if (mode !== 'observe') sp.set('mode', mode);
    else sp.delete('mode');
    if (selectedBodyId) sp.set('focus', selectedBodyId);
    else sp.delete('focus');
    if (timeScale !== 86_400) sp.set('speed', String(timeScale));
    else sp.delete('speed');
    if (physicsEngine !== 'kepler') sp.set('engine', physicsEngine);
    else sp.delete('engine');
    const text = url.toString();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 폴백 — 클립보드 API 미지원 브라우저
      window.prompt('이 URL을 복사하세요', text);
    }
  }, [julianDate, mode, selectedBodyId, timeScale, physicsEngine]);

  return (
    <button
      type="button"
      data-testid="bookmark-button"
      onClick={copy}
      disabled={julianDate === null}
      title="현재 시각·포커스·엔진·속도를 URL에 담아 복사"
      className="num text-caption shrink-0 whitespace-nowrap max-[1439px]:inline-flex max-[1439px]:items-center px-2 py-1 rounded-sm border border-border-subtle bg-bg-surface/80 backdrop-blur text-fg-secondary hover:bg-bg-elevated disabled:opacity-40"
    >
      {/* #1281 — 1440 미만은 아이콘만, 라벨은 `sr-only` 로 접근 가능한 이름 보존 (계약 D5 · D9(d)). 모바일 세로 눌림뿐 아니라
            Linux 폰트(CI ubuntu)의 1280 에서 우측 그룹이 넘쳐 `?` 가 화면 밖으로 밀렸다 (PR #1283 CI 실측 우단 1286.6). */}
      {/* #1385 — 두 글리프를 한 칸에 겹쳐 두고 보이는 쪽만 바꾼다. 종전처럼 글자를 갈아 끼우면 `✓` 와 `🔖` 의 폭
            차이만큼 버튼 폭이 변해, 오른쪽 정렬된 상단 바의 다른 트리거(표시 패널 등)가 복사 직후와 1.5 s 뒤에 흔들렸다
            (macOS 실측 — 실 Chrome 4.875 px · headless SwiftShader 7.98 px). 열린 표시 패널은 「트리거가 움직였으면
            닫는다」(#1268) 라 그 사이 스크롤하면 닫혔다. 칸 폭은 항상 둘 중 넓은 쪽이다. `invisible`(visibility: hidden)
            이라 숨은 쪽은 자리만 차지한다. */}
      <span
        aria-hidden="true"
        data-testid="bookmark-icon"
        className="inline-grid place-items-center"
      >
        <span
          data-testid="bookmark-icon-idle"
          className={`col-start-1 row-start-1 ${copied ? 'invisible' : ''}`}
        >
          🔖
        </span>
        <span
          data-testid="bookmark-icon-copied"
          className={`col-start-1 row-start-1 ${copied ? '' : 'invisible'}`}
        >
          ✓
        </span>
      </span>
      <span className="max-[1439px]:sr-only">{copied ? ' 복사됨' : ' 북마크'}</span>
    </button>
  );
}
