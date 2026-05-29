import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoreCommand } from '@astro-simulator/shared';
import { useSimStore } from '@/store/sim-store';
import { FocusQuickButtons } from './focus-quick-buttons';

let sentCommands: CoreCommand[] = [];
vi.mock('@/core/sim-context', () => ({
  useSimCommand: () => (cmd: CoreCommand) => {
    sentCommands.push(cmd);
  },
}));

beforeEach(() => {
  sentCommands = [];
  useSimStore.setState({
    rendererKind: null,
    engineError: null,
    mode: 'observe',
    julianDate: null,
    selectedBodyId: null,
    timeScale: 86_400,
    fps: null,
    unitSystem: 'astro',
    pingCount: 0,
    lastPingAt: null,
  });
});

/**
 * R2 #361 / R3 #369 / R4 #532 — FocusQuickButtons 단위 테스트.
 *
 * D-S1 (shortcut bar 수성/금성 항목 추가) 검증 + R4 D3 (moon 추가, 7개로 확장):
 *   1. 7 body 버튼 (sun / mercury / venus / earth / moon / jupiter / neptune) + reset 버튼 렌더
 *   2. mercury / venus / earth / moon 클릭 시 focusOn 명령 발행 (R1 패턴 재사용)
 *   3. 천체 거리 순서 (sun → mercury → venus → earth → moon → jupiter → neptune) 보존
 *      moon 은 parent-satellite 자연 그룹 (earth 인접)
 *
 * ADR: docs/decisions/20260428-r2-mercury-visualization.md §결정 2 +
 *       docs/decisions/20260429-r3-venus-visualization.md §결정 +
 *       docs/decisions/20260520-r4-earth-moon-visualization.md §결정 5
 *
 * #416 — R2/R3 활성 케이스 describe 제목 + venus 명시 단언 1개 보강 (PR #414 reviewer 권고 4).
 */
describe('FocusQuickButtons — R1 sun + R2 mercury + R3 venus + R4 earth + moon', () => {
  it('7 body 버튼 + reset 렌더 (R1 sun + R2 mercury + R3 venus + R4 earth + moon + R5+ placeholder)', () => {
    render(<FocusQuickButtons />);
    expect(screen.getByTestId('focus-sun')).toBeInTheDocument();
    expect(screen.getByTestId('focus-mercury')).toBeInTheDocument();
    expect(screen.getByTestId('focus-venus')).toBeInTheDocument();
    expect(screen.getByTestId('focus-earth')).toBeInTheDocument();
    expect(screen.getByTestId('focus-moon')).toBeInTheDocument();
    expect(screen.getByTestId('focus-jupiter')).toBeInTheDocument();
    expect(screen.getByTestId('focus-neptune')).toBeInTheDocument();
    expect(screen.getByTestId('focus-reset')).toBeInTheDocument();
  });

  it('mercury 버튼 텍스트 = "수성" (한국어 라벨, axe 자연 라벨)', () => {
    render(<FocusQuickButtons />);
    expect(screen.getByTestId('focus-mercury')).toHaveTextContent('수성');
  });

  it('mercury 클릭 시 focusOn 명령 발행 (R1 sun 패턴 재사용)', () => {
    render(<FocusQuickButtons />);
    fireEvent.click(screen.getByTestId('focus-mercury'));
    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'mercury' });
  });

  // #416 — R3 venus 명시 단언 (PR #414 reviewer 권고 4 — R2/R3 활성 케이스 의미 정합성).
  it('venus 클릭 시 focusOn 명령 발행 (R3 #369 진입 검증)', () => {
    render(<FocusQuickButtons />);
    fireEvent.click(screen.getByTestId('focus-venus'));
    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'venus' });
  });

  it('venus 버튼 텍스트 = "금성" (한국어 라벨, axe 자연 라벨)', () => {
    render(<FocusQuickButtons />);
    expect(screen.getByTestId('focus-venus')).toHaveTextContent('금성');
  });

  it('sun 클릭 시 focusOn 명령 발행 (R1 회귀 0)', () => {
    render(<FocusQuickButtons />);
    fireEvent.click(screen.getByTestId('focus-sun'));
    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'sun' });
  });

  it('reset 클릭 시 resetCamera 명령 발행', () => {
    render(<FocusQuickButtons />);
    fireEvent.click(screen.getByTestId('focus-reset'));
    expect(sentCommands).toContainEqual({ type: 'resetCamera' });
  });

  it('mercury 가 selectedBodyId 일 때 active 스타일 적용', () => {
    useSimStore.setState({ selectedBodyId: 'mercury' });
    render(<FocusQuickButtons />);
    const btn = screen.getByTestId('focus-mercury');
    // active 상태에서는 bg-primary/20 텍스트 색상 변경 (focus-quick-buttons.tsx 28-30 라인)
    expect(btn.className).toContain('bg-primary/20');
  });

  it('sun → mercury → venus → earth → moon → jupiter → neptune 거리 순서 보존 (R4 moon 인접)', () => {
    render(<FocusQuickButtons />);
    const buttons = [
      screen.getByTestId('focus-sun'),
      screen.getByTestId('focus-mercury'),
      screen.getByTestId('focus-venus'),
      screen.getByTestId('focus-earth'),
      screen.getByTestId('focus-moon'),
      screen.getByTestId('focus-jupiter'),
      screen.getByTestId('focus-neptune'),
    ];
    // DOM 순서가 천체 거리 순서 + parent-satellite 자연 그룹 (R4 #532) 과 일치하는지 검증.
    // Node.compareDocumentPosition: 0x04 (DOCUMENT_POSITION_FOLLOWING)
    // = a 가 b 보다 앞에 있음.
    for (let i = 0; i < buttons.length - 1; i++) {
      const current = buttons[i];
      const next = buttons[i + 1];
      if (!current || !next) throw new Error('button index OOB — 7 body 보장 위배');
      expect(current.compareDocumentPosition(next)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    }
  });
});

