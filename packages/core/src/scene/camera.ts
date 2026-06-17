import {
  ArcRotateCamera,
  KeyboardEventTypes,
  Vector3,
  type Observer,
  type KeyboardInfo,
  type Scene,
} from '@babylonjs/core';

/**
 * #629 — 줌(휠/핀치) 델타를 radius 비례(%)로 적용하는 비율 상수.
 *
 * 틱당 약 1% 줌. 절대 `wheelPrecision`/`pinchPrecision` 대신 사용하는 이유는 tier 별
 * renderScale 비대칭(T1 solar radius≈35 ↔ T3 body radius≈158386) 때문이다 — 절대 델타는
 * deep tier 에서 변화율이 0.03% 로 떨어져 줌이 체감상 멈춘다 (forensic ADR
 * docs/decisions/20260607-629-freefly-camera-zoom-forensic.md). 휠/핀치 동일 값으로
 * desktop·mobile 줌 감도를 일치시킨다. D-T2 피드백 시 본 상수만 조정.
 */
export const ZOOM_DELTA_PERCENTAGE = 0.01;

/**
 * #693 — free-fly 패닝(우클릭/Ctrl 드래그) 시 화면 px ↔ world 이동 비율 상수.
 *
 * "drag 1px ≈ radius × PANNING_DELTA_PERCENTAGE world 이동" 을 보장한다. tier 별 renderScale
 * 비대칭(solar radius≈35 ↔ body radius≈158386)에서 절대 `panningSensibility` 는 화면 px↔world
 * 비율이 깨진다는 #629 `wheelDeltaPercentage` 교훈을 패닝에 적용 (forensic ADR
 * docs/decisions/20260616-693-freefly-panning.md §결정 2). D-T2 감도 튜닝 시 본 상수만 조정.
 */
export const PANNING_DELTA_PERCENTAGE = 0.01;

/**
 * #693 — radius 기반 `panningSensibility` 산출.
 *
 * Babylon `panningSensibility` 는 정적 스칼라(divisor — 값↑ = 둔감)이고 radius 에 자동 비례하지
 * 않는다("deltaPercentage" 패닝 옵션 부재) → radius 가 변할 때마다(줌) 재산출해야 화면 px↔world
 * 비율이 일정하다. drag 1px world 이동량 ≈ radius × PANNING_DELTA_PERCENTAGE 가 되도록
 * `sensibility = REFERENCE / (radius × pct)` 형태.
 *
 * **zero-division 가드 (ADR §결정 1, agy 고유 발견 ①)**: 분모 radius 가 0/NaN 이면 sensibility 가
 * Infinity/NaN 으로 발산 → 패닝 입력이 NaN target 을 만들어 렌더링 먹통(DoS). radius 는 카메라
 * `lowerRadiusLimit`(tier 별 양수, 기본 0.5)에서 clamp 되지만 산식 분모는 방어적으로 명시 하한
 * (`Math.max(radius, lowerRadiusLimit, EPSILON)`)을 적용한다.
 */
export function computePanningSensibility(camera: ArcRotateCamera): number {
  // Babylon panning 내부식 기준 참조 상수: sensibility=1 일 때 1px drag ≈ 1 world unit /
  // (radius 무관). REFERENCE_SENSIBILITY 를 radius×pct 로 나눠 radius 비례를 부여한다.
  const REFERENCE_SENSIBILITY = 1000;
  const EPSILON = 1e-6;
  const lower = camera.lowerRadiusLimit ?? EPSILON;
  // NaN 방어: Number.isFinite 가 아니면 lower 로 대체 후 하한 clamp.
  const safeRadius = Number.isFinite(camera.radius) ? camera.radius : lower;
  const denom = Math.max(safeRadius, lower, EPSILON) * PANNING_DELTA_PERCENTAGE;
  return REFERENCE_SENSIBILITY / denom;
}

