#!/usr/bin/env node
/**
 * #1274 — 절차 표면 base↔feature 픽셀 불변성 하네스 (ADR `20260628-756` Amendment 12 §A12.8).
 *
 * **무엇을 재는가**: 두 빌드 (A · B) 가 같은 결정적 프레임에서 그린 천체 disk 표본의 픽셀이 같은가.
 * 시나리오 = `body × {on, off}` (`off` = `?surface=off`). 판정량은 시나리오별 disk 표본 안에서
 * **채널 하나라도 다른 픽셀 수** 다 — `EXPECT_ZERO` 는 정확히 `0`, `EXPECT_NONZERO` 는 `> 0`.
 *
 * 두 빌드를 비교하므로 CI 상시 가드가 아니다 (§A12.8 — 비-범위). dev · qa 실행 도구이며 실행 로그를
 * PR 코멘트에 박제한다.
 *
 * ## 모드
 *   MODE=capture OUT=<dir> [SCENARIOS=earth:on,...]   현재 서버 (BASE_URL) 의 시나리오를 캡처한다.
 *                                                    기본 시나리오 = `BODIES × {on, off}` 전부.
 *   MODE=compare A=<dir> B=<dir> EXPECT_ZERO=<list> EXPECT_NONZERO=<list>
 *                                                    두 캡처 디렉터리를 비교한다 (브라우저 불요).
 *   한 포트로 「base 캡처 → feature 빌드 · 서버 재시작 → feature 캡처 → compare」 순서로 쓴다.
 *
 * ## 종료 코드
 *   0 기대 전건 충족 / 1 기대 위반 / **2 측정 불가** — 아래 전제 중 하나라도 실패.
 *   측정 실패를 diff `0` 으로 읽지 않는다. 처리되지 않은 예외도 exit `2` 로 번역한다.
 *
 * ## 전제 (위반 = exit 2) — §A12.8 전제 표 + 하네스 고유 2종
 *   capture  P1 캔버스 개수 `=== 1` (`hideDomOverlays` 단언 + 캡처 직전 재확인)
 *            P2 대상 mesh 존재 · disk 표본 픽셀 `> 0`
 *            P3 투영 disk 반경 `≥ SURFACE_MASK_MIN_DISK_PX` (코어 상수를 **소스에서 읽는다** — 사본 0)
 *            P4 자기 대조 — 같은 시나리오를 독립 page load 2회 캡처해 기하 동일 · disk diff `0`
 *            P5 earth `:on` — host 머티리얼 `uMaskEnabled === 1` (마스크 로드 완료)
 *            P6 LOD 정착 (`waitForLodSettle` timedOut 아님)
 *            P7 (하네스 고유) 대상 body LOD level `=== 'high'` — billboard 면 on/off 가 같은 단색이 되어
 *               diff `0` 이 판별력 없이 나온다
 *            P8 (하네스 고유) host 머티리얼 클래스가 시나리오와 정합 — `:on` = `ShaderMaterial`,
 *               `:off` = `StandardMaterial`. `?surface=off` 가 조용한 no-op 이 되면 여기서 걸린다
 *   compare  C1 `EXPECT_ZERO ∪ EXPECT_NONZERO` 비어 있지 않음 · 두 목록 교집합 `∅` · 형식 `<body>:<on|off>`
 *            C2 캡처된 시나리오 집합 `==` `EXPECT_ZERO ∪ EXPECT_NONZERO` (A · B 각각)
 *            C3 A · B 의 capture 전제 전건 충족 (meta `complete` · `premiseFailures` 0)
 *            C4 A · B 의 disk 기하 (중심 · 반경 · 이미지 크기) 동일 · 렌더러 문자열 동일
 *
 * ## 판정 범위의 한계 (§A12.8)
 *   표본이 `0.95R` 안쪽이라 `0.95R ~ R` 가장자리 띠 (rim 대역 포함) 의 변화는 판정 밖이다.
 *
 * 환경: BASE_URL (기본 http://localhost:3000) · SWIFTSHADER=1 (headless + --use-angle=swiftshader)
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import {
  bootstrapScene,
  collectConsoleErrors,
  hideDomOverlays,
  launchBrowser,
  resolveBaseUrl,
  waitForLodSettle,
  withBrowser,
} from '../../../scripts/browser-verify-utils.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MODE = process.env.MODE ?? '';
const SWIFTSHADER = process.env.SWIFTSHADER === '1';

const EXIT_PASS = 0;
const EXIT_FAIL = 1;
const EXIT_UNMEASURABLE = 2;

/** PR1 대상 body (§A12.8 시나리오). PR2 에서 uranus · neptune 을 더한다. */
const BODIES = ['earth', 'mars', 'jupiter', 'moon'];
const SURFACE_MODES = ['on', 'off'];

