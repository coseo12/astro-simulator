/**
 * #1428 — 태양 홍염 생성기 · 기하 · 셰이더 정적 계약 (ADR `20261107-1428` 결정 1 · 3 · 7, DoD D2 · D3 · D9).
 *
 *  1. 생성기 — 결정성 (골든 값) · 진입부 jd 가드 · 차등 자전 (흑점과 같은 `ω`) · 자정 경계 연속 (lookback) · 상한 여유.
 *  2. envelope — 모든 밝기 전이 ≥ 0.5 일 (감쇠 계수 `c = 1` 의 근거 — 결정 3).
 *  3. 기하 — 고정 크기 버퍼 · 비활성 슬롯 퇴화 (밝기 0 · 면적 0) · 발자국 · 꼭대기 반경.
 *  4. 리본 측 방향 미러 — 평행 입력에서 유한값 (§교차검증 합의 1).
 *  5. GLSL 정적 계약 — switch 부재 · 시간 uniform 부재 · `gl_FragDepth` 기록 · 선언 일관성 · varying 쌍 (§교차검증 이견 3).
 *  6. D2 표본 — 1900~2100 · 7.3 일 간격에서 기본 카메라 기준 꼭대기가 림 밖인 홍염이 1 개 이상인 표본 비율 (기록용 — 새 임계 0).
 */
import { describe, expect, it } from 'vitest';
import { J2000_JD } from '@astro-simulator/shared';
import { LOG_DEPTH_FRAGMENT_WRITE_GLSL } from './log-depth.js';
import { SUNSPOT_JD_RANGE_DAYS, sunspotOmegaDegPerDay } from './sunspots.js';
import {
  PROMINENCE_ERUPTION_DAYS,
  PROMINENCE_ERUPTION_FADE_START_FRACTION,
  PROMINENCE_LIFE_MAX_DAYS,
  PROMINENCE_LIFE_MIN_DAYS,
  PROMINENCE_MAX,
  PROMINENCE_MIN_TRANSITION_DAYS,
  PROMINENCE_RISE_FRACTION,
  PROMINENCE_SEGMENTS,
  PROMINENCE_SIDE_EPS,
  PROMINENCE_SLOT_LOOKBACK_DAYS,
  PROMINENCE_VERTEX_COUNT,
  PROMINENCE_VERTICES_PER_LOOP,
  SUN_PROMINENCE_ATTRIBUTES,
  SUN_PROMINENCE_FRAGMENT_SHADER,
  SUN_PROMINENCE_UNIFORMS,
  SUN_PROMINENCE_VERTEX_SHADER,
  buildProminenceIndices,
  createProminenceList,
  createProminenceVertexBuffers,
  generateProminences,
  lastProminenceCandidateCount,
  prominenceApex,
  prominenceBrightness,
  prominenceHeightScale,
  prominenceRibbonSideMirror,
  writeProminenceGeometry,
} from './sun-prominences.js';

/** ADR 1412 · 1428 시안 시각 (2014-04-01, 사이클 24 극대). */
const JD_MAX = 2_456_748.5;
const JD_1900 = 2_415_020.5;
const JD_2100 = 2_488_069.5;