/**
 * #693 — free-fly ↔ focus 전환 시 패닝 활성/비활성 토글.
 *
 * - free-fly 진입 → `computePanningSensibility(camera)` (radius 비례 활성)
 * - focus 진입 → `0` (비활성). focus 중 `#followObserver`(camera-controller.ts)가 매 프레임
 *   target 을 focus mesh 로 덮어쓰므로 패닝 입력이 즉시 상쇄됨 → 활성화 무의미 + jitter (ADR §결정 3
 *   옵션 A).
 *
 * free-fly 활성 중에는 줌(radius 변동)에 따라 sensibility 가 어긋나지 않도록 `onBeforeRender` 에서
 * `enabled=true` 로 매 프레임 재호출해야 한다 (ADR §결정 2, agy 고유 발견 ②).
 */
export function setPanningEnabled(camera: ArcRotateCamera, enabled: boolean): void {
  camera.panningSensibility = enabled ? computePanningSensibility(camera) : 0;
}

/**
 * #696 — free-fly WASD/QE 키보드 이동 속도 상수 (초당 radius 비율).
 *
 * 매 프레임 이동량 = `dir × radius × WASD_DELTA_PERCENTAGE × (deltaTime초)` — radius 비례라
 * tier 별 renderScale 비대칭(solar radius≈35 ↔ body radius≈158386)에서도 체감 속도가 일정하다
 * (#629 `wheelDeltaPercentage` / #693 `PANNING_DELTA_PERCENTAGE` 비례 철학 계승, ADR §결정 축 3).
 *
 * **PANNING 과 별개 상수** — 드래그(패닝) vs 키 지속(WASD)은 체감 속도가 달라 단일 공유 시 한쪽
 * 튜닝이 다른 쪽을 오염시킨다(ADR §결정 1). "초당 radius 의 N배 이동" 의미 — deltaTime 곱산이라
 * 프레임 레이트(60/144Hz)와 무관하게 동일 속도(ADR §결정 3, agy 고유 발견 ①). D-T2 체감 후 본 상수만 조정.
 */
export const WASD_DELTA_PERCENTAGE = 0.5;

/** #696 — WASD 이동에 관여하는 키(소문자) → 카메라 로컬 basis 축 매핑. */
const WASD_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e']);

/** #696 — attachWasdControl 이 반환하는 detach 핸들 (observer + 키 상태 정리). */
export interface WasdControlHandle {
  /** 리스너/observer 해제 + 눌림 키 상태 클리어 (HMR/unmount 누수 방지). */
  detach: () => void;
  /** free-fly ↔ focus 토글. false 면 이동 연산 자체를 건너뛴다(focus follow 충돌 회피). */
  setEnabled: (enabled: boolean) => void;
  /** 눌림 키 상태 클리어 (reset / blur / keyup 유실 대비 — ADR §결정 5). */
  clearKeys: () => void;
}

/**
 * #696 — free-fly WASD/QE 키보드 이동을 카메라에 부착한다.
 *
 * W/S = 시선 전·후진 / A·D = 좌우 strafe / Q·E = 상·하. 화살표 키(`keysUp/Down/Left/Right`)는
 * 손대지 않아 ArcRotate 기본 회전이 보존된다(Q1 무충돌, ADR §결정 2).
 *
 * 좌표계: target + position 을 **동시 평행이동**(dolly 아님 — radius/α/β offset 보존). free-fly
 * originOffset=[0,0,0] 불변식상 #631 `cameraFromSunMeters` 가산식이 그대로 정합 → 좌표 보정 0
 * (ADR §1 측정 관찰 1·2). forward/right 는 카메라 로컬, **Q/E 상하는 월드 절대 up**(`Vector3.Up()`)
 * 사용 — 수직 하향 시점(pitch≈−π/2)에서 local up 이 수평으로 둔갑하는 비직관 회피(agy 고유 발견 ②).
 *
 * 리스너 수명 주기는 반환 핸들의 `detach()` 로 봉인(#693 contextmenu `onDisposeObservable` 선례).
 * sim-canvas 가 free-fly 토글 시 `setEnabled`, reset/unmount 시 `clearKeys`/`detach` 호출.
 *
 * @returns attach/detach + setEnabled + clearKeys 인터페이스(ADR §결정 2, agy 고유 발견 ③)
 */