/** 결정적 프레임 고정 JD — `verify:1202` / `verify:1215` / `verify:783` / `verify:1119` 와 같은 값. */
const T_JD = 2451626.0;

/** 뷰포트 — §A12.8 「1280×720 · deviceScaleFactor 1」. */
const VIEWPORT = { width: 1280, height: 720 };

/** 부트스트랩 안정화 대기 — `verify:1202` · `verify:1215` · `verify:1226` 과 같은 값. */
const BOOT_SETTLE_MS = 2800;
/** JD 점프 + 정지 뒤 대기 — `verify:1202` · `verify:1215` · `verify:1226` 과 같은 값. */
const POST_JUMP_WAIT_MS = 1000;

/** 자기 대조 page load 횟수 (§A12.8 「독립 page load 2회」). */
const SELF_LOADS = 2;

const META_FILE = 'meta.json';

// ── 코어 · 자매 가드 상수를 **소스에서 읽는다** (사본 0 — 숨은 상수 drift 차단, volt #69) ─────────
// 읽기에 실패하면 throw → exit 2. 값을 손으로 옮겨 적지 않는다.

/**
 * `file` 안의 `const <name> = <number>;` 선언에서 수치를 읽는다 (선언이 정확히 1개여야 한다).
 * @returns {number}
 */
async function readNumericConst(relFile, name) {
  const src = await readFile(path.join(REPO_ROOT, relFile), 'utf8');
  const re = new RegExp(`^(?:export\\s+)?const\\s+${name}\\s*=\\s*([0-9.]+)\\s*;`, 'gm');
  const hits = [...src.matchAll(re)];
  if (hits.length !== 1) {
    throw new Error(`${relFile} 에서 \`const ${name} = <수치>;\` 선언이 ${hits.length}개 (기대 1)`);
  }
  const value = Number(hits[0][1]);
  if (!Number.isFinite(value)) throw new Error(`${relFile} ${name} 수치 해석 실패 (${hits[0][1]})`);
  return value;
}

/** 코어 원거리 마스크 LOD 임계 — §A12.8 P3 (cross-validate F2 수정 수용 — 새 임계 0). */
const SURFACE_MASK_MIN_DISK_PX_SOURCE = 'packages/core/src/scene/procedural-planet-shader.ts';
/** disk 표본 반경 비 — `verify:756` P2 (#1146) 와 같은 식 (§A12.8 「사본이면 출처 주석」 → 사본 대신 읽기). */
const DISK_SAMPLE_RADIUS_SOURCE = 'apps/web/scripts/browser-verify-756-surface.mjs';

// ── 공용 ──────────────────────────────────────────────────────────────────────

/** 측정 불가 사유를 담는 예외 — PASS 도 FAIL 도 아니다. `main` 의 catch 가 exit 2 로 번역한다. */
class Unmeasurable extends Error {}

const scenarioKey = (body, surface) => `${body}:${surface}`;
const scenarioFile = (key, load) => `${key.replace(':', '-')}.load${load}.png`;