describe('#1428 sun-prominences — 생성기 (D3 · D9)', () => {
  it('결정성 — 같은 jd 는 같은 목록 (골든 값: 2014-04-01 6 개)', () => {
    const a = createProminenceList();
    const b = createProminenceList();
    const n = generateProminences(JD_MAX, a);
    generateProminences(JD_MAX + 3.7, b); // 다른 jd 를 사이에 끼워도
    expect(generateProminences(JD_MAX, b)).toBe(n);
    expect(Array.from(b.lonDeg.subarray(0, n))).toEqual(Array.from(a.lonDeg.subarray(0, n)));
    expect(Array.from(b.heightR.subarray(0, n))).toEqual(Array.from(a.heightR.subarray(0, n)));
    // 골든 — 난수 소비 순서 · 상수가 바뀌면 깨진다 (의도한 변경이면 값을 갱신한다).
    expect(n).toBe(6);
    expect(Array.from(a.idSlot.subarray(0, n))).toEqual([5192, 5195, 5197, 5199, 5200, 5201]);
    const golden: ReadonlyArray<readonly [number, number, number, number]> = [
      [-11.414864, 517.45712, 0.280238, 0.110177],
      [-12.125271, 439.84291, 0.313513, 1],
      [17.669362, 434.232488, 0.244533, 1],
      [10.237728, 200.523469, 0.222775, 1],
      [-10.545696, 278.526902, 0.273664, 1],
      [15.851278, 253.508283, 0.219433, 0.620105],
    ];
    golden.forEach(([lat, lon, h, br], i) => {
      expect(a.latDeg[i]).toBeCloseTo(lat, 5);
      expect(a.lonDeg[i]).toBeCloseTo(lon, 5);
      expect(a.heightR[i]).toBeCloseTo(h, 5);
      expect(a.brightness[i]).toBeCloseTo(br, 5);
    });
  });

  it('진입부 jd 가드 — 비유한 · 범위 밖 jd 는 0 개이고 출력 버퍼를 건드리지 않는다', () => {
    const out = createProminenceList();
    out.latDeg.fill(123);
    for (const jd of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      J2000_JD + SUNSPOT_JD_RANGE_DAYS + 1,
      J2000_JD - SUNSPOT_JD_RANGE_DAYS - 1,
    ]) {
      expect(generateProminences(jd, out), String(jd)).toBe(0);
      expect(lastProminenceCandidateCount()).toBe(0);
    }
    expect(out.latDeg.every((v) => v === 123)).toBe(true);
  });

  it('차등 자전 — 같은 개체의 경도 변화 = 흑점과 같은 ω(위도) × Δt', () => {
    const a = createProminenceList();
    const b = createProminenceList();
    const dt = 0.75;
    const na = generateProminences(JD_MAX, a);
    const nb = generateProminences(JD_MAX + dt, b);
    let matched = 0;
    for (let i = 0; i < na; i++) {
      for (let j = 0; j < nb; j++) {
        if (a.idSlot[i] !== b.idSlot[j] || a.idIndex[i] !== b.idIndex[j]) continue;
        expect(b.latDeg[j]).toBe(a.latDeg[i]);
        expect(b.lonDeg[j]! - a.lonDeg[i]!).toBeCloseTo(
          sunspotOmegaDegPerDay(a.latDeg[i]!) * dt,
          9,
        );
        matched++;
      }
    }
    // 공허 통과 차단 — 비교한 개체가 있어야 한다.
    expect(matched).toBeGreaterThan(0);
  });

  it('자정 경계 — 슬롯 경계 전후 jd 에서 같은 개체가 이어진다 (lookback = ⌈최장 수명⌉ + 2)', () => {
    expect(PROMINENCE_SLOT_LOOKBACK_DAYS).toBe(Math.ceil(PROMINENCE_LIFE_MAX_DAYS) + 2);
    const eps = 1e-6;
    let matched = 0;
    for (let k = 0; k < 40; k++) {
      const boundary = Math.floor(JD_MAX - J2000_JD) + J2000_JD + k * 9;
      const a = createProminenceList();
      const b = createProminenceList();
      const na = generateProminences(boundary - eps, a);
      const nb = generateProminences(boundary + eps, b);
      for (let i = 0; i < na; i++) {
        // 수명 끝에 걸린 개체는 경계에서 사라질 수 있다 — 밝기가 남은 개체만 본다.
        if (a.brightness[i]! < 1e-3) continue;
        let found = false;
        for (let j = 0; j < nb; j++) {
          if (a.idSlot[i] !== b.idSlot[j] || a.idIndex[i] !== b.idIndex[j]) continue;
          found = true;
          expect(Math.abs(b.lonDeg[j]! - a.lonDeg[i]!)).toBeLessThan(1e-3);
          expect(Math.abs(b.heightR[j]! - a.heightR[i]!)).toBeLessThan(1e-3);
        }
        expect(found, `경계 ${boundary} id ${a.idSlot[i]}/${a.idIndex[i]}`).toBe(true);
        matched++;
      }
    }
    expect(matched).toBeGreaterThan(0);
  });

  it('상한 여유 — 1900~2100 0.5 일 간격의 상한 절단 전 활성 수 최대가 PROMINENCE_MAX 이하', () => {
    const out = createProminenceList();
    let max = 0;
    for (let jd = JD_1900; jd <= JD_2100; jd += 0.5) {
      generateProminences(jd, out);
      max = Math.max(max, lastProminenceCandidateCount());
    }
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(PROMINENCE_MAX);
  });
});

