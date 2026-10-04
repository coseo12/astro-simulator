/**
 * #1274 PR2 — `IceGiant` (천왕성 · 해왕성) 정적 계약 (ADR `20260628-756` Amendment 12 §A12.9).
 *
 * **D7 — earth 전용 효과 `0`** (계약 조정 C2): GLSL 미러는 GLSL 과 따로 작성돼 GLSL 의 누수를 볼 수
 * 없다. 그래서 `FRAGMENT_SHADER` 를 **정적 블록 분석**한다 — `//` 주석을 지운 뒤 `uSurfaceType == N`
 * 으로 가드된 모든 블록을 괄호 매칭으로 추출해 N 별로 합치고,
 *   - `rim =` · `lights =` 대입은 가드 블록 사이에서 N = 0 블록에만 있고 N = 4 블록에는 없다
 *     (양성 대조: N = 0 블록에 둘 다 있어야 한다 — 없으면 추출기가 고장난 것이다)
 *   - 리뷰 B1 (PR #1278): 위 비교는 `uSurfaceType == N` 가드 블록끼리만 본다. 그래서 **셰이더 전체의 대입
 *     연산 수 == N=0 블록 안 대입 수 + 초기값 선언 1** 도 단언한다 — 가드 없는 대입 · `>=` 등 다른 가드를
 *     잡는다. 세는 대상은 대입 문법의 출현이다 (`countAssignments` 주석 — 데이터 흐름 분석 아님)
 *   - 밴드 uniform (`gasBandAmplitude` · `gasBandCount` · `gasTurbulence`) 참조 블록의 N 집합
 *     == `BAND_SURFACE_TYPES` (결정 1 의 집합과 GLSL 의 양방향 일치 — volt #120)
 *   - 수치 양성 대조: `nightLightTermMirror` 가 earth 대표 입력에서 `> 0`
 *
 * 추출기 자체의 판별력은 아래 「합성 셰이더」 테스트가 고정한다 (rim 이 N = 4 로 샌 판본 → 검출).
 */
import { describe, expect, it } from 'vitest';
import {
  BAND_SURFACE_TYPES,
  ICE_GIANT_ALBEDO_BY_BODY,
  PLANET_FRAGMENT_SHADER,
  SURFACE_BAND_PARAMS_BY_BODY,
  SURFACE_TYPE_BY_BODY,
  SurfaceType,
  nightLightTermMirror,
  resolveIceGiantAlbedo,
  surfaceColorMirror,
} from './procedural-planet-shader.js';

/** `//` 주석 제거 (GLSL 소스에 블록 주석은 없다 — 아래 테스트가 단언한다). */
const stripLineComments = (src: string): string =>
  src
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');

/**
 * `uSurfaceType == N` 으로 가드된 블록 본문을 N 별로 모은다 (같은 N 이 여러 번이면 이어 붙인다).
 * 조건 뒤 첫 `{` 부터 괄호 깊이가 0 으로 돌아오는 `}` 까지가 블록이다 — `} else if (…) {` 의 앞 `}` 에서
 * 끝나므로 형제 분기가 섞이지 않는다.
 */
