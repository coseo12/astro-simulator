import { describe, expect, it } from 'vitest';
import {
  boxesOverlap,
  isLabelEligible,
  isOccluded,
  layoutLabels,
  LABEL_GAP_PX,
  LABEL_OFFSET_PX,
  LABEL_RADIUS_CAP_PX,
  placeLabel,
  type LabelBox,
  type LabelCandidate,
} from './label-layout';

/** #1293 D4 · D5 — 라벨 배치 · 디클러터 순수 함수. */

const VW = 1280;

function cand(over: Partial<LabelCandidate> & { id: string }): LabelCandidate {
  return {
    kind: 'planet',
    parentId: 'sun',
    x: 100,
    y: 100,
    radius: 4,
    onScreen: true,
    distance: 1,
    embedded: false,
    width: 40,
    height: 20,
    ...over,
  };
}

/** 겹침 쌍 수 — D5 술어 (간격 0 기준, 실제 사각형 교차). */
function overlapPairs(boxes: readonly LabelBox[]): number {
  let n = 0;
  for (let i = 0; i < boxes.length; i += 1)
    for (let j = i + 1; j < boxes.length; j += 1) if (boxesOverlap(boxes[i]!, boxes[j]!, 0)) n += 1;
  return n;
}

describe('isLabelEligible — D4 화면 밖 · 카메라 뒤 · 위성 규칙', () => {
  it('onScreen=false (카메라 뒤 또는 화면 밖) → 제외', () => {
    expect(isLabelEligible(cand({ id: 'mars', onScreen: false }), null)).toBe(false);
  });

  it('박스 크기 미측정 (0) → 제외', () => {
    expect(isLabelEligible(cand({ id: 'mars', width: 0 }), null)).toBe(false);
  });

  it('위성 — 모체 선택 시에만 (자기 자신 선택 포함)', () => {
    const moon = cand({ id: 'moon', kind: 'moon', parentId: 'earth' });
    expect(isLabelEligible(moon, null)).toBe(false);
    expect(isLabelEligible(moon, 'mars')).toBe(false);
    expect(isLabelEligible(moon, 'earth')).toBe(true);
    expect(isLabelEligible(moon, 'moon')).toBe(true);
  });

  it('행성 · 왜소행성 · 소행성 · 혜성 · 태양은 선택과 무관', () => {
    for (const kind of ['star', 'planet', 'dwarf-planet', 'asteroid', 'comet'])
      expect(isLabelEligible(cand({ id: kind, kind }), null)).toBe(true);
  });
});

describe('isOccluded — 규칙 1b (더 가까운 body 원반 뒤)', () => {
  const jupiter = cand({ id: 'jupiter', x: 400, y: 300, radius: 100, distance: 10 });
  it('더 먼 body 의 중심이 가까운 원반 안 → 가림 (목성 뒤 이오)', () => {
    const io = cand({ id: 'io', kind: 'moon', x: 450, y: 300, distance: 11 });
    expect(isOccluded(io, [jupiter, io])).toBe(true);
    const out = layoutLabels([jupiter, { ...io, parentId: 'jupiter' }], {
      focusedId: 'jupiter',
      viewportWidth: VW,
    });
    expect(out.map((b) => b.id)).toEqual(['jupiter']);
  });
  it('더 가까우면 (원반 앞) 가림 아님', () => {
    const io = cand({ id: 'io', kind: 'moon', x: 450, y: 300, distance: 9 });
    expect(isOccluded(io, [jupiter, io])).toBe(false);
  });
  it('원반 밖이면 가림 아님 · 화면 밖 body 는 가리지 않는다', () => {
    const far = cand({ id: 'x', x: 520, y: 300, distance: 11 });
    expect(isOccluded(far, [jupiter, far])).toBe(false);
    const hidden = { ...jupiter, onScreen: false };
    const io = cand({ id: 'io', x: 450, y: 300, distance: 11 });
    expect(isOccluded(io, [hidden, io])).toBe(false);
  });
});

