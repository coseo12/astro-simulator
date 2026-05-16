#!/usr/bin/env node
/**
 * ADR 20260515 Z 패턴 health metric 자동 탐지 스크립트
 *
 * Phase 1 카운트: ADR §Amendment N regex + 본 프로젝트 PR commit grep 보조
 * Phase 2 카운트: gh pr list --search (coseo12/harness-setting 다중 OR 키워드)
 *
 * 임계값 (Amendment 1+2 정합 3중 OR):
 *   - Phase 2 진행률 < 33% (Amendment 1 health metric)
 *   - Phase 1 회차 (현재) >= N=10 (Amendment 2 재조정)
 *   - ADR 첫 적용 후 90일 경과 (Amendment 2 재조정)
 *
 * exit code (Gemini 2.5-pro cross-validate 권고 3분류):
 *   - 0: 정상 (모든 임계값 미발화)
 *   - 1: 트리거 발화 (1개 이상 임계값 충족)
 *   - 2: 실행 에러 (gh CLI 실패 / 파일 부재 등)
 *
 * 근거:
 *   - ADR docs/decisions/20260515-harness-managed-divergent-pattern.md
 *   - #476 architect cross-validate Q5 권고 (자동 탐지 도입)
 *   - #483 architect cross-validate (9 핵심 결정)
 *   - volt #69 (workflow_dispatch 2단계 함정 — D2/D3 머지 후 검증)
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const ADR_PATH = 'docs/decisions/20260515-harness-managed-divergent-pattern.md';
const ADR_FIRST_APPLY_DATE = '2026-05-15'; // ADR 첫 박제일 (#463)
const N_THRESHOLD = 10; // Amendment 2
const TIME_THRESHOLD_DAYS = 90; // Amendment 2
const PHASE2_THRESHOLD = 0.33; // Amendment 1 health metric

try {
  // 1. ADR 파일 존재 검증
  if (!existsSync(ADR_PATH)) {
    console.error(`ERROR: ADR file not found: ${ADR_PATH}`);
    process.exit(2);
  }

  const adrContent = readFileSync(ADR_PATH, 'utf-8');

  // 2. Phase 1 카운트 — §Amendment N regex
  const amendmentMatches = adrContent.matchAll(/## Amendment (\d+)/g);
  const amendmentNumbers = Array.from(amendmentMatches).map((m) => parseInt(m[1], 10));
  const amendmentCount = amendmentNumbers.length;

  // PR commit grep 보조 — ADR 인용 PR 카운트 (본 프로젝트)
  const adrCitationsRaw = execSync(
    `gh pr list --repo coseo12/astro-simulator --state merged --search "20260515-harness-managed-divergent-pattern" --json number --jq 'length'`,
    { encoding: 'utf-8' },
  ).trim();
  const adrCitations = parseInt(adrCitationsRaw, 10) || 0;
  const phase1Count = Math.max(amendmentCount, adrCitations);

  // 3. Phase 2 카운트 — upstream harness-setting PR 검색
  //
  // 측정 방법 결정 (D1 실측 기반):
  //   - architect 9 핵심 결정 #3 은 "다중 OR 키워드 (ADR 20260515 OR harness-managed-divergent OR Z 패턴)"
  //     를 제시했으나, D1 실측에서 false positive 5건 발견:
  //       - "harness-managed-divergent" → 단어 분할로 "managed" 매칭 (PR #64/#61/#62/#94 무관 PR 4건)
  //       - "Z 패턴" → "Z 옵션" 매칭 (PR #154 무관)
  //   - "ADR 20260515" 정확 식별자만 사용 (현재 0건, 노이즈 0).
  //   - 향후 upstream PR 본문/제목에 ADR ID 박제 컨벤션 유지 필요 (Phase 2 의무 PR 규약).
  //   - CRITICAL "수치 DoD 미달 시 측정 방법 검증 우선" 원칙 정합 — 식 보정 후 임계값 평가.
  let phase2Count = 0;
  try {
    const phase2Result = execSync(
      `gh pr list --repo coseo12/harness-setting --state all --search "ADR 20260515" --json number --jq 'length'`,
      { encoding: 'utf-8' },
    ).trim();
    phase2Count = parseInt(phase2Result, 10) || 0;
  } catch {
    // upstream 검색 실패 (네트워크 / 권한 등) 시 보수적으로 0 으로 가정
    phase2Count = 0;
  }

  // 4. 시간 경과 검증
  const firstApplyDate = new Date(ADR_FIRST_APPLY_DATE);
  const today = new Date();
  const daysSinceFirstApply = Math.floor((today - firstApplyDate) / (1000 * 60 * 60 * 24));

  // 5. 임계값 검증 (3중 OR)
  const phase2Ratio = phase1Count > 0 ? phase2Count / phase1Count : 0;
  const triggers = [];

  if (phase2Ratio < PHASE2_THRESHOLD) {
    triggers.push(
      `Phase 2 진행률 ${(phase2Ratio * 100).toFixed(1)}% < ${PHASE2_THRESHOLD * 100}% 임계값`,
    );
  }
  if (phase1Count >= N_THRESHOLD) {
    triggers.push(`Phase 1 회차 ${phase1Count} >= N=${N_THRESHOLD} 임계값`);
  }
  if (daysSinceFirstApply >= TIME_THRESHOLD_DAYS) {
    triggers.push(
      `ADR 첫 적용 후 ${daysSinceFirstApply}일 경과 >= ${TIME_THRESHOLD_DAYS}일 임계값`,
    );
  }

  // 6. 출력 + exit
  console.log(`Phase 1 (본 프로젝트): ${phase1Count} (Amendment ${amendmentCount}, PR citations ${adrCitations})`);
  console.log(`Phase 2 (upstream harness-setting): ${phase2Count}`);
  console.log(`Phase 2 진행률: ${(phase2Ratio * 100).toFixed(1)}%`);
  console.log(`ADR 적용 후 경과 일수: ${daysSinceFirstApply}일`);

  if (triggers.length > 0) {
    console.error(`\n[ADR Trigger] ADR 20260515 Z 패턴 §재검토 조건 #5 발화:`);
    triggers.forEach((t) => console.error(`  - ${t}`));
    process.exit(1);
  } else {
    console.log(`\n[ADR OK] 모든 임계값 미발화 (Amendment 1+2 정합)`);
    process.exit(0);
  }
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  process.exit(2);
}