export function attachWasdControl(camera: ArcRotateCamera, scene: Scene): WasdControlHandle {
  const pressed = new Set<string>();
  let enabled = false;

  // 키 다운/업 → 눌림 키 집합 추적. Shift 동반/CapsLock 대문자 변형 방어 위해 소문자 비교.
  const keyboardObserver: Observer<KeyboardInfo> | null = scene.onKeyboardObservable.add((info) => {
    const key = info.event.key.toLowerCase();
    if (!WASD_KEYS.has(key)) return; // 화살표 등 비대상 키는 ArcRotate 에 위임(Q1).
    if (info.type === KeyboardEventTypes.KEYDOWN) pressed.add(key);
    else if (info.type === KeyboardEventTypes.KEYUP) pressed.delete(key);
  });

  // 포커스 이탈(alt-tab)로 keyup 이 유실되면 키가 "눌린 채" 남아 카메라가 계속 이동한다 → blur 시 클리어.
  const renderingCanvas = scene.getEngine().getRenderingCanvas();
  const onBlur = () => pressed.clear();
  if (typeof window !== 'undefined') window.addEventListener('blur', onBlur);

  // 매 프레임 이동 — free-fly 활성 + 눌린 키가 있을 때만.
  const renderObserver = scene.onBeforeRenderObservable.add(() => {
    if (!enabled || pressed.size === 0) return;
    // 텍스트 입력 포커스 중 WASD 가 카메라를 움직이면 안 된다(ADR §결정 6). canvas 포커스만 허용.
    if (typeof document !== 'undefined') {
      const active = document.activeElement;
      const isTextInput =
        active instanceof HTMLElement &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable);
      if (isTextInput) return;
      // canvas 가 포커스를 갖지 않으면(다른 요소 포커스) 이동 차단 — 2중 가드.
      if (renderingCanvas && active !== renderingCanvas && active !== document.body) return;
    }

    const forward = camera.getDirection(Vector3.Forward());
    const worldUp = Vector3.Up();
    // right = forward × worldUp (정규직교 strafe 축, ADR §1 측정 관찰 3).
    const right = Vector3.Cross(forward, worldUp);

    // 눌린 키 → 방향 합벡터 누적. 대각 이동이 √2/√3 가속되지 않도록 합산 후 정규화(ADR §결정 3 이견 수용).
    const move = Vector3.Zero();
    if (pressed.has('w')) move.addInPlace(forward);
    if (pressed.has('s')) move.subtractInPlace(forward);
    if (pressed.has('d')) move.addInPlace(right);
    if (pressed.has('a')) move.subtractInPlace(right);
    if (pressed.has('q')) move.addInPlace(worldUp);
    if (pressed.has('e')) move.subtractInPlace(worldUp);
    if (move.lengthSquared() === 0) return; // W+S 등 상쇄로 합벡터 0.
    move.normalize();

    // 프레임 레이트 독립(agy 고유 발견 ①, 치명적): deltaSeconds 곱산 → 60/144Hz 무관 동일 속도.
    const deltaSeconds = scene.getEngine().getDeltaTime() / 1000;
    const step = camera.radius * WASD_DELTA_PERCENTAGE * deltaSeconds;
    move.scaleInPlace(step);

    // target + position 동시 평행이동 (offset 보존 → radius/시선 방향 불변, ADR §결정 축 2).
    camera.target.addInPlace(move);
    camera.position.addInPlace(move);
  });

  return {
    detach: () => {
      if (keyboardObserver) scene.onKeyboardObservable.remove(keyboardObserver);
      if (renderObserver) scene.onBeforeRenderObservable.remove(renderObserver);
      if (typeof window !== 'undefined') window.removeEventListener('blur', onBlur);
      pressed.clear();
    },
    setEnabled: (next: boolean) => {
      enabled = next;
      if (!next) pressed.clear(); // 비활성 전환 시 잔존 키 클리어(focus 진입 시 이동 잔류 방지).
    },
    clearKeys: () => pressed.clear(),
  };
}

export interface ArcCameraOptions {
  /** 수평 회전각 (rad) */
  alpha?: number;
  /** 수직 회전각 (rad) */
  beta?: number;
  /** 타겟까지 거리 (씬 단위) */
  radius?: number;
  /** 타겟 위치 */
  target?: Vector3;
  /** 최소 거리 */
  lowerRadiusLimit?: number;
  /** 최대 거리 */
  upperRadiusLimit?: number;
}