describe('규칙 1c — 렌더된 모체 구 안에 묻힌 위성 (#1293 qa B1)', () => {
  // 목성 원반 반지름 90 · 이오 화면 위치는 원반 안 (중심에서 67) · 카메라 쪽 (목성보다 가까움) — 1b 는 못 잡는다.
  const jupiter = cand({ id: 'jupiter', x: 400, y: 300, radius: 90, distance: 10 });
  const ioFront = cand({
    id: 'io',
    kind: 'moon',
    parentId: 'jupiter',
    x: 467,
    y: 300,
    distance: 9,
  });
  it('모체 구 안 (embedded) → 앞쪽이어도 숨김', () => {
    const io = { ...ioFront, embedded: true };
    expect(isOccluded(io, [jupiter, io])).toBe(false); // 1b 로는 못 잡는 경우임을 고정
    expect(isLabelEligible(io, 'jupiter')).toBe(false);
    const out = layoutLabels([jupiter, io], { focusedId: 'jupiter', viewportWidth: VW });
    expect(out.map((b) => b.id)).toEqual(['jupiter']);
  });
  it('모체 구 밖 · 원반 앞을 지나는 통과 (embedded=false) → 표시', () => {
    const out = layoutLabels([jupiter, { ...ioFront, y: 420 }], {
      focusedId: 'jupiter',
      viewportWidth: VW,
    });
    expect(out.map((b) => b.id).sort()).toEqual(['io', 'jupiter']);
    expect(isLabelEligible(ioFront, 'jupiter')).toBe(true);
  });
});

describe('placeLabel — D4 투영 위치 ±(반지름 + 오프셋)', () => {
  it('오른쪽 배치: 왼쪽 변 = 중심 + 반지름 + 오프셋, 세로 중앙', () => {
    const b = placeLabel(cand({ id: 'a', x: 200, y: 300, radius: 10, height: 20 }), VW);
    expect(b.left).toBe(200 + 10 + LABEL_OFFSET_PX);
    expect(b.top).toBe(290);
  });

  it('반지름 상한 — 화면을 덮는 근접 body 도 라벨이 중심 근처에 남는다', () => {
    const b = placeLabel(cand({ id: 'a', x: 200, y: 300, radius: 2000 }), VW);
    expect(b.left).toBe(200 + LABEL_RADIUS_CAP_PX + LABEL_OFFSET_PX);
  });

  it('오른쪽 넘침 → 왼쪽 배치 (오른쪽 변 = 중심 − 반지름 − 오프셋), 박스는 화면 안', () => {
    const b = placeLabel(cand({ id: 'a', x: VW - 10, y: 300, radius: 4, width: 60 }), VW);
    expect(b.left + b.width).toBe(VW - 10 - 4 - LABEL_OFFSET_PX);
    expect(b.left + b.width).toBeLessThanOrEqual(VW);
  });

  it('가까운 변이 항상 중심에서 반지름(상한) + 오프셋 이내', () => {
    for (const x of [0, 50, 640, 1200, VW]) {
      for (const radius of [0, 3, 30, 300]) {
        const c = cand({ id: 'a', x, radius, width: 70 });
        const b = placeLabel(c, VW);
        const reach = Math.min(radius, LABEL_RADIUS_CAP_PX) + LABEL_OFFSET_PX;
        const nearEdge = b.left >= x ? b.left - x : x - (b.left + b.width);
        // 반올림 (정수 px) 오차 0.5 허용.
        expect(nearEdge).toBeLessThanOrEqual(reach + 0.5);
        expect(nearEdge).toBeGreaterThanOrEqual(reach - 0.5);
      }
    }
  });
});

