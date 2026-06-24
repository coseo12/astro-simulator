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
    orbitLinesVisible: true, // #688 — 기본 ON 결정적 리셋
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
 *  - R10b #664: bar 전체 enabled (halley 15버튼째 승격 — disabled-path negative 는 tree/panel/preset 의 vi.mock 부분 mock 이 승계, ADR 20260612-r10b §축 5 ②)
 *  - allowlist 박제 body 버튼 (sun / mercury / venus) 은 활성
 *  - disabled 버튼 강제 클릭 시 focusOn 명령 발행 0 (HTML disabled 자체 차단)
 *  - tooltip (title 속성) 박제
 */
describe('FocusQuickButtons — R-Phase Allowlist 가드 UI (#402 + R4 #532 + R5 #594)', () => {
  it('R-Phase 박제 body (sun / mercury / venus / earth / moon / mars / jupiter) 는 활성', () => {
    render(<FocusQuickButtons />);
    expect(screen.getByTestId('focus-sun')).not.toBeDisabled();
    expect(screen.getByTestId('focus-mercury')).not.toBeDisabled();
    expect(screen.getByTestId('focus-venus')).not.toBeDisabled();
    expect(screen.getByTestId('focus-earth')).not.toBeDisabled();
    expect(screen.getByTestId('focus-moon')).not.toBeDisabled();
    expect(screen.getByTestId('focus-mars')).not.toBeDisabled(); // R5 #594
    expect(screen.getByTestId('focus-jupiter')).not.toBeDisabled(); // R6 #621
  });

  it('neptune (R9 #653 진입) 은 활성 — CURRENT_R_PHASE=9 1줄 자동 enabled (#613 Concrete Prediction)', () => {
    // R9 — 로드맵 마지막 행성 진입으로 FOCUS_BUTTONS 의 disabled 대상이 구조 소멸
    // (R10a 미등록 4 + R10b 혜성 3 전부 showInShortcutBar=false → bar 미등록). disabled-path
    // negative 는 celestial-tree / celestial-info-panel / scenario-presets 단위 테스트 (R10b #664
    // 부터 vi.mock 부분 mock 승계 — ADR 20260612-r10b §축 5 ②. 이전: halley —
    // R10a #659 에서 pluto 교체) 가 보존.
    render(<FocusQuickButtons />);
    expect(screen.getByTestId('focus-neptune')).not.toBeDisabled();
  });

  // R10a #659 — pluto 승격 케이스 단언 (PM Q3=A: pluto 만 추가, 나머지 4 미등록 검증).
  it('pluto (R10a #659 진입 + bar 승격) 은 활성 — 14버튼째 (거리순 마지막)', () => {
    render(<FocusQuickButtons />);
    expect(screen.getByTestId('focus-pluto')).not.toBeDisabled();
    expect(screen.getByTestId('focus-pluto')).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByTestId('focus-pluto')).toHaveAttribute('data-r-phase-disabled', 'false');
    expect(screen.getByTestId('focus-pluto')).not.toHaveAttribute('title');
  });

  it('pluto 버튼 텍스트 = "명왕성" (R10a 박제 + 한국어 라벨)', () => {
    render(<FocusQuickButtons />);
    expect(screen.getByTestId('focus-pluto')).toHaveTextContent('명왕성');
  });

  it('pluto 클릭 시 focusOn 명령 발행 (R10a #659 진입 검증)', () => {
    render(<FocusQuickButtons />);
    fireEvent.click(screen.getByTestId('focus-pluto'));
    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'pluto' });
  });

  it('neptune → pluto DOM 거리 순서 보존 (행성 거리순 블록 + 비-행성 후미 — pluto 가 14번째)', () => {
    render(<FocusQuickButtons />);
    const neptune = screen.getByTestId('focus-neptune');
    const pluto = screen.getByTestId('focus-pluto');
    expect(neptune.compareDocumentPosition(pluto)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  // R10b #664 — halley 승격 케이스 단언 (PM Q2=A: halley 만 추가, encke/swift-tuttle 미등록 검증).
  it('halley (R10b #664 진입 + bar 승격) 은 활성 — 15버튼째 (비-행성 카테고리 후미 컨벤션)', () => {
    render(<FocusQuickButtons />);
    expect(screen.getByTestId('focus-halley')).not.toBeDisabled();
    expect(screen.getByTestId('focus-halley')).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByTestId('focus-halley')).toHaveAttribute('data-r-phase-disabled', 'false');
    expect(screen.getByTestId('focus-halley')).not.toHaveAttribute('title');
  });

  it('halley 버튼 텍스트 = "핼리 혜성" (R10b 박제 + 한국어 라벨)', () => {
    render(<FocusQuickButtons />);
    expect(screen.getByTestId('focus-halley')).toHaveTextContent('핼리 혜성');
  });

  it('halley 클릭 시 focusOn 명령 발행 (R10b #664 진입 검증)', () => {
    render(<FocusQuickButtons />);
    fireEvent.click(screen.getByTestId('focus-halley'));
    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'halley' });
  });

  it('pluto → halley DOM 순서 보존 (비-행성 카테고리 후미 — halley 가 bar 마지막. ⚠️ a 17.834 AU 거리순 엄격 삽입 기각, ADR 20260612-r10b §축 6 컨벤션)', () => {
    render(<FocusQuickButtons />);
    const pluto = screen.getByTestId('focus-pluto');
    const halley = screen.getByTestId('focus-halley');
    expect(pluto.compareDocumentPosition(halley)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('ceres / haumea / makemake / eris 는 shortcut bar 미등록 (PM Q3=A — URL ?focus= 진입, #617 직교 축)', () => {
    render(<FocusQuickButtons />);
    expect(screen.queryByTestId('focus-ceres')).toBeNull();
    expect(screen.queryByTestId('focus-haumea')).toBeNull();
    expect(screen.queryByTestId('focus-makemake')).toBeNull();
    expect(screen.queryByTestId('focus-eris')).toBeNull();
  });

  it('encke / swift-tuttle 는 shortcut bar 미등록 (R10b PM Q2=A — URL ?focus= 진입, #617 직교 축)', () => {
    render(<FocusQuickButtons />);
    expect(screen.queryByTestId('focus-encke')).toBeNull();
    expect(screen.queryByTestId('focus-swift-tuttle')).toBeNull();
  });

  it('neptune 은 aria-disabled="false" + data-r-phase-disabled="false" (R9 enabled 전환)', () => {
    render(<FocusQuickButtons />);
    expect(screen.getByTestId('focus-neptune')).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByTestId('focus-neptune')).toHaveAttribute('data-r-phase-disabled', 'false');
  });

  it('활성 버튼은 aria-disabled="false" (R4 earth / moon + R5 mars + R6 jupiter 포함)', () => {
    render(<FocusQuickButtons />);
    expect(screen.getByTestId('focus-sun')).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByTestId('focus-venus')).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByTestId('focus-earth')).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByTestId('focus-moon')).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByTestId('focus-mars')).toHaveAttribute('aria-disabled', 'false'); // R5 #594
    expect(screen.getByTestId('focus-jupiter')).toHaveAttribute('aria-disabled', 'false'); // R6 #621
  });

  it('전 버튼 data-r-phase-disabled="false" 회귀 가드 selector 박제 (R9 — bar 전체 enabled)', () => {
    render(<FocusQuickButtons />);
    expect(screen.getByTestId('focus-sun')).toHaveAttribute('data-r-phase-disabled', 'false');
    expect(screen.getByTestId('focus-earth')).toHaveAttribute('data-r-phase-disabled', 'false');
    expect(screen.getByTestId('focus-moon')).toHaveAttribute('data-r-phase-disabled', 'false');
    expect(screen.getByTestId('focus-mars')).toHaveAttribute('data-r-phase-disabled', 'false'); // R5 #594
    expect(screen.getByTestId('focus-jupiter')).toHaveAttribute('data-r-phase-disabled', 'false'); // R6 #621
  });

  it('활성 버튼은 title 속성 없음 (불필요 노이즈 차단 — neptune 포함 R9 전환 검증)', () => {
    render(<FocusQuickButtons />);
    expect(screen.getByTestId('focus-sun')).not.toHaveAttribute('title');
    expect(screen.getByTestId('focus-earth')).not.toHaveAttribute('title');
    expect(screen.getByTestId('focus-moon')).not.toHaveAttribute('title');
    expect(screen.getByTestId('focus-mars')).not.toHaveAttribute('title'); // R5 #594
    expect(screen.getByTestId('focus-jupiter')).not.toHaveAttribute('title'); // R6 #621
    expect(screen.getByTestId('focus-neptune')).not.toHaveAttribute('title'); // R9 #653
  });

  it('neptune 클릭 시 focusOn 명령 발행 (R9 #653 진입 검증)', () => {
    render(<FocusQuickButtons />);
    fireEvent.click(screen.getByTestId('focus-neptune'));
    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'neptune' });
  });

  it('neptune 버튼 시각 차별화 해제 — opacity-50 cursor-not-allowed 부재 (R9 enabled)', () => {
    render(<FocusQuickButtons />);
    const neptuneBtn = screen.getByTestId('focus-neptune');
    expect(neptuneBtn.className).not.toContain('opacity-50');
    expect(neptuneBtn.className).not.toContain('cursor-not-allowed');
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

  it('triton 은 shortcut bar 미등록 (galilean/titan/titania 패턴 — URL ?focus=triton 진입)', () => {
    render(<FocusQuickButtons />);
    expect(screen.queryByTestId('focus-triton')).toBeNull();
  });
});

