# ADR: #391 Phase 2 Decision — billboard 시각 개선 (alpha mask 채택)

- **상태**: Accepted (architect 단계, developer 진입 직전 박제)
- **날짜**: 2026-05-02
- **결정자**: architect (#391)
- **관련**:
  - 본 ADR 의 forensic SSoT: `docs/reports/391-forensic/output.json`
  - 선행 ADR (Phase 1): `20260502-379-fix-decision.md` (식 정정 + Phase 분리 박제)
  - 선행 ADR (정책 분석): `20260502-379-lod-policy-review.md`
  - 선행 ADR (P11-B 정책): `20260424-p11-b-lod-design.md` §미해결 1 (본 ADR 이 정식 fix)
  - 선행 ADR (#373 라운드 2): `20260430-r3-followup-body-proportion.md`
  - 후속 이슈: #385 (라운드 3 박제값 인하) — 본 ADR 채택이 #385 안전 진입 보장
- **교훈 적용**:
  - "DoD PASS ≠ 제품 동작" (volt #74) — Phase 1 회귀 가드 PASS 후에도 작은 viewport mercury/venus 사각형 잔존 가능
  - "교차검증 박제 직후 루틴" (volt #23) — 본 ADR 박제 직후 cross-validate 1회 의무
  - "주석 계약 vs 구현 drift" (volt #49) — billboard alpha mask 의 적용 시점/조건을 코드 주석 SSoT 박제

---

## 배경

#379 Phase 1 (PR #390, f6bc67e, 2026-05-02) 머지 후 sun=high 100% 회복 + 큰 viewport (414×896 dpr2 / 1440×900 dpr2) 환경에서 mercury/venus 가 mid 진입. 그러나 Phase 1 baseline 8 cell 매트릭스 분석 결과 **6/8 cell 에서 mercury/venus 가 여전히 low billboard fallback** 상태로 잔존:

| Phase 2 target | mercury low | venus low | 환경 |
|---|---|---|---|
| 320x568 dpr1 | ✓ | ✓ | 모바일 narrow |
| 375x667 dpr1 | ✓ | ✓ | 모바일 |
| 375x667 dpr2 | ✓ | - | 모바일 |
| 1280x720 dpr1 | ✓ | ✓ | 데스크톱 (사용자 D-T2 trigger) |
| 1440x900 dpr1 | ✓ | - | 데스크톱 |
| 1920x1080 dpr1 | ✓ | - | 데스크톱 wide |

**6 cell 모두에서 low billboard 의 시각 디테일 (사각형 quad)** 이 사용자 D-T2 회귀 trigger. P11-B ADR `20260424-p11-b-lod-design.md` §미해결 1 의 정식 fix 시점이다.

본 ADR 은 후보 (가) (나) (다) 비교 → 결정 → 결과·재검토 조건 4섹션 박제. CLAUDE.md "교차검증 박제 직후 루틴" 적용 1회 의무 (volt #23).

---

## Forensic 측정 — billboard 의 시각 메커니즘

`docs/reports/391-forensic/output.json` SSoT.

### billboard 코드 분석 (`packages/core/src/scene/solar-system-scene.ts:1356-1391`)

```ts
function createBodyBillboard(...) {
  const diameter = body.radius * 2 * renderScaleForTier(tier);
  const mesh = MeshBuilder.CreatePlane(
    `${body.id}-lod-low`,
    { size: diameter, sideOrientation: 2 /* DOUBLESIDE */ },
    scene,
  );
  mesh.parent = parent;
  mesh.position.set(0, 0, 0);
  mesh.billboardMode = 7; // BILLBOARDMODE_ALL

  const mat = new StandardMaterial(`${body.id}-lod-low-mat`, scene);
  const hex = body.colorHint?.hex ?? '#888888';
  const c = hexToColor3(hex);
  if (body.kind === 'star') {
    mat.emissiveColor = c;
    mat.disableLighting = true;
  } else {
    mat.diffuseColor = c;
    mat.emissiveColor = c.scale(0.3);
    mat.specularColor = new Color3(0, 0, 0);
  }
  mesh.material = mat;
  mesh.setEnabled(false);
  return mesh;
}
```

**시각 메커니즘**:

- `MeshBuilder.CreatePlane` — 단순 정사각형 quad (4 vertex / 2 triangle)
- `StandardMaterial` — 단색 albedo + emissive 0.3, alpha mask 미적용
- `BILLBOARDMODE_ALL` — 카메라 정면 회전 (X/Y/Z 모두) 자동 적용

**사용자 인지 회귀의 직접 원인**: alpha mask 부재. `MeshBuilder.CreatePlane` 의 정사각형 윤곽이 픽셀 그리드에 그대로 노출. mercury 7~13px / venus 12~16px 의 quad 면적이 사용자 인지 임계 (≥4px) 진입 시 사각형 윤곽 가시화.

### 픽셀 형태 측정 (Phase 1 baseline 8 cell)

| Body | min pxDiameter | max pxDiameter | 시각 결과 |
|---|---|---|---|
| mercury | 6.80 (320×568) | 12.94 (1920×1080) | 7×7 ~ 13×13 정사각형 |
| venus | 12.39 (320×568) | 15.71 (1280×720) | 12×12 ~ 16×16 정사각형 |

**6 cell 모두 사용자 인지 임계 통과** — 사각형 윤곽이 명확. 사용자 D-T2 보고와 정합.

---

## 후보 비교 — 3종 (이슈 #391 본문 박제)

forensic 측정값 + Phase 1 baseline + P11-B ADR 정책 영향을 종합 비교.

| 후보 | 변경 영역 | 변경 라인 | r1-guard 영향 | draw call | 메모리 | P11-B 정책 영향 | R4 결합 위험 | #385 결합 |
|---|---|---|---|---|---|---|---|---|
| **(가) alpha mask** | `createBodyBillboard` material | 5~10 | low | 0 | 0 | §미해결 1 정식 fix (Amendment) | 무관 (독립) | 안전 마진 제공 |
| (나) sphere segment 강제 | `createBodyBillboard` geometry + lighting | 10~20 | low~medium | 0 | +24 body × 60 vert | §축 4 정책 변경 (Amendment) | 무관 | medium |
| (다) adaptive 임계 | `lodFromScreenCoverage` + tier-profile | 20~40 | medium | +24 body × mid sphere | +24 body × mid lazy-create 빈도 증가 | §결정 §2 핵심 공식 변경 (Amendment) | **결합 검토 의무** | 임계 변경 시 효과 약화 |

### 후보 (가) alpha mask — 채택

**구현 방식**:

- `StandardMaterial.opacityTexture` 에 procedural alpha mask 적용 — `DynamicTexture` 또는 `Texture` 기반 원형 alpha
- 또는 `ShaderMaterial` 로 직접 fragment shader 에서 `alpha = 1 - smoothstep(0.4, 0.5, length(uv - 0.5))`
- 구현 가이드는 developer 단계에서 결정 — `DynamicTexture` 가 단순하나 `ShaderMaterial` 이 정확

**효과 예측**:

- 6 Phase 2 target cell 모두에서 mercury/venus quad 의 사각형 윤곽 → 원형 disc 변환
- pxDiameter 6.80~15.71 의 quad 도 원형으로 인지 — 사용자 D-T2 회귀 차단
- billboard mesh 자체 size / position 무변경 → r1-guard `--measure-px-ratio` BBOX 측정 변경 0 (raw quad 기준)

**위험**:

- `ShaderMaterial` 도입 시 Babylon shader cache 무효화 가능 → `DynamicTexture` 기반 `StandardMaterial.opacityTexture` 가 단순
- alpha test threshold 미적용 시 alpha 0 픽셀이 z-buffer 에 쓰여 뒤 body 가려짐 → `mat.useAlphaFromDiffuseTexture = true` + `mat.transparencyMode = ALPHATEST` 적용 의무

### 후보 (나) sphere segment 강제 — 기각

**기각 근거**:

- P11-B ADR §축 4 의 정책 직접 변경 ("low = billboard quad" → "low = low-poly sphere")
- mid (segments=12) vs low (segments=8) 차이가 너무 작아 LOD 단계 의미 약화
- `MeshBuilder.CreateSphere` 가 vertex/index buffer 증가 — 24 body × 60 vert ≈ 1440 vert 추가. iOS Safari 17.4+ #219 환경에서 메모리 부담 가능
- billboard 의 BILLBOARDMODE_ALL 제거 → sphere 가 카메라 회전 시 segments 가 보이는 회귀 가능 (특히 segments=8 의 8각형 윤곽)
- alpha mask 보다 자연스럽지 않음

### 후보 (다) adaptive 임계 — 기각

**기각 근거**:

- P11-B ADR §결정 §2 의 핵심 공식 변경 (high≥50 / mid≥8 → viewport / DPR 적응)
- **R4 viewport-aware scaling 결정과 결합 검토 의무** — R4 가 박제값 자체를 viewport 적응으로 만든다면 (다) 의 임계 적응과 책임 중복
- mid 진입 빈도 증가 → `createBodyMeshMid` lazy-create 빈도 증가 → 메모리 부담 증가 + LRU dispose 정책 가속 필요
- P11-B DoD #1 "draw call 차이 ≥ 20%" 회귀 가능 (mid sphere segments=12 가 quad 1개 대비 GPU 부담 증가)
- Phase 2 단독 채택 시 R4 와 충돌 가능 → R4 진입 전 사전 검토 의무 부담

### 단독 vs 조합 채택 결론

**(가) 단독 채택**. 다른 후보는:

- (나): 기각 (P11-B 정책 변경 부담 + 메모리 증가)
- (다): R4 진입 전 단독 채택 위험 + Phase 2 단독으로는 비효율. R4 진입 시 별도 검토.
- 조합 (가)+(나): 무의미 — alpha mask 가 적용된 quad 와 sphere 가 동일 시각 결과
- 조합 (가)+(다): 임계 변경 + alpha mask 모두 적용 시 변경량 과대. R4 결합으로 분리.

---

## 결정

### Phase 2 = (가) alpha mask 단독 채택, 1 PR 완결

**developer 단계 작업 명세** (cross-validate 이견 수용 #1 #2 #3 반영):

1. **`createBodyBillboard` material 변경** — `packages/core/src/scene/solar-system-scene.ts:1378-1389`
   - `StandardMaterial.opacityTexture` 에 procedural 원형 alpha mask 적용 — **DynamicTexture 1회 생성 + scene 단위 공유 채택**
   - **옵션 A 채택 (Gemini cross-validate 권고)**: `DynamicTexture` 64×64 1회 생성 + 모든 billboard material 이 공유 (`scene.metadata.alphaMaskTexture` 또는 동등 캐시 키)
     - 근거: Babylon Uber-shader 캐시 활용 (shader 컴파일 jank 회피), 64×64 = 16KB VRAM (메모리 효율), Material 인스턴스는 body 별 emissiveColor 분리 유지하되 opacityTexture 참조만 공유
     - 옵션 B (`ShaderMaterial` 직접 작성) 는 shader cache 무효화 + 새 셰이더 컴파일 jank 위험으로 기각
   - alpha test threshold 적용 의무: `mat.useAlphaFromDiffuseTexture = true` + `mat.transparencyMode = 1 (ALPHATEST)`
     - 근거: ALPHABLEND 는 24 body back-to-front 정렬 매 프레임 CPU 부하 + sub-pixel body 정렬 비용 큼. ALPHATEST 는 fragment shader discard + Z-buffer write 로 CPU 정렬 비용 0 + 하드웨어 occlusion
2. **pxDiameter < 4px fallback 분기** (cross-validate 이견 수용 #1):
   - `createBodyBillboard` 또는 LOD pass 에서 매 프레임 mesh 의 pxDiameter (또는 screenCoverage 의 2배) 측정
   - **임계 4px 미만 진입 시 alpha mask 바이패스**: `material.opacityTexture = null` (또는 `transparencyMode = 0 OPAQUE` 전환) → 사각형 quad 그대로 유지
   - 근거: `smoothstep(0.4, 0.5)` 전이 구간이 0.53px (4px 의 13%) 인데 hardware pixel 1개 미만이라 GPU sampler aliasing + sub-pixel flickering 발생. 사용자 D-T2 가 3px 이하 객체에서 원/사각형 구분 불가 → 사각형 quad 가 시각 안정성 우위
   - 구현 위치: LOD pass 의 billboard variant active 시점 (`runLodPass` 내) 에 mesh 의 현재 측정 pxDiameter 기반 분기. 매 프레임 분기 비용 작음 (24 body 단위)
   - 단위 테스트 추가: pxDiameter 3.9px (fallback 진입) / 4.1px (alpha mask 적용) 경계 분기 검증
3. **공유 텍스처 dispose 책임** (cross-validate 이견 수용 #2):
   - `scene.metadata.alphaMaskTexture` (또는 동등 캐시) 가 scene dispose 시 함께 dispose 되도록 명시 처리
   - `solar-system-scene.ts` 의 scene cleanup 또는 `disposeAll` 함수에 `scene.metadata?.alphaMaskTexture?.dispose()` 추가 의무
   - 근거: scene 이 여러 번 생성/파괴되는 시나리오 (HMR, navigation) 에서 텍스처 누수 방지
4. **주석 계약 박제** (drift 방어):
   - `createBodyBillboard` 함수 상단 주석에 "alpha mask 적용 의무 — quad 의 정사각형 윤곽 회피. 픽셀 그리드 노출 시 사용자 D-T2 회귀 발생" 명시
   - 4px fallback 임계 + transparencyMode=ALPHATEST 선택 근거 박제
   - alpha mask threshold (smoothstep 0.4/0.5) 변경 시 ADR Amendment 의무 박제
5. **회귀 가드 박제**:
   - 단위 테스트: `packages/core/src/render/lod.test.ts` 에 sub-pixel asteroid (T1 solar 뷰) → low LOD 결정 회귀 검증 추가 (alpha mask 적용이 LOD 분기 자체를 깨지 않는지)
   - browser-verify 확장: `apps/web/scripts/browser-verify-379-lod.mjs` 시나리오 A 에 **alpha mask 검증 hook** 추가 — billboard mesh 의 `material.opacityTexture` 가 정의되어 있는지 + pxDiameter < 4px cell 에서 fallback (opacityTexture = null) 적용 확인. 또는 신설 `apps/web/scripts/browser-verify-391-billboard.mjs` 로 분리
6. **r1-guard 영향 평가**:
   - Phase 2 적용 후 `pnpm verify:r1-guard --measure-px-ratio` 실행. 5% 마진 유지 확인
   - r1-guard 가 BBOX 측정에 alpha 반영 안 함 (raw quad size) → 영향 0 예상. 단, 실측 의무

### 박제 직후 cross-validate 1회 (필수)

본 ADR 박제 직후 Gemini cross-validate 1회 실행 — outcome / 합의 / 이견 / 고유발견 분류. 결과는 본 ADR §"Cross-validate" 섹션에 박제.

### Concrete Prediction

- Phase 2 PR 의 코드 변경 라인 수: 5~15 라인 (createBodyBillboard 함수 내부만)
- 회귀 가드 추가: ~50 라인 (browser-verify 확장 또는 신설)
- P11-B ADR `20260424-p11-b-lod-design.md` §미해결 1 → "Resolved (#391, 2026-05-02)" Amendment 추가 1 라인
- 사용자 D-T2 결과: 6 Phase 2 target cell 모두에서 mercury/venus 의 사각형 인지 회귀 0
- r1-guard `--measure-px-ratio` 변경 0 예상 (raw quad size 동일)

### Phase 분리 권장 (architect → 메인)

`phase_split_recommended: false`. Phase 2 자체가 단일 변경 (alpha mask 적용) — 추가 분리 불필요. 1 PR 로 완결 가능.

---

## 영향 범위

### 본 ADR 박제 PR (현재 PR — architect 단계)

- 신규: `docs/decisions/20260502-391-phase2-billboard.md` (본 파일)
- 신규: `docs/reports/391-forensic/output.json` (forensic SSoT)
- 갱신: `docs/decisions/20260424-p11-b-lod-design.md` §미해결 1 — Amendment 추가 ("Phase 2 #391 에서 alpha mask 정식 fix")

### Phase 2 구현 PR (developer 단계)

| 대상 | 파일 | 변경 규모 | DoD 대응 |
|---|---|---|---|
| alpha mask 적용 | `packages/core/src/scene/solar-system-scene.ts` `createBodyBillboard` | 5~15 라인 | 사각형 회귀 fix |
| 회귀 가드 | `apps/web/scripts/browser-verify-391-billboard.mjs` (신규) 또는 `browser-verify-379-lod.mjs` 확장 | ~50 라인 | 사용자 D-T2 |
| 단위 테스트 | `packages/core/src/render/lod.test.ts` 에 회귀 추가 | ~10 라인 | sub-pixel asteroid LOD 분기 회귀 0 |
| r1-guard 영향 평가 | 기존 `verify:r1-guard --measure-px-ratio` 실행 | 0 (스크립트) | 5% 마진 유지 확인 |
| P11-B ADR Amendment | `docs/decisions/20260424-p11-b-lod-design.md` §미해결 1 | 1~2 라인 | 정책 정식 fix 박제 |

### LOD 정책 / Scale Tier 관련 파일 (변경 0 예상)

P11-B ADR Concrete Prediction 1 (신규 body 추가 시 LOD 코드 변화 0) 의 역방향:

- `packages/core/src/render/lod.ts` — 변경 0 (alpha mask 는 scene 레이어 변경)
- `packages/core/src/render/lod-body-thresholds.ts` — 변경 0
- `packages/core/src/scene/tier.ts` / `tier-transition.ts` — 변경 0

검증:

```bash
git diff <Phase2 PR base>..<Phase2 PR head> -- \
  packages/core/src/render/ \
  packages/core/src/scene/tier.ts \
  packages/core/src/scene/tier-transition.ts \
  --numstat | awk '{s+=$1+$2} END {print s+0}'
# 기대값: 0
```

---

## 결과·재검토 조건

1. **alpha mask 적용 후 사용자 D-T2 에서 사각형 회귀 잔존** — 6 cell 중 1+ 에서 사각형 인지 시 alpha mask threshold 조정 (smoothstep 경계 0.4/0.5 → 0.45/0.5 등) 또는 후보 (나) sphere segment 강제 fallback 검토
2. **r1-guard `--measure-px-ratio` 5% 마진 위배** — alpha mask 가 BBOX 측정에 영향. 측정 방법 검토 (alpha 무시 raw BBOX 사용으로 정정) 또는 baseline 갱신 (사용자 합의 후)
3. **draw call / 메모리 회귀** — alpha mask 가 shader cache 무효화 또는 추가 GPU 비용 유발. P11-B DoD #1 회귀율 5% 임계 위배 시 `DynamicTexture` 1회 공유 패턴으로 정정. **저사양 모바일 환경 ALPHATEST 프레임 저하 관찰** (cross-validate 이견 수용 #3) — 일부 GPU 에서 Early-Z 비활성화로 미미한 프레임 저하 가능. iOS Safari 17.4+ #219 + 저사양 Android 기기 spot-check 의무
4. **#385 라운드 3 (mercury 700-800 / venus 800-900) 진입 시 본 fix 영향** (cross-validate 이견 수용 #1 박제):
   - 박제값 인하 → mercury/venus pxDiameter 더 작아짐 (e.g., mercuryScale 700 → mercury coverage ≈ 2.65px @ 320×568 dpr1)
   - **고정 임계 4px fallback 박제**: pxDiameter < 4px 진입 시 alpha mask 바이패스 (`opacityTexture = null` 또는 `transparencyMode = 0 OPAQUE`) + 사각형 quad 유지
     - 근거: `smoothstep(0.4, 0.5)` 의 0.53px 전이 구간이 hardware pixel 미만 → GPU sampler aliasing + sub-pixel flickering 발생. 사용자 D-T2 가 3px 이하 객체에서 원/사각형 구분 불가 → 사각형 quad 가 시각 안정성 우위
   - 4px 이상 cell: alpha mask 적용 → 원형 disc → 사용자 D-T2 회귀 차단
   - #385 architect 단계 진입 시 사전 시뮬레이션 의무 (mercury/venus pxDiameter 분포 매트릭스 + 4px fallback 진입 비율)
5. **R4 viewport-aware scaling 결정과의 결합** — R4 진입 시 본 ADR 의 alpha mask 가 R4 의 viewport 적응 박제값과 충돌하는지 사전 검토. 충돌 무 — alpha mask 는 mesh material 변경, R4 는 박제값 / scale 변경 (직교)
6. **장기 세션 메모리 누적** — `DynamicTexture` 64×64 가 24 body × 1 = 24 texture 또는 scene 1 공유 → 공유 패턴 강제 의무 (per-body texture 생성 시 메모리 24배)

---

## 암묵 전제 박제

- alpha mask 의 alpha 0 픽셀은 transparent — z-buffer 에 쓰이지 않아야 함. `mat.transparencyMode = 1 (ALPHATEST)` 적용 의무. ALPHABLEND (2) 사용 시 정렬 문제 발생 가능 (sub-pixel body 정렬 비용 증가)
- `DynamicTexture` 또는 procedural texture 는 scene 단위 1회 생성 후 모든 billboard material 이 공유. per-body texture 생성 금지 (메모리 24배)
- alpha mask 의 smoothstep 경계 (0.4/0.5) 는 quad 의 64.6% 면적이 opaque 원형 disc — 사용자 D-T2 가 사각형으로 인지하지 않을 수 있는 충분한 원형 외관
- billboard 의 `BILLBOARDMODE_ALL` 유지 — alpha mask 는 quad 자체에 적용되며 billboard 회전과 독립
- Phase 1 baseline `verify:379-lod` 의 sun=high 100% 회복은 본 ADR 의 변경과 무관 (alpha mask 는 low billboard 의 시각만 변경, LOD 분기는 변경 없음)

---

## 교차검증 반영 사항

**호출 결과**: 2026-05-02 cross-validate 1회 실행, outcome: **applied** (exit 0). 로그: `.claude/logs/cross-validate-architecture-20260503-024818.log`. 추가 명시 질문 follow-up 1회 (Babylon 기술 디테일 3종).

**Claude 편향 셀프 체크 통과 여부** (4종 체크리스트, 호출 전 기록):

- **낙관적 일정** OK — Phase 2 가 단일 변경 (alpha mask) 1 PR 완결
- **결합 간과** △ — alpha mask 가 r1-guard `--measure-px-ratio` 의 BBOX 측정에 영향 가능. Gemini 명시 질문 → 응답: 변경 0 예상 (raw quad size 동일, alpha 무시 BBOX). 의견 일치
- **폐기 프레이밍** OK — billboard quad 자체 폐기 안 함
- **순수주의** △ — alpha mask vs sphere segment 정당성. Gemini 명시 질문 → 응답: alpha mask 가 Babylon shader cache + 메모리 + draw call 측면에서 압도적 우위. 의견 일치 (후보 (나) 기각 정당화)

### 합의

Gemini 가 Claude 설계와 일치한 평가 (현재 ADR 즉시 유지):

1. **데이터 기반 문제 정의 + Phase 1 baseline 활용** — "체계적 기술 결정 모범 사례" 평가. Claude forensic 측정 방향성 정당
2. **(가) alpha mask 채택 + (나) (다) 기각** — "논리적이고 설득력 있음", "성숙한 아키텍처 설계 역량" 평가. 본 ADR §"단독 vs 조합 채택 결론" 정당성 재확인
3. **인터페이스 명확성** — `git diff numstat` 검증 명령 + 변경 vs 비변경 영역 분리 박제를 "매우 훌륭" 평가
4. **확장성** — "후속 #385 / R4 와의 결합 검토 + 가장 국소적 해결책 채택으로 변경 유연성 보존" 평가. §"결과·재검토 조건 #4 #5" 정당성 재확인
5. **명시 질문 (1) DynamicTexture 우위** — Babylon Uber-shader 캐시 활용 + 64×64 ≈ 16KB VRAM + 인스턴스 단일 공유 메모리 효율 근거. **본 ADR §"developer 단계 작업 명세" 옵션 A 채택 정당**
6. **명시 질문 (2) ALPHATEST 우위** — CPU 정렬 비용 0 + Z-buffer write 로 하드웨어 occlusion 처리. ALPHABLEND 의 24 body back-to-front 정렬 매 프레임 부하 회피. **본 ADR §"암묵 전제" 박제 정당**

### 이견 수용

Gemini 고유 발견 중 본 PR 범위 내 + 즉시 반영 가능한 항목:

1. **명시 질문 (3) — pxDiameter < 4px fallback 임계 + 구체 전략** — Gemini 고유 발견. `smoothstep(0.4, 0.5)` 의 0.53px 전이 구간이 1 hardware pixel 미만이라 GPU 텍스처 샘플러 aliasing + sub-pixel flickering 발생. **fallback**: pxDiameter < 4px 진입 시 `material.opacityTexture = null` (또는 `transparencyMode = 0 OPAQUE`) 로 alpha mask 연산 바이패스 + 사각형 quad 그대로 유지. 사용자 D-T2 가 3px 이하 객체에서 원/사각형 구분 불가 → 사각형 quad 가 시각적으로 더 안정. **본 ADR §"결과·재검토 조건 #4" 를 "고정 임계 4px fallback 박제" 로 갱신 + §"developer 단계 작업 명세" 에 fallback 분기 의무 추가**

2. **공유 텍스처 수명 주기 (dispose 책임)** — Gemini 누락 요소 지적. `scene.alphaMaskTexture` 캐시가 scene 파괴 시 함께 파기되도록 명시적 처리. 메모리 누수 방지. **본 ADR §"developer 단계 작업 명세" 에 "scene dispose 시 공유 텍스처 dispose 책임" 명시 추가**

3. **저사양 GPU ALPHATEST 성능** — Gemini 누락 요소 지적. 일부 저사양 GPU 에서 Early-Z 비활성화 → 미미한 프레임 저하 가능. **본 ADR §"결과·재검토 조건 #3" 에 "저사양 모바일 환경 ALPHATEST 프레임 저하 관찰 항목" 추가**

### Claude 재분석으로 기각한 Gemini 제안

(없음 — Gemini 핵심 발견 모두 본 PR 범위 내 + 즉시 수용 가능. 기각 항목 없음)

### 고유 발견 — 후속 분리

1. **alpha mask 디버그 모드 (LOD 적용 여부 시각화)** — Gemini 선택 사항 제안. `createBodyBillboard` 에 디버그 옵션 추가 (alpha mask 대신 빨간색 등 눈에 띄는 색으로 billboard 렌더링 → LOD 적용 여부 즉시 확인). 본 PR 비-범위 — 향후 LOD 디버깅 편의성 향상이지 사각형 회귀 fix 의 직접 메커니즘 아님. **후속 분리**:
   - 우선순위 **low**, 분리 박제 SSoT (사용자 D-T2 통과 후 메인이 이슈 생성):
     - 제목: `[#391 후속] LOD 디버그 모드 — billboard 적용 여부 시각화`
     - 본문: Gemini 디버그 옵션 스케치 + `Builds on: #391`
     - priority:low

### 박제 직후 cross-validate 1회 루틴 적용 결과 (volt #23)

**outcome: applied** (Gemini 정상 응답, exit 0). 단일 모델 편향 노출 효율 최대화 목적 달성:

- Gemini 5개 합의 항목으로 ADR 정당성 재확인
- Gemini 3개 고유 발견 중 3개 즉시 수용 (구체 임계 4px / 공유 텍스처 dispose / 저사양 GPU 관찰) — ADR 견고성 향상
- Gemini 1개 후속 분리 (디버그 모드) — 스코프 보호
- 기각 항목 0 — Claude 원안과 Gemini 평가가 핵심 결정에서 모두 일치 (alpha mask 채택, DynamicTexture, ALPHATEST)

---

## 참고

- forensic 측정: `docs/reports/391-forensic/output.json`
- Phase 1 baseline: `apps/web/scripts/__baselines__/lod-379.json`
- Phase 1 forensic: `docs/reports/379-forensic/output.json` (40 cell 매트릭스, Phase 1 전 박제)
- 선행 ADR: `docs/decisions/20260502-379-fix-decision.md` (Phase 1 식 정정 + Phase 분리 박제)
- 선행 ADR: `docs/decisions/20260502-379-lod-policy-review.md` (LOD 정책 분석)
- 선행 ADR: `docs/decisions/20260424-p11-b-lod-design.md` §미해결 1 (본 ADR 이 정식 fix)
- volt #23 (cross-validate 박제 직후 루틴), volt #49 (주석 계약 vs 구현 drift), volt #74 (DoD PASS ≠ 제품 동작), volt #77 (headless ≠ 실 브라우저)
