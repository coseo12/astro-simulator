/**
 * #1234 C2-H3 — 부팅 단계 계측 기록기 (dev 전용).
 *
 * ## 왜 있는가
 *
 * `shader-pixel-guard` 의 `bootstrapScene` 은 `window.__solarScene` 노출까지를 20 s 안에
 * 기다린다. C1 계측이 잡은 실패 표본 (run 35489961871 attempt 3) 의 상태는
 * `readyState=complete` · `__simCore="object"` · **`__solarScene="undefined"`** ·
 * `performance.now()=21736ms` 였다. 즉 문서도 번들도 떴고 초기화 effect 도 이미 시작했는데
 * 장면만 안 나왔다 — 그 사이 구간이 통째로 블랙박스였다.
 *
 * 이 모듈은 그 구간에 **눈금을 새긴다**. 원인을 고르지 않는다 (#1234 C2 1단계 = 계측).
 *
 * ## 계약
 *
 * - `markBootPhase(name, chain)` = 「`chain` 의 `name` 구간이 방금 끝났다」. 소요는 **같은 chain
 *   의 직전 mark 와의 차**다.
 * - **chain 이 필요한 이유**: dev 빌드는 React StrictMode 로 초기화 effect 를 두 번 돌리고, 두
 *   체인이 **동시에** 진행한다 (로컬 실측 — 한 페이지에 엔진이 2개 생성된다). 전역 직전 mark 와
 *   빼면 남의 체인과의 차가 자기 구간 소요로 기록돼 **거짓 분포**가 된다.
 * - 첫 mark 의 `atMs` 는 `performance.now()` 이므로 **네비게이션 시작 기준 경과**다.
 *   따라서 「effect 가 시작되기까지 얼마나 걸렸나」도 값 하나로 읽힌다.
 * - 노출은 `window.__bootPhases` **한 곳**이고 `process.env.NODE_ENV !== 'production'`
 *   게이트 안에서만 정의된다 — `__solarScene` (sim-canvas.tsx §P10-C-2) 과 같은 계약이다.
 *   **앱 코드가 이 전역을 소비하면 prod 에서 조용히 퇴행한다** (#847 회귀 클래스). 소비자는
 *   `scripts/browser-verify-utils.mjs` 의 부팅 진단 하나뿐이다.
 * - prod 번들에서는 `BOOT_PHASES_ENABLED` 가 리터럴 `false` 로 치환되어 기록·노출 양쪽이
 *   DCE 된다. core 쪽 훅도 `undefined` 로 전달되어 호출 0 이 된다 (sim-canvas 배선 참조).
 *
 * ## 왜 core 가 아니라 여기인가
 *
 * `performance.now()` 소유권과 dev 게이트를 한 곳에 둔다. core 가 전역을 잡으면 Next 의
 * `NODE_ENV` 리터럴 치환이 닿지 않아 prod 번들에 남고, 상한·노출 방식이 두 곳으로 갈린다.
 * core 는 **이름만 통지**한다 (`packages/core/src/engine/boot-phase.ts` §계약).
 */

/**
 * 기록 상한 — 계측이 메모리·로그를 키우지 않게 하는 방어선.
 *
 * #1234 C2 2단계에서 `gpu:*` (최대 6) · `engine:create-enter` · `engine:probe-adapter-call`
 * 이 늘었다. 두 수를 구분해서 적는다:
 *  - **[실측]** 로컬 `verify:1215-cloud-layer` PASS 페이지 = `phases 44` · `dropped 0`
 *    (WebGL2 폴백 경로 + StrictMode 첫 체인이 중도 취소된 형태). 옛 상한 64 로도 안 잘린다.
 *  - **[계산]** 양 체인이 **둘 다 완주**하고 **WebGPU 경로**로 가면 체인당 34 (폴백까지 타면
 *    36) → 한 페이지 68~72 로 64 를 넘는다. 이때 잘리는 것은 **뒤쪽**, 즉 `scene:*` ~
 *    `web:first-frame-after-scene` 이라 하필 비교 기준이 되는 정상 부팅의 꼬리다.
 *
 * 즉 상한 상향은 관측된 절단의 수습이 아니라 **아직 안 밟은 경로에 대한 여유**다. 상한은
 * 판정·임계가 아니라 계측 자신의 방어선이므로 #1234 계약 C5 의 「판정·임계 상수」와 무관하다.
 */
const MAX_BOOT_PHASES = 128;