/**
 * #688 — 궤도선 on/off 토글 버튼 단위 테스트.
 *
 * 검증:
 *  - 버튼 렌더 + bar 마지막 (free-fly 다음 = 컨트롤 그룹 후미)
 *  - 기본 ON (store orbitLinesVisible=true) 일 때 aria-pressed=true + active 스타일
 *  - 클릭 → setOrbitLinesVisible command 발행 (toggle: true→false→true) + store 동기화
 *  - OFF 상태 (store false) 진입 시 aria-pressed=false (URL `?orbits=off` 초기값 시나리오)
 */
describe('FocusQuickButtons — 궤도선 토글 (#688)', () => {
  it('궤도선 토글 버튼 렌더 + bar 마지막 (free-fly 다음)', () => {
    render(<FocusQuickButtons />);
    const toggle = screen.getByTestId('toggle-orbits');
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveTextContent('궤도선');
    // 컨트롤 그룹 후미 — free-fly 버튼 다음 (DOM 순서).
    const freeFly = screen.getByTestId('focus-free-fly');
    expect(freeFly.compareDocumentPosition(toggle)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('기본 ON (store orbitLinesVisible=true) — aria-pressed=true + active 스타일', () => {
    useSimStore.setState({ orbitLinesVisible: true });
    render(<FocusQuickButtons />);
    const toggle = screen.getByTestId('toggle-orbits');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle.className).toContain('bg-primary/20'); // 켜짐 시각 구분
  });

  it('OFF (store orbitLinesVisible=false) — aria-pressed=false (URL ?orbits=off 시나리오)', () => {
    useSimStore.setState({ orbitLinesVisible: false });
    render(<FocusQuickButtons />);
    const toggle = screen.getByTestId('toggle-orbits');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle.className).not.toContain('bg-primary/20'); // 꺼짐 시각 구분
  });

  it('ON 상태 클릭 → setOrbitLinesVisible(false) command 발행 + store false', () => {
    useSimStore.setState({ orbitLinesVisible: true });
    render(<FocusQuickButtons />);
    fireEvent.click(screen.getByTestId('toggle-orbits'));
    expect(sentCommands).toContainEqual({ type: 'setOrbitLinesVisible', visible: false });
    expect(useSimStore.getState().orbitLinesVisible).toBe(false);
  });

  it('OFF 상태 클릭 → setOrbitLinesVisible(true) command 발행 + store true (양방향 토글)', () => {
    useSimStore.setState({ orbitLinesVisible: false });
    render(<FocusQuickButtons />);
    fireEvent.click(screen.getByTestId('toggle-orbits'));
    expect(sentCommands).toContainEqual({ type: 'setOrbitLinesVisible', visible: true });
    expect(useSimStore.getState().orbitLinesVisible).toBe(true);
  });
});

/**
 * #737 — Esc 충돌 가드 (`data-modal-open` 컨벤션 SSoT, architect 핵심결정 1).
 *
 * focus 중(selectedBodyId!==null) Esc 1회는 free-fly 진입이지만, 모달(about/sensitivity/onboarding)
 * 이 열려 있으면(`[data-modal-open="true"]` 존재) Esc 는 모달 닫기 전용이라 free-fly 오발화를 막아야
 * 한다. native window listener 라 React stopPropagation 으로 차단 불가 → DOM 속성 가드로 해소.
 *
 * ⚠️ R1 (architect 위험): 신규 모달은 컨테이너에 `data-modal-open="true"` 를 박제해야 본 가드가
 * 일관 동작한다 (회귀 가드 — 본 테스트가 가드 작동을 박제).
 */
describe('FocusQuickButtons — Esc 충돌 가드 (#737 data-modal-open)', () => {
  it('focus 중 모달 미오픈 + Esc → enterFreeFly 발화 (기존 #509 동작 보존)', () => {
    useSimStore.setState({ selectedBodyId: 'earth' });
    render(<FocusQuickButtons />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(sentCommands).toContainEqual({ type: 'enterFreeFly' });
  });

  it('focus 중 모달 오픈([data-modal-open]) + Esc → enterFreeFly 미발화 (모달 닫기 전용)', () => {
    useSimStore.setState({ selectedBodyId: 'earth' });
    render(<FocusQuickButtons />);
    // 모달 컨테이너 시뮬레이션 — body 에 data-modal-open 속성 요소 삽입.
    const modal = document.createElement('div');
    modal.setAttribute('data-modal-open', 'true');
    document.body.appendChild(modal);
    try {
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(sentCommands).not.toContainEqual({ type: 'enterFreeFly' });
    } finally {
      document.body.removeChild(modal);
    }
  });

  it('focus 없음(selectedBodyId=null) + Esc → enterFreeFly 미발화 (#509 no-op 보존)', () => {
    useSimStore.setState({ selectedBodyId: null });
    render(<FocusQuickButtons />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(sentCommands).not.toContainEqual({ type: 'enterFreeFly' });
  });
});
