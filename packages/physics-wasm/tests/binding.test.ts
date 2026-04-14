import { describe, expect, it } from 'vitest';
// @ts-expect-error — pkg/는 빌드 산출물(gitignored). test 스크립트가 선빌드한다.
import { add } from '../pkg/physics_wasm.js';

describe('physics-wasm ↔ TS binding', () => {
  it('add() — WASM 왕복 스모크', () => {
    expect(add(1.5, 2.25)).toBe(3.75);
    expect(add(-1, 1)).toBe(0);
  });
});
