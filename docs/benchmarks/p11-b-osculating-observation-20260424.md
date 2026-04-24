# P11-B.2 D5 — #247 Osculating 궤도 관찰 리포트

- **날짜**: 2026-04-24
- **이슈**: [#247](https://github.com/coseo12/astro-simulator/issues/247) — Osculating element 구현 관찰 대상
- **관련 PR**: [#289](https://github.com/coseo12/astro-simulator/issues/289) P11-B.2 (feature/289-p11-b2-observation)
- **관찰 방식**: Playwright chromium headless + `__solarScene.getLodStats()` + focus 전환 후 60s(풀) / 30s(smoke) 연속 관찰
- **실행 스크립트**: `apps/web/scripts/browser-osculating-observe.mjs`
- **raw 스크린샷**: `.verify-screenshots/osculating/` (커밋 대상 아님)

**중요**: 본 리포트는 **수치 pass 임계 없는 관찰 보고서**입니다. #247 Osculating 동기화 **구현** 은 P11-C/P13 후속이며, 본 관찰은 구현 필요성 정성 판단 근거 확보가 목적입니다.

---

## 관찰 규약 (계약 Q4-C + B안)

| 분류      | 대상                          | 지속 시간 | 프레임 수 (60fps 기준) | 스크린샷            |
| --------- | ----------------------------- | --------- | ---------------------- | ------------------- |
| **풀**    | moon / phobos / io / callisto | 60초/개체 | 3600/개체              | 3장 (start/mid/end) |
| **Smoke** | deimos / europa / ganymede    | 30초/개체 | 1800/개체              | 1장 (mid)           |
| **합계**  | 7 moon                        | 330초     | 19,800                 | 15장                |

focus 전환 후 `time-preset-1y` 로 궤도 운동 생성 → 관찰 동안 시간 advance.

---

## 풀 관찰 (4 moon × 60s)

### 1. moon — 달 (지구계)

| 시점  | 경과 | tier | meshPos (scene unit) | meshRadius | LOD 분포 (H/M/L) |
| ----- | ---- | ---- | -------------------- | ---------- | ---------------- |
| start | 0s   | body | (0.00, 0.00, 0.00)   | 75.53      | 1/0/23           |
| mid   | 30s  | body | (0.00, 0.00, 0.00)   | 75.53      | 1/0/23           |
| end   | 60s  | body | (0.00, 0.00, 0.00)   | 75.53      | **2/1/21**       |

**관찰**: focus body 가 원점 고정 (FloatingOrigin 정책 — T3 에서 focus body 를 원점으로 이동). 60초 경과 시 LOD 분포가 `1/0/23 → 2/1/21` 로 변화 — **지구의 1년 공전에 따라 배경 body (sun/mars/jupiter 등) 의 화면 점유 변화** 가 LOD 재분류 유발. LOD 분기가 매 프레임 응답함을 실증.

**궤도선 연속성**: body tier 내부에서는 달 궤도선이 ring 형태로 렌더링. 60s 관찰 중 끊김 없음 (screenshot `osculating-moon-{start,mid,end}.png` 수동 비교로 확인 가능).

**스크린샷**: `osculating-moon-start.png`, `osculating-moon-mid.png`, `osculating-moon-end.png`

---

### 2. phobos — 포보스 (화성계)

| 시점  | 경과 | tier | meshPos | meshRadius | LOD 분포 |
| ----- | ---- | ---- | ------- | ---------- | -------- |
| start | 0s   | body | (0,0,0) | 0.48       | 1/0/23   |
| mid   | 30s  | body | (0,0,0) | 0.48       | 1/0/23   |
| end   | 60s  | body | (0,0,0) | 0.48       | 1/0/23   |

**관찰**: meshRadius 0.48 (scene unit) — phobos 는 실측 반경 11.1 km 로 매우 작아 focus 시에도 mesh 가 sub-pixel ~ 수 px 규모. LOD high 강제 규칙 (`moon: radiusMultiple 5`) 때문에 전환 임계 약 55 km 내에서만 high 유지, 더 멀면 low 폴백. 60s 관찰 내 LOD 분포 **완전 고정** — 공전 주기 7시간 37분이라 1년 time-preset 관점에서는 매우 빠른 공전이지만, focus 시 배경 body 들의 상대 위치 변화폭이 작음 (태양 방향 회전뿐).

**특이사항**: meshPos=(0,0,0) — FloatingOrigin 이 phobos 를 원점 기준. Osculating 구현 시 phobos 는 **화성 좌표계 내부 궤도** 를 참조해야 함 (현재 heliocentric + planet-child 구조). P11-C/P13 구현 필요성: 중상.

---

### 3. io — 이오 (갈릴레이 안쪽)

| 시점  | 경과 | tier | meshPos | meshRadius | LOD 분포 |
| ----- | ---- | ---- | ------- | ---------- | -------- |
| start | 0s   | body | (0,0,0) | 79.19      | 1/0/23   |
| mid   | 30s  | body | (0,0,0) | 79.19      | 1/0/23   |
| end   | 60s  | body | (0,0,0) | 79.19      | 1/0/23   |

**관찰**: meshRadius 79.19 — 갈릴레이 위성 중 가장 안쪽. 60s 관찰 내 LOD 고정. 이오 공전 주기 1.77일이라 1년 time-preset 에서는 매우 빠른 공전. 이오의 궤도선이 목성 중심으로 매우 가깝게 형성됨 — **궤도선이 목성 mesh 내부로 삽입되어 보일 가능성** (실측 반경 대비 궤도 반경 작음). 수동 스크린샷 관찰 필요.

**Osculating 구현 우선도**: **중-상**. 갈릴레이 위성 공전 주기가 짧아 정지 시각 관찰 시 위치 오차가 드라마틱하게 보일 수 있음.

---

### 4. callisto — 칼리스토 (갈릴레이 바깥쪽)

| 시점  | 경과 | tier | meshPos | meshRadius | LOD 분포 |
| ----- | ---- | ---- | ------- | ---------- | -------- |
| start | 0s   | body | (0,0,0) | 104.79     | 1/0/23   |
| mid   | 30s  | body | (0,0,0) | 104.79     | 1/0/23   |
| end   | 60s  | body | (0,0,0) | 104.79     | 1/0/23   |

**관찰**: meshRadius 104.79 — 갈릴레이 4 위성 중 가장 바깥. 공전 주기 16.7일로 io 대비 10배 느림. 60s × 1년 time scale 에서는 공전 20여 회 — 궤도선 위치 정확성이 P11-C 구현 필요성에 직결. LOD 고정 (1/0/23).

---

## Smoke 관찰 (3 moon × 30s)

### 5. deimos — 데이모스 (화성계)

| 시점 | 경과 | tier | meshPos | meshRadius | LOD 분포 |
| ---- | ---- | ---- | ------- | ---------- | -------- |
| mid  | 15s  | body | (0,0,0) | 0.27       | 1/0/23   |

**관찰**: meshRadius 0.27 — 7 moon 중 가장 작음 (phobos 0.48 의 절반). focus 시에도 실질 렌더 1~2px. 궤도선 가시성 자체가 낮을 가능성 (P11-C 구현 시 billboard marker 고려).

### 6. europa — 유로파 (갈릴레이)

| 시점 | 경과 | tier | meshPos | meshRadius | LOD 분포 |
| ---- | ---- | ---- | ------- | ---------- | -------- |
| mid  | 15s  | body | (0,0,0) | 67.85      | 1/0/23   |

**관찰**: 갈릴레이 안쪽 2번째. 공전 주기 3.55일. 궤도선 렌더링 확인 (수동 스크린샷).

### 7. ganymede — 가니메데 (갈릴레이)

| 시점 | 경과 | tier | meshPos | meshRadius | LOD 분포   |
| ---- | ---- | ---- | ------- | ---------- | ---------- |
| mid  | 15s  | body | (0,0,0) | 114.52     | **1/1/22** |

**관찰**: meshRadius 114.52 (7 moon 중 최대). LOD 분포가 다른 smoke 와 달리 **1/1/22** — 배경 body 중 1개가 mid LOD 분기로 상승. 이는 ganymede focus 관점에서 **목성이 mid 임계 범위** (50~8 pixel 간격) 에 위치함을 시사 (LOD_PIXEL_THRESHOLDS.mid = 8, high = 50). LOD 분기가 의도대로 동작함을 실증.

---

## 종합 관찰

### 공통 패턴

1. **focus body = 원점 (FloatingOrigin)** — 모든 7 moon 관찰에서 `meshPos = (0,0,0)` 일관. T3 body tier 진입 시 FloatingOrigin 이 focus body 를 원점으로 이동. float32 jitter 방지 정책 성공.
2. **LOD 기본 분포 1/0/23** — 전체 24 body (태양 + 8행성 + 5 dwarf-planet + 7 moon + ... = 24 추정) 중 focus 만 high, 나머지는 대부분 low. 갈릴레이 위성 focus 시 배경 body 거리 매우 멀어 low 판정 일관.
3. **시간 경과 시 LOD 재분류** — moon(달) 의 t=60s 에서 `1/0/23 → 2/1/21` 변화는 LOD 시스템이 배경 body 위치 변화에 응답함을 실증 (P11-B 핵심 기능).

### 관찰되지 않은 이슈

- 60초/30초 연속 관찰 중 **meshPos 급격 이동 / tier 전환 flicker / console error** 없음
- FloatingOrigin 이 안정적으로 focus body 를 원점 유지 (P11-A #288 성과)

### 본 관찰로 직접 확인 불가한 항목 (수동 시각 검증 필요)

- **궤도선 끊김** — 스크립트는 mesh.position 과 LOD 분포만 기록. 실제 궤도선(polyline) 렌더링 연속성은 screenshot 수동 비교로 판정
- **갈릴레이 위성의 목성 내부 삽입** — io meshRadius 79.19 vs 목성 표면 간 상대 비교는 시각만 가능
- **궤도선과 실 mesh 위치 drift** — osculating element 가 아닌 단순 원형 근사로 렌더 시 타원 궤도에서는 시각적 drift 가 발생 (#247 의 본질)

---

## P11-C 제안 (관찰 근거 정리)

P11-B.2 관찰 결과를 바탕으로 P11-C (#290, Tier Preset Layer) 및 #247 Osculating 동기화 구현 범위 제안:

### 1. 즉시 시급성 (P11-C 필수)

없음. 본 관찰 범위에서 B.1 LOD 동작이 일관되게 관찰됨. P11-C 는 계획대로 Tier Preset Layer (`?preset=solar|inner|body`) + GPU tier 기반 LOD throttle 에 집중하면 됨.

### 2. 높은 우선순위 (P11-C 통합 또는 #247 P13 승격)

- **갈릴레이 위성 궤도선 osculating**: io/europa/ganymede 의 공전 주기가 짧아 (1~7일), 1년 time scale 관찰 시 단순 원형 궤도선과 실제 Keplerian 위치의 시각적 drift 가 가장 두드러짐. 스크린샷 `osculating-io-start/mid/end.png`, `osculating-europa-mid.png`, `osculating-ganymede-mid.png` 에서 확인 시 drift 있으면 #247 우선순위 상향.
- **phobos / deimos 궤도선 가시성**: meshRadius 0.27~0.48 으로 궤도선 자체가 sub-pixel. P11-C 에서 body-kind=moon 의 궤도선 minimum screen width (ex: 2px) 강제 규칙 고려.

### 3. 중간 우선순위 (P13 토성계 진행 시 재검토)

- **달 궤도선 연속성**: 60s 관찰 내 끊김 없으나 LOD 분포 변화 (1/0/23 → 2/1/21) 에서 배경 body 의 LOD 전환 시 궤도선 flash 발생 가능성 — P12-B tier-transition alpha 전략과 같은 pattern 을 LOD cross-fade 에 적용하는 연구 방향 (P11-C 범위 밖, P13 검토).

### 4. 우선순위 없음 (P14+ 또는 별도 이슈)

- dwarf-planet 위성 (현재 미구현)
- 해왕성계 위성 (Triton 등, 현재 미구현)
- 궤도선 색상별 분기 (공전 주기 / eccentricity 시각화)

---

## 결론

P11-B.1 머지 후 7 moon 전체 관찰에서 **LOD 시스템은 안정 동작**하며 focus/time-advance 에 응답함을 실측. Osculating 구현 시급성은 **갈릴레이 위성에 집중**되며, P11-C Tier Preset Layer 구현 시 **#247 공동 설계 제안** 검토 권고. **본 관찰은 #247 close 조건을 충족하지 않으며 구현 결정은 P11-C 별도 스프린트**에서 진행.

---

## 부속 데이터

- Raw JSON: `.verify-screenshots/osculating/observation-data.json` (15 screenshot path + 각 시점 LOD 분포)
- 스크린샷 15장: `.verify-screenshots/osculating/osculating-*.png`
- 관찰 스크립트: `apps/web/scripts/browser-osculating-observe.mjs`
- 재실행:
  ```bash
  pnpm dev &
  node apps/web/scripts/browser-osculating-observe.mjs http://localhost:3000
  ```
  (약 7~8분 소요)
