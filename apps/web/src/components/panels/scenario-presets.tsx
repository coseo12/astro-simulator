'use client';

import { useSimStore } from '@/store/sim-store';
import { useSimCommand } from '@/core/sim-context';

interface Preset {
  id: string;
  label: string;
  description: string;
  massMultipliers: Record<string, number>;
}

/**
 * 프리셋 "만약에" 시나리오 (#109).
 *
 * 질량 배수(#107)만 다루는 순수 설정. 적용 시:
 *  1. Newton 엔진으로 전환 (Kepler 2-body는 섭동 관찰 불가)
 *  2. 시간을 J2000으로 리셋 — 비교 관찰을 동일 시점에서 시작
 *  3. 질량 배수 교체
 */
const PRESETS: Preset[] = [
  {
    id: 'jupiter-x10',
    label: '목성 10배 질량',
    description: '내행성 및 소행성대 궤도 섭동을 관찰. 소행성대와 함께 볼 것 (URL ?belt=300).',
    massMultipliers: { jupiter: 10 },
  },
  {
    id: 'no-jupiter',
    label: '목성 제거 (질량 1%)',
    description: '수성·화성 궤도가 Kepler 해석해와 어떻게 일치하는지 관찰.',
    massMultipliers: { jupiter: 0.01 },
  },
  {
    id: 'sun-half',
    label: '태양 0.5배 질량',
    description: '모든 행성의 공전주기가 √2배 길어진다(Kepler 3법칙). 1일/초 재생에서 체감.',
    massMultipliers: { sun: 0.5 },
  },
];

const J2000 = 2_451_545.0;

export function ScenarioPresets() {
  const resetMasses = useSimStore((s) => s.resetMassMultipliers);
  const setMass = useSimStore((s) => s.setMassMultiplier);
  const setEngine = useSimStore((s) => s.setPhysicsEngine);
  const sendCommand = useSimCommand();

  const apply = (preset: Preset) => {
    setEngine('newton');
    resetMasses();
    for (const [id, mul] of Object.entries(preset.massMultipliers)) {
      setMass(id, mul);
    }
    sendCommand({ type: 'jumpToJulianDate', julianDate: J2000 });
  };

  const resetAll = () => {
    resetMasses();
    setEngine('kepler');
    sendCommand({ type: 'jumpToJulianDate', julianDate: J2000 });
  };

  return (
    <div data-testid="scenario-presets" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-body-sm text-fg-secondary">만약에 시나리오</span>
        <button
          type="button"
          data-testid="scenario-reset"
          onClick={resetAll}
          className="num text-caption px-1.5 py-0.5 rounded-xs bg-bg-elevated text-fg-secondary hover:bg-primary/20"
          title="Kepler 2-body + 모든 질량 원복 + J2000 리셋"
        >
          원복
        </button>
      </div>
      {PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          data-testid={`preset-${p.id}`}
          onClick={() => apply(p)}
          className="text-left bg-bg-elevated/50 hover:bg-primary/15 rounded-sm px-2 py-1.5 border border-border-subtle"
        >
          <div className="text-body-sm text-fg-primary">{p.label}</div>
          <div className="text-caption text-fg-tertiary leading-snug">{p.description}</div>
        </button>
      ))}
    </div>
  );
}