function parseScenarioList(raw, label) {
  if (raw === undefined) return [];
  const items = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  for (const item of items) {
    if (!/^[a-z0-9_-]+:(on|off)$/.test(item)) {
      throw new Unmeasurable(`${label} 항목 형식 위반 '${item}' (기대 <body>:<on|off>)`);
    }
  }
  const set = new Set(items);
  if (set.size !== items.length) throw new Unmeasurable(`${label} 에 중복 항목이 있다`);
  return items;
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** 캡처 출처 — base / feature / 변이 빌드를 로그에서 가르기 위한 기록 (판정 입력 아님). */
async function provenance() {
  const git = (args) => {
    try {
      return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    } catch (e) {
      return `git 실패: ${e.message}`;
    }
  };
  const distRel = 'packages/core/dist/scene/procedural-planet-shader.js';
  const distPath = path.join(REPO_ROOT, distRel);
  return {
    head: git(['rev-parse', 'HEAD']),
    coreSrcDirty: git(['status', '--porcelain', '--', 'packages/core/src']),
    coreDistShaderSha256: existsSync(distPath) ? sha256(await readFile(distPath)) : null,
  };
}

// ── capture ───────────────────────────────────────────────────────────────────

/**
 * 결정적 프레임 부트스트랩 — `verify:1202` · `verify:1215` 레시피 (JD 고정 + 정지 + LOD 정착).
 * 쿼리는 §A12.8 그대로: `?gpu=a&focus=<id>&lod=auto&speed=0&rotate=off` (+ `&surface=off`).
 * 쿼리 키마다 파서가 있다 — `gpu` · `lod` · `surface` · `rotate` 는 `sim-canvas.tsx`, `focus` · `speed` ·
 * `lod` 는 `core/url-sync.tsx`. 파서가 없는 키는 조용한 no-op 이라 키를 더할 때 파서 존재를 먼저 확인한다.
 * `?surface=off` 가 실제로 적용됐는지는 전제 P8 (host 머티리얼 클래스) 이 매 캡처에서 다시 확인한다.
 */
async function loadScenario(browser, baseUrl, body, surface, load) {
  const query = `/?gpu=a&focus=${body}&lod=auto&speed=0&rotate=off${surface === 'off' ? '&surface=off' : ''}`;
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    const errors = collectConsoleErrors(page);
    await bootstrapScene(page, {
      baseUrl,
      query,
      handles: ['__simCore', '__solarScene'],
      settleMs: BOOT_SETTLE_MS,
      label: `${scenarioKey(body, surface)}#${load}`,
    });
    // #1219 — 캔버스 위 DOM (HUD · 토스트) 을 숨긴다. 캔버스 개수 `!== 1` 이면 throw (P1).
    await hideDomOverlays(page);
    await page.evaluate((jd) => {
      window.__simCore.command({ type: 'jumpToJulianDate', julianDate: jd });
      window.__simCore.command({ type: 'pause' });
    }, T_JD);
    await page.waitForTimeout(POST_JUMP_WAIT_MS);
    const settle = await waitForLodSettle(page);
    const state = await readSceneState(page, body);
    const png = await page.locator('canvas').first().screenshot();
    return { query, settle, state, png, consoleErrors: [...errors] };
  } finally {
    await context.close();
  }
}

/**
 * 캡처 직전 씬 상태 — 캔버스 개수 · 렌더러 · 대상 body 의 LOD · host 머티리얼 · 투영 disk 기하.
 *
 * 투영 disk 산식은 `browser-verify-756-surface.mjs` `measureDisk` (#1146 P2) 와 같다 — 회전 불변
 * world 반경 `max(extendSize × |scaling|)` 을 카메라 right 방향으로 투영. 그쪽 주석이 산식 근거다.
 */
