# ADR (대부분 NO-OP + 1 미세 개선 옵션): 위성/body focus → 태양계 개요 전환 UX (#732)

- **상태**: **Accepted** (cross-validate agy outcome=applied 2026-06-21 — §8 교차검증 반영 사항 4축 통합 완료. CLAUDE.md ADR Status 워크플로)
- **날짜**: 2026-06-21
- **결정자**: architect (#732 — #704 후속 인계 실측 재검증)
- **관련**:
  - [#732](https://github.com/coseo12/astro-simulator/issues/732) (본 이슈 — #704 §8 후속 분리 항목 인계)
  - [`20260618-704-body-tier-zoomout-jump.md`](20260618-704-body-tier-zoomout-jump.md) §8 후속 (잠재 후속 "개요로 단축키 신설 — 현재 reset 재사용" / UX 피드백 분리) ← **본 이슈의 직접 출처**
  - [`20260618-704-freefly-sensitivity-settings-ui.md`](20260618-704-freefly-sensitivity-settings-ui.md) §비목표 (줌아웃 배율 슬라이더로 "배율 모호" 1차 해소 완료)
  - [`20260617-699-freefly-camera-unified-redesign.md`](20260617-699-freefly-camera-unified-redesign.md) §5-1/§5-3 (free-fly 진입 단일화 + 허공 대체 처리 = 줌아웃 상한)
  - [`20260608-631-freefly-tier-escalation-forensic.md`](20260608-631-freefly-tier-escalation-forensic.md) (body tier → solar pull-back — #699 가 의도 변경하여 폐기됨)
  - [`20260607-629-freefly-camera-zoom-forensic.md`](20260607-629-freefly-camera-zoom-forensic.md) (radius 비례 줌 — reset tween 과 직교)
  - `apps/web/src/components/layout/focus-quick-buttons.tsx` (reset 버튼 / 탐색 버튼 / Esc 핸들러)
  - `apps/web/src/components/sim-canvas.tsx` `syncFocusToScene` (focus→개요 reset 천이 분기)
  - `packages/core/src/scene/camera-controller.ts` `reset()` (radius/target tween, `ExponentialEase` EASEOUT, `TRANSITION_MS=300`)
- **교훈 적용**: "인계 항목 실측 재검증 — NO-OP ADR 패턴" (volt #14/#67) + "measurement-first" (volt #32). 인계 항목 4개 중 3개가 착수 시점 이미 해소됐음을 runtime 실측으로 확정. `_debug-732-overview-transition-tmp.mjs` (실행 후 즉시 rm — volt #67 패턴).
- 용어: D-T2 / tier / Floating Origin / free-fly / EASEOUT 등은 [`docs/glossary.md`](../glossary.md) 참조.

---

## §1 배경

위성 탐색 인프라(#713 클릭 / #719 cycle / #721·#725 위성 / #728 ring arcs)로 콘텐츠가 풍부해졌고, #704 후속으로 "위성/body focus → 태양계 개요 복귀 경로" UX 가 분리 인계됐다. PM 초안 스프린트 계약은 5개 항목을 제시했다:

1. 위성/body focus 상태에서 "태양계 개요로" 단일 액션으로 매끄럽게 전환
2. 전환 시 카메라 이동이 급격하지 않음 (#629/#704 escalation 급변 무재발)
3. 줌아웃 배율 체감 개선 (#704 "배율 모호" 해소)
4. free-fly/focus/reset 상태 전이 무회귀
5. UI 3단계 브라우저 검증

⚠️ 이슈 본문이 명시한 대로 **이 feature 는 #699/#704/#629/#631 에서 이미 부분/전체 구현됐을 가능성이 높다**. architect 가 NO-OP 패턴(volt #14/#67)을 적용해 **현재 코드 + runtime 동작을 먼저 실측**한 뒤 잔여 개선 여지만 정의한다.

## §2 Forensic 측정 (2026-06-21, headless 1280×720, develop = feature/732 baseline 7e5d1ed)

`_debug-732-overview-transition-tmp.mjs` (volt #67 패턴, 실행 후 rm). 카메라 `radius`/`target`/`tier` 수치 천이만 측정 — **시각 readback 아님이라 headless 정확** (WebGPU 셰이더 readback 함정 회피). 콘솔 에러 0.

전역 접근: `window.__simCore.scene.activeCamera` (ArcRotateCamera), `window.__solarScene.getTier()`, `window.__simCore.command({...})`.

### S1 — io(목성계 위성) focus → reset 버튼 (개요 복귀)

io focus 정착: `tier=body radius=158386 target=(7384,-1879,33) lower=467`. `resetCamera` 후 16ms(프레임) 간격 샘플:

| t(ms) | radius | \|target\| | 프레임Δ |
| ----- | ------ | ---------- | ------- |
| 0     | 158386 | 8412       | —       |
| 16    | 79512  | 4222       | 47.7%   |
| 32    | 7978   | 422        | 52.9%   |
| 48    | **35** | **0**      | 69.5%   |
| 64+   | 35     | 0          | 0%      |

- **radius 와 \|target\| 이 동기 감속** (둘 다 같은 비율로 수렴) → 시각적 끊김/점프 없음.
- **tier 는 reset 직후 `body→solar` 즉시 전환** (`clearFocus()` 의 `setTier(default)`), 그러나 radius/target tween 은 매끄럽게 진행.
- ⚠️ **tween 도달 시간 ≈ 48ms (3프레임)** — `TRANSITION_MS=300` 의도 대비 실제 6분의 1.

### S2 — io focus → 탐색(free-fly) → 줌아웃 20틱

| 구간          | 관찰                                                                       |
| ------------- | -------------------------------------------------------------------------- |
| free-fly 진입 | `radius=158386 유지 tier=body upper=791931(=entryRadius×5)` — 시점 보존 ✅ |
| 줌아웃 7틱    | radius 158386→791931 (entryRadius×zoomoutFactor 5) 상한 **clamp**          |
| 8~19틱        | radius 791931 고정, **tier=body 불변** (escalation 미발생)                 |

→ **줌아웃만으로는 위성→개요 전환이 일어나지 않는다.** #704 anchor gate 가 body tier 를 유지(위성 근방 보존)하여 의도적으로 차단. 개요 복귀는 reset 버튼이 담당.

### S3 — earth(inner tier) focus → reset (대조군)

| t(ms) | radius                                   |
| ----- | ---------------------------------------- |
| 0     | 68.1                                     |
| 16    | 79.5(\*) → 실제 시퀀스 68→60→45→40→36→35 |
| 128   | **35 도달**                              |

- earth reset 도달 ≈ **128ms (8프레임)** — io(48ms)의 **2.6배 느림**.
- **핵심 비대칭**: 시작 radius 가 클수록(위성 158386) reset 이 **더 빨리** 끝난다 (역직관). `ExponentialEase` EASEOUT 의 **선형 보간**(`start + (end-start)×easeOut(t)`)이 radius 4525배 차이를 처리할 때, 큰 값 구간(158386→수천)을 easeOut 곡선 초반 ~30ms 에 90%+ 통과 → 화면상 "먼 천체에서 휙 빨려나가고 나머지는 비가시" 체감. earth(68→35, 2배)는 선형이어도 전 구간 가시.

## §3 인계 항목 실측 재검증 결과 (PM 초안 5항 대조)

| PM 초안 항목                                       | 실측 결과                                                                                                                                | 판정               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 1. "개요로" 단일 액션 매끄러운 전환                | **이미 존재** — `reset` 버튼(`data-testid="focus-reset"`)이 focus/free-fly 무관 sun 중심 개요로 tween 복귀. S1: 끊김/점프 0, 콘솔 에러 0 | **NO-OP**          |
| 2. 카메라 이동 급격하지 않음                       | **이미 충족** — radius/target 동기 tween, escalation 급변(#704)은 anchor gate 로 차단됨                                                  | **NO-OP**          |
| 3. 줌아웃 배율 체감 개선                           | **#704 에서 이미 해소** — 줌아웃 배율 슬라이더(`zoomoutFactor` 0.4~4배)로 사용자 조정 가능. "모호"는 가변화 부재였고 #704 가 가변화 완료 | **NO-OP**          |
| 4. free-fly/focus/reset 무회귀                     | **이미 가드됨** — `verify:629/631/693` + 378-focus. S1/S2/S3 무회귀 실측                                                                 | **NO-OP**          |
| 5. UI 3단계 브라우저 검증                          | 신규 동작 없으면 불요 (NO-OP 시)                                                                                                         | 조건부             |
| (실측 신규 발견) reset tween 거리 비례 속도 비일관 | **잠재 개선 여지** — io 48ms vs earth 128ms. 끊김은 아니나 원거리 천체에서 더 급하게 종료(역직관). 측정 가능.                            | **미세 개선 옵션** |

## §4 결정 — 대부분 NO-OP + reset tween 로그보간 1건만 사용자 결정 위임

### NO-OP 확정 (PM 초안 1~4 = 신규 구현 불요)

PM 초안 항목 1~4 는 **#699/#704 가 이미 충족**한다. "개요로 단일 액션"은 reset 버튼이 정확히 그 역할을 하고(S1 매끄러운 tween + 에러 0), "급변 없음"은 anchor gate 가, "줌아웃 배율 모호"는 #704 슬라이더가 해소했다. 신규 버튼/단축키/제스처/카메라 모드는 **불필요한 표면 추가(YAGNI)** — 기존 reset 버튼과 의미 중복.

> #704 §8 이 이미 예측한 결론: "잠재 후속: '개요로' 단축키 신설(현재 reset 재사용)". 실측 결과 reset 재사용으로 충분 → 별도 단축키도 불요.

### 유일한 실재 개선 여지 — reset tween 의 radius 로그 보간 (옵션 비교)

S2/S3 측정이 드러낸 **reset tween 거리 비례 속도 비일관**(io 48ms vs earth 128ms)이 #732 의 유일한 객관적 개선 대상이다. 축별 비교:

| 옵션                                         | 변경 범위                                                                                                  | 장점                                                                    | 단점                                                                                            |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **(a) 순수 NO-OP** (전체 종결)               | 0                                                                                                          | 비용 0, 회귀 위험 0. 끊김/에러 없음(객관 충족)                          | 원거리 reset 의 "휙 빨려나감" 체감 잔존 (주관적, D-T2 미검증)                                   |
| **(b) reset radius 로그 보간** (최소 개선)   | `camera-controller.ts reset()` radius 애니메이션만 선형→`Math.log(radius)` 공간 보간 (target 은 선형 유지) | 거리 비례 속도 일관화 — 위성/행성 reset 도달 시간 균일. 코어 1함수 국소 | `focusOn`/`runTierTransition` 의 radius tween 과 보간 모델 분기(이중 모델 drift 위험) — §위험 1 |
| **(c) reset TRANSITION_MS 거리 비례 가변**   | reset frame 수를 `log(startRadius/endRadius)` 비례로                                                       | (b)보다 단순(easing 모델 불변)                                          | radius 5000배차에서 frame 수 폭증 가능 — 상한 clamp 필요                                        |
| **(d) net-new 연출** (fade / dolly-zoom FOV) | 신규 셰이더/포스트프로세스                                                                                 | 멀미 완화 시네마틱                                                      | **#732 범위 밖** — #704 §8 이 이미 "후속 분리, 우선순위 low"로 박제. 비목표                     |

**architect 권고** (§8 교차검증 이견 4 반영 — agy 가 (c) 우선 제안하여 원안 "(b) 우선" 정정): **(a) 순수 NO-OP 를 기본 권고**하되, 사용자가 원거리 reset "휙 빨려나감" 체감을 실제 D-T2 로 확인하고 거슬려하면 **(c) TRANSITION_MS 거리 비례 가변 + frame 수 상한 clamp 를 1순위 후속**으로 채택한다. (c) 는 easing 모델을 건드리지 않아 `focusOn`/`runTierTransition` 과의 보간 모델 이중화(§5-1)가 없다 — agy 핵심 근거. **(b) 로그 보간은 (c) 가 거리 비례 균일화에 불충분할 때만** 차선으로 검토(보간 모델 drift 비용 감수). 어느 쪽이든 끊김 fix 가 아니라 "속도 일관화"이므로 **객관 회귀가 아닌 주관 polish** — 사용자 체감 확인 없이 선제 구현하면 measurement-first 위반(volt #32 "정적 추정 fix 오진"). (d) 는 기각(범위 밖 — #704 §8 후속 분리).

> **폐기 프레이밍 경계 (Claude 편향 셀프 체크 §3)**: "NO-OP 가 정답"으로 성급히 닫지 않는다. reset 거리 비례 비일관은 **실측으로 확인된 실재 현상**(io 48ms vs earth 128ms, 2.6배). 다만 "끊김/버그"는 아니고 "주관적 polish 후보"라 사용자 D-T2 판단에 위임하는 것이 정직하다.

## §5 위험 / 미해결

1. **(b) 채택 시 보간 모델 이중화 drift (결합 — Claude 편향 셀프 체크 §2)**: `reset()` 의 radius 를 로그 보간으로 바꾸면, `focusOn()` 진입 tween + `runTierTransition` 의 apparent-size 보존 수식(`radius_new = radius_old × newScale/oldScale`)은 여전히 선형/곱셈 모델이라 **카메라 radius 천이가 경로마다 다른 보간 곡선**을 갖게 된다. (b) 구현 시 dev 는 reset 만 바꾸는 것이 전체 radius 애니메이션 일관성을 해치지 않는지 `verify:629/631` 무회귀 + focus→reset 왕복 D-T2 로 확인 필수.
2. **(a) 순수 NO-OP 시 회귀 가드 부재 위험**: 현재 "reset 이 위성에서도 개요로 매끄럽게 복귀"하는 동작에 **전용 회귀 가드가 없다** (verify:378-focus 는 focus 진입만, verify:629/631 은 줌/escalation 만 커버). 미래 카메라 리팩토링이 reset 천이를 조용히 깨뜨릴 수 있다 → **§6 회귀 가드를 NO-OP 채택 시에도 박제**.
3. **줌아웃→개요 미전환은 "버그 아님"**: S2 가 보인 "줌아웃해도 body tier 유지"는 #704 anchor gate 의 **의도된 동작**(위성 근방 보존). 사용자가 "줌아웃으로 개요 나가고 싶다"를 요구하면 이는 anchor gate 의 설계 의도와 정면 충돌 → 후속 별도 이슈 + #704 ADR Amendment 필요 (본 #732 범위 밖).
4. **reset 도중 사용자 입력 잔류 (agy §3 race 지적 — 실측 확인)**: `reset()` 은 `detachControl` 을 호출하지 않아 tween 48ms 동안 사용자 휠/드래그 입력이 `camera.radius` 를 동시에 건드린다. **실측**(2026-06-21): io reset tween 중 휠 2회 주입 시 최종 radius=**45.3** (입력 없으면 35.0). 콘솔 에러 0 · NaN/진동 없음 → catastrophic race 아님(사용자 줌 의도가 정상 반영된 결과로도 해석 가능)이지만, **"reset = 항상 radius 35 도달" 불변식이 입력 시 깨진다**. §6 회귀 가드의 "단조 감소/종료 상태" assert 는 **입력 없는 reset 경로**에 한정해야 false-positive 를 피한다. (b)/(c) 채택 시 reset 중 `detachControl` 추가 여부는 별도 판단 — UX 상 "reset 도중 줌 허용" vs "reset 완주 보장" 트레이드오프.
5. **reset 상태/연출 불일치 기간 (agy §3 인터페이스 — onTransitionComplete 부재)**: `resetCamera` 직후 `tier` 는 즉시 `body→solar` 로 set 되지만(`clearFocus()`), 카메라 tween 은 48ms 더 진행 → **물리 상태(solar)와 카메라 위치(아직 body 근처)가 불일치하는 기간**이 존재. 현재 이 기간에 의존하는 타 모듈 콜백/렌더 경로가 없어(LOD/picking 은 camera radius 직접 읽음) **실해 0**이나, 미래에 "개요 전환 완료 시점" 이벤트가 필요한 기능(예: 전환 후 자동 안내 토스트)이 생기면 `reset()` 에 `onAnimationEnd` 콜백 인터페이스가 필요. 현재는 YAGNI — 재검토 트리거 §7 에 기록.

## §6 회귀 가드 (NO-OP / (b) 무관 박제 의무)

판정이 (a) 순수 NO-OP 든 (b) 개선이든, **현 "focus/free-fly → reset = 개요 복귀" 동작을 보존하는 회귀 가드를 신설**한다 (§5 위험 2 — 현재 가드 사각). dev 인수인계 시 최소 단위 검증:

- **단위/headless 가드** (`verify:732-overview` 또는 기존 verify 확장): io focus → reset → 종료 상태가 `tier=solar radius≈35 |target|≈0` 임을 assert (위성/행성 각 1 케이스). free-fly → reset 도 동일 종료 상태 assert. **⚠️ 입력 없는 reset 경로 한정** — §5-4 실측대로 reset tween 중 사용자 휠 입력 시 종료 radius 가 35 가 아닐 수 있으므로(45.3), 가드는 reset 후 입력 주입 없이 순수 종료 상태만 검증한다.
- **천이 매끄러움 약식 가드**: reset 천이 중 어느 프레임도 radius/target 이 **단조 감소를 위반하지 않음**(되돌아가는 oscillation = race 신호) assert. (절대 도달 시간은 가드하지 않음 — easing 구현 세부에 과결합 회피. agy §6 "FPS 비의존성" 우려 정합 — 도달 시간을 가드하면 60↔144Hz 에서 frame-count 차이로 flake.)
- **(agy §6 FPS 비의존성 확인 — dev 인수인계 측정 항목)**: reset tween 이 frame-count 기반(`(TRANSITION_MS/1000)×60` frames)이라 Babylon Animation 의 벽시계 시간 스케일링(`deltaTime`)에 의존한다. dev 는 (b)/(c) 구현 시 144Hz/저FPS 에서 reset 도달 **시간**(frame 수 아님)이 일정한지 1회 실측(이미 모든 focusOn 천이 공통이라 #732 신규 회귀 아님 — 확인만).

## §7 결과 · 재검토 조건

- **NO-OP (a) 채택 시**: 코드 동작 변경 0. 본 ADR + §6 회귀 가드만 신설. #732 는 "핵심 인계 항목 이미 해소 + 회귀 가드 박제"로 종결. #704 §8 후속 인계 항목 해소.
- **(c) 채택 시 (§8 이견 4 반영 1순위)**: `camera-controller.ts reset()` 의 frame 수를 `log(startRadius/endRadius)` 비례 + 상한 clamp 로 변경(easing 모델 불변 — 보간 이중화 없음) + §6 가드 + D-T2(위성/행성 reset 체감 균일 확인). MINOR (에이전트 아닌 앱 거동 변화).
- **(b) 차선**: (c) 가 거리 비례 균일화에 불충분 시 reset radius 로그 보간. §5-1 보간 모델 drift 비용 + `verify:629/631` 무회귀 + focus→reset 왕복 D-T2 필수.
- **재검토 트리거**: (1) 4번째 tier(Galactic 등) 도입으로 radius 범위가 더 극단화되면 reset 비일관 재측정 + agy §4 보간 Strategy 패턴 추상화 재평가(현재 YAGNI 기각) / (2) 사용자가 "줌아웃으로 개요 나가기"를 명시 요구하면 #704 anchor gate Amendment 후속 이슈 / (3) net-new 연출(fade/dolly-zoom) 수요 확인 시 #704 §8 후속 분리 항목 착수 / (4) "개요 전환 완료 시점" 이벤트 필요 기능(자동 안내 토스트 등) 등장 시 `reset()` 에 `onAnimationEnd` 콜백 인터페이스 추가(§5-5 agy §3 발견).

## §8 교차검증 반영 사항

cross-validate (agy, outcome=applied, exit 0, 2026-06-21, 로그: `.claude/logs/cross-validate-architecture-20260621-193547.log` — gitignored 로컬 산출물이라 링크 아닌 경로 표기, #842). 호출 전 Claude 편향 셀프 체크: 낙관 일정 = N/A(설계 전용) · 결합 = §5-1 보간 모델 drift 명시(통과) · 폐기 프레이밍 = §4 "NO-OP 성급 종결 경계" 박제(통과) · 순수주의 = (b) YAGNI 경계 + (c)/(d) 기각(통과). 미통과 의심 축(결합/폐기 프레이밍)을 호출 프롬프트 명시 질문으로 삽입.

### 합의 (Claude 설계와 일치 — 본 ADR 즉시 반영)

1. **(a) 순수 NO-OP 기본 권고 타당** — agy "기존 #699/#704 재활용 + 실측 근거 (a) 채택 합리적", "불필요한 개발 공수 줄이는 훌륭한 프랙티스". 폐기 프레이밍 편향 질문 1 에 대해 agy 도 NO-OP 가 과소평가/조작이 아니라 정당하다고 합의.
2. **§6 회귀 가드 신설 필수** — agy "(a) 채택하더라도 §6 회귀 가드 신설은 장기 카메라 리팩토링 안전망으로 반드시 병행 착수 적극 권고". §5 위험 2(가드 사각)와 정확히 일치.
3. **net-new 연출(fade/dolly-zoom/멀미 완화)는 별도** — agy §6 "멀미 방지 가이드라인" 도 본 ADR (d) 기각 + #704 §8 후속 분리와 동일 위치.

### 이견 수용 (agy 근거가 합리적 — 본 ADR 수정)

4. **옵션 우선순위 (b) → (c) 로 전환** — **원안**: §4 가 (b) reset radius 로그보간을 D-T2 후 1순위로 권고. **agy 이견**: "이중 보간 공식 적용(b)보다 (c) TRANSITION_MS 거리 비례 가변+Clamp 가 구현 단순/안정 → 우선 고려". **수용 근거**: §5-1 보간 모델 drift 위험을 회피하는 것이 (b)의 로그보간 정밀도보다 우선. (c) 는 easing 모델을 건드리지 않아 focusOn/runTierTransition 과의 이중화가 없다. → **§4 권고를 "(c) 우선, (b) 는 (c) 가 거리 비례 균일화에 불충분할 때만" 으로 정정** (아래 반영). 단 (c)의 frame 수 폭증은 원안대로 clamp 필수.

### Claude 재분석으로 기각 / 범위 외 분류 (맹목 수용 회피 — volt #51)

5. **보간 전략 패턴(Strategy Pattern) 추상화 (agy §4 확장성)** — **기각(YAGNI)**. agy 는 reset/focusOn 보간 파편화 방지용 Strategy 주입을 제안하나, 현재 보간 경로는 2종(reset easeOut / runTierTransition 곱셈)뿐이고 4번째 tier 미등장. CLAUDE.md §교차검증 "근본 해결책이라도 현재 스프린트 범위 밖이면 분리" + §7 재검토 트리거 1(4번째 tier 시 재측정)에 이미 조건부 박제됨. 선제 추상화는 #732 비목표.
6. **프로덕션 디버그 API tree-shaking (agy §5 보안)** — **범위 외**. `window.__simCore` 노출은 #732 가 만든 게 아니라 전 프로젝트 공통 dev 빌드 패턴(모든 browser-verify 의존). #732 와 직교 → 별도 보안 이슈 영역(본 ADR 미반영, 후속 분리도 보류 — 실해 미입증).
7. **Sequence Diagram / 컴포넌트 생명주기 도식 (agy §1)** — **부분 수용 보류**. 가치 있으나 NO-OP ADR 에 비동기 흐름도까지 요구하면 과설계. 핵심 상태 전이는 §2 실측 표 + §5-5 불일치 기간 서술로 충분. (b)/(c) 구현 PR 에서 dev 가 필요 시 추가.

### 고유 발견 (Claude 가 놓친 실재 결합 — §5 추가 박제, 후속 분리 없음)

8. **reset 도중 사용자 입력 잔류 race (agy §3) — 실측 확인** → **§5-4 신규 박제**. agy 가 "tier 즉시 변경 vs tween 지속 race" 를 지적 → Claude 가 실측(io reset tween 중 휠 2회 → 종료 radius 45.3 ≠ 35). catastrophic 아니나 "reset = 항상 radius 35" 불변식이 입력 시 깨짐 → **§6 회귀 가드를 "입력 없는 reset 경로 한정" 으로 정정** (false-positive 차단). 질문 2(결합)에 대해 agy 가 Claude 가 놓친 더 깊은 결합을 정확히 발굴.
9. **onTransitionComplete 콜백 부재 / 상태·연출 불일치 기간 (agy §3)** → **§5-5 신규 박제**. 현재 실해 0(불일치 기간 의존 모듈 없음)이나 미래 "전환 완료 이벤트" 필요 기능 대비 §7 재검토 트리거에 기록. YAGNI 로 현재 미구현.
10. **FPS 비의존성 검증 (agy §6)** → **§6 가드 항목 + dev 인수인계 측정 항목 추가**. reset tween 이 frame-count 기반(`18 frames`)이라 144Hz/저FPS 도달 시간 검증 필요 — 단 모든 focusOn 천이 공통이라 #732 신규 회귀 아님(확인만). 가드가 "도달 시간"이 아닌 "종료 상태/단조성"만 검증하도록 한 §6 설계가 이 우려와 정합.

### 줌아웃→개요 전환 (질문 3) 재확인

agy 는 anchor gate 의 "줌아웃 차단" 자체에 이의를 제기하지 않았다(멀미 완화 가이드라인만 언급). Claude 재분석: 줌아웃 제스처 개요 복귀는 #704 anchor gate 설계 의도(위성 근방 보존)와 정면 충돌 — reset 버튼이 명시적 개요 액션으로 충분(S1 매끄러움 실측). 사용자가 줌아웃 제스처를 명시 요구하면 §7 재검토 트리거 2(#704 Amendment 후속)로 분리. **#732 범위 내 회피 아님 — 의도된 설계 경계.**
