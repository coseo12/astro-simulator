#!/usr/bin/env node
/**
 * #627 satellite 궤도선 구조 결함 회귀 가드 — moon 패턴 일반화 (옵션 A).
 *
 * ADR `docs/decisions/20260606-627-satellite-orbit-structure-forensic.md` §5 §결정
 * + §교차검증 반영 사항 (cross-validate agy outcome=applied) 고유 발견 #3 (원점 밀집 통계 테스트).
 *
 * **회귀 배경** (DoD PASS ≠ 제품 동작, volt #74): R5 까지 moon 만 별도 LineSystem (parent
 * 추적 + visual scale) 이었고 phobos/deimos/galilean 은 sun 중심 `orbit-lines` batch 로 처리 →
 * parent 미추적 (position 0,0,0) + visual scale 미적용 → 궤도선이 태양 원점에 잘못 렌더
 * (forensic 실측 `orbit-lines` vertex 54% 가 원점 1 unit 이내 밀집). 자동 DoD (mesh px / a11y /
 * fps) 는 궤도선 **위치** 를 검증하지 않아 R5 D-T2 에서 잠복 → R6 galilean 4개로 표면화.
 *
 * **검증 (2축)**:
 *   A) 각 satellite 궤도 LineSystem (`satellite-orbit-line-<parent>`) 의 worldCenter 가 parent mesh
 *      scene 좌표의 ±0.2 unit 이내 (parent 추적 정합 — D-627-1)
 *   B) **원점 밀집 통계 테스트** (agy 보강 ③): planet `orbit-lines` 의 vertex 중 원점 1 unit 이내
 *      개수가 0 (satellite 궤도점이 planet batch 에 섞여 태양 원점에 밀집하는 결함 재발 직접 감지)
 *
 * 사용법:
 *   node apps/web/scripts/browser-verify-627-satellite-orbit.mjs           # 검증
 *   node apps/web/scripts/browser-verify-627-satellite-orbit.mjs --json    # JSON 결과 (CI artifact)
 *
 * dev 빌드 의존: `window.__solarScene.meshes` (Map<id, Mesh>) + scene.getMeshByName(LineSystem).
 *
 * 환경변수:
 *   BASE_URL  — 웹 서버 URL (기본 http://localhost:3000)
 *
 * R7+ (titan/saturn moons) 진입 시 자동 확장 — EXPECTED_SATELLITE_PARENTS 갱신만 필요.
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const args = process.argv.slice(2);
const flags = { json: args.includes('--json') };

const VIEWPORT = { width: 1280, height: 720 };
const POST_LOAD_WAIT_MS = 2500; // tier transition + LOD 안정화 마진

// R9 시점 satellite parent (earth=moon / mars=phobos·deimos / jupiter=galilean 4 / saturn=titan
// / uranus=titania #647 / neptune=triton #653). R10+ 진입 시 갱신 (R_PHASE_BODY_ALLOWLIST 의
// satellite parent 집합과 동기). triton 궤도선은 역행 평면 (ecliptic 129.14°) 이어도 LineSystem
// 폐곡선 렌더는 동일 — #627 일반화 경로가 parent 추적 + ×75 visual scale 자동 처리.
const EXPECTED_SATELLITE_PARENTS = ['earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

// DoD 임계.
const PARENT_TRACK_TOLERANCE = 0.2; // worldCenter ↔ parent scene 좌표 (D-627-1)
const ORIGIN_CLUSTER_RADIUS = 1.0; // 원점 밀집 통계 bucket 반경 (scene unit)
const ORIGIN_CLUSTER_MAX_COUNT = 0; // planet orbit-lines 의 원점 1 unit 이내 vertex 허용 개수

async function measure(page) {
  return await page.evaluate(
    ({ parents, clusterRadius }) => {
      const solar = window.__solarScene;
      if (!solar) return { error: '__solarScene 미노출 (dev 빌드 필요)' };
      const meshes = solar.meshes;
      const sample = meshes.get('earth') ?? meshes.get('sun');
      if (!sample) return { error: 'sample mesh 미존재' };
      const scene = sample.getScene();
      if (!scene) return { error: 'scene 추출 실패' };

      const meshWorldPos = (id) => {
        const m = meshes.get(id);
        if (!m) return null;
        m.computeWorldMatrix(true);
        const p = m.absolutePosition;
        return { x: p.x, y: p.y, z: p.z };
      };
      const dist = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);

      // A) satellite 궤도선 worldCenter ↔ parent
      const satellites = {};
      for (const parent of parents) {
        const ls = scene.getMeshByName(`satellite-orbit-line-${parent}`);
        const parentPos = meshWorldPos(parent);
        if (!ls) {
          satellites[parent] = { present: false };
          continue;
        }
        ls.computeWorldMatrix(true);
        const c = ls.getBoundingInfo().boundingBox.centerWorld;
        const lineCenter = { x: c.x, y: c.y, z: c.z };
        satellites[parent] = {
          present: true,
          scaling: ls.scaling.x,
          lineCenter,
          parentPos,
          distToParent: parentPos ? dist(lineCenter, parentPos) : null,
          distToOrigin: Math.sqrt(lineCenter.x ** 2 + lineCenter.y ** 2 + lineCenter.z ** 2),
        };
      }

      // B) planet orbit-lines 원점 밀집 통계
      let originCluster = { present: false };
      const orbitLines = scene.getMeshByName('orbit-lines');
      if (orbitLines) {
        const positions = orbitLines.getVerticesData('position');
        if (positions) {
          let total = 0;
          let nearOrigin = 0;
          let minD = Infinity;
          for (let i = 0; i < positions.length; i += 3) {
            const d = Math.sqrt(positions[i] ** 2 + positions[i + 1] ** 2 + positions[i + 2] ** 2);
            total += 1;
            if (d < clusterRadius) nearOrigin += 1;
            if (d < minD) minD = d;
          }
          originCluster = {
            present: true,
            total,
            nearOrigin,
            minD,
            pctNearOrigin: total > 0 ? (nearOrigin / total) * 100 : 0,
          };
        }
      }

      return { satellites, originCluster };
    },
    { parents: EXPECTED_SATELLITE_PARENTS, clusterRadius: ORIGIN_CLUSTER_RADIUS },
  );
}

function evaluate(measurement) {
  if (measurement.error) return { pass: false, reasons: [measurement.error] };
  const reasons = [];
  let pass = true;

  // A) 각 satellite parent 추적 검증.
  for (const parent of EXPECTED_SATELLITE_PARENTS) {
    const s = measurement.satellites[parent];
    if (!s || !s.present) {
      pass = false;
      reasons.push(`A FAIL [${parent}]: satellite-orbit-line-${parent} LineSystem 미존재`);
      continue;
    }
    if (s.distToParent === null) {
      pass = false;
      reasons.push(`A FAIL [${parent}]: parent mesh 좌표 추출 실패`);
      continue;
    }
    if (s.distToParent > PARENT_TRACK_TOLERANCE) {
      pass = false;
      reasons.push(
        `A FAIL [${parent}]: worldCenter ↔ parent 거리 ${s.distToParent.toFixed(3)} > ${PARENT_TRACK_TOLERANCE} unit (parent 미추적 — 태양 원점 잘못 렌더 재발)`,
      );
    }
  }

  // B) 원점 밀집 통계 (agy 보강 ③).
  const oc = measurement.originCluster;
  if (!oc || !oc.present) {
    // orbit-lines 자체가 없으면 planet 궤도 없음 — R-Phase 초기 상태. 경고만.
    reasons.push('B WARN: orbit-lines (planet batch) 미존재 — planet 궤도 없음');
  } else if (oc.nearOrigin > ORIGIN_CLUSTER_MAX_COUNT) {
    pass = false;
    reasons.push(
      `B FAIL: planet orbit-lines vertex ${oc.nearOrigin}/${oc.total} (${oc.pctNearOrigin.toFixed(1)}%) 가 원점 ${ORIGIN_CLUSTER_RADIUS} unit 이내 밀집 (> ${ORIGIN_CLUSTER_MAX_COUNT} — satellite 궤도점이 planet batch 에 섞임, forensic 54% 결함 재발)`,
    );
  }

  return { pass, reasons };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const result = { timestamp: new Date().toISOString(), baseUrl: BASE_URL };
  let pass = false;
  try {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/?gpu=a&lod=auto`, {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });
    await page.waitForFunction(() => typeof window.__solarScene !== 'undefined', {
      timeout: 15_000,
    });
    await page.waitForTimeout(POST_LOAD_WAIT_MS);

    const measurement = await measure(page);
    const verdict = evaluate(measurement);
    result.measurement = measurement;
    result.verdict = verdict;
    pass = verdict.pass;
    await context.close();
  } finally {
    await browser.close();
  }

  console.log('\n=== #627 satellite 궤도선 구조 회귀 가드 ===\n');
  if (result.measurement?.satellites) {
    for (const parent of EXPECTED_SATELLITE_PARENTS) {
      const s = result.measurement.satellites[parent];
      if (s?.present) {
        console.log(
          `  ${parent.padEnd(8)}: distToParent=${s.distToParent?.toFixed(4) ?? 'n/a'}` +
            `  scaling=${s.scaling}  distToOrigin=${s.distToOrigin?.toFixed(2)}`,
        );
      } else {
        console.log(`  ${parent.padEnd(8)}: LineSystem 미존재`);
      }
    }
    const oc = result.measurement.originCluster;
    if (oc?.present) {
      console.log(
        `  orbit-lines 원점밀집: ${oc.nearOrigin}/${oc.total} (${oc.pctNearOrigin.toFixed(1)}%) within ${ORIGIN_CLUSTER_RADIUS} unit, minD=${oc.minD.toFixed(2)}`,
      );
    }
  }
  console.log('');
  for (const r of result.verdict?.reasons ?? []) console.log(`  ${r}`);
  console.log(`\n  overall: ${pass ? 'PASS' : 'FAIL'}`);

  if (flags.json) {
    console.log('\n--- JSON ---');
    console.log(JSON.stringify(result, null, 2));
  }

  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error('\n  FATAL:', err);
  process.exit(2);
});
