'use client';

import { useSimStore } from '@/store/sim-store';
import { useSimCommand } from '@/core/sim-context';
// #404 — R-Phase allowlist SSoT (named import — scene namespace 경유 금지).
// ADR `20260508-404-scenario-presets-r-phase-guard.md` §결정 3.
//
// ⚠️ #402 §Amendment 결정 D1 — `scene as sceneApi` namespace 경유 시 turbopack module dep graph 가
//    solar-system-scene → nbody-engine → physics_wasm `__dirname` 평가를 trigger 하여 SSR 500.
//    본 컴포넌트는 side-panels.tsx 직접 import → SSR 평가 대상이므로 named import 로 모듈 그래프 영향 0 보장.
import { isRPhaseFocusable } from '@astro-simulator/core';

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
 *
 * #404 R-Phase Allowlist 가드 (defense-in-depth UI 측면 3번째 축, #402/#403 와 직교) —
 * ADR `20260508-404-scenario-presets-r-phase-guard.md` §결정 3.
 * preset 의 모든 mass multiplier target body 가 `R_PHASE_BODY_ALLOWLIST` 에 박제되어야 enabled.
 * R_PHASE_BODY_ALLOWLIST 1줄 추가만으로 자동 활성 (Concrete Prediction §zero-touch).
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
  {
    // #621 R6 — saturn(introducedInRPhase=7) target preset. jupiter 가 R6 진입으로
    // allowlist 에 포함되면서 jupiter-x10 / no-jupiter 가 모두 enabled 가 되어 disabled-path
    // 검증 negative 케이스가 소멸한다. 미진입 body(saturn) target preset 을 추가해
    // R-Phase 가드 disabled 분기 (#404) 가 "항상 PASS" 로 무력화되지 않도록 negative 케이스 보존
    // (CLAUDE.md §가드 설계 원칙 — fail-fast / negative 케이스 유지).
    // R7 #641 — saturn 진입으로 zero-touch 자동 enabled (Concrete Prediction 재현 2번째).
    id: 'saturn-x10',
    label: '토성 10배 질량',
    description: '외행성 섭동과 목성-토성 대공명(2:5)을 관찰. 토성 진입(R7) 시 활성.',
    massMultipliers: { saturn: 10 },
  },
  {
    // R7 #641 — uranus(introducedInRPhase=8) target preset (negative 케이스 교체 보존).
    // R8 #647 — uranus 진입으로 zero-touch 자동 enabled (Concrete Prediction 재현 3번째).
    id: 'uranus-x10',
    label: '천왕성 10배 질량',
    description: '외행성 외곽 섭동을 관찰. 천왕성 진입(R8) 시 활성.',
    massMultipliers: { uranus: 10 },
  },
  {
    // R8 #647 — neptune(introducedInRPhase=9) target preset. uranus 진입으로 uranus-x10 이
    // enabled 가 되어 disabled-path negative 케이스가 다시 소멸 → 미진입 body(neptune) 로
    // 교체 보존 (R6 saturn-x10 / R7 uranus-x10 선례 답습). R9 진입 시 자동 enabled.
    // R9 #653 — neptune 진입으로 zero-touch 자동 enabled (Concrete Prediction 재현 4번째).
    id: 'neptune-x10',
    label: '해왕성 10배 질량',
    description: '최외곽 행성 섭동을 관찰. 해왕성 진입(R9) 시 활성.',
    massMultipliers: { neptune: 10 },
  },
  {
    // R9 #653 — pluto(introducedInRPhase=10) target preset. neptune 진입으로 neptune-x10 이
    // enabled 가 되어 disabled-path negative 케이스가 다시 소멸 → 미진입 body(pluto) 로
    // 교체 보존 (R6 saturn-x10 / R7 uranus-x10 / R8 neptune-x10 선례 답습 — 로드맵 행성 완주로
    // R10 은 왜소행성·혜성 라운드).
    // R10a #659 — pluto 진입으로 zero-touch 자동 enabled (Concrete Prediction 재현 5번째).
    id: 'pluto-x10',
    label: '명왕성 10배 질량',
    description: '카이퍼벨트 왜소행성 섭동을 관찰 (R10a 진입 완료 — 활성).',
    massMultipliers: { pluto: 10 },
  },
  {
    // R10a #659 — halley(introducedInRPhase=11, R10b 혜성) target preset. pluto 진입으로
    // pluto-x10 이 enabled 가 되어 disabled-path negative 케이스가 다시 소멸 → 미진입
    // body(halley) 로 교체 보존 (R6 saturn-x10 / R7 uranus-x10 / R8 neptune-x10 / R9 pluto-x10
    // 선례 답습 — phase 11 재박제가 halley 를 최소 미진입 body 로 선출, ADR 20260611-r10a §축 2/§축 4).
    // R10b 진입 시 자동 enabled.
    id: 'halley-x10',
    label: '핼리 혜성 10배 질량',
    description: '고이심률 혜성 궤도 섭동을 관찰. 혜성 진입(R10b) 시 활성.',
    massMultipliers: { halley: 10 },
  },
];

const J2000 = 2_451_545.0;

// #404 — R-Phase 미진입 preset 호버 / 클릭 시 사용자 안내 문구.
// ADR `20260508-404-scenario-presets-r-phase-guard.md` §결정 3.
// i18n 키 분기 신설 금지 (ADR §명시적 비-범위) — 한국어 하드코딩, `/en` 라우팅 미지원.
const DISABLED_TOOLTIP = 'R-Phase 진행 시 활성';

/**
 * preset 활성 여부 판정 — 모든 mass multiplier target body 가
 * `R_PHASE_BODY_ALLOWLIST` 에 박제되어야 enabled.
 *
 * R-Phase 진입 시 자동 적응 (zero-touch): allowlist 1줄 추가만으로
 * 해당 body 영향 preset 자동 enabled.
 *
 * ADR `docs/decisions/20260508-404-scenario-presets-r-phase-guard.md` §결정 3 참조.
 */
function isPresetEnabled(preset: Preset): boolean {
  return Object.keys(preset.massMultipliers).every((bodyId) => isRPhaseFocusable(bodyId));
}

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
      {PRESETS.map((p) => {
        const enabled = isPresetEnabled(p);
        return (
          <button
            key={p.id}
            type="button"
            data-testid={`preset-${p.id}`}
            // data-r-phase-disabled — E2E (browser-verify) 회귀 가드 + 선택자 노출용
            // (#403 ADR cross-validate Gemini 개선 제안 2 패턴 일관, disabled / aria-disabled 와
            // 의미 중복이지만 selector 일관성 위해 #402/#403 박제 패턴 그대로 재사용).
            data-r-phase-disabled={!enabled}
            disabled={!enabled}
            aria-disabled={!enabled}
            title={enabled ? undefined : DISABLED_TOOLTIP}
            onClick={() => apply(p)}
            className={`text-left bg-bg-elevated/50 rounded-sm px-2 py-1.5 border border-border-subtle ${
              enabled ? 'hover:bg-primary/15' : 'opacity-50 cursor-not-allowed'
            }`}
          >
            <div className="text-body-sm text-fg-primary">{p.label}</div>
            <div className="text-caption text-fg-tertiary leading-snug">{p.description}</div>
          </button>
        );
      })}
    </div>
  );
}
