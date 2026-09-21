import { Engine, WebGPUEngine } from '@babylonjs/core';
import type { BootPhaseHook } from './boot-phase.js';
import {
  GPU_ADAPTER_TIMEOUT,
  createAdapterBudget,
  withAdapterTimeoutMarked,
  type AdapterBudget,
} from '../gpu/adapter-timeout.js';

export type EngineKind = 'webgpu' | 'webgl2';

export interface CreatedEngine {
  engine: Engine | WebGPUEngine;
  kind: EngineKind;
}

/**
 * WebGPU 우선 시도 후 실패 시 WebGL2로 폴백한다.
 * ADR: docs/phases/architecture.md §6 "WebGPU-first + WebGL2 폴백"
 *
 * WebGPUEngine 생성 전에 navigator.gpu.requestAdapter()를 먼저 시도하여
 * 실제 사용 가능한 adapter가 있는 경우에만 진행한다.
 * 이렇게 하지 않으면 Babylon 내부에서 console.error로 실패 로그가 먼저 찍힌다
 * (try/catch로 잡히지 않음).
 *
 * #1234 C2-H3 — `onBootPhase` 는 **끝난 구간**을 통지한다 (미지정 시 호출 0).
 * 여기서 갈리는 축이 세 개다: 어댑터 조회 (`requestAdapter`) / WebGPU device 초기화 /
 * WebGL2 컨텍스트 생성. 세 번째는 **한 브라우저가 동시에 열 수 있는 GL 컨텍스트 수**에
 * 종속이라, 「페이지를 여러 개 열어둔 채 부팅」 가설 (H1) 이 사실이면 여기가 길어진다.
 *
 * #1234 C2 2단계 — **첫 마크가 `engine:webgpu-probe` 이면 늦다.** 그 마크는
 * `isWebGpuUsable()` 이 **끝난 뒤**에 찍히는데, 그 안쪽이 `await gpu.requestAdapter()` 라
 * (`detectGpuCapability` 와 같은 실패 모드) 거기서 멈추면 이 함수는 **마크를 하나도 남기지
 * 못한다**. 그러면 「`start()` 가 호출되지 않았다」와 「어댑터 조회가 미결이다」가 같은
 * 스냅샷 (엔진 마크 0) 으로 보인다. 아래 두 마크가 그 둘을 가른다.
 *
 * 그리고 이 축은 **실제로 필요했다** [실측]: 로컬 재현 표본 (`verify:1215-cloud-layer` page 3,
 * 20 s 타임아웃) 에서 `gpu/capability.ts` 와 **여기**의 `requestAdapter()` 가 **동시에** 미결
 * 이었다 (`gpu:adapter-call` · `engine:probe-adapter-call` 이 마지막 마크). 한쪽만 계측했다면
 * 나머지 한쪽의 침묵이 「거기까지 못 왔다」로 읽혔을 것이다.
 *
 * #1234 C3-A — 그 확정된 원인에 상한을 씌웠다. 이 파일 안의 `requestAdapter()` 호출 **둘 다**
 * (`isWebGpuUsable` · `getWebGpuFeatures`) `withAdapterTimeoutMarked` 를 거치며, 상한 도달은
 * 「어댑터 없음」과 같은 결론(WebGL2 폴백)으로 흡수되되 전용 마크로 갈린다. 상한 값과 그
 * 실측 근거는 `../gpu/adapter-timeout.ts` §`GPU_ADAPTER_TIMEOUT_MS` 가 SSoT 다.
 *
 * #1238 리뷰 R1 — 그 두 호출은 **직렬**이라 (`isWebGpuUsable` 이 true 여야 `getWebGpuFeatures`
 * 에 온다) 각자 상한을 가지면 대기 합이 가드 한계를 넘는다. 이 함수가 **체인 예산 하나**를
 * 만들어 둘에게 넘기고 `finally` 에서 놓는다 — 어댑터 대기 합이 `GPU_ADAPTER_TIMEOUT_MS` 다.
 *
 * ⚠️ **상한이 닿지 않는 곳이 하나 남는다** — `engine.initAsync()` 다 (아래 WebGPU 경로).
 * 관측된 미결 표본은 전부 어댑터 조회였고 `initAsync` 는 다른 API 라 이번 처방에 넣지 않았다.
 * 거기서 멈추면 `engine:webgpu-features` 는 찍혔는데 `engine:webgpu-init` 이 없는 형태다.
 * 그 안쪽도 결국 `navigator.gpu.requestAdapter()` 를 **자기가 다시** 부른다 [실측 —
 * `@babylonjs/core@9.19.0` `Engines/webgpuEngine.pure.js:401`] 는 점에서 같은 실패 모드이지만,
 * 그 호출은 Babylon 소유라 이 예산이 닿지 않는다.
 */
