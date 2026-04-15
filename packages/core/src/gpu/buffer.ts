/**
 * GPU storage buffer 래퍼 (P3-B #143).
 *
 * Babylon `StorageBuffer`를 Float32Array I/O 중심으로 단순화. N-body 입자 상태(위치/속도/가속도)
 * 는 모두 Float32Array AoS-flat (3N 길이)로 처리한다.
 *
 * 주의 — float64 미지원
 * --------------------
 * WebGPU/WGSL은 f64 미지원. CPU(`NBodySystem`/`BarnesHutSystem`)는 f64를 쓰지만 GPU 경로에서는
 * **f32로 다운캐스트**된다. 행성 SI 좌표 (~1e11 m)에서 f32 정밀도 7 자리 → ~1e4m(10km) 단위 오차.
 * 시각화/인터랙션 용도는 충분하지만 장기 적분 정확도는 CPU 경로 대비 ~1000× 떨어짐.
 *
 * P3-B #145에서 적분 스킴 결정 시 정밀도 보전 전략 확정 (예: relative origin shift).
 */
import { StorageBuffer } from '@babylonjs/core/Buffers/storageBuffer.js';
import type { GpuComputeContext } from './compute-context.js';

/** Float32 storage buffer. 길이는 element 수, 바이트 크기는 length×4. */
export class GpuFloat32Buffer {
  private readonly buffer: StorageBuffer;
  readonly length: number;

  constructor(ctx: GpuComputeContext, length: number, label?: string) {
    if (length <= 0 || !Number.isInteger(length)) {
      throw new RangeError(`length must be positive integer, got ${length}`);
    }
    this.length = length;
    this.buffer = new StorageBuffer(ctx.engine, length * 4, undefined, label);
  }

  /** CPU → GPU 업로드. data 길이는 buffer length와 동일해야. */
  write(data: Float32Array): void {
    if (data.length !== this.length) {
      throw new RangeError(
        `write size mismatch: buffer length ${this.length}, data length ${data.length}`,
      );
    }
    this.buffer.update(data);
  }

  /**
   * GPU → CPU readback. 비동기.
   * @param noDelay true면 flushFramebuffer 호출 (지연 ↓, 약간의 perf 비용)
   */
  async read(noDelay = true): Promise<Float32Array> {
    const out = new Float32Array(this.length);
    await this.buffer.read(0, this.length * 4, out, noDelay);
    return out;
  }

  /** Babylon 원본. ComputeShader 바인딩에 사용. */
  raw(): StorageBuffer {
    return this.buffer;
  }
}