function extractSurfaceTypeBlocks(code: string): Map<number, string> {
  const blocks = new Map<number, string>();
  const re = /if\s*\(\s*uSurfaceType\s*==\s*(\d+)\s*\)\s*\{/g;
  for (const m of code.matchAll(re)) {
    const n = Number(m[1]);
    const open = (m.index ?? 0) + m[0].length - 1;
    let depth = 0;
    let end = -1;
    for (let i = open; i < code.length; i++) {
      if (code[i] === '{') depth++;
      else if (code[i] === '}') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) throw new Error(`uSurfaceType == ${n} 블록의 닫는 괄호가 없다`);
    blocks.set(n, `${blocks.get(n) ?? ''}\n${code.slice(open + 1, end)}`);
  }
  return blocks;
}

/** `name =` 대입 (비교 `==` 제외 · 선언 `float name =` 포함) 이 있는가. */
const assigns = (block: string, name: string): boolean =>
  new RegExp(`\\b${name}\\s*=(?!=)`).test(block);

/**
 * #1274 리뷰 B1 — `name` 에 대한 **대입 연산 출현 수** (주석 제거된 GLSL 문자열 기준, 정규식).
 *
 * 세는 것: `name =` (선언 `float name =` 포함) · `name += -= *= /=` · `name++` · `name--` · `++name` · `--name`.
 * 세지 않는 것: 비교 (`==` · `!=` · `<=` · `>=`) · 다른 식별자 (`rimGeom` 등 — 단어 경계) · out 인자 ·
 * 매크로 · swizzle 경유 쓰기. 즉 「대입 문법의 출현」 을 세는 텍스트 술어이지 데이터 흐름 분석이 아니다.
 */
const countAssignments = (code: string, name: string): number =>
  (
    code.match(
      new RegExp(`\\b${name}\\s*(?:[-+*/]?=(?!=)|\\+\\+|--)|(?:\\+\\+|--)\\s*${name}\\b`, 'g'),
    ) ?? []
  ).length;

/**
 * 가드 블록 (`uSurfaceType == 0`) 밖의 대입 수 = 전체 − N=0 블록 안 − 분기 앞 초기값 선언 1.
 * `uSurfaceType == N` 추출기가 보지 못하는 경로 (가드 없는 대입 · `>=` / `!=` 등 다른 가드 · 별도 bool 가드)
 * 를 전부 「N=0 블록 밖」 으로 센다 (리뷰 재현 D7a · D7b).
 */
const assignmentsOutsideRocky = (code: string, name: string): number => {
  const rocky = extractSurfaceTypeBlocks(code).get(SurfaceType.Rocky) ?? '';
  const decl = code.split(`float ${name} = 0.0`).length - 1;
  return countAssignments(code, name) - countAssignments(rocky, name) - decl;
};

const BAND_UNIFORMS = ['gasBandAmplitude', 'gasBandCount', 'gasTurbulence'];
const readsBand = (block: string): boolean =>
  BAND_UNIFORMS.some((u) => new RegExp(`\\b${u}\\b`).test(block));

const CODE = stripLineComments(PLANET_FRAGMENT_SHADER);
const BLOCKS = extractSurfaceTypeBlocks(CODE);

describe('#1274 D7 — FRAGMENT_SHADER 정적 블록 분석 (earth 전용 효과 0)', () => {
  it('전제 — 블록 주석 없음 (`//` 제거만으로 주석이 전부 빠진다)', () => {
    expect(PLANET_FRAGMENT_SHADER).not.toContain('/*');
  });

  it('enum 의 모든 값에 블록이 있다 (추출기 커버리지 — N = 4 포함)', () => {
    const enumValues = Object.values(SurfaceType).filter((v): v is number => typeof v === 'number');
    expect([...BLOCKS.keys()].sort((a, b) => a - b)).toEqual(enumValues.sort((a, b) => a - b));
    expect(BLOCKS.get(SurfaceType.IceGiant)?.trim()).not.toBe('');
  });

  it('양성 대조 — N = 0 (rocky) 블록에 `rim =` · `lights =` 대입이 둘 다 있다', () => {
    const rocky = BLOCKS.get(SurfaceType.Rocky) ?? '';
    expect(assigns(rocky, 'rim')).toBe(true);
    expect(assigns(rocky, 'lights')).toBe(true);
  });

  it('가드 블록 사이 비교 — `rim =` · `lights =` 대입이 있는 `uSurfaceType == N` 블록은 N = 0 뿐이다 (IceGiant N = 4 에는 없다)', () => {
    const rimTypes = [...BLOCKS].filter(([, b]) => assigns(b, 'rim')).map(([n]) => n);
    const lightTypes = [...BLOCKS].filter(([, b]) => assigns(b, 'lights')).map(([n]) => n);
    expect(rimTypes).toEqual([SurfaceType.Rocky]);
    expect(lightTypes).toEqual([SurfaceType.Rocky]);
    const ice = BLOCKS.get(SurfaceType.IceGiant) ?? '';
    expect(assigns(ice, 'rim')).toBe(false);
    expect(assigns(ice, 'lights')).toBe(false);
  });

  it('B1 — FRAGMENT_SHADER 전체의 rim · lights 대입 연산 수 == N=0 블록 안 대입 수 + 초기값 선언 1 (가드 없는 대입 · 다른 가드 포함)', () => {
    for (const name of ['rim', 'lights']) {
      // 초기값 선언은 정확히 1 이고 N=0 블록 안 대입이 ≥ 1 이어야 한다 (양쪽 0 의 공허 통과 차단).
      expect(CODE.split(`float ${name} = 0.0`).length - 1).toBe(1);
      expect(countAssignments(BLOCKS.get(SurfaceType.Rocky) ?? '', name)).toBeGreaterThanOrEqual(1);
      expect(assignmentsOutsideRocky(CODE, name)).toBe(0);
    }
  });

  it('분기 밖 초기값은 0 — 비-rocky 합성이 정확한 no-op 인 근거 (`float rim = 0.0` · `float lights = 0.0`)', () => {
    expect(CODE).toContain('float rim = 0.0');
    expect(CODE).toContain('float lights = 0.0');
  });

  it('밴드 uniform 참조 블록의 N 집합 == BAND_SURFACE_TYPES (양방향)', () => {
    const bandTypes = [...BLOCKS]
      .filter(([, b]) => readsBand(b))
      .map(([n]) => n)
      .sort((a, b) => a - b);
    expect(bandTypes.length).toBeGreaterThan(0);
    expect(bandTypes).toEqual([...BAND_SURFACE_TYPES].sort((a, b) => a - b));
  });

  it('수치 양성 대조 — nightLightTermMirror 가 earth 대표 입력 (완전 밤 · 육지 · 마스크 경로) 에서 > 0', () => {
    expect(
      nightLightTermMirror({ ndl: -1, landMask: 1, iceMask: 0, maskEnabled: 1, density: 1 }),
    ).toBeGreaterThan(0);
  });
});

describe('#1274 D7 — 추출기 판별력 (합성 셰이더 변이)', () => {
  const SYNTH_OK = `
    float rim = 0.0;
    if (uSurfaceType == 0) { rim = 1.0; lights = 2.0; if (x) { y = 1.0; } }
    else if (uSurfaceType == 4) { col = baseColor * gasBandAmplitude; }
  `;
  it('정상 합성본 — rim 은 N = 0 에만', () => {
    const b = extractSurfaceTypeBlocks(SYNTH_OK);
    expect([...b].filter(([, x]) => assigns(x, 'rim')).map(([n]) => n)).toEqual([0]);
    // 중첩 괄호를 넘어 블록 끝까지 읽는다 (조기 종료 시 이 대입이 빠진다).
    expect(b.get(0)).toContain('y = 1.0');
  });

  it('B1 누수 변이 — 가드 없는 대입 (D7a 형) 을 블록 밖 대입으로 센다', () => {
    expect(assignmentsOutsideRocky(SYNTH_OK, 'rim')).toBe(0);
    expect(assignmentsOutsideRocky(`${SYNTH_OK}\n rim = rimStrength;`, 'rim')).toBe(1);
  });

  it('B1 누수 변이 — `>=` 가드 (D7b 형) · 복합 대입 (`+=` · `*=`) · `++` 도 센다', () => {
    expect(
      assignmentsOutsideRocky(`${SYNTH_OK} if (uSurfaceType >= 4) { lights = 3.0; }`, 'lights'),
    ).toBe(1);
    expect(assignmentsOutsideRocky(`${SYNTH_OK} rim += 0.1;`, 'rim')).toBe(1);
    expect(assignmentsOutsideRocky(`${SYNTH_OK} rim *= 2.0;`, 'rim')).toBe(1);
    expect(assignmentsOutsideRocky(`${SYNTH_OK} rim++;`, 'rim')).toBe(1);
  });

  it('B1 오매칭 없음 — 비교 연산 · 접두가 같은 다른 식별자는 세지 않는다', () => {
    const noise = `${SYNTH_OK} if (rim == 0.0 || rim >= 1.0 || rim <= 2.0 || rim != 3.0) {} float rimGeom = 1.0; rimFall = 2.0;`;
    expect(assignmentsOutsideRocky(noise, 'rim')).toBe(0);
  });

  it('누수 변이 — N = 4 블록에 rim 대입을 넣으면 검출된다', () => {
    const leaked = SYNTH_OK.replace(
      'col = baseColor * gasBandAmplitude;',
      'col = baseColor * gasBandAmplitude; rim = 0.5;',
    );
    const b = extractSurfaceTypeBlocks(leaked);
    expect([...b].filter(([, x]) => assigns(x, 'rim')).map(([n]) => n)).toEqual([0, 4]);
  });

  it('비교 연산 (`rim == 0.0`) 은 대입으로 세지 않는다', () => {
    expect(assigns('if (rim == 0.0) {}', 'rim')).toBe(false);
  });
});

describe('#1274 U1 (b) — IceGiant albedo 배율 (별도 테이블 · 분기 4 전용)', () => {
  const sorted = (xs: Iterable<string>): string[] => [...xs].sort();

  it('keys(ICE_GIANT_ALBEDO_BY_BODY) == { id | SURFACE_TYPE_BY_BODY[id] == IceGiant } (양방향)', () => {
    const derived = Object.entries(SURFACE_TYPE_BY_BODY)
      .filter(([, t]) => t === SurfaceType.IceGiant)
      .map(([id]) => id);
    expect(derived.length).toBeGreaterThan(0);
    expect(sorted(Object.keys(ICE_GIANT_ALBEDO_BY_BODY))).toEqual(sorted(derived));
  });

  it('누락 · 초과 시 throw (기본값 fallback 금지) · 비-IceGiant 는 1', () => {
    expect(() => resolveIceGiantAlbedo('uranus', SurfaceType.IceGiant, {})).toThrow(/행이 없다/);
    expect(() => resolveIceGiantAlbedo('jupiter', SurfaceType.GasBands, { jupiter: 0.5 })).toThrow(
      /행이 있다/,
    );
    expect(resolveIceGiantAlbedo('jupiter', SurfaceType.GasBands)).toBe(1);
    expect(resolveIceGiantAlbedo('x', SurfaceType.IceGiant, { x: 0.4 })).toBe(0.4);
  });

  it('GLSL — iceGiantAlbedo 선언 1 + 참조는 N = 4 블록에만 (양성 대조: N = 4 에 있다)', () => {
    expect(CODE).toContain('uniform float iceGiantAlbedo');
    const users = [...BLOCKS].filter(([, b]) => /\biceGiantAlbedo\b/.test(b)).map(([n]) => n);
    expect(users).toEqual([SurfaceType.IceGiant]);
    // 선언 1 + 분기 4 사용 1 — 분기 밖에서 읽는 경로가 없다.
    expect(CODE.split('iceGiantAlbedo').length - 1).toBe(2);
  });

  it('미러 — IceGiant 는 albedo 필수 (미전달 throw) · 배율이 색에 곱해진다 · GasBands 는 읽지 않는다', () => {
    const base: readonly [number, number, number] = [0.6, 0.5, 0.4];
    const p: readonly [number, number, number] = [0.3, 0.6, 0.74];
    const band = SURFACE_BAND_PARAMS_BY_BODY.uranus!;
    expect(() => surfaceColorMirror(base, SurfaceType.IceGiant, p, undefined, band)).toThrow(
      /iceGiantAlbedo 인자가 없다/,
    );
    const one = surfaceColorMirror(base, SurfaceType.IceGiant, p, undefined, band, 1);
    const half = surfaceColorMirror(base, SurfaceType.IceGiant, p, undefined, band, 0.5);
    one.forEach((c, i) => expect(half[i]).toBeCloseTo(c * 0.5, 12));
    const jb = SURFACE_BAND_PARAMS_BY_BODY.jupiter!;
    expect(surfaceColorMirror(base, SurfaceType.GasBands, p, undefined, jb, 0.5)).toEqual(
      surfaceColorMirror(base, SurfaceType.GasBands, p, undefined, jb),
    );
  });
});