export async function createEngine(
  canvas: HTMLCanvasElement,
  onBootPhase?: BootPhaseHook,
): Promise<CreatedEngine> {
  // 「createEngine 에 도달은 했다」. 이 마크가 없으면 stall 은 이 함수 **앞**이다.
  onBootPhase?.('engine:create-enter');
  // #1238 R1 — 아래 두 어댑터 조회가 공유하는 체인 예산. 머리말 §R1 참조.
  const budget = createAdapterBudget();
  try {
    const webGpuUsable = await isWebGpuUsable(onBootPhase, budget);
    onBootPhase?.('engine:webgpu-probe');
    if (webGpuUsable) {
      try {
        // P4-D #166 — timestamp-query feature를 optional로 요청.
        // 어댑터가 지원 시 EngineInstrumentation.captureGPUFrameTime이 동작한다.
        // 미지원 어댑터는 feature가 비어있는 device로 생성되어 폴백 필요 없음.
        const supported = await getWebGpuFeatures(onBootPhase, budget);
        onBootPhase?.('engine:webgpu-features');
        const requiredFeatures = (
          supported.has('timestamp-query') ? ['timestamp-query'] : []
        ) as GPUFeatureName[];
        const engine = new WebGPUEngine(canvas, {
          antialias: true,
          stencil: true,
          adaptToDeviceRatio: true,
          deviceDescriptor: { requiredFeatures },
        });
        await engine.initAsync();
        onBootPhase?.('engine:webgpu-init');
        return { engine, kind: 'webgpu' };
      } catch (error) {
        // adapter는 있었으나 초기화 중 실패 — WebGL2로 폴백
        console.warn('[engine-factory] WebGPU 초기화 실패, WebGL2로 폴백합니다.', error);
        onBootPhase?.('engine:webgpu-failed');
      }
    }

    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      adaptToDeviceRatio: true,
    });
    onBootPhase?.('engine:webgl2-ctor');
    return { engine, kind: 'webgl2' };
  } finally {
    // 체인 종료 — 공유 타이머를 놓는다 (남기면 프로세스가 예산만큼 더 산다).
    budget.release();
  }
}

/**
 * 현재 환경에서 WebGPU 사용이 가능한지 사전 판별.
 * - navigator.gpu 존재
 * - requestAdapter() 가 null이 아닌 adapter 반환
 *
 * 헤드리스 브라우저(Playwright Chromium 등)는 gpu 객체는 있으나 adapter가 null이므로
 * 여기서 즉시 false로 판별되어 WebGL2 경로로 이동.
 *
 * #1234 C2 2단계 — `engine:probe-adapter-call` 은 **await 직전**에 찍힌다. 이 마크가 있는데
 * 호출부의 `engine:webgpu-probe` 가 없으면 **이 `requestAdapter()` 가 미결**이라는 뜻이다
 * (**앱 런타임** (`apps/web/src` + `packages/core/src`) 의 `requestAdapter` 호출 지점은 셋이고,
 * C2 시점에 그중 둘이 마크 없이 부팅 앞단에 있었다 — 나머지 하나인 `getWebGpuFeatures` 는 이미
 * `engine:webgpu-probe` ↔ `engine:webgpu-features` 사이에 갇혀 있어 **구간 마크**를 따로 찍지
 * 않는다. C3-A 이후 셋 다 **상한 도달 마크**는 갖는다 — 구간 마크와 상한 마크는 다른 축이다).
 *
 * ⚠️ 「셋」의 술어는 **앱 런타임**이다 (#1238 리뷰 R6 — 「저장소 안」이라고 적었던 것의 정정).
 * 저장소 전체로는 가드 스크립트 `scripts/browser-verify-webgpu.mjs:61` 이 넷째 실호출이고,
 * `apps/web/scripts/browser-verify-glow-marker.mjs:433` 은 호출이 아니라 **스텁 정의**다.
 * 둘 다 부팅 경로가 아니므로 상한의 처방 대상이 아니다 — 가드는 자기 판정을 위해 어댑터를
 * 직접 묻는 쪽이지 사용자 화면을 띄우는 쪽이 아니다.
 */
