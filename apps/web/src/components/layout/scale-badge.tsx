'use client';

import { useSimStore } from '@/store/sim-store';

/**
 * P12-A #298 B2 — 과장 배지 내용 재정의.
 *
 * 과거 (P10-C-2 #278) 에는 `educational` 모드에서 kind 별 `MAX_SCALE_BY_KIND` (×500 등) 배수를
 * 표시했으나, P12-A 부터 body 시각 과장이 완전 제거됐다 (tier 엔진 기반 실측 비율). 따라서
 * "×N 과장 중" 문구는 **거짓 UX** 가 되어 본 Phase 에서 차단한다.
 *
 * 본 배지는 Phase C (#298 R2) 에서 완전 제거될 예정이며, Phase A 동안은 혼란 방지를 위해
 * 내용을 "실측 비율" 기반으로 재정의하여 유지한다 (컴포넌트 자체는 삭제하지 않음).
 *
 * - focus 없음: "실측 비율 모드"
 * - focus 있음: "{bodyName} — 실측 비율 1.0"
 * - viewMode 분기는 양쪽 동일 (모두 실측) — `data-view-mode` 만 어트리뷰트로 보존 (기존 테스트 호환).
 */

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
 * P10-C-2 #278 → P12-A #298 B2 — 스케일 배지 (실측 비율 표시).
 *
 * 사용자가 body 에 focus 하면 이름을, 아니면 모드 요약만 표시.
 * 과거 `MAX_SCALE_BY_KIND` 인라인 미러링은 과장 기능이 제거되어 제거됨.
 */
export function ScaleBadge() {
  const viewMode = useSimStore((s) => s.viewMode);
  const selectedBodyId = useSimStore((s) => s.selectedBodyId);

  const body = selectedBodyId ? BODY_META[selectedBodyId] : null;

  // Phase A 부터는 educational / scientific 모두 실측 비율 (1.0) — tier 엔진이 처리.
  // 분기 자체를 유지하지 않고 동일 문구 출력. viewMode 값은 어트리뷰트로만 보존.
  const label = body ? `${body.nameKo} — 실측 비율 1.0` : '실측 비율 모드';

  return (
    <div
      className="num text-caption bg-bg-surface/80 backdrop-blur border border-border-subtle rounded-sm px-2 py-1 text-fg-secondary"
      data-testid="scale-badge"
      data-view-mode={viewMode}
      title="IAU 2015 실측 비율. 거리·크기 모두 실측 (P12-A 부터). Phase C 에서 배지 자체 제거 예정."
    >
      {label}
    </div>
  );
}