/**
 * 기본 ArcRotate 카메라를 씬에 설치한다.
 * Floating Origin 기반의 본격 카메라 시스템은 C6 (#18)에서 구현.
 */
export function setupArcRotateCamera(
  scene: Scene,
  options: ArcCameraOptions = {},
): ArcRotateCamera {
  const {
    alpha = -Math.PI / 2,
    beta = Math.PI / 2.5,
    radius = 30,
    target = Vector3.Zero(),
    lowerRadiusLimit = 0.5,
    upperRadiusLimit = 1e14,
  } = options;

  const camera = new ArcRotateCamera('camera', alpha, beta, radius, target, scene);
  camera.lowerRadiusLimit = lowerRadiusLimit;
  camera.upperRadiusLimit = upperRadiusLimit;
  // #629 — 줌 델타를 radius 비례(%)로 적용한다.
  //
  // 절대 `wheelPrecision`/`pinchPrecision` 은 tier 별 renderScale 비대칭 (T1 solar radius≈35
  // ↔ T3 body radius≈158386) 에서 동일 틱이 전혀 다른 비율 변화를 낳는다. 위성(galilean) focus
  // 후 free-fly 진입 시 카메라가 tier=body / radius≈158386 으로 잔존하는데, 절대 델타(틱당 수십
  // unit)는 radius 158386 대비 변화율이 0.03% 로 떨어져 줌이 체감상 완전히 멈춘다 → 사용자가
  // "탐색 시 시점 고정" 으로 인지 (forensic ADR docs/decisions/20260607-629-freefly-camera-zoom-forensic.md).
  // percentage 모드는 모든 tier/scale 에서 일정 비율(틱당 ~1%) 줌을 보장한다.
  // (Babylon: deltaPercentage 설정 시 절대 precision 은 무시되므로 wheelPrecision/pinchPrecision 제거.)
  camera.wheelDeltaPercentage = ZOOM_DELTA_PERCENTAGE;
  camera.pinchDeltaPercentage = ZOOM_DELTA_PERCENTAGE;
  // #693 — 패닝은 free-fly 진입 시에만 활성. 초기값 0(비활성) — focus 가 기본 상태이고 focus 중
  // followObserver 가 target 을 덮어쓰므로 패닝 무의미(ADR §결정 3 옵션 A). free-fly ↔ focus
  // 전환 시 setPanningEnabled() 로 토글, free-fly 활성 중에는 onBeforeRender 에서 radius 비례
  // 재산출(줌 일관성, §결정 2). 패닝 축 = Babylon 기본 스크린 평면(viewport XY) — "보이는 화면을
  // 미는" 멘탈 모델 정합 (§결정 3, panningAxis 미설정 = 기본값 유지).
  camera.panningSensibility = 0;
  // 로그 뎁스 버퍼 전제 — 극단 near/far (행성 표면 ~ 태양계 외곽 이상)
  camera.minZ = 0.01;
  camera.maxZ = 1e14;

  const canvas = scene.getEngine().getRenderingCanvas();
  if (canvas) {
    camera.attachControl(canvas, true);
    // #693 — 우클릭 드래그 패닝 시 브라우저 contextmenu 팝업 차단 (ADR §결정 5).
    // `attachControl(canvas, true)` 는 noPreventDefault=true 라 native 우클릭 메뉴가 뜬다 →
    // 우클릭 패닝과 충돌. canvas 한정 contextmenu 차단으로 패닝 UX 보존 (좌클릭 회전/휠 줌 무영향).
    // named handler + camera dispose 시 제거 — HMR/StrictMode 재마운트 리스너 누수 방지 (reviewer 권고).
    const preventContextMenu = (e: Event) => e.preventDefault();
    canvas.addEventListener('contextmenu', preventContextMenu);
    camera.onDisposeObservable.add(() => {
      canvas.removeEventListener('contextmenu', preventContextMenu);
    });
  }

  return camera;
}
