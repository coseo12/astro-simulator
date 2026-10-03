/**
 * #1274 PR2 — `IceGiant` (천왕성 · 해왕성) 정적 계약 (ADR `20260628-756` Amendment 12 §A12.9).
 *
 * **D7 — earth 전용 효과 `0`** (계약 조정 C2): GLSL 미러는 GLSL 과 따로 작성돼 GLSL 의 누수를 볼 수
 * 없다. 그래서 `FRAGMENT_SHADER` 를 **정적 블록 분석**한다 — `//` 주석을 지운 뒤 `uSurfaceType == N`
 * 으로 가드된 모든 블록을 괄호 매칭으로 추출해 N 별로 합치고,
 *   - `rim =` · `lights =` 대입은 N = 0 블록에만 있고 N = 4 블록에는 없다
 *     (양성 대조: N = 0 블록에 둘 다 있어야 한다 — 없으면 추출기가 고장난 것이다)
 *   - 밴드 uniform (`gasBandAmplitude` · `gasBandCount` · `gasTurbulence`) 참조 블록의 N 집합
 *     == `BAND_SURFACE_TYPES` (결정 1 의 집합과 GLSL 의 양방향 일치 — volt #120)
 *   - 수치 양성 대조: `nightLightTermMirror` 가 earth 대표 입력에서 `> 0`
 *
 * 추출기 자체의 판별력은 아래 「합성 셰이더」 테스트가 고정한다 (rim 이 N = 4 로 샌 판본 → 검출).
 */
import { describe, expect, it } from 'vitest';
import {
  BAND_SURFACE_TYPES,
  PLANET_FRAGMENT_SHADER,
  SurfaceType,
  nightLightTermMirror,
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

  it('`rim =` · `lights =` 대입이 있는 블록은 N = 0 뿐이다 (IceGiant N = 4 에는 없다)', () => {
    const rimTypes = [...BLOCKS].filter(([, b]) => assigns(b, 'rim')).map(([n]) => n);
    const lightTypes = [...BLOCKS].filter(([, b]) => assigns(b, 'lights')).map(([n]) => n);
    expect(rimTypes).toEqual([SurfaceType.Rocky]);
    expect(lightTypes).toEqual([SurfaceType.Rocky]);
    const ice = BLOCKS.get(SurfaceType.IceGiant) ?? '';
    expect(assigns(ice, 'rim')).toBe(false);
    expect(assigns(ice, 'lights')).toBe(false);
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
