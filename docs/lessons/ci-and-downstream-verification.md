# CI 통과 ≠ 테스트 실행 / 다운스트림 실측이 최종 가드

> **요지**: CLAUDE.md 실전 교훈의 CI 파이프라인 + 다운스트림 verification 블록 상세. 본문 요약은 CLAUDE.md `## 실전 교훈` 의 포인터 참조.
>
> **근거**: harness [#199](https://github.com/coseo12/harness-setting/issues/199) Phase 3-A 에서 추출.

---

## CI 통과 ≠ 테스트 실행

"언어 자동 감지" 범용 CI 템플릿이 `echo` 만 수행하고 실제 `npm test` / `pytest` 등을 돌리지 않는 경우가 있다. 초록 체크로 머지되지만 **실제로는 테스트가 돌지 않은 상태**. PR 자동 체크 PASS 만 보지 말고 Actions 로그의 테스트 출력 존재 여부를 정기 감사한다. "빌드 성공 ≠ 동작" 의 CI/파이프라인 버전.

### 진단 신호 3개
1. **실행 시간**: Node 테스트 포함 CI 가 5초 안에 PASS → 의심 (`npm ci` 만으로도 수십 초 소요). Python/Go/Rust 도 동일 관점
2. **Actions 로그**: step log 에 실제 테스트 러너 출력 (`ℹ tests N / ℹ pass N`, `PASSED`, `ok N`) 부재
3. **CI 구조**: `detect-and-test` 같은 범용 템플릿 이름 + step 내용이 `echo` 뿐

### 감사 루틴
- 리포지토리 초기 설정 후 최소 1회, 이후 분기 1회 CI Actions 로그에서 실제 테스트 출력 확인
- **고의적 실패 PR 실측**: 테스트 1건 일부러 깨뜨린 draft PR 로 CI 가 실제로 red 로 전환되는지 체크 후 revert — "CI 가 회귀 게이트로 동작함" 을 실증
- **"로컬 통과 = 안전" 가정 금지** — CI 가 실질 회귀 게이트로 동작하지 않으면 로컬 miss 가 곧 main 오염

### 근거
- volt [#48](https://github.com/coseo12/volt/issues/48) — harness [#153](https://github.com/coseo12/harness-setting/issues/153) (v2.24.0). `.github/workflows/ci.yml` 의 `detect-and-test` 잡이 `echo "Node.js ${node_version} 사용"` 만 수행하고 `npm test` 를 돌리지 않은 채 4개 PR (#144/#147/#150/#154) 이 머지됐던 사례. "staging 성공 ≠ 커밋 내용" (volt [#13](https://github.com/coseo12/volt/issues/13)) 의 파이프라인 버전

---

## 다운스트림 실측이 최종 가드 — upstream 3중 방어 blindspot

upstream 의 **단위 테스트 / reviewer / cross-validate** 가 모두 통과해도, 다운스트림 **실 사용 환경** 에서만 드러나는 결함이 있다. upstream 자기 저장소의 테스트 환경이 다운스트림의 환경 매트릭스 전체를 원리적으로 커버할 수 없기 때문. "CI 통과 ≠ 테스트 실행" 과는 **흡수가 아닌 직교 관계** — volt #48 은 "테스트 자체가 안 돈 경우", 본 교훈은 "테스트가 정상적으로 돌았으나 환경 매트릭스 차이로 결함 잔존" 을 다룬다.

### upstream 사전 방어 3가지
upstream 이 자기 저장소에서 감지 불가능한 blindspot 존재를 인정. 3중 방어 (자동 테스트 + reviewer + cross-validate) 의 한계를 받아들이고, release 를 막는 대신 **다운스트림 → upstream 역방향 피드백 속도** 를 최대화.

1. **긴급 PATCH 파이프라인 템플릿** — CHANGELOG 엔트리 템플릿 / hotfix 브랜치 규약 / 태그 자동화 (release PR 형식 표준화)
2. **대표 다운스트림 명시** — "이 버전을 먼저 적용하는 다운스트림" 을 `docs/downstream-representatives.md` (또는 해당 파일이 없으면 `(프로젝트명, 역할, CI 접근가능여부)` 튜플 형식) 으로 박제. 단순 프로젝트명 나열은 링크 rot 위험 — 튜플/외부화로 구조화
3. **회귀 가드 소급 승격** — 다운스트림에서 감지된 결함을 재현하는 테스트 fixture 를 upstream 에 통합. volt [#56](https://github.com/coseo12/volt/issues/56) "암묵 관례의 구조적 승격" 과 동일 패턴

### 적용 시나리오 (실측/가정 라벨 규약, #195)
`N 적용 시나리오` 근거 박제 시 **각 시나리오에 `[실측]` / `[가정]` 라벨 필수 부착**. 라벨 없는 시나리오 동등 나열은 1회 관찰 박제의 등가 증거력 주장을 약화시킨다.

- **[실측]** npm 패키지 ↔ downstream React 앱 — astro-simulator#270 (volt #60) 직접 관찰
- **[가정]** Rust crate ↔ downstream Cargo 빌드
- **[가정]** Docker 이미지 ↔ Kubernetes Pod
- **[가정]** DB migration ↔ ETL 파이프라인
- **[가정]** LLM 모델 ↔ downstream agent 행동

### 박제 문턱 공식 (#195)
1회 관찰을 "5 적용 시나리오" 로 일반화 주장할 때 다음 **3조건 동시 충족** 필요:

| 조건 | 기준 |
|---|---|
| 실측 카운트 | `[실측]` 라벨 시나리오 ≥ 1 |
| 가정 카운트 | `[가정]` 라벨 시나리오 ≥ 3 |
| 공통 조건 매트릭스 | 실측·가정 시나리오 간 구조적 유사성 명시 (아래 매트릭스) |

**공통 조건 매트릭스**: upstream 자기 테스트가 다운스트림 환경 매트릭스 전체를 커버 못함 + 다운스트림이 자동 CI/관찰 인프라 보유 + 양방향 보고 채널 존재.

문턱 미달 시 (가정 100% 또는 공통 조건 부재) 박제 보류 — volt #61 같은 1회 관찰의 남용 방지.

### 미래 승격 트리거
`[가정]` 라벨 시나리오가 실측 관찰로 승격되면 해당 라벨을 `[실측]` 으로 갱신 + 관찰 이슈 링크 추가. 이후 박제 문턱 재평가 (실측 카운트 재계산).

### 근거
- volt [#60](https://github.com/coseo12/volt/issues/60) — harness v2.28.2 pnpm `--if-present` 버그 (volt [#59](https://github.com/coseo12/volt/issues/59)) 가 upstream 3중 방어 모두 통과 후 다운스트림 [astro-simulator#270](https://github.com/coseo12/astro-simulator/pull/270) 이 v2.28.2 적용 직후 CI red 로 최초 감지 → 19분 내 v2.29.1 복구. harness 저장소 자체는 npm 으로만 테스트하여 pnpm 경로가 자기 CI 에서 실행조차 안 된 구조적 한계
- harness [#195](https://github.com/coseo12/harness-setting/issues/195) — "5 적용 시나리오" 관성화 예방 메타 규약 (실측/가정 라벨 + 박제 문턱 공식)
