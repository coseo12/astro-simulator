'use client';

import { useSimStore } from '@/store/sim-store';
import { useBodyInfo } from '@/hooks/use-body-info';

const PRESETS = [0.1, 0.5, 1, 2, 5, 10];

/**
 * 선택 천체 질량 배수 슬라이더 (#107).
 *
 * Newton 모드에서만 효과적 — Kepler는 2-body 해석해라 질량 변경이 궤도에 영향 없음.
 * 슬라이더 값은 store.massMultipliers에 반영되고 sim-canvas가 scene에 전파.
 */
export function MassSlider() {
  const selected = useSimStore((s) => s.selectedBodyId);
  const engine = useSimStore((s) => s.physicsEngine);
  const mul = useSimStore((s) => (selected ? (s.massMultipliers[selected] ?? 1) : 1));
  const setMul = useSimStore((s) => s.setMassMultiplier);
  const resetAll = useSimStore((s) => s.resetMassMultipliers);
  // #1281 — 라벨에 raw id 대신 한글 이름. 미등록 id 는 연구 패널이 이 컴포넌트를 렌더하기 전에
  // 걸러지므로 도달하지 않으며, 도달하면 id 로 표기한다 (빈 라벨로 흡수하지 않는다).
  const { data } = useBodyInfo(selected);
  const name = data?.nameKo ?? selected;

  if (!selected) {
    return (
      <div data-testid="mass-slider-empty" className="text-caption text-fg-secondary">
        천체를 선택하면 질량 조절이 가능합니다.
      </div>
    );
  }

  const disabled = engine !== 'newton';

  return (
    <div data-testid="mass-slider" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-caption num text-fg-secondary">질량 배수 · {name}</span>
        <span className="text-caption num text-fg-primary">{mul.toFixed(2)}×</span>
      </div>
      <input
        type="range"
        data-testid="mass-slider-input"
        aria-label={`${name} 질량 배수`}
        min="0.1"
        max="10"
        step="0.1"
        value={mul}
        disabled={disabled}
        onChange={(e) => setMul(selected, Number(e.target.value))}
        className="w-full accent-primary disabled:opacity-40"
      />
      <div className="flex items-center gap-1">
        {PRESETS.map((v) => (
          <button
            key={v}
            type="button"
            data-testid={`mass-preset-${v}`}
            disabled={disabled}
            onClick={() => setMul(selected, v)}
            className="num text-caption px-1.5 py-0.5 rounded-xs bg-bg-elevated text-fg-secondary hover:bg-primary/20 disabled:opacity-40"
          >
            {v}×
          </button>
        ))}
        <button
          type="button"
          data-testid="mass-reset"
          disabled={disabled}
          onClick={resetAll}
          className="num text-caption px-1.5 py-0.5 rounded-xs bg-bg-elevated text-fg-secondary hover:bg-primary/20 ml-auto disabled:opacity-40"
          title="모든 바디 질량을 원래대로"
        >
          리셋
        </button>
      </div>
      {disabled && (
        <div className="text-caption text-fg-secondary">
          Newton 엔진에서만 반영됩니다. 상단에서 Newton으로 전환하세요.
        </div>
      )}
    </div>
  );
}