function readSceneState(page, body) {
  return page.evaluate((bodyId) => {
    const scene = window.__simCore?.scene;
    const solar = window.__solarScene;
    const canvasCount = document.querySelectorAll('canvas').length;
    if (!scene || !solar) return { canvasCount, error: 'scene/__solarScene 부재' };
    const engine = scene.getEngine();
    const gl = typeof engine.getGlInfo === 'function' ? engine.getGlInfo() : null;
    const renderer = `${engine.isWebGPU ? 'webgpu' : 'webgl'} | ${engine.description ?? '?'} | ${gl?.renderer ?? '?'}`;
    const rw = engine.getRenderWidth();
    const rh = engine.getRenderHeight();
    const mesh = solar.meshes?.get(bodyId);
    if (!mesh) return { canvasCount, renderer, rw, rh, error: `mesh 부재 (${bodyId})` };
    const lodEntry = (solar.getLodInfo?.() ?? []).find((e) => e.id === bodyId);
    const material = mesh.material;
    const materialClass = material?.getClassName?.() ?? null;
    const uMaskEnabled = material?._floats?.uMaskEnabled ?? null;

    const cam = scene.activeCamera;
    const vp = cam.viewport.toGlobal(rw, rh);
    const transform = scene.getTransformMatrix();
    const Vector3 = mesh.getAbsolutePosition().constructor;
    const Matrix = mesh.getWorldMatrix().constructor;
    const extendSize = mesh.getBoundingInfo().boundingBox.extendSize;
    const s = mesh.scaling;
    const radiusWorld = Math.max(
      extendSize.x * Math.abs(s.x),
      extendSize.y * Math.abs(s.y),
      extendSize.z * Math.abs(s.z),
    );
    const center = mesh.getAbsolutePosition();
    const camRight = cam.getDirection(new Vector3(1, 0, 0));
    const c = Vector3.Project(center, Matrix.Identity(), transform, vp);
    const e = Vector3.Project(
      center.add(camRight.scale(radiusWorld)),
      Matrix.Identity(),
      transform,
      vp,
    );
    return {
      canvasCount,
      renderer,
      rw,
      rh,
      lodLevel: lodEntry?.level ?? null,
      lodStats: solar.getLodStats?.() ?? null,
      materialClass,
      materialName: material?.name ?? null,
      uMaskEnabled,
      disk: { cx: c.x, cy: c.y, r: Math.hypot(e.x - c.x, e.y - c.y) },
    };
  }, body);
}

/** disk 표본 마스크 — 픽셀 중심이 `(cx, cy)` 에서 `ratio × r` 안. 반환: 표본 픽셀 인덱스 배열. */
function diskSampleIndices(width, height, disk, ratio) {
  const rr = (disk.r * ratio) ** 2;
  const out = [];
  const y0 = Math.max(0, Math.floor(disk.cy - disk.r));
  const y1 = Math.min(height - 1, Math.ceil(disk.cy + disk.r));
  const x0 = Math.max(0, Math.floor(disk.cx - disk.r));
  const x1 = Math.min(width - 1, Math.ceil(disk.cx + disk.r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - disk.cx;
      const dy = y + 0.5 - disk.cy;
      if (dx * dx + dy * dy <= rr) out.push(y * width + x);
    }
  }
  return out;
}

/** 표본 안에서 RGBA 채널 하나라도 다른 픽셀 수. 두 이미지 크기가 다르면 throw (전제). */
function diffCount(pngA, pngB, indices) {
  if (pngA.width !== pngB.width || pngA.height !== pngB.height) {
    throw new Unmeasurable(
      `이미지 크기 불일치 ${pngA.width}x${pngA.height} ↔ ${pngB.width}x${pngB.height}`,
    );
  }
  let n = 0;
  for (const i of indices) {
    const o = i * 4;
    if (
      pngA.data[o] !== pngB.data[o] ||
      pngA.data[o + 1] !== pngB.data[o + 1] ||
      pngA.data[o + 2] !== pngB.data[o + 2] ||
      pngA.data[o + 3] !== pngB.data[o + 3]
    ) {
      n++;
    }
  }
  return n;
}

const sameDisk = (a, b) => a.cx === b.cx && a.cy === b.cy && a.r === b.r;

/** 한 load 의 capture 전제 (P1 · P2 일부 · P3 · P5~P8). 위반 문자열 배열을 돌려준다. */
function loadPremiseFailures(key, body, surface, loadRes, minDiskPx) {
  const f = [];
  const st = loadRes.state;
  if (st.canvasCount !== 1) f.push(`P1 캔버스 ${st.canvasCount}개 (기대 1)`);
  if (st.error) {
    f.push(`P2 ${st.error}`);
    return f.map((m) => `${key}: ${m}`);
  }
  if (st.rw !== VIEWPORT.width || st.rh !== VIEWPORT.height) {
    f.push(`렌더 크기 ${st.rw}x${st.rh} ≠ ${VIEWPORT.width}x${VIEWPORT.height}`);
  }
  if (loadRes.settle.timedOut) {
    f.push(`P6 LOD 정착 상한 초과 (dist=${loadRes.settle.dist} fading=${loadRes.settle.fading})`);
  }
  if (st.lodLevel !== 'high') f.push(`P7 ${body} LOD level '${st.lodLevel}' (기대 'high')`);
  const expectedClass = surface === 'on' ? 'ShaderMaterial' : 'StandardMaterial';
  if (st.materialClass !== expectedClass) {
    f.push(`P8 :${surface} 인데 host 머티리얼 ${st.materialClass} (기대 ${expectedClass})`);
  }
  if (body === 'earth' && surface === 'on' && st.uMaskEnabled !== 1) {
    f.push(`P5 earth uMaskEnabled ${st.uMaskEnabled} (기대 1 — 마스크 로드 미완)`);
  }
  const { cx, cy, r } = st.disk;
  if (![cx, cy, r].every(Number.isFinite)) f.push(`P2 disk 기하 비유한 (${cx}, ${cy}, ${r})`);
  else if (!(r >= minDiskPx)) {
    f.push(`P3 disk 반경 ${r.toFixed(2)}px < SURFACE_MASK_MIN_DISK_PX ${minDiskPx}`);
  }
  return f.map((m) => `${key}: ${m}`);
}

