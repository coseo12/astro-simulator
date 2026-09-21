/**
 * #1234 C3-B — renderer 문자열의 **두 소스 합성**과 late-arrival 판정.
 *
 * ## 왜 순수 함수로 빼는가
 *
 * C3-B 는 장면 구축이 GPU capability 의 settle 을 기다리지 않게 바꿨다. 그 결과 **2순위 소스가
 * 「아직 안 왔을 수 있다」는 상태**가 새로 생겼는데, 이 분기는 **CI 에서 도달하지 않는다** —
 * headless swiftshader 는 1순위 (`UNMASKED_RENDERER_WEBGL`) 가 항상 값을 주므로 `??` 의
 * 오른쪽이 평가되지 않는다 ([실측] 96/96 에서 `adapterInfo` 자체가 `undefined` 였다).
 *
 * 즉 **브라우저 가드로는 이 분기를 영영 못 본다**. `sim-canvas.tsx` 안에 인라인으로 두면
 * 「테스트가 있다 ≠ 그 분기가 테스트된다」가 되므로, 결정식만 떼어내 단위 테스트로 고정한다
 * (`detect-software-renderer.ts` · `parse-stars-mode.ts` 의 `resolveStarfieldVisible` 동형 —
 * 같은 #745 결정식 계열을 이미 이 모양으로 갖고 있다).
 */

import { detectSoftwareRenderer } from './detect-software-renderer';

/** `detectGpuCapability()` 결과에서 이 모듈이 쓰는 최소 형태 (core 타입에 결합하지 않는다). */
export interface RendererCapabilitySnapshot {
  adapterInfo?: { description: string };
}

/**
 * 소프트웨어 렌더 감지에 쓸 renderer 문자열을 정한다.
 *
 * 우선순위는 #745 가 정한 그대로다 — **1순위는 동기 WebGL 추출**, 2순위는 WebGPU
 * `adapterInfo.description` (빈 `{}` 인 브라우저가 있어 신뢰가 낮다). C3-B 가 바꾼 것은
 * 우선순위가 아니라 **2순위의 가용성**이다: 대기하지 않으므로 `null` (미도착) 일 수 있다.
 *
 * @param primary `extractWebglRendererString()` 결과 (1순위).
 * @param snapshot 그 시점까지 도착한 GPU capability. **미도착이면 `null`** — 대기하지 않는다.
 * @returns renderer 문자열, 또는 어느 소스도 값을 주지 못하면 `null`.
 *   `null` 의 결말은 `detectSoftwareRenderer(null) === false` = **별 표시 유지**이고, 이는
 *   #745 가 못박은 보수적 기본값이다 (하드웨어에서 별이 사라지는 과잉 비활성을 차단).
 *   ⚠️ **빈 문자열은 `null` 로 접히지 않는다** — `??` 는 `''` 를 nullish 로 보지 않으므로
 *   `{ description: '' }` 인 브라우저는 `''` 를 그대로 받는다. C3-B **도입 전 식도 같았고**
 *   하류 결말도 같으므로 (`detectSoftwareRenderer('') === false`) 여기서 접지 않는다 —
 *   접으면 범위 밖 동작 변경이 된다. 단위 테스트가 이 사실을 「이랬다」로 고정한다.
 */
export function resolveRendererString(
  primary: string | null,
  snapshot: RendererCapabilitySnapshot | null,
): string | null {
  return primary ?? snapshot?.adapterInfo?.description ?? null;
}

/**
 * 늦게 도착한 2순위가 **이미 끝난** 장면 구축의 판정을 뒤집었는가.
 *
 * `true` 면 그 세션의 별 배경이 #745 기준으로는 꺼졌어야 했는데 켜진 채로 남았다는 뜻이다.
 * 자동 되돌림은 하지 않는다 (생성된 mesh 를 뒤늦게 dispose 하는 쪽이 fill-rate 비용보다
 * 위험하다 — #745 자체가 **과잉 비활성 회귀**의 정정이었다). 호출부는 경고 + 계측 마크만
 * 남긴다 — **조용히 지나가면 이 창이 진단 불가능해진다**.
 *
 * @param sceneRendererString 장면 구축 시점에 확정된 문자열.
 *   `undefined` = **아직 구축 전** (늦은 도착이 아니다 — 제때 온 것이다).
 *   `null` = 구축했는데 어느 소스도 값을 주지 못했다 (= 뒤집힐 수 있는 유일한 상태).
 * @param lateDescription 뒤늦게 도착한 `adapterInfo.description`.
 */
export function isLateSoftwareRendererArrival(
  sceneRendererString: string | null | undefined,
  lateDescription: string | undefined,
): boolean {
  // `undefined` 와 `null` 을 반드시 갈라야 한다 — 느슨한 비교(`== null`)로 뭉개면 **정상적인
  // 제때 도착**(구축 전)까지 「늦었다」로 읽혀 경고가 상시 발화한다.
  if (sceneRendererString !== null) return false;
  return detectSoftwareRenderer(lateDescription);
}
