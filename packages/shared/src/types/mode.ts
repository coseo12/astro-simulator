/**
 * 시뮬레이터 인터랙션 모드.
 * P1에서는 observe, research만 활성화.
 * education, sandbox는 P2+ 예정.
 */
export const SimMode = {
  Observe: 'observe',
  Research: 'research',
  Education: 'education',
  Sandbox: 'sandbox',
} as const;

export type SimMode = (typeof SimMode)[keyof typeof SimMode];