async function isWebGpuUsable(
  onBootPhase?: BootPhaseHook,
  budget?: AdapterBudget,
): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
  if (!gpu) return false;
  try {
    onBootPhase?.('engine:probe-adapter-call');
    // #1234 C3-A — 상한. 미결이면 `GPU_ADAPTER_TIMEOUT` 이 돌아오고, 「어댑터 없음」과 같은
    // 결론(false)으로 흡수돼 아래 WebGL2 폴백으로 간다. 상한 도달은
    // `engine:probe-adapter-timeout` 마크로 남으므로 「adapter 가 null 이었다」와 갈린다.
    const adapter = await withAdapterTimeoutMarked(
      gpu.requestAdapter(),
      'engine:probe-adapter-timeout',
      onBootPhase,
      budget,
    );
    if (adapter === GPU_ADAPTER_TIMEOUT) return false;
    return adapter !== null;
  } catch {
    return false;
  }
}

/**
 * 현재 어댑터가 지원하는 WebGPU feature 집합. P4-D #166 — timestamp-query 사용 가능 여부 판별.
 * 어댑터 획득 실패 시 빈 Set. 동일 어댑터에 대해 Babylon이 별도 생성하지만, 중복 호출 비용은
 * microsecond 단위로 무시 가능.
 *
 * #1234 C3-A — 여기도 **같은 클래스**다 (타임아웃 없는 `requestAdapter()` await, 부팅 경로 위).
 * 실패 표본이 여기서 멈춘 적은 없다 — 이 함수는 위 사전 판별이 **settle 해서 true 였을 때만**
 * 도달하기 때문이다. 다만 「앞 호출이 settle 했으니 뒤 호출도 settle 한다」는 보장은 없고
 * (미결은 자원 상태 함수이지 단조 함수가 아니다), 여기서 멈추면 증상이 동일하다 —
 * `engine:webgpu-probe` 는 찍혔는데 `engine:webgpu-features` 가 없는 형태다. 같은 상한을 씌운다.
 *
 * #1238 R1 — 「같은 상한」이 아니라 **같은 예산**이다. 위 사전 판별이 늦게 settle 했다면 여기는
 * **잔여만** 받는다. 잔여 소진은 양성 결말로 흡수된다 (빈 feature 집합 = P4-D bench 전용 —
 * WebGPU 엔진 생성 자체는 그대로 진행한다).
 */
async function getWebGpuFeatures(
  onBootPhase?: BootPhaseHook,
  budget?: AdapterBudget,
): Promise<ReadonlySet<string>> {
  if (typeof navigator === 'undefined') return new Set();
  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
  if (!gpu) return new Set();
  try {
    const adapter = await withAdapterTimeoutMarked(
      gpu.requestAdapter(),
      'engine:features-adapter-timeout',
      onBootPhase,
      budget,
    );
    // 상한 도달은 「어댑터 없음」과 같은 결말 — feature 집합이 비면 timestamp-query 를 요청하지
    // 않을 뿐이고 (P4-D bench 전용) WebGPU 엔진 생성 자체는 그대로 진행한다.
    if (adapter === GPU_ADAPTER_TIMEOUT || !adapter) return new Set();
    return new Set(adapter.features);
  } catch {
    return new Set();
  }
}
