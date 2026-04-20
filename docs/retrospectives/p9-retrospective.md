# P9 회고 — 목성계 (Galilean + Laplace 공명 + 고리 3층 + Osculating 동기화)

- **기간**: 2026-04-19 ~ 2026-04-20
- **메인 이슈**: [#254](https://github.com/coseo12/astro-simulator/issues/254)
- **릴리스**: v0.9.0 (2026-04-20)
- **ADR**: [`docs/decisions/20260420-p9-galilean-laplace-rings.md`](../decisions/20260420-p9-galilean-laplace-rings.md)
- **선행 릴리스**: v0.8.0 (P8 내행성계 위성)

## 1. 달성도

### DoD 실측

| DoD                      | 계약          | 실측                             | 판정    |
| ------------------------ | ------------- | -------------------------------- | ------- |
| D1 Io 공전주기           | ±1% (1.769d)  | PASS                             | ✅      |
| D2 Europa 공전주기       | ±1% (3.551d)  | PASS                             | ✅      |
| D3 Ganymede 공전주기     | ±1% (7.155d)  | PASS                             | ✅      |
| D4 Callisto 공전주기     | ±1% (16.689d) | PASS (비공명 baseline)           | ✅      |
| D5-a Laplace 잔차        | ±1%           | **0.00024 (41× 여유)**           | ✅      |
| D5-b 위상 진폭           | ±2°           | **이관 (#261)**                  | ⚠️ 이관 |
| D6 고리 3층 shader       | 가시          | PASS (실 Chrome 6 스크린샷)      | ✅      |
| D7 Osculating 동기화     | 1Hz polling   | **인프라 완결 / UI 이관 (#263)** | ⚠️ 이관 |
| D8 이심률·경사 UI        | JSON 바인딩   | PASS                             | ✅      |
| M4 cargo fast path       | ≤5분          | **9.27s (32× 여유)**             | ✅      |
| fps baseline (실 Chrome) | ≥55fps        | **평균 59.98 / 최소 59.75**      | ✅      |

**8 DoD + M4 중 6.5 PASS / 1.5 이관**. 2건(D5-b / D7 UI 동적) 은 follow-up 이슈로 분리. 핵심 가치(Galilean + shader + 인프라) 는 완결.

### 코드 증분

- **Rust**: `packages/physics-wasm/src/satellites/{mod,laplace,osculating}.rs` 신규 + 단위테스트 5~6건
- **TS**: `packages/core/src/scene/{ring-shader,ring-placeholder}.ts` 신규, `apps/web/src/hooks/use-osculating-sync.ts` 신규, `apps/web/src/components/panels/satellite-info-panel.tsx` 신규
- **CI**: `.github/workflows/ci-physics-wasm.yml` 빠른/장기 경로 독립 job 분리

### 박제 증분

- ADR 신규 1건 + §Amendments 엔트리 4건 (Babylon 정정 + GLSL 배열 + 비동기 onError + D7 timeScale)
- CHANGELOG v0.9.0 `### Behavior Changes` 8건
- CLAUDE.md §프로젝트 고유 보강 교훈 1건 신설 (sub-agent 프로세스 리크)
- volt #52 (harness upstream 반영 대상)
- follow-up 이슈 4건 (#255 J2/J4 / #256 에너지 보존 / #257 고리 섀도우 / #261 D5-b 데이터 / #263 Osculating timeScale)

## 2. 잘 된 것

### M4 효과 — 32× 여유

`cargo test --lib` 일상 경로 **30분+ (좀비 경쟁 시) → 9.27s** 로 단축. CI 장기 경로 `--include-ignored` 독립 job 216.9s `continue-on-error: true` 로 빠른 경로만 PR 차단. 다음 Phase 부터는 일상 TDD 루프 정상화.

### shader 3층 실 Chrome 검증

PR-2.5 에서 `ring-shader.ts` + M1 백업 경로 (수동 `?ring=fallback`) 를 실 Chrome 6 스크린샷으로 검증. volt #33 경계 엄수 — headless false positive 회피 성공. dust-tone avgRGB 매칭으로 headless 보조 검증.

### CLAUDE.md §sub-agent 프로세스 리크 교훈 (신규) 3번째 적용에서 완벽 준수

PR-1 세션 중 dev/reviewer/qa sub-agent 누적 cargo 좀비 4개 발견 → CLAUDE.md §프로젝트 고유 보강 교훈 박제 + volt #52 캡처. 이후 PR-2 / PR-2.5 / PR-3 세션에서 **3번째 호출부터 완벽 준수** (QA sub-agent 반환 직전 3단계 체크 + `spawned_bg_pids` 필드 박제).

### 교차검증 (Gemini) 3단 프로토콜 성공 운용

PM 스프린트 계약 직후 cross-validate 1회 → 합의 3건 / 고유 발견 2건 / 범위 밖 3건 분리. 고유 발견 2건은 P9 계약에 흡수 (D5-b 위상 진폭, 5체 N-body 그룹 명시), 범위 밖 3건은 follow-up #255/#256/#257 로 분리.

### 측정법 검증 우선 원칙 (volt #32) 충실 수행

D5-b 미달 발견 시 **식 수정 2회** (근점 검출 → mean motion 회귀, osculating λ → true longitude atan2) + **적분 조건 검증** (원궤도 fixture) 충실 수행 후 근본 원인 (PR-1 데이터의 φ₀=218°) 발견. 측정 도구 자체는 libration 재현 가능 확인. 데이터 교정은 범위 밖으로 분리 (#261).

## 3. 어려웠던 것

### sub-agent 이탈 재발 4회 — volt #24 → #52 프로세스 레벨 확장

코멘트·라벨 박제 누락 (volt #24) + 백그라운드 프로세스 리크 (volt #52, **본 마일스톤 첫 관찰**) 의 복합 재발. P9 세션 중 QA sub-agent 이탈 3회 (PR-1 QA 2회 + PR-2 QA 1회) → 메인 오케스트레이터가 직접 보완 박제. 4번째 (PR-2.5 QA) 에서 드디어 이탈 없이 완벽 수행.

### D5-b 수치 DoD 미달 — 측정법 vs 데이터 분리 난이도

Laplace 공명 위수 φ = λ_Io − 3·λ_Europa + 2·λ_Ganymede 의 peak-to-peak 측정에서 471°/1200° 관측. 공식·측정 도구·적분기 모두 정상이나 PR-1 JSON 의 `meanLongitudeDeg` 조합이 libration 평형점 180° 로부터 38° 벗어난 φ₀=218° circulation 상태. 해결은 데이터 교정 (JPL Horizons 재쿼리) — 측정법 검증 우선 원칙의 5단계 전수 수행 후 분리.

### D7 timeScale 내성 부재 — 구현 조건 측정 noise

Osculating 1Hz polling 의 forward-diff velocity 추정이 기본 `timeScale=86400s/s` 조건에서 Io 주기 1.77일 대비 Δ=1s 스텝이 비선형 구간 포함 → noise 과다로 UI 배지 미렌더. 훅 인프라·fps 폴백·WASM wiring 완결이지만 UI 동적 표시는 Babylon 씬 velocity 직접 추출로 재구현 필요 (#263 이관).

### ADR Babylon.js 정정 (PR-1 재작업)

초기 ADR 이 Three.js 타입 시그니처로 작성됨 (architect sub-agent 오류). PR-1 reviewer 에서 blocker C1 지적 → developer 재작업으로 ADR §Amendments 에 "Babylon.js 스택 정정" 엔트리 + 본문 인터페이스 박제 섹션 전체 Babylon 타입으로 교체. architect 단계 검증 부족 관찰.

### 좀비 프로세스 누적 교착 — 30분+ cargo 지연

PR-1 세션 중 dev → reviewer → dev 재작업 → qa 연속 호출이 각자 `cargo test --lib` 을 `run_in_background=true` 로 시작 + PID 정리 없이 반환 → 4개 테스트 바이너리 동일 target 디렉토리 경쟁 → 어느 것도 완주 못 함. 좀비 3개 kill 후 단일 프로세스로 ~8분 완주.

## 4. 다음 인수인계

### P10 (토성계) 착수 전제

- **shader 인프라 재사용**: `ring-shader.ts` 의 `densityProfileR[16]/densityProfileD[16]` + `createRingShaderMaterial` 파라미터 교체로 토성 Cassini 간극·F 링 지원. ADR §결정 2 의 "P10 재사용 전제" 실증 완결
- **측정 인프라 재사용**: `measure_moon_orbital_period` (P8) + `measure_galilean_period` (P9) 패턴 계승. 토성 10+ 위성 각각에 적용
- **scene 통합 패턴**: `solar-system-scene.ts` 의 `parentId` 체인 `updateAtKepler` + `ringRenderMode` 옵션 재사용

### 후속 OPEN 우선순위

1. **[#263](https://github.com/coseo12/astro-simulator/issues/263) Osculating timeScale 내성화** (medium) — v0.9.1 후보. D7 UI 동적 표시 완결. 해결 후 `?mass=jupiter×N` UI 반영 자동
2. **[#261](https://github.com/coseo12/astro-simulator/issues/261) D5-b 데이터 교정** (medium) — v0.9.1 후보. JPL Horizons 재쿼리만으로 해결 가능 (1~2 시간). D5-b assertion 복구
3. **[#255](https://github.com/coseo12/astro-simulator/issues/255) J2/J4 편평도** (medium) — P13 궤도 정밀 보정 흡수 후보
4. **[#256](https://github.com/coseo12/astro-simulator/issues/256) 에너지 보존 DoD** (low) — P16 기술부채 흡수 후보
5. **[#257](https://github.com/coseo12/astro-simulator/issues/257) 고리 섀도우** (low) — P10 토성 자연 연동

### 제도화 권고 (다음 마일스톤 반영)

- **sub-agent 규범 확장**: CLAUDE.md §프로젝트 고유 보강 교훈 §sub-agent 프로세스 리크 를 harness upstream (volt #52) 반영 후 `.claude/agents/*.md` 규범에 `spawned_bg_pids` 필드 의무화
- **architect 규범**: ADR 작성 시 스택 가정 (Three.js vs Babylon.js 등) 을 반드시 실제 `package.json` dependencies 확인 후 박제. architect sub-agent 프롬프트에 "의존성 실측 선행" 추가
- **M4 패턴 템플릿화**: 장기 적분 테스트 `#[ignore]` + CI `--include-ignored` 경로 분리는 P10 부터 기본 템플릿으로. `docs/` 에 "Rust 테스트 분리 가이드" 박제 검토
- **측정법 검증 우선 원칙 (volt #32) 세 단계 강화**: 식 수정 → 적분 조건 검증 → **데이터 신뢰성 재확인** (3단계 신설, PR-2 에서 발견)

### v0.9.0 릴리스 절차 (본 PR 머지 후)

1. **release PR 생성**: `develop → main` base, squash 금지 / `--merge` 방식
2. **merge 직후 동기화**: `git push origin main:develop` fast-forward
3. **태그 + 릴리스**: `git tag v0.9.0 && gh release create v0.9.0` — 본 회고 + CHANGELOG `[0.9.0]` 섹션을 본문으로
4. **이슈 close**: #254 (P9 메인) close. follow-up 이슈 (#261/#263) 는 유지
