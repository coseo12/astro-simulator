import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useRef, useState } from 'react';
import { Modal } from './modal';

/**
 * #848 — 공용 `Modal` 계약 테스트.
 *
 * 검증 축:
 *   1. portal → document.body 직속 + `z-[100]` (about-modal 의 비-portal `z-40` 회귀 차단)
 *   2. Tab / Shift+Tab 순환이 패널 내부에 갇힘 (user-event 의 실제 tab 시뮬레이션)
 *   3. Esc / backdrop / 닫기 버튼 닫힘
 *   4. open 시 닫기 버튼 focus, close 시 직전 포커스 요소 복원
 *   5. `role="dialog"` + `aria-modal` + `aria-labelledby` + `data-modal-open` 속성 계약
 */

/** 트리거 버튼 + 배경 버튼을 가진 실사용 형태 하니스. */
function Harness({ withFallback = false }: { withFallback?: boolean }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  return (
    <div>
      <button data-testid="background-before">배경 앞</button>
      <button ref={triggerRef} data-testid="trigger" onClick={() => setOpen(true)}>
        열기
      </button>
      <button data-testid="background-after">배경 뒤</button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="테스트 모달"
        titleId="test-title"
        testId="test-modal"
        closeTestId="test-close"
        {...(withFallback ? { fallbackFocusRef: triggerRef } : {})}
      >
        <button data-testid="inner-a">A</button>
        <button data-testid="inner-b">B</button>
      </Modal>
    </div>
  );
}

describe('Modal (#848 공용 셸)', () => {
  it('open=false — 아무것도 렌더하지 않음 (SSR/hydration 안전)', () => {
    render(
      <Modal open={false} onClose={vi.fn()} title="t" titleId="t" testId="m" closeTestId="c">
        <span>내용</span>
      </Modal>,
    );
    expect(screen.queryByTestId('m')).toBeNull();
  });

  it('portal — backdrop 이 document.body 직속 + z-[100]', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByTestId('trigger'));

    const panel = screen.getByTestId('test-modal');
    const backdrop = panel.parentElement!;
    expect(backdrop.parentElement).toBe(document.body);
    // #704 D-T2 — canvas 합성 레이어 위 보장. `z-40` 회귀 차단.
    expect(backdrop.className).toContain('z-[100]');
    expect(backdrop.className).not.toContain('z-40');
  });

  it('a11y 속성 계약 — role/aria-modal/aria-labelledby/data-modal-open', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByTestId('trigger'));

    const panel = screen.getByTestId('test-modal');
    expect(panel).toHaveAttribute('role', 'dialog');
    expect(panel).toHaveAttribute('aria-modal', 'true');
    expect(panel).toHaveAttribute('aria-labelledby', 'test-title');
    // focus-quick-buttons 의 Esc 오발화 가드 SSoT (#737 핵심결정 1).
    expect(panel).toHaveAttribute('data-modal-open', 'true');
    expect(screen.getByRole('heading', { name: '테스트 모달' })).toHaveAttribute(
      'id',
      'test-title',
    );
  });

  it('open 시 닫기 버튼으로 초기 focus', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByTestId('trigger'));
    expect(document.activeElement).toBe(screen.getByTestId('test-close'));
  });

  describe('focus trap — Tab 순환이 모달 내부에 갇힘', () => {
    it('마지막 요소 → Tab → 첫 요소', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByTestId('trigger'));

      // 포커서블 순서: close → inner-a → inner-b
      const close = screen.getByTestId('test-close');
      const innerA = screen.getByTestId('inner-a');
      const innerB = screen.getByTestId('inner-b');

      await user.tab();
      expect(document.activeElement).toBe(innerA);
      await user.tab();
      expect(document.activeElement).toBe(innerB);
      // 마지막에서 Tab → 배경으로 새지 않고 첫 요소로 순환.
      await user.tab();
      expect(document.activeElement).toBe(close);
    });

    it('첫 요소 → Shift+Tab → 마지막 요소', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByTestId('trigger'));

      expect(document.activeElement).toBe(screen.getByTestId('test-close'));
      await user.tab({ shift: true });
      expect(document.activeElement).toBe(screen.getByTestId('inner-b'));
    });

    it('Tab 을 여러 번 눌러도 배경 버튼에 도달하지 않음', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByTestId('trigger'));

      const panel = screen.getByTestId('test-modal');
      for (let i = 0; i < 10; i += 1) {
        await user.tab();
        expect(panel.contains(document.activeElement)).toBe(true);
      }
      expect(document.activeElement).not.toBe(screen.getByTestId('background-before'));
      expect(document.activeElement).not.toBe(screen.getByTestId('background-after'));
    });

    it('포커스가 모달 밖으로 나간 상태에서 Tab → 모달 첫 요소로 회수', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByTestId('trigger'));

      // 배경 요소가 강제로 포커스를 가져간 상황 시뮬레이션.
      screen.getByTestId('background-after').focus();
      expect(document.activeElement).toBe(screen.getByTestId('background-after'));

      await user.tab();
      expect(document.activeElement).toBe(screen.getByTestId('test-close'));
    });
  });

  describe('닫기 경로', () => {
    it('Esc → 닫힘', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByTestId('trigger'));
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByTestId('test-modal')).toBeNull();
    });

    it('backdrop 클릭 → 닫힘 / 패널 내부 클릭 → 유지', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByTestId('trigger'));

      const panel = screen.getByTestId('test-modal');
      fireEvent.click(panel);
      expect(screen.getByTestId('test-modal')).toBeInTheDocument();

      fireEvent.click(panel.parentElement!);
      expect(screen.queryByTestId('test-modal')).toBeNull();
    });

    it('닫기 버튼 → 닫힘', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByTestId('trigger'));
      await user.click(screen.getByTestId('test-close'));
      expect(screen.queryByTestId('test-modal')).toBeNull();
    });
  });

  describe('focus 복원', () => {
    it('닫으면 열기 직전 포커스 요소(트리거)로 복원', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      const trigger = screen.getByTestId('trigger');
      await user.click(trigger);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(document.activeElement).toBe(trigger);
    });

    it('트리거가 아닌 요소에서 열렸어도 그 요소로 복원', () => {
      render(<Harness />);
      // 배경 버튼이 포커스를 가진 상태에서 트리거를 프로그램적으로 활성화 (포커스 이동 없음) —
      // 단축키/외부 이벤트로 모달이 열리는 경로를 모사한다.
      const background = screen.getByTestId('background-before');
      background.focus();
      fireEvent.click(screen.getByTestId('trigger'));
      expect(document.activeElement).toBe(screen.getByTestId('test-close'));

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(document.activeElement).toBe(background);
    });

    it('열림 시 활성 요소가 body 면 fallbackFocusRef 로 복원 (자동 표시 경로)', () => {
      render(<Harness withFallback />);
      // 포커스 없음(body) 상태에서 프로그램적으로 open.
      expect(document.activeElement).toBe(document.body);
      fireEvent.click(screen.getByTestId('trigger'));
      // fireEvent.click 은 포커스를 옮기지 않으므로 직전 활성 요소는 body.
      expect(document.activeElement).toBe(screen.getByTestId('test-close'));

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(document.activeElement).toBe(screen.getByTestId('trigger'));
    });
  });

  it('닫힌 뒤에는 Esc/Tab 리스너가 해제됨 (누수 방지)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByTestId('trigger'));
    await user.click(screen.getByTestId('test-close'));

    // 모달이 없으므로 Tab 은 배경 순회로 정상 동작해야 한다.
    screen.getByTestId('background-before').focus();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByTestId('trigger'));
  });
});
