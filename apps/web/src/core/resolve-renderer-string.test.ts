/**
 * #1234 C3-B — renderer 문자열 합성 + late-arrival 판정.
 *
 * **이 파일이 존재하는 이유**: 아래 분기들은 CI 브라우저 가드에서 **도달하지 않는다**.
 * headless swiftshader 는 1순위가 항상 값을 주므로 2순위·미도착 경로가 한 번도 평가되지
 * 않는다 ([실측] 96/96 에서 `adapterInfo` 가 `undefined`). 가드 PASS 가 이 분기의 증거가
 * 못 되므로 여기서 직접 고정한다.
 */
import { describe, expect, it } from 'vitest';
import { detectSoftwareRenderer } from './detect-software-renderer';
import { isLateSoftwareRendererArrival, resolveRendererString } from './resolve-renderer-string';

describe('#1234 C3-B resolveRendererString — 두 소스 합성', () => {
  it('1순위가 값을 주면 2순위는 읽지 않는다 (CI 가 타는 경로 — 동작 변화 0)', () => {
    expect(
      resolveRendererString('ANGLE (SwiftShader)', { adapterInfo: { description: 'Apple M3' } }),
    ).toBe('ANGLE (SwiftShader)');
  });

  it('1순위가 값을 주면 **2순위 미도착도 무관**하다 — C3-B 가 만든 창이 여기서 닫힌다', () => {
    expect(resolveRendererString('ANGLE (SwiftShader)', null)).toBe('ANGLE (SwiftShader)');
  });

  it('1순위가 null 이고 2순위가 도착했으면 2순위를 쓴다 (#745 폴백 유지)', () => {
    expect(resolveRendererString(null, { adapterInfo: { description: 'llvmpipe' } })).toBe(
      'llvmpipe',
    );
  });

  it('1순위 null + 2순위 **미도착** → null (대기하지 않는다)', () => {
    expect(resolveRendererString(null, null)).toBeNull();
  });

  it('2순위가 도착했으나 `adapterInfo` 가 없으면 null (빈 `{}` 브라우저)', () => {
    expect(resolveRendererString(null, {})).toBeNull();
  });

  it("빈 문자열 description 은 `null` 이 아니라 `''` 로 통과한다 (C3-B 이전과 동일)", () => {
    // ⚠️ 이 단언은 「이래야 한다」가 아니라 **「이랬다」**를 고정한다. `??` 는 `''` 를 nullish 로
    // 보지 않으므로 도입 전 식 (`primary ?? gpuCap.adapterInfo?.description ?? null`) 도 `''` 를
    // 반환했다. C3-B 는 2순위의 **가용성**만 바꿨지 이 합성 규칙은 건드리지 않았다.
    // 하류 결말은 어차피 같다 — `detectSoftwareRenderer('')` 는 `false` 다 (빈 값 = 감지 실패 =
    // 보수적으로 별 표시). 여기서 `null` 을 강제하면 범위 밖 동작 변경이 된다.
    expect(resolveRendererString(null, { adapterInfo: { description: '' } })).toBe('');
    expect(
      detectSoftwareRenderer(resolveRendererString(null, { adapterInfo: { description: '' } })),
    ).toBe(false);
  });
});

describe('#1234 C3-B isLateSoftwareRendererArrival — 뒤집힘만 잡는다', () => {
  it('아직 구축 전(undefined)이면 늦은 것이 아니다 — 제때 온 것이다', () => {
    // 이 케이스가 **가장 흔한 정상 경로**다. `== null` 느슨한 비교로 뭉개면 여기서 경고가
    // 상시 발화하므로, 이 단언이 그 구현 실수를 직접 잡는다.
    expect(isLateSoftwareRendererArrival(undefined, 'llvmpipe')).toBe(false);
  });

  it('구축 시 1순위가 값을 줬으면(문자열) 2순위는 애초에 안 읽혔다 → 뒤집힘 없음', () => {
    expect(isLateSoftwareRendererArrival('NVIDIA GeForce RTX 4090', 'llvmpipe')).toBe(false);
  });

  it('구축 시 아무 소스도 없었고(null) 늦게 온 것이 소프트웨어면 **뒤집혔다**', () => {
    expect(isLateSoftwareRendererArrival(null, 'llvmpipe')).toBe(true);
  });

  it('구축 시 null 이어도 늦게 온 것이 하드웨어면 판정은 그대로 (별 표시 유지)', () => {
    expect(isLateSoftwareRendererArrival(null, 'Apple M3 Max')).toBe(false);
  });

  it('구축 시 null + 늦게 온 것도 없음(undefined) → 뒤집힘 없음', () => {
    expect(isLateSoftwareRendererArrival(null, undefined)).toBe(false);
  });

  it('판별력 — 네 입력 조합에서 `true` 는 정확히 하나뿐이다', () => {
    const cases: Array<[string | null | undefined, string | undefined]> = [
      [undefined, 'llvmpipe'],
      ['NVIDIA', 'llvmpipe'],
      [null, 'llvmpipe'],
      [null, 'Apple M3'],
    ];
    const results = cases.map(([scene, late]) => isLateSoftwareRendererArrival(scene, late));
    expect(results).toEqual([false, false, true, false]);
  });
});
