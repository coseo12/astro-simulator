'use client';

import { useSimStore } from '@/store/sim-store';

/**
 * kind 별 시각 과장 상한 (packages/core/src/scene/visual-scale.ts 와 SSoT 동기).
 * core scene 모듈은 babylon + physics-wasm 의존을 끌고 오므로 SSR prerender 에서 ENOENT.
 * 본 컴포넌트는 값만 필요하여 인라인 미러링 (drift 방지는 테스트에서 검증).
 */
const MAX_SCALE_BY_KIND: Record<string, number> = {
  star: 20,
  planet: 500,
  moon: 500,
  'dwarf-planet': 2_000,
  comet: 20_000,
};

function maxScaleForKind(kind: string): number {
  return MAX_SCALE_BY_KIND[kind] ?? 500;
}

interface BodyMeta {
  id: string;
  nameKo: string;
  kind: string;
}

// body id → 한국어 이름/kind (solar-system.json 과 동기화. P10-B-2 감사 값).
// 전체 24 bodies 가 아닌, focus 가능한 주요 body 만 포함 (확장 필요 시 loader 경유).
const BODY_META: Record<string, BodyMeta> = {
  sun: { id: 'sun', nameKo: '태양', kind: 'star' },
  mercury: { id: 'mercury', nameKo: '수성', kind: 'planet' },
  venus: { id: 'venus', nameKo: '금성', kind: 'planet' },
  earth: { id: 'earth', nameKo: '지구', kind: 'planet' },
  moon: { id: 'moon', nameKo: '달', kind: 'moon' },
  mars: { id: 'mars', nameKo: '화성', kind: 'planet' },
  phobos: { id: 'phobos', nameKo: '포보스', kind: 'moon' },
  deimos: { id: 'deimos', nameKo: '데이모스', kind: 'moon' },
  jupiter: { id: 'jupiter', nameKo: '목성', kind: 'planet' },
  io: { id: 'io', nameKo: '이오', kind: 'moon' },
  europa: { id: 'europa', nameKo: '유로파', kind: 'moon' },
  ganymede: { id: 'ganymede', nameKo: '가니메데', kind: 'moon' },
  callisto: { id: 'callisto', nameKo: '칼리스토', kind: 'moon' },
  saturn: { id: 'saturn', nameKo: '토성', kind: 'planet' },
  uranus: { id: 'uranus', nameKo: '천왕성', kind: 'planet' },
  neptune: { id: 'neptune', nameKo: '해왕성', kind: 'planet' },
  ceres: { id: 'ceres', nameKo: '세레스', kind: 'dwarf-planet' },
  pluto: { id: 'pluto', nameKo: '명왕성', kind: 'dwarf-planet' },
  haumea: { id: 'haumea', nameKo: '하우메아', kind: 'dwarf-planet' },
  makemake: { id: 'makemake', nameKo: '마케마케', kind: 'dwarf-planet' },
  eris: { id: 'eris', nameKo: '에리스', kind: 'dwarf-planet' },
  halley: { id: 'halley', nameKo: '핼리 혜성', kind: 'comet' },
  encke: { id: 'encke', nameKo: '엥케 혜성', kind: 'comet' },
  'swift-tuttle': { id: 'swift-tuttle', nameKo: '스위프트-터틀 혜성', kind: 'comet' },
};

/**
 * P10-C-2 #278 — 과장 스케일 배지 (Fact-First 원칙 §"Hover/Focus 배지").
 *
 * selectedBodyId 기반 — 사용자가 body 에 focus 하면 현재 시각 과장 상한 표시.
 *
 * - `educational` 모드: "{bodyName} — 시각 크기 최대 ×N 과장 중" (kind 별 MAX_VISUAL_SCALE_*)
 * - `scientific` 모드: "{bodyName} — 실제 비율 1.0"
 * - focus 없음: 모드 요약만 표시 ("시각 과장 모드" / "사실 비율 모드")
 *
 * hover 기반은 babylon pointer event 통합이 필요하여 C-3 로 분리. 본 MVP 는 focus 경로.
 */
export function ScaleBadge() {
  const viewMode = useSimStore((s) => s.viewMode);
  const selectedBodyId = useSimStore((s) => s.selectedBodyId);

  const body = selectedBodyId ? BODY_META[selectedBodyId] : null;

  let label: string;
  if (viewMode === 'scientific') {
    label = body ? `${body.nameKo} — 실제 비율 1.0` : '사실 비율 모드';
  } else {
    if (body) {
      const max = maxScaleForKind(body.kind);
      label = `${body.nameKo} — 시각 크기 최대 ×${max.toLocaleString()} 과장 중`;
    } else {
      label = '시각 과장 모드';
    }
  }

  return (
    <div
      className="num text-caption bg-bg-surface/80 backdrop-blur border border-border-subtle rounded-sm px-2 py-1 text-fg-secondary"
      data-testid="scale-badge"
      data-view-mode={viewMode}
      title={
        viewMode === 'scientific'
          ? 'IAU 2015 실측 비율. sub-pixel 이탈 주의'
          : '시각 이해를 위해 천체 크기가 과장되어 있습니다. m 키로 사실 모드 전환.'
      }
    >
      {label}
    </div>
  );
}