describe('#1428 sun-prominences — envelope 전이 ≥ 0.5 일 (결정 1 · 3)', () => {
  it('상수 — 상승 · 소멸 · 분출 소멸 · 분출 상승이 모두 최소 전이 이상', () => {
    expect(PROMINENCE_MIN_TRANSITION_DAYS).toBe(0.5);
    expect(PROMINENCE_LIFE_MIN_DAYS * PROMINENCE_RISE_FRACTION).toBeGreaterThanOrEqual(
      PROMINENCE_MIN_TRANSITION_DAYS,
    );
    expect(
      PROMINENCE_ERUPTION_DAYS * (1 - PROMINENCE_ERUPTION_FADE_START_FRACTION),
    ).toBeGreaterThanOrEqual(PROMINENCE_MIN_TRANSITION_DAYS);
    expect(PROMINENCE_ERUPTION_DAYS).toBeGreaterThanOrEqual(PROMINENCE_MIN_TRANSITION_DAYS);
    // 분출 전에 상승이 끝난다 (상승 구간과 분출 구간이 겹치지 않는다).
    expect(PROMINENCE_LIFE_MIN_DAYS - PROMINENCE_ERUPTION_DAYS).toBeGreaterThanOrEqual(
      PROMINENCE_LIFE_MIN_DAYS * PROMINENCE_RISE_FRACTION,
    );
  });

  it('수치 — 밝기 기울기 ≤ smoothstep 최대 기울기 1.5 / 최소 전이 (수명 범위 · 분출 여부 전부)', () => {
    const bound = 1.5 / PROMINENCE_MIN_TRANSITION_DAYS;
    const h = 1e-4;
    for (const life of [PROMINENCE_LIFE_MIN_DAYS, 7.3, PROMINENCE_LIFE_MAX_DAYS - 1e-9]) {
      for (const erupts of [false, true]) {
        let maxSlope = 0;
        for (let age = 0; age < life - h; age += h * 10) {
          const slope =
            Math.abs(
              prominenceBrightness(age + h, life, erupts) - prominenceBrightness(age, life, erupts),
            ) / h;
          maxSlope = Math.max(maxSlope, slope);
        }
        expect(maxSlope, `life ${life} erupts ${erupts}`).toBeLessThanOrEqual(bound * (1 + 1e-3));
      }
    }
  });

  it('수명 밖 밝기 0 · 분출 끝 높이 배율 3.2 · 상승 시작 0.3', () => {
    expect(prominenceBrightness(-0.1, 5, false)).toBe(0);
    expect(prominenceBrightness(5, 5, false)).toBe(0);
    expect(prominenceBrightness(2.5, 5, false)).toBe(1);
    expect(prominenceHeightScale(0, 5, false)).toBeCloseTo(0.3, 12);
    expect(prominenceHeightScale(2.5, 5, false)).toBe(1);
    expect(prominenceHeightScale(5, 5, true)).toBeCloseTo(3.2, 12);
  });
});

describe('#1428 sun-prominences — 고정 크기 정점 버퍼 (§교차검증 합의 2)', () => {
  it('버퍼 길이 · 인덱스는 고정 — 정점 수 = 상한 × (분절 + 1) × 2, 인덱스 최대 < 정점 수', () => {
    expect(PROMINENCE_VERTICES_PER_LOOP).toBe((PROMINENCE_SEGMENTS + 1) * 2);
    expect(PROMINENCE_VERTEX_COUNT).toBe(PROMINENCE_MAX * PROMINENCE_VERTICES_PER_LOOP);
    const idx = buildProminenceIndices();
    expect(idx.length).toBe(PROMINENCE_MAX * PROMINENCE_SEGMENTS * 6);
    expect(Math.max(...idx)).toBe(PROMINENCE_VERTEX_COUNT - 1);
  });

  it('활성 루프 기록 · 비활성 슬롯 퇴화 (같은 버퍼 제자리 갱신)', () => {
    const list = createProminenceList();
    const n = generateProminences(JD_MAX, list);
    const buffers = createProminenceVertexBuffers();
    const refs = { ...buffers };
    writeProminenceGeometry(list, n, buffers);
    expect(buffers.positions).toBe(refs.positions);
    expect(buffers.params.length).toBe(PROMINENCE_VERTEX_COUNT * 3);
    const radiusAt = (v: number) =>
      Math.hypot(
        buffers.positions[v * 3]!,
        buffers.positions[v * 3 + 1]!,
        buffers.positions[v * 3 + 2]!,
      );
    for (let i = 0; i < n; i++) {
      const base = i * PROMINENCE_VERTICES_PER_LOOP;
      // 발자국 (s = 0 · 1) 은 태양 표면 (Float32 버퍼 — 6 자리) · 꼭대기는 1 + 높이 근처 (기울기만큼 낮다 — cos(0.4) 이상).
      expect(radiusAt(base)).toBeCloseTo(1, 6);
      expect(radiusAt(base + PROMINENCE_VERTICES_PER_LOOP - 1)).toBeCloseTo(1, 6);
      const apex = [0, 0, 0];
      prominenceApex(list, i, apex);
      const apexR = Math.hypot(apex[0]!, apex[1]!, apex[2]!);
      expect(apexR).toBeGreaterThan(1 + list.heightR[i]! * Math.cos(0.4) - 1e-3);
      expect(apexR).toBeLessThanOrEqual(1 + list.heightR[i]! + 1e-9);
      // 리본 측 ±1 · 밝기 = envelope × 가닥 결 (≤ 1).
      expect(buffers.params[base * 3]).toBe(-1);
      expect(buffers.params[(base + 1) * 3]).toBe(1);
      expect(buffers.params[base * 3 + 1]).toBeLessThanOrEqual(1);
    }
    for (let i = n; i < PROMINENCE_MAX; i++) {
      for (let v = 0; v < PROMINENCE_VERTICES_PER_LOOP; v++) {
        const o = (i * PROMINENCE_VERTICES_PER_LOOP + v) * 3;
        expect(radiusAt(i * PROMINENCE_VERTICES_PER_LOOP + v)).toBe(0);
        expect(buffers.params[o + 1]).toBe(0); // 밝기 0
        expect(buffers.params[o + 2]).toBe(0); // 반폭 0 — 두 측 정점이 같은 점 (면적 0)
      }
    }
    // 개수가 줄면 남는 슬롯이 다시 퇴화한다.
    writeProminenceGeometry(list, 0, buffers);
    expect(buffers.positions.every((x) => x === 0)).toBe(true);
    expect(buffers.positions).toBe(refs.positions);
  });
});

