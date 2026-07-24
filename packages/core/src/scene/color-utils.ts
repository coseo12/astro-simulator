import { Color3 } from '@babylonjs/core';

/**
 * hex 색상 문자열 → Babylon `Color3` (각 채널 [0,1] 정규화).
 *
 * `#RRGGBB` 또는 `RRGGBB` (선행 `#` 선택) 6자리 hex 를 받아 채널을 255 로 나눈
 * Color3 인스턴스를 만든다. `colorHint.hex` (데이터 SSoT) 를 셰이더/머티리얼 입력으로
 * 변환하는 공용 유틸 — solar-system-scene / procedural-planet-shader / sun-shader 3곳의
 * 동일 사설 구현을 rule-of-three 로 단일화 (volt #21 중복 구현 금지, #789).
 *
 * @param hex `#RRGGBB` 또는 `RRGGBB` 형식 6자리 hex 문자열
 * @returns 채널별 [0,1] 정규화 Color3
 */
export function hexToColor3(hex: string): Color3 {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return new Color3(r, g, b);
}

/**
 * #845 — 씬 배경 톤 RGBA SSoT (volt #69 숨은 상수 단일화).
 *
 * `engine/simulation-core.ts` (엔진 초기 씬) 와 `scene/solar-system-scene.ts` (태양계 씬) 가
 * 동일 튜플을 각자 리터럴로 이중 선언하고 있었다 — 한쪽만 바꾸면 초기 프레임 ↔ 본 씬 배경이
 * 조용히 어긋난다. 소비처는 `new Color4(...SCENE_CLEAR_COLOR_RGBA)` 로 스프레드 생성.
 */
export const SCENE_CLEAR_COLOR_RGBA: readonly [number, number, number, number] = [
  0.031, 0.035, 0.051, 1,
];
