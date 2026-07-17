import { describe, it, expect } from 'vitest';
import { hexToColor3 } from './color-utils';

// #789 — hexToColor3 SSoT 직접 회귀 가드 (rule-of-three 추출 — reviewer 권고).
describe('color-utils — hexToColor3', () => {
  it('#RRGGBB → 채널 [0,1] 정규화 Color3', () => {
    const c = hexToColor3('#ff8000');
    expect(c.r).toBeCloseTo(1, 6); // 255/255
    expect(c.g).toBeCloseTo(128 / 255, 6);
    expect(c.b).toBeCloseTo(0, 6);
  });

  it('선행 # 없이도 동일 결과 (# 선택)', () => {
    const withHash = hexToColor3('#00ff10');
    const without = hexToColor3('00ff10');
    expect(without.r).toBeCloseTo(withHash.r, 6);
    expect(without.g).toBeCloseTo(withHash.g, 6);
    expect(without.b).toBeCloseTo(withHash.b, 6);
    expect(without.g).toBeCloseTo(1, 6); // ff
    expect(without.b).toBeCloseTo(16 / 255, 6); // 10
  });
});
