/**
 * 매 렌더 프레임 tier / 카메라 기록기 — tier 경계 줌 가드 공용 (#1232).
 *
 * 소비처: `browser-verify-818-focus-zoom.mjs` S4 (focus 경로) · `browser-verify-380-zoom.mjs` S2
 * (free-fly 경로). 두 가드가 같은 판정 원칙을 쓰므로 기록 형식과 실거리 환산을 한 곳에 둔다.
 *
 * ## 왜 매 렌더 프레임인가
 *
 * tier 전환 결함 (ADR 380 §Amendment 3 A3.1(2)) 은 **전환 프레임 1장** 에만 나타난다 — setTier 는
 * `onBeforeRender` 에서 호출되고 camera.update 다음이라, 그 프레임의 radius 가 구 단위인지 새
 * 단위인지는 폴링 측정으로는 볼 수 없다. `scene.onAfterRenderObservable` 로 **실제 렌더된 상태**를
 * 매 프레임 남긴다.
 *
 * ## 왜 실거리인가
 *
 * `camera.radius` 는 scene unit 이라 tier 마다 단위가 다르다 (inner→body 16,299 배, solar→inner
 * 18.3 배). raw radius 의 부호·단조성은 단위 전환 순간을 역행/점프로 읽는다 (A3.1(3) — 구 S2 가
 * 결함판·수정판 **둘 다 FAIL** 한 원인). 판정은 tier-불변 실거리 `radius / RENDER_SCALE[tier] / AU`
 * 로만 한다.
 */

export const AU = 1.495978707e11;

// tier.ts RENDER_SCALE SSoT (m → scene unit). tier-불변 실거리 환산에 사용.
export const RENDER_SCALE = { solar: 8.4e-11, inner: 1.54e-9, body: 2.51e-5 };

/**
 * radius (scene unit) → 실거리 (AU). tier 미상이면 `NaN` — 대체 scale 로 흡수하지 않는다
 * (NaN 은 모든 비교에서 false 라 술어가 fail-closed 로 떨어진다).
 */
export function realDistanceAU(radius, tier) {
  return radius / (RENDER_SCALE[tier] ?? NaN) / AU;
}

/**
 * 기록기 설치 — `window.__tierFrameRec` 에 매 렌더 프레임
 * `{ t, dt, tier, radius, lo }` 를 push 한다. 이미 설치돼 있으면 교체한다.
 *
 * - `dt` = `engine.getDeltaTime()` (ms). 관성 변위는 `dt` 에 비례하므로, 실거리 판정이 FAIL 했을
 *   때 프레임 간격 문제인지 결함인지 가르는 **진단값**이다 (판정량 아님 — #1232 reviewer 권고 3).
 * - `lo` = `camera.lowerRadiusLimit` 원값 (`null` 가능 — Babylon 타입이 `number | null`).
 *
 * @param page Playwright Page
 * @param meshId scene / activeCamera 를 얻을 mesh id (어느 body 든 같은 scene)
 * @returns `{ ok: true }` 또는 `{ error }`
 */
export async function installFrameRecorder(page, meshId) {
  return await page.evaluate((id) => {
    const solar = window.__solarScene;
    const mesh = solar?.meshes?.get?.(id);
    if (!mesh) return { error: `no mesh: ${id}` };
    const scene = mesh.getScene();
    const cam = scene?.activeCamera;
    if (!cam) return { error: 'no camera' };
    const engine = scene.getEngine();
    if (window.__tierFrameRecObserver) {
      scene.onAfterRenderObservable.remove(window.__tierFrameRecObserver);
    }
    window.__tierFrameRec = [];
    window.__tierFrameRecObserver = scene.onAfterRenderObservable.add(() => {
      window.__tierFrameRec.push({
        t: performance.now(),
        dt: engine.getDeltaTime(),
        tier: solar.getTier ? solar.getTier() : 'unknown',
        radius: cam.radius,
        lo: cam.lowerRadiusLimit,
      });
    });
    return { ok: true };
  }, meshId);
}

/** 기록 회수 + 실거리(`au`) 부착. 기록은 비운다 (기록기는 계속 동작). */
export async function drainFrameRecorder(page) {
  const frames = await page.evaluate(() => {
    const f = window.__tierFrameRec ?? [];
    window.__tierFrameRec = [];
    return f;
  });
  return frames.map((f) => ({ ...f, au: realDistanceAU(f.radius, f.tier) }));
}

/** tier 전이 목록 (프레임 인덱스 `i` = 새 tier 의 첫 프레임, from, to). */
export function tierTransitions(frames) {
  const out = [];
  for (let i = 1; i < frames.length; i += 1) {
    if (frames[i].tier !== frames[i - 1].tier) {
      out.push({ i, from: frames[i - 1].tier, to: frames[i].tier });
    }
  }
  return out;
}
