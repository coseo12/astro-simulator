import { length, subtract, type Vec3Double } from './vec3.js';

/**
 * Floating Origin 관리자.
 *
 * 카메라(또는 기준점)가 월드 원점에서 일정 거리 이상 멀어지면 월드 전체 좌표계를 평행이동하여
 * 카메라를 다시 원점 근처로 되돌린다. 씬 그래프는 이 shift만큼 반대로 이동한 것으로 해석된다.
 *
 * ADR: docs/phases/architecture.md §4 "RTE + Floating Origin"
 *
 * 이 클래스는 좌표 계산만 담당한다. 실제 씬 노드 이동은 호출 측(카메라 시스템 C6)에서 수행.
 */
export class FloatingOrigin {
  /** 누적 원점 오프셋 (월드 절대좌표 누산) */
  #originOffset: Vec3Double = [0, 0, 0];
  /** shift 트리거 임계 거리 */
  readonly threshold: number;

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
   * 카메라(월드 절대좌표)를 받아 필요 시 shift를 수행한다.
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
    return local;
  }

  /** 원점 리셋 (테스트/전환용) */
  reset(): void {
    this.#originOffset = [0, 0, 0];
  }
}