/**
 * #402 R-Phase Allowlist 가드 — UI 측면 단위 테스트 (defense-in-depth).
 *
 * ADR `docs/decisions/20260504-r-phase-allowlist-guard.md` §결정 2.
 *
 * 검증:
 *  - allowlist 외 body 버튼 (earth / jupiter / neptune) 은 disabled + aria-disabled + data-r-phase-disabled
 *  - allowlist 박제 body 버튼 (sun / mercury / venus) 은 활성
 *  - disabled 버튼 강제 클릭 시 focusOn 명령 발행 0 (HTML disabled 자체 차단)
 *  - tooltip (title 속성) 박제
 */
describe('FocusQuickButtons — R-Phase Allowlist 가드 UI (#402 + R4 #532 + R5 #594)', () => {
  it('R-Phase 박제 body (sun / mercury / venus / earth / moon / mars) 는 활성', () => {
    render(<FocusQuickButtons />);
    expect(screen.getByTestId('focus-sun')).not.toBeDisabled();
    expect(screen.getByTestId('focus-mercury')).not.toBeDisabled();
    expect(screen.getByTestId('focus-venus')).not.toBeDisabled();
    expect(screen.getByTestId('focus-earth')).not.toBeDisabled();
    expect(screen.getByTestId('focus-moon')).not.toBeDisabled();
    expect(screen.getByTestId('focus-mars')).not.toBeDisabled(); // R5 #594
  });

  it('R-Phase 미박제 body (jupiter / neptune) 는 disabled', () => {
    render(<FocusQuickButtons />);
    expect(screen.getByTestId('focus-jupiter')).toBeDisabled();
    expect(screen.getByTestId('focus-neptune')).toBeDisabled();
  });

  it('disabled 버튼은 aria-disabled="true" 설정 (스크린 리더 인지)', () => {
    render(<FocusQuickButtons />);
    expect(screen.getByTestId('focus-jupiter')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('focus-neptune')).toHaveAttribute('aria-disabled', 'true');
  });

  it('활성 버튼은 aria-disabled="false" (R4 earth / moon + R5 mars 포함)', () => {
    render(<FocusQuickButtons />);
    expect(screen.getByTestId('focus-sun')).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByTestId('focus-venus')).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByTestId('focus-earth')).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByTestId('focus-moon')).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByTestId('focus-mars')).toHaveAttribute('aria-disabled', 'false'); // R5 #594
  });

  it('disabled 버튼은 data-r-phase-disabled="true" 회귀 가드 selector 박제', () => {
    render(<FocusQuickButtons />);
    expect(screen.getByTestId('focus-jupiter')).toHaveAttribute('data-r-phase-disabled', 'true');
    expect(screen.getByTestId('focus-sun')).toHaveAttribute('data-r-phase-disabled', 'false');
    expect(screen.getByTestId('focus-earth')).toHaveAttribute('data-r-phase-disabled', 'false');
    expect(screen.getByTestId('focus-moon')).toHaveAttribute('data-r-phase-disabled', 'false');
    expect(screen.getByTestId('focus-mars')).toHaveAttribute('data-r-phase-disabled', 'false'); // R5 #594
  });

  it('disabled 버튼은 tooltip (title 속성) 박제 — 사용자 안내', () => {
    render(<FocusQuickButtons />);
    const jupiterBtn = screen.getByTestId('focus-jupiter');
    expect(jupiterBtn).toHaveAttribute('title');
    expect(jupiterBtn.getAttribute('title')).toMatch(/구현|R-Phase/);
  });

  it('활성 버튼은 title 속성 없음 (불필요 노이즈 차단)', () => {
    render(<FocusQuickButtons />);
    expect(screen.getByTestId('focus-sun')).not.toHaveAttribute('title');
    expect(screen.getByTestId('focus-earth')).not.toHaveAttribute('title');
    expect(screen.getByTestId('focus-moon')).not.toHaveAttribute('title');
    expect(screen.getByTestId('focus-mars')).not.toHaveAttribute('title'); // R5 #594
  });

  it('disabled 버튼 강제 click → focusOn 명령 발행 0 (HTML disabled 자체 차단)', () => {
    render(<FocusQuickButtons />);
    fireEvent.click(screen.getByTestId('focus-jupiter'));
    fireEvent.click(screen.getByTestId('focus-neptune'));
    // HTML button[disabled] 는 click 이벤트 자체를 dispatch 하지 않음.
    expect(sentCommands.filter((c) => c.type === 'focusOn')).toEqual([]);
  });

  it('disabled 버튼 시각 차별화 — opacity-50 cursor-not-allowed 클래스 박제', () => {
    render(<FocusQuickButtons />);
    const jupiterBtn = screen.getByTestId('focus-jupiter');
    expect(jupiterBtn.className).toContain('opacity-50');
    expect(jupiterBtn.className).toContain('cursor-not-allowed');
  });

  it('venus 버튼 텍스트 = "금성" (R3 박제 + 한국어 라벨)', () => {
    render(<FocusQuickButtons />);
    expect(screen.getByTestId('focus-venus')).toHaveTextContent('금성');
  });

  it('venus 클릭 시 focusOn 명령 발행 (R3 정상 활성)', () => {
    render(<FocusQuickButtons />);
    fireEvent.click(screen.getByTestId('focus-venus'));
    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'venus' });
  });

  // R4 #532 — earth / moon 활성 케이스 단언 (D3 검증).
  it('earth 버튼 텍스트 = "지구" (R4 박제 + 한국어 라벨)', () => {
    render(<FocusQuickButtons />);
    expect(screen.getByTestId('focus-earth')).toHaveTextContent('지구');
  });

  it('moon 버튼 텍스트 = "달" (R4 박제 + 한국어 라벨)', () => {
    render(<FocusQuickButtons />);
    expect(screen.getByTestId('focus-moon')).toHaveTextContent('달');
  });

  it('earth 클릭 시 focusOn 명령 발행 (R4 #532 진입 검증)', () => {
    render(<FocusQuickButtons />);
    fireEvent.click(screen.getByTestId('focus-earth'));
    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'earth' });
  });

  it('moon 클릭 시 focusOn 명령 발행 (R4 #532 satellite 첫 본 사례)', () => {
    render(<FocusQuickButtons />);
    fireEvent.click(screen.getByTestId('focus-moon'));
    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'moon' });
  });

  // R5 #594 — mars 활성 케이스 단언 (Q4a=A: mars 만 추가, phobos/deimos 미등록 검증)
  it('mars 버튼 텍스트 = "화성" (R5 박제 + 한국어 라벨)', () => {
    render(<FocusQuickButtons />);
    expect(screen.getByTestId('focus-mars')).toHaveTextContent('화성');
  });

  it('mars 클릭 시 focusOn 명령 발행 (R5 #594 Q2=B 2번째 본 인스턴스화)', () => {
    render(<FocusQuickButtons />);
    fireEvent.click(screen.getByTestId('focus-mars'));
    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'mars' });
  });

  it('phobos / deimos 는 shortcut bar 미등록 (Q4a=A — 모바일 너비 안전)', () => {
    render(<FocusQuickButtons />);
    // R5 ADR §결정 8: phobos/deimos 는 URL override 또는 mars focus zoom-in 후 mesh 클릭 진입.
    // shortcut bar 미등록으로 10 버튼 (sun/mercury/venus/earth/moon/mars/jupiter/neptune + reset + free-fly)
    // = 356 px < 375 px 모바일 viewport (margin 19 px).
    expect(screen.queryByTestId('focus-phobos')).toBeNull();
    expect(screen.queryByTestId('focus-deimos')).toBeNull();
  });
});