async function runCapture() {
  const out = process.env.OUT;
  if (!out) throw new Unmeasurable('MODE=capture 에 OUT 미지정');
  const scenarios =
    process.env.SCENARIOS === undefined
      ? BODIES.flatMap((b) => SURFACE_MODES.map((s) => scenarioKey(b, s)))
      : parseScenarioList(process.env.SCENARIOS, 'SCENARIOS');
  if (scenarios.length === 0) throw new Unmeasurable('캡처 시나리오가 비어 있다');

  const minDiskPx = await readNumericConst(
    SURFACE_MASK_MIN_DISK_PX_SOURCE,
    'SURFACE_MASK_MIN_DISK_PX',
  );
  const sampleRatio = await readNumericConst(DISK_SAMPLE_RADIUS_SOURCE, 'DISK_SAMPLE_RADIUS');
  const baseUrl = resolveBaseUrl();
  await mkdir(out, { recursive: true });
  // 이전 실행의 meta 가 남아 이번 실행의 실패를 가리지 않게 먼저 지운다 (meta 는 끝에서만 쓴다).
  await rm(path.join(out, META_FILE), { force: true });

  const meta = {
    harness: 'browser-verify-1274-surface-invariance',
    complete: false,
    capturedAt: new Date().toISOString(),
    baseUrl,
    swiftshader: SWIFTSHADER,
    tJd: T_JD,
    viewport: VIEWPORT,
    sampleRatio,
    minDiskPx,
    provenance: await provenance(),
    scenarios: {},
    premiseFailures: [],
  };
  console.log(`[capture] OUT=${out} BASE_URL=${baseUrl} SWIFTSHADER=${SWIFTSHADER}`);
  console.log(`[capture] provenance ${JSON.stringify(meta.provenance)}`);
  console.log(`[capture] SURFACE_MASK_MIN_DISK_PX=${minDiskPx} DISK_SAMPLE_RADIUS=${sampleRatio}`);

  const gpu = SWIFTSHADER ? 'swiftshader' : 'default';
  await withBrowser(
    { gpu },
    async (browser) => {
      for (const key of scenarios) {
        const [body, surface] = key.split(':');
        const loads = [];
        for (let load = 1; load <= SELF_LOADS; load++) {
          const res = await loadScenario(browser, baseUrl, body, surface, load);
          await writeFile(path.join(out, scenarioFile(key, load)), res.png);
          loads.push(res);
        }
        const failures = loads.flatMap((l) =>
          loadPremiseFailures(key, body, surface, l, minDiskPx),
        );
        const first = loads[0].state;
        let selfDiff = null;
        let sampleCount = null;
        if (failures.length === 0) {
          // P4 자기 대조 — 기하 · 렌더러가 load 간에 같고, disk 표본 diff 가 0.
          // (LOD 는 P7 이 load 마다 'high' 를 요구하므로 여기서 다시 비교하지 않는다.)
          for (const l of loads.slice(1)) {
            if (!sameDisk(first.disk, l.state.disk)) {
              failures.push(
                `${key}: P4 load 간 disk 기하 불일치 ${JSON.stringify(first.disk)} ↔ ${JSON.stringify(l.state.disk)}`,
              );
            }
            if (first.renderer !== l.state.renderer) {
              failures.push(`${key}: P4 load 간 렌더러 불일치`);
            }
          }
          const pngs = loads.map((l) => PNG.sync.read(l.png));
          const idx = diskSampleIndices(pngs[0].width, pngs[0].height, first.disk, sampleRatio);
          sampleCount = idx.length;
          if (sampleCount === 0) failures.push(`${key}: P2 disk 표본 픽셀 0`);
          if (failures.length === 0) {
            selfDiff = Math.max(...pngs.slice(1).map((p) => diffCount(pngs[0], p, idx)));
            if (selfDiff !== 0) {
              failures.push(
                `${key}: P4 자기 대조 disk diff ${selfDiff}px (같은 빌드 독립 load 2회)`,
              );
            }
          }
        }
        meta.scenarios[key] = {
          query: loads[0].query,
          file: scenarioFile(key, 1),
          disk: first.disk,
          renderer: first.renderer ?? null,
          lodLevel: first.lodLevel ?? null,
          lodStats: first.lodStats ?? null,
          materialClass: first.materialClass ?? null,
          materialName: first.materialName ?? null,
          uMaskEnabled: first.uMaskEnabled ?? null,
          sampleCount,
          selfDiff,
          settles: loads.map((l) => l.settle),
          consoleErrors: loads.map((l) => l.consoleErrors),
          premiseFailures: failures,
        };
        meta.premiseFailures.push(...failures);
        const d = first.disk;
        console.log(
          `  ${key.padEnd(12)} r=${d ? d.r.toFixed(2) : '?'} c=(${d ? d.cx.toFixed(2) : '?'},${d ? d.cy.toFixed(2) : '?'}) ` +
            `lod=${first.lodLevel ?? '?'} mat=${first.materialClass ?? '?'} uMask=${first.uMaskEnabled} ` +
            `sample=${sampleCount} selfDiff=${selfDiff} consoleErrors=${loads.map((l) => l.consoleErrors.length).join('/')} ` +
            `${failures.length ? `✗ ${failures.length}` : '✓'}`,
        );
      }
    },
    { launch: launchBrowser },
  );

  meta.complete = true;
  await writeFile(path.join(out, META_FILE), `${JSON.stringify(meta, null, 2)}\n`);
  if (meta.premiseFailures.length) {
    throw new Unmeasurable(
      `capture 전제 위반 ${meta.premiseFailures.length}건:\n  - ${meta.premiseFailures.join('\n  - ')}`,
    );
  }
  console.log(
    `\n[capture] 시나리오 ${scenarios.length}개 전제 전건 충족 — ${path.join(out, META_FILE)}`,
  );
  return EXIT_PASS;
}

