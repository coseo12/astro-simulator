# Forensic ADR + Amendment 패턴 템플릿

> **사용 시점**: 복잡한 회귀 (가설 N≥2 / runtime 측정 데이터 필요 / 사용자 인지 단위 ↔ 박제 단위 mismatch / DoD PASS 인데 제품 동작 회귀) 에서 architect 단계가 채택하는 ADR 변형. 단순 결정 기록은 일반 ADR 템플릿 (`### 아키텍처 결정 기록 (ADR)` 절차) 사용.
>
> **모범 사례**:
>
> - [`docs/decisions/20260430-r3-followup-body-proportion.md`](../decisions/20260430-r3-followup-body-proportion.md) (#373) — body 간 시각 비율 회귀. 다중 metric 측정 + 사용자 인지 단위 mismatch
> - [`docs/decisions/20260509-380-zoom-camera-freeze-forensic.md`](../decisions/20260509-380-zoom-camera-freeze-forensic.md) (#380) — zoom freeze 의 G1~G8 가드 비교 + Amendment 2026-05-11 F1~F5
> - [`docs/decisions/20260504-411-r1-guard-shortcut-bar-forensic.md`](../decisions/20260504-411-r1-guard-shortcut-bar-forensic.md) (#411) — R1 가드 shortcut-bar 임계 forensic
>
> **저장 위치**: `docs/decisions/<YYYYMMDD>-<topic>-forensic.md` (일반 ADR 와 동일 prefix 정책, 파일명에 `-forensic` 또는 `-followup-` suffix).

---

# ADR: <한 줄 제목 — 회귀 발견 발화점 + 핵심 키워드>

- **상태**: Proposed (사용자 옵션 선택 대기) / Accepted / Superseded
- **날짜**: <YYYY-MM-DD>
- **결정자**: architect (#<이슈번호> forensic 단계 — fix 구현은 사용자 승인 후 별도 developer 단계)
- **관련**: #<본 이슈>, #<선행 PR>, #<관련 ADR>, [`<선행 ADR 파일>`](<상대경로>), [`<roadmap>`](<상대경로>)
- **교훈 적용**:
  - "<CLAUDE.md 또는 volt 교훈 1>" (<출처>) — 본 케이스 적용 방식
  - "<교훈 2>" (<출처>) — 적용 방식
  - <2~5개 적용 — 너무 많으면 잡음, 적으면 박제 부담>

---

## §1 배경

### <본 이슈 핵심>

- 회귀 발화점 (어느 PR 의 D-T2 / 어느 CI / 어느 사용자 보고)
- 영향 범위 (모든 viewport / 특정 tier / 특정 사용자 시나리오)
- 의도 vs 실제 갭 (DoD PASS 인데 사용자 인지 회귀 / 자동 검증 미포착)

### Forensic 측정 결과 (<날짜>, develop tip = `<commit-sha>`)

`scripts/_debug-<이슈번호>-<topic>-tmp.mjs` (volt #67 패턴 일회성 debug) 로 실측.
데이터: [`docs/reports/<이슈번호>-debug-output.json`](../reports/<이슈번호>-debug-output.json),
스크린샷: [`docs/reports/<이슈번호>-debug-{1280x720,1920x1080,375x667}.png`](../reports/).

> ⚠️ `_debug-*-tmp.mjs` 는 실측 직후 `rm` (영구 박제 금지). 결과 JSON/PNG 만 `docs/reports/` 에 박제. 영속화 가치가 있는 측정 스크립트는 `scripts/verify-<topic>.mjs` 로 승격.

#### 측정 1 — <측정 이름> (<viewport / 시나리오>)

| metric | 정의 | 값 | 비고 |
|---|---|---|---|
| `<metric1>` | <정의 한 줄> | **<값>** | <SSoT 관계 / 정합 마진> |
| `<metric2>` | <정의> | <값> | <비고> |

- <관찰 1>: <SSoT 일관성 / 마진 통과 여부>
- <관찰 2>: <metric 간 관계 / 사용자 인지와의 mismatch>
- <관찰 3>: <bloom / halo / 광학 효과 등 누락 분기>

#### 측정 2 — <측정 이름>

| <축> | <컬럼 1> | <컬럼 2> | <px 비> | <area 비> | <비고> |
|---|---|---|---|---|---|

- <사용자 인지 단위 == ?>
- <ADR 박제 단위 == ?>
- <두 단위의 관계 (제곱/선형/임계) — mismatch 지점 명시>

#### 측정 3 — <필요 시 추가>

(거리 비율, 시간 시계열, multi-tier 비교 등)

### 가설 검증 결론

| 가설 | 결론 | 근거 |
|---|---|---|
| **가설 1: <한 줄 진술>** | **확정 (주된 원인) / 부분 / 기각** | 측정 데이터 / 정적 분석 / 시계열 |
| **가설 2: <진술>** | <판정> | <근거> |
| **가설 3: <진술>** | <판정> | <근거> |

> 가설 N≥2 가 forensic ADR 의 핵심. 각 가설은 (a) 측정 가능한 진술 (b) 정적 분석 또는 runtime 실측으로 확정/기각 (c) 가설 간 결합 가능성 고려.

### 잠재 시점 분석 (선택)

- <시점 X 부터 잠재 — 그러나 발현 안 됨 → 시점 Y 가 trigger>
- <근거: 누적 효과 / 결합 / 임계 도달>
- <ADR 박제 시점에 이미 알려진 trade-off 가 사용자 인지 단위와 mismatch 였다면 명시>

---

## §2 영향 모듈/파일

### 측정 결과 박제 (본 ADR 동반)

- `docs/reports/<이슈>-debug-output.json` — <측정 매트릭스 요약>
- `docs/reports/<이슈>-debug-*.png` — 스크린샷
- 본 ADR §배경 §Forensic 측정 결과

### Fix 후보별 영향 모듈 (옵션 선택 후 변경 대상)

- `<파일 경로 1>:<라인>` (옵션 a, c)
- `<파일 경로 2>:<라인>` (옵션 b)
- `<파일 경로 3>` (옵션 d/e)

### Fix 가 깨는 박제값 (ADR amendment 필요 후보)

- <기존 ADR §결정 값> → fix 후 새 값. **해당 ADR 에 Amendment 동반 박제 의무**
- <기존 DoD 임계> → 재조정 (스프린트 계약 재합의)

---

## §3 옵션 비교 (5축 권장)

> 5개 후보 (a~e) 가 기본. 3개 미만이면 비교 가치 낮음, 6개 이상이면 잡음. cross-validate (Gemini) 가 고유 발견 옵션을 제안하면 (f), (g) 로 확장.

### 옵션 (a) <짧은 이름>

- **변경**: <파일:라인 / 식 변경>
- **장점**: <사용자 인지 회귀 해소 / 박제값 최소 변경>
- **단점**: <부수 회귀 가능성 / 다른 ADR 결정과 충돌>
- **회귀 예측**: <DoD 깨지는 항목 / 새 측정 필요>

### 옵션 (b) <이름>

- **변경**: ...
- **장점**: ...
- **단점**: ...
- **회귀 예측**: ...

### 옵션 (c)~(e)

(동일 형식)

### 축별 비교 매트릭스

| 축 | (a) | (b) | (c) | (d) | (e) |
|---|---|---|---|---|---|
| 사용자 인지 회귀 해소 | <체크> | <체크> | <체크> | <체크> | <체크> |
| 박제값 변경 최소 | <체크> | <체크> | <체크> | <체크> | <체크> |
| 부수 회귀 위험 | low/med/high | ... | ... | ... | ... |
| 구현 비용 | 1줄/Phase/리팩토링 | ... | ... | ... | ... |
| ADR Amendment 필요 | 0/1/N | ... | ... | ... | ... |

### 권장 안 (사전 선호)

architect 의 사전 선호 (사용자 결정 전 안내) + 근거.

- **단기**: (b) 또는 (c) — <근거>
- **장기**: (a) + (e) 결합 — <근거>

---

## §4 Concrete Prediction (선택, 권장)

> ADR 의 가설 정확도를 사후 검증하기 위한 **사전 박제**. fix 후 실측이 예측을 위반하면 ADR 재검토 트리거.

### 예측 1 — 코드 변경 라인 수

- 옵션 (b) 채택 시: **<X> 라인 변경** (`<파일>:<라인>` 1곳)
- 옵션 (a) 채택 시: **<Y> 라인** (`<파일>` 추가 + `<다른 파일>` 수정)
- 위반 임계: 실측 라인 수가 예측의 ±50% 초과 시 → 설계 가정 재검토

### 예측 2 — 수치 DoD

- **D-X1**: <metric> 가 <임계> 이내 — fix 후 실측 ≤ X 이면 PASS
- **D-X2**: <metric> 가 <임계> 이내 — fix 후 실측 ≤ Y 이면 PASS
- 위반 임계: D-X1 / D-X2 중 1개라도 fail → fix 회귀, 옵션 재선택

### 예측 3 — 인접 영역 무영향 (보조)

- <인접 metric 1> 변화 없음 (±5% 이내)
- <인접 metric 2> 변화 없음
- 위반 임계: 인접 metric 회귀 시 → fix 의 부수효과 확정, Amendment 필요

---

## §5 결정 (사용자 선택 박제 후)

> Proposed 상태에서는 비워둠. Accepted 전이 시 사용자 선택 옵션 + 근거 박제.

- **채택 옵션**: (X) <이름>
- **선택 근거**: <사용자 의도 / DoD 만족 / 부수 회귀 회피 우선순위>
- **단기/장기 분리**: <단기 fix vs 장기 리팩토링 분리 여부>

### 구현 절차

1. <Step 1>
2. <Step 2>
3. <Step 3>

### Fix 후 박제 의무

- 본 ADR `§결정` 갱신 (Accepted 전이)
- <기존 ADR> Amendment 동반 (깨진 박제값 재합의)
- `docs/reports/<이슈>-fix-output.json` 신규 측정 데이터 박제
- PR 본문에 `§Concrete Prediction` 위반 여부 명시

---

## §6 위험 / 재검토 트리거

| 위험 | 회귀 시점 | 임계 / 발동 조건 | 완화 방안 |
|---|---|---|---|
| <위험 1> | <fix 머지 직후 / N일 후 / 다음 phase> | <측정 임계> | <가드 추가 / 회귀 가드 자동화> |
| <위험 2> | ... | ... | ... |

### 재검토 트리거

- 본 ADR 의 결정은 다음 조건 중 1개 발생 시 재검토:
  1. <fix 후 D-X1 / D-X2 위반>
  2. <인접 ADR Amendment 가 본 결정과 직접 충돌>
  3. <사용자 D-T2 에서 새 회귀 보고>
  4. <Phase N+1 진입 시 본 결정의 가정 불성립>

---

## §7 Amendment 라운드 N (라운드별 추가)

> 라운드 ≠ 라운드 — 시간 순서대로 추가. 각 라운드는 **다른 cross-validate 또는 사용자 응답** 으로 트리거됨.

### Amendment 라운드 1 (<YYYY-MM-DD>, <트리거: cross-validate / 사용자 D-T2 응답 / 후속 PR>)

#### 추가 발견

- <Gemini cross-validate 고유 발견 1>
- <사용자 D-T2 응답으로 드러난 새 측정 필요>

#### 결정 추가 / 갱신

- §<섹션>: <기존 결정> → <갱신된 결정>
- 신규 §<섹션>: <추가 박제>

#### cross-validate 결과 (있을 때만)

- Gemini 평가: <인용 또는 요약>
- 합의: <항목 1>, <항목 2>
- 이견 (반려): <항목>, <반려 근거>
- 고유 발견 (수용 / 분리): <항목> → <별도 이슈 #N>

### Amendment 라운드 2 (<날짜>, <트리거>)

(동일 형식)

### Amendment 라운드 N

(동일 형식 — 라운드 수가 5 초과하면 ADR 분리 고려)

---

## §8 후속 / 분리 이슈

> cross-validate 고유 발견 중 본 ADR 범위 밖이라 분리한 이슈.

- #<신규 이슈 1>: <한 줄 설명> — <분리 근거 (비-목표 충돌 / 다른 Phase / 인프라 의존)>
- #<신규 이슈 2>: <설명>
- <Builds on: #<원 PR>> 표기로 양방향 cross-link

---

## 변경 이력 (선택)

- <YYYY-MM-DD>: 초안 작성 (architect, #<이슈> forensic)
- <YYYY-MM-DD>: §결정 갱신 (사용자 옵션 (X) 선택, Accepted 전이)
- <YYYY-MM-DD>: Amendment 라운드 1 추가 (cross-validate)
- <YYYY-MM-DD>: Amendment 라운드 2 추가 (사용자 D-T2 응답)