describe('#1428 sun-prominences — 리본 측 방향 미러 (결정 1 · §교차검증 합의 1)', () => {
  const finite = (v: readonly number[]) => v.every((x) => Number.isFinite(x));
  const len = (v: readonly number[]) => Math.hypot(v[0]!, v[1]!, v[2]!);
  const dot = (a: readonly number[], b: readonly number[]) =>
    a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

  it('일반 입력 — 단위 길이 · 접선 · 시선과 수직', () => {
    const t = [0.3, 1, -0.2] as const;
    const v = [1, 0.1, 0.4] as const;
    const s = prominenceRibbonSideMirror(t, v, [0, 0, 1]);
    expect(len(s)).toBeCloseTo(1, 9);
    expect(dot(s, t)).toBeCloseTo(0, 9);
    expect(dot(s, v)).toBeCloseTo(0, 9);
  });

  it('평행 입력 (다리가 시선과 나란함) — NaN 이 아니라 반경 기저로 유한한 단위 벡터', () => {
    for (const scale of [1, 1e-8, 5e6]) {
      const t = [0, 0, 2 * scale] as const;
      const v = [0, 0, -3] as const;
      const s = prominenceRibbonSideMirror(t, v, [1, 0, 0.5]);
      expect(finite(s), `scale ${scale}`).toBe(true);
      expect(len(s)).toBeCloseTo(1, 9);
      expect(dot(s, v)).toBeCloseTo(0, 9);
    }
    // 문턱 바로 아래 (사잇각이 아주 작음) 도 같은 경로.
    const tiny = Math.sqrt(PROMINENCE_SIDE_EPS) / 10;
    expect(finite(prominenceRibbonSideMirror([tiny, 0, 1], [0, 0, 1], [0, 1, 0]))).toBe(true);
  });

  it('완전 퇴화 (접선 0 · 반경도 시선과 나란함) — 0 벡터 (폭 0 리본), NaN 아님', () => {
    const s = prominenceRibbonSideMirror([0, 0, 0], [0, 0, 1], [0, 0, 0]);
    expect(finite(s)).toBe(true);
    expect(len(s)).toBe(0);
    const s2 = prominenceRibbonSideMirror([0, 0, 1], [0, 0, 1], [0, 0, 1]);
    expect(finite(s2)).toBe(true);
    expect(len(s2)).toBe(0);
  });
});

/** GLSL 블록 · 줄 주석 제거. */
function stripGlslComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}
/** `<qualifier> <type> <name>;` 선언 이름 목록. */
function declared(src: string, qualifier: 'attribute' | 'uniform' | 'varying'): string[] {
  const re = new RegExp(`\\b${qualifier}\\s+\\w+\\s+(\\w+)\\s*;`, 'g');
  return [...stripGlslComments(src).matchAll(re)].map((m) => m[1]!);
}