// ── compare ───────────────────────────────────────────────────────────────────

async function readMeta(dir, label) {
  if (!dir) throw new Unmeasurable(`${label} 미지정`);
  const p = path.join(dir, META_FILE);
  if (!existsSync(p))
    throw new Unmeasurable(`${label}=${dir} 에 ${META_FILE} 없음 (capture 미완료)`);
  const meta = JSON.parse(await readFile(p, 'utf8'));
  if (meta.complete !== true) throw new Unmeasurable(`${label} meta.complete !== true`);
  if (!Array.isArray(meta.premiseFailures) || meta.premiseFailures.length !== 0) {
    throw new Unmeasurable(
      `${label} capture 전제 위반 ${meta.premiseFailures?.length ?? '?'}건 (C3)`,
    );
  }
  return meta;
}

async function runCompare() {
  const expectZero = parseScenarioList(process.env.EXPECT_ZERO, 'EXPECT_ZERO');
  const expectNonzero = parseScenarioList(process.env.EXPECT_NONZERO, 'EXPECT_NONZERO');
  const expected = new Set([...expectZero, ...expectNonzero]);
  // C1 — 기대 목록 공백의 공허 통과 차단 · 모순 차단.
  if (expected.size === 0) throw new Unmeasurable('C1 EXPECT_ZERO ∪ EXPECT_NONZERO 가 비어 있다');
  const overlap = expectZero.filter((k) => expectNonzero.includes(k));
  if (overlap.length)
    throw new Unmeasurable(`C1 EXPECT_ZERO ∩ EXPECT_NONZERO = ${overlap.join(',')}`);

  const metaA = await readMeta(process.env.A, 'A');
  const metaB = await readMeta(process.env.B, 'B');
  console.log(`[compare] A=${process.env.A} provenance ${JSON.stringify(metaA.provenance)}`);
  console.log(`[compare] B=${process.env.B} provenance ${JSON.stringify(metaB.provenance)}`);

  // C2 — 캡처 집합 == 기대 집합 (A · B 각각). 캡처했으나 기대에 없는 시나리오가 판정 밖으로 빠지는 경로 차단.
  for (const [label, meta] of [
    ['A', metaA],
    ['B', metaB],
  ]) {
    const captured = new Set(Object.keys(meta.scenarios));
    const missing = [...expected].filter((k) => !captured.has(k));
    const extra = [...captured].filter((k) => !expected.has(k));
    if (missing.length || extra.length) {
      throw new Unmeasurable(
        `C2 ${label} 캡처 집합 ≠ 기대 집합 — 기대에만: [${missing.join(',')}] / 캡처에만: [${extra.join(',')}]`,
      );
    }
  }
  if (metaA.sampleRatio !== metaB.sampleRatio) {
    throw new Unmeasurable(`C4 표본 반경 비 불일치 ${metaA.sampleRatio} ↔ ${metaB.sampleRatio}`);
  }

  const rows = [];
  for (const key of [...expected].sort()) {
    const a = metaA.scenarios[key];
    const b = metaB.scenarios[key];
    // C4 — 서로 다른 영역 · 렌더러를 비교하지 않는다.
    if (!sameDisk(a.disk, b.disk)) {
      throw new Unmeasurable(
        `C4 ${key} A · B disk 기하 불일치 ${JSON.stringify(a.disk)} ↔ ${JSON.stringify(b.disk)}`,
      );
    }
    if (a.renderer !== b.renderer) {
      throw new Unmeasurable(`C4 ${key} A · B 렌더러 불일치 '${a.renderer}' ↔ '${b.renderer}'`);
    }
    const pngA = PNG.sync.read(await readFile(path.join(process.env.A, a.file)));
    const pngB = PNG.sync.read(await readFile(path.join(process.env.B, b.file)));
    const idx = diskSampleIndices(pngA.width, pngA.height, a.disk, metaA.sampleRatio);
    if (idx.length === 0 || idx.length !== a.sampleCount || idx.length !== b.sampleCount) {
      throw new Unmeasurable(
        `C4 ${key} 표본 수 불일치/0 (재계산 ${idx.length}, A ${a.sampleCount}, B ${b.sampleCount})`,
      );
    }
    const diff = diffCount(pngA, pngB, idx);
    const expect = expectZero.includes(key) ? 'zero' : 'nonzero';
    const ok = expect === 'zero' ? diff === 0 : diff > 0;
    rows.push({ key, expect, diff, sample: idx.length, ok });
  }

  console.log('\n=== #1274 base↔feature disk 픽셀 diff (채널 하나라도 다른 픽셀 수) ===');
  for (const r of rows) {
    console.log(
      `  ${r.ok ? 'PASS' : 'FAIL'}  ${r.key.padEnd(12)} diff=${String(r.diff).padStart(6)} / sample ${r.sample}  (기대 ${r.expect === 'zero' ? '== 0' : '> 0'})`,
    );
  }
  const failed = rows.filter((r) => !r.ok);
  console.log(
    failed.length
      ? `\n[FAIL] 기대 위반 ${failed.length}건`
      : `\n[PASS] 기대 ${rows.length}건 전건 충족`,
  );
  return failed.length ? EXIT_FAIL : EXIT_PASS;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (MODE === 'capture') return runCapture();
  if (MODE === 'compare') return runCompare();
  throw new Unmeasurable(`MODE='${MODE}' — capture | compare 중 하나여야 한다`);
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    // 처리되지 않은 예외도 측정 불가 (exit 2) 로 번역한다 — 예외를 exit 1 (기대 위반) 로 읽지 않게.
    console.error(`\n[측정 불가] ${e instanceof Unmeasurable ? e.message : (e?.stack ?? e)}`);
    process.exit(EXIT_UNMEASURABLE);
  });