/**
 * dev 게이트. `process.env.NODE_ENV` 는 Next webpack 이 **리터럴로 치환**하므로 prod 빌드에서
 * 이 상수는 `false` 가 되고 아래 분기 전체가 DCE 된다 (`globalThis.process` 경유 읽기가 아님에
 * 유의 — 그 형태는 치환 대상이 아니라 런타임 조회가 된다).
 */
const BOOT_PHASES_ENABLED = process.env.NODE_ENV !== 'production';

export interface BootPhaseRecord {
  /** 방금 끝난 구간 이름. */
  name: string;
  /** 초기화 체인 식별자 (StrictMode 이중 마운트 분리 — `m1` / `m2` …). */
  chain: string;
  /** `performance.now()` — 네비게이션 시작 기준 경과 (ms, 소수 1자리). */
  atMs: number;
  /** **같은 chain** 의 직전 mark 와의 차 (ms, 소수 1자리). 체인 첫 mark 는 `atMs` 와 같다. */
  deltaMs: number;
}

const records: BootPhaseRecord[] = [];
/** 발급된 초기화 체인 수 (= dev 에서 effect 가 몇 번 돌았나). */
let chainSeq = 0;
let exposed = false;
/** 상한 초과로 버린 mark 수 — 「기록이 없다」와 「잘렸다」를 구분한다. */
let dropped = 0;

/** 소수 1자리 반올림 (ms 미만 구간이 전부 0 으로 뭉개지는 것을 막는다). */
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function now(): number {
  // SSR·구형 환경 방어. `performance` 부재 시 계측만 0 이 되고 앱은 그대로 돈다.
  return typeof performance !== 'undefined' ? performance.now() : 0;
}

/**
 * `window.__bootPhases` 노출 (최초 mark 시 1회).
 *
 * getter 라 **읽는 시점의 스냅샷**을 준다 — 부팅이 멈춘 채로 진단이 읽어도 그때까지의 구간이
 * 전부 보인다. 이것이 본 계측의 존재 이유이므로 값 복사본을 미리 박아두면 안 된다.
 */
function exposeGlobal(): void {
  if (exposed || typeof window === 'undefined') return;
  exposed = true;
  Object.defineProperty(window, '__bootPhases', {
    configurable: true,
    get: () => readBootPhases(),
  });
}

/**
 * 초기화 체인 id 를 새로 발급한다 (초기화 effect 진입 시 1회).
 *
 * 같은 페이지에서 effect 가 두 번 돌면 (StrictMode) 두 체인이 동시에 진행하므로, 구간 소요를
 * 자기 체인 안에서 빼기 위한 축이다.
 */
export function nextBootChain(): string {
  chainSeq += 1;
  return `m${chainSeq}`;
}

/**
 * 구간 종료를 기록한다. 비활성 (prod) 이면 no-op.
 *
 * @param name 방금 끝난 구간 이름 (`web:` / `gpu:` / `engine:` / `core:` / `scene:` 접두).
 * @param chain `nextBootChain()` 이 발급한 체인 id. 미지정은 체인 구분 없는 단일 흐름.
 */
export function markBootPhase(name: string, chain = 'm0'): void {
  if (!BOOT_PHASES_ENABLED) return;
  const atMs = now();
  if (records.length >= MAX_BOOT_PHASES) {
    dropped += 1;
    return;
  }
  // 같은 체인의 직전 mark 를 뒤에서부터 찾는다 (체인은 보통 2개라 탐색 길이가 짧다).
  let previous: BootPhaseRecord | undefined;
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const candidate = records[i];
    if (candidate !== undefined && candidate.chain === chain) {
      previous = candidate;
      break;
    }
  }
  records.push({
    name,
    chain,
    atMs: round1(atMs),
    deltaMs: round1(previous === undefined ? atMs : atMs - previous.atMs),
  });
  exposeGlobal();
}

/** 지금까지의 기록 스냅샷 (읽는 쪽이 배열을 바꿔도 원본은 불변). */
export function readBootPhases(): {
  phases: BootPhaseRecord[];
  dropped: number;
  nowMs: number;
} {
  return { phases: records.map((r) => ({ ...r })), dropped, nowMs: round1(now()) };
}

/** 테스트 전용 — 모듈 상태 초기화. 앱 코드는 호출하지 않는다. */
export function __resetBootPhasesForTest(): void {
  records.length = 0;
  dropped = 0;
  exposed = false;
  chainSeq = 0;
}
