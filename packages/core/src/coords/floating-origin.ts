import { length, subtract, type Vec3Double } from './vec3.js';

/** Origin shift 이벤트 listener. 이전 origin → 새 origin 으로의 절대 월드 델타 (m) 를 받는다. */
export type OriginShiftListener = (delta: Vec3Double) => void;

/**
 * Floating Origin 관리자.
 *
 * 카메라(또는 기준점)가 월드 원점에서 일정 거리 이상 멀어지면 월드 전체 좌표계를 평행이동하여
 * 카메라를 다시 원점 근처로 되돌린다. 씬 그래프는 이 shift만큼 반대로 이동한 것으로 해석된다.
 *
 * ADR: `docs/decisions/20260422-floating-origin.md` (P11-A #288)
 *
 * 이 클래스는 좌표 계산만 담당한다. 실제 씬 노드 이동은 호출 측(scene/카메라 시스템)에서 수행.
 *
 * ## 트리거 전략
 *  - `setOriginToBody(world)` — focus 전환 시 primary. 주어진 절대 월드 좌표로 origin 즉시 이동.
 *  - `update(cameraWorld)` — safety net. free-fly 시 카메라 local 좌표가 threshold 초과하면 shift.
 *
 * ## subscription
 *  - `onOriginShift(listener)` — origin 이 이동할 때마다 delta 를 전달. Trail/Particle 모듈이
 *    자체 GPU 버퍼를 delta 만큼 translate 할 때 사용 (ADR §2, 미래 Phase 용 계약).
 */
export class FloatingOrigin {
  /** 누적 원점 오프셋 (월드 절대좌표 누산) */
  #originOffset: Vec3Double = [0, 0, 0];
  /** shift 트리거 임계 거리 */
  readonly threshold: number;
  /** origin shift listener 집합 (Trail/Particle 모듈용, ADR §2) */
  readonly #listeners = new Set<OriginShiftListener>();

  constructor(threshold = 10_000) {
    if (!(threshold > 0) || !Number.isFinite(threshold)) {
      throw new Error('FloatingOrigin threshold는 양의 유한수여야 합니다.');
    }
    this.threshold = threshold;
  }

  /** 현재 누적 원점 (절대 월드 좌표) */
  get originOffset(): Vec3Double {
    return this.#originOffset;
  }

  /** 씬 로컬 좌표 → 절대 월드 좌표 */
  toWorld(local: Vec3Double): Vec3Double {
    const o = this.#originOffset;
    return [local[0] + o[0], local[1] + o[1], local[2] + o[2]];
  }

  /** 절대 월드 좌표 → 씬 로컬 좌표 */
  toLocal(world: Vec3Double): Vec3Double {
    return subtract(world, this.#originOffset);
  }

  /**
   * 카메라(월드 절대좌표)를 받아 필요 시 shift를 수행한다 (safety net).
   *
   * @returns 이번 호출에서 발생한 shift 델타 (원점 이동량). shift가 없으면 null.
   */
  update(cameraWorld: Vec3Double): Vec3Double | null {
    const local = this.toLocal(cameraWorld);
    if (length(local) < this.threshold) {
      return null;
    }

    // 카메라 로컬 좌표만큼 원점을 이동시켜 카메라를 다시 (0,0,0) 근처로 되돌림
    const o = this.#originOffset;
    this.#originOffset = [o[0] + local[0], o[1] + local[1], o[2] + local[2]];
    this.#emitShift(local);
    return local;
  }

  /**
   * focus body 기반 primary origin shift (ADR §1-B).
   *
   * focus 전환 hook (예: `controller.focusOn`) 에서 호출해 origin 을 focus body 의 절대 월드 좌표로
   * 즉시 이동시킨다. threshold 를 무시하고 항상 shift 하며, 델타는 이전 origin → 새 origin 이다.
   *
   * @param bodyWorld focus body 의 절대 월드 좌표 (m)
   * @returns 이번 호출의 shift 델타 (이전 origin 대비). 델타가 0 이면 shift 없음으로 간주하고 null 반환.
   */
  setOriginToBody(bodyWorld: Vec3Double): Vec3Double | null {
    const delta = this.toLocal(bodyWorld);
    // 원점과 완전히 같으면 (예: sun focus 직후 재호출) no-op.
    if (delta[0] === 0 && delta[1] === 0 && delta[2] === 0) return null;
    this.#originOffset = [bodyWorld[0], bodyWorld[1], bodyWorld[2]];
    this.#emitShift(delta);
    return delta;
  }

  /**
   * Origin shift 이벤트 구독.
   *
   * 미래 Trail/Particle 모듈이 shift 발생 시 자체 GPU 버퍼를 delta 만큼 translate 할 때 사용한다
   * (ADR §2 Concrete Prediction #4). 호출 순서는 등록 순서.
   *
   * @returns unsubscribe 함수.
   */
  onOriginShift(listener: OriginShiftListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** 원점 리셋 (테스트/전환용). listener 는 호출하지 않는다. */
  reset(): void {
    this.#originOffset = [0, 0, 0];
  }

  /** 내부: shift 이벤트를 등록 순서대로 발행. listener 예외는 격리 (다른 listener 에 영향 없음). */
  #emitShift(delta: Vec3Double): void {
    for (const listener of this.#listeners) {
      try {
        listener(delta);
      } catch (err) {
        // Trail 모듈 버그가 scene update 전체를 break 하지 않도록 격리.
        console.error('[floating-origin] onOriginShift listener 예외', err);
      }
    }
  }
}