describe('layoutLabels — D5 겹침 쌍 0 · 우선순위', () => {
  it('겹치면 낮은 순위 숨김: 태양 > 행성 > 왜소행성 > 소행성 > 위성 > 혜성', () => {
    const order = [
      cand({ id: 'halley', kind: 'comet' }),
      cand({ id: 'moon', kind: 'moon', parentId: 'earth' }),
      cand({ id: 'vesta', kind: 'asteroid' }), // #1318 D4 — 왜소행성 다음 · 위성 앞
      cand({ id: 'pluto', kind: 'dwarf-planet' }),
      cand({ id: 'earth', kind: 'planet' }),
      cand({ id: 'sun', kind: 'star', parentId: null }),
    ];
    // 전부 같은 위치 — 한 개만 남는다. 하나씩 빼며 그다음 순위가 이기는지 본다.
    const expected = ['sun', 'earth', 'pluto', 'vesta', 'moon', 'halley'];
    for (let k = 0; k < expected.length; k += 1) {
      const pool = order.filter((c) => !expected.slice(0, k).includes(c.id));
      const out = layoutLabels(pool, { focusedId: 'earth', viewportWidth: VW });
      expect(out.map((b) => b.id)).toEqual([expected[k]]);
    }
  });

  it('같은 등급은 화면 반지름 큰 쪽 우선', () => {
    const out = layoutLabels([cand({ id: 'mars', radius: 3 }), cand({ id: 'venus', radius: 9 })], {
      focusedId: null,
      viewportWidth: VW,
    });
    // 반지름이 달라 왼쪽 변이 다르지만 박스가 겹친다 → 큰 쪽만.
    expect(out.map((b) => b.id)).toEqual(['venus']);
  });

  it('떨어져 있으면 모두 표시', () => {
    const out = layoutLabels(
      [cand({ id: 'a', y: 100 }), cand({ id: 'b', y: 200 }), cand({ id: 'c', x: 600 })],
      { focusedId: null, viewportWidth: VW },
    );
    expect(out).toHaveLength(3);
  });

  it('간격 경계 — 세로로 정확히 LABEL_GAP_PX 떨어지면 둘 다, 1px 더 가까우면 하나', () => {
    const h = 20;
    const apart = layoutLabels(
      [
        cand({ id: 'a', y: 100, height: h }),
        cand({ id: 'b', y: 100 + h + LABEL_GAP_PX, height: h }),
      ],
      { focusedId: null, viewportWidth: VW },
    );
    expect(apart).toHaveLength(2);
    const close = layoutLabels(
      [
        cand({ id: 'a', y: 100, height: h }),
        cand({ id: 'b', y: 100 + h + LABEL_GAP_PX - 1, height: h }),
      ],
      { focusedId: null, viewportWidth: VW },
    );
    expect(close).toHaveLength(1);
  });

  it('무작위 배치 200 회 — 출력 겹침 쌍 0 (D5 술어), 출력 ⊆ 자격 있는 후보', () => {
    // 결정적 의사난수 (LCG) — 실패 시 재현 가능.
    let seed = 1293;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    const kinds = ['star', 'planet', 'dwarf-planet', 'moon', 'comet'];
    for (let trial = 0; trial < 200; trial += 1) {
      const cands: LabelCandidate[] = Array.from({ length: 32 }, (_, i) =>
        cand({
          id: `b${i}`,
          kind: kinds[Math.floor(rand() * kinds.length)]!,
          parentId: rand() < 0.5 ? 'p0' : 'p1',
          x: rand() * VW,
          y: rand() * 720,
          radius: rand() * 60,
          onScreen: rand() < 0.9,
          distance: rand(),
          embedded: rand() < 0.1,
          width: 20 + rand() * 80,
          height: 16 + rand() * 4,
        }),
      );
      const out = layoutLabels(cands, { focusedId: 'p0', viewportWidth: VW });
      expect(overlapPairs(out)).toBe(0);
      const eligible = new Set(cands.filter((c) => isLabelEligible(c, 'p0')).map((c) => c.id));
      for (const b of out) expect(eligible.has(b.id)).toBe(true);
    }
  });
});