describe('#1428 sun-prominences — GLSL 정적 계약 (D9 · §교차검증 이견 3)', () => {
  const vs = stripGlslComments(SUN_PROMINENCE_VERTEX_SHADER);
  const fs = stripGlslComments(SUN_PROMINENCE_FRAGMENT_SHADER);

  it('switch 부재 (WGSL 변환) · 시간 · jd uniform 부재 (#782 규약)', () => {
    for (const src of [vs, fs]) {
      expect(src).not.toMatch(/\bswitch\b/);
      expect(src).not.toMatch(/uniform\s+\w+\s+\w*([Tt]ime|[Jj]d|[Jj]ulian)\w*\s*;/);
    }
  });

  it('fragment — 로그 depth 공용 조각 1 회 · 사용 전제 선언 · vertex 의 vFragmentDepth 기록', () => {
    expect(SUN_PROMINENCE_FRAGMENT_SHADER).toContain(LOG_DEPTH_FRAGMENT_WRITE_GLSL);
    expect(fs.split('gl_FragDepth =').length - 1).toBe(1);
    expect(fs).toContain('varying float vFragmentDepth;');
    expect(fs).toContain('uniform float logDepthConstant;');
    expect(vs).toMatch(/vFragmentDepth\s*=\s*1\.0\s*\+\s*clip\.w\s*;/);
  });

  it('선언 일관성 — ShaderMaterial attributes = vertex attribute 선언', () => {
    expect([...declared(SUN_PROMINENCE_VERTEX_SHADER, 'attribute')].sort()).toEqual(
      [...SUN_PROMINENCE_ATTRIBUTES].sort(),
    );
    expect(declared(SUN_PROMINENCE_FRAGMENT_SHADER, 'attribute')).toEqual([]);
  });

  it('선언 일관성 — ShaderMaterial uniforms = vertex ∪ fragment uniform 선언', () => {
    const both = new Set([
      ...declared(SUN_PROMINENCE_VERTEX_SHADER, 'uniform'),
      ...declared(SUN_PROMINENCE_FRAGMENT_SHADER, 'uniform'),
    ]);
    expect([...both].sort()).toEqual([...SUN_PROMINENCE_UNIFORMS].sort());
  });

  it('varying 쌍 — vertex · fragment 선언이 같은 집합이고 vertex 가 전부 쓴다', () => {
    const vv = declared(SUN_PROMINENCE_VERTEX_SHADER, 'varying').sort();
    const fv = declared(SUN_PROMINENCE_FRAGMENT_SHADER, 'varying').sort();
    expect(vv).toEqual(fv);
    for (const name of vv) expect(vs).toMatch(new RegExp(`\\b${name}\\s*=`));
  });

  it('vertex gl_Position 쓰기 — 전체 대입 1 회 (#1422 보정 미적용 — PR1 노출 측정 0, 결정 2)', () => {
    const writes = [...vs.matchAll(/gl_Position(\.[xyzw]+)?\s*[-+*/]?=(?!=)/g)].map((m) =>
      m[0].replace(/\s+/g, ''),
    );
    expect(writes).toEqual(['gl_Position=']);
  });
});

describe('#1428 sun-prominences — D2 표본 (기본 카메라 · 꼭대기 림 밖)', () => {
  it('1900~2100 · 7.3 일 간격 — 꼭대기가 림 밖인 홍염이 1 개 이상인 표본이 있다 (비율은 PR 본문 기록)', () => {
    // 기본 · focus 카메라의 태양 → 카메라 방향 (ADR 1428 POC probe 실측) — 원거리 직교 투영 근사 [계산].
    const cam = [0, 10.815594673156738, -33.2869758605957];
    const cn = Math.hypot(cam[0]!, cam[1]!, cam[2]!);
    const c = cam.map((x) => x / cn);
    const list = createProminenceList();
    const apex = [0, 0, 0];
    let samples = 0;
    let withLimb = 0;
    for (let jd = JD_1900; jd <= JD_2100; jd += 7.3) {
      const n = generateProminences(jd, list);
      samples++;
      for (let i = 0; i < n; i++) {
        prominenceApex(list, i, apex);
        const along = apex[0]! * c[0]! + apex[1]! * c[1]! + apex[2]! * c[2]!;
        const px = Math.hypot(
          apex[0]! - along * c[0]!,
          apex[1]! - along * c[1]!,
          apex[2]! - along * c[2]!,
        );
        if (px > 1) {
          withLimb++;
          break;
        }
      }
    }
    expect(samples).toBeGreaterThan(10_000);
    expect(withLimb).toBeGreaterThan(0);
  });
});
