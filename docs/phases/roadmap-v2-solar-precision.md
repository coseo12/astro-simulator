# 로드맵 v2 — 태양계 정밀화 (Solar Precision)

> **Status**: Active
> **박제일**: 2026-04-20 (P10-A #268)
> **Supersedes**: `roadmap-v1-cosmic-scale.md` 의 P8 이후 (관측가능우주 확장) 는 **보류**
> **Precedes**: P10 Fact Audit 완료 후 P11~P16 순차 진행

---

## 재조정 배경

v1 로드맵은 "관측가능우주 확장"(P1 → P7) 을 최종 목표로 설정했다. P1~P9 구현 과정에서 다음 현실이 누적되었다:

1. **태양계 내부 정밀도 부채** — IAU 2015 대조 미수행, 과장 배수 암묵 상수, 공식 uncertainty 부재.
2. **시각 원칙 부재** — 과장 모드와 사실 모드 토글 없음. 사용자는 과장된 화면만 접근 가능.
3. **모바일 경로 경직** — 모바일 감지 후 단순 폐기/경고 → 재도전 기회 차단.
4. **신규 Phase 확장 이전의 basis 정비 필요** — 상위 원칙("Fact-First, Visual-Second") 박제가 선행되어야 후속 Phase 가 일관.

v2 는 **태양계 정밀도·시각 원칙·기술 부채**를 먼저 정리한 뒤 위성·고리·소행성·배포로 확장한다. v1 의 은하/우주거대구조 확장은 본 프로젝트 생애주기 내에서는 **보류** (재검토는 v3 범주).

---

## Phase 개요

| Phase   | 테마                        | 규모    | 상태        | 비고                                                                         |
| ------- | --------------------------- | ------- | ----------- | ---------------------------------------------------------------------------- |
| **P10** | Fact Audit + 시각 원칙 정비 | 9~13d   | **진행 중** | 상위 원칙 박제 + 데이터 감사 + `educational`/`scientific` 토글 + 정확도 이슈 |
| **P11** | Visual Foundation           | 6~10d\* | 계획 중     | Floating Origin + LOD 3단계 + distance scale + **tier preset 1급 설계**      |
| **P12** | Texture Pipeline            | 5~8d    | 계획 중     | 30+ body PBR + normalMap + cloud layer + ring detail (Cassini 간극 등)       |
| **P13** | 토성계                      | 5~7d    | 계획 중     | 주요 위성 9 (Titan/Enceladus 등) + 고리 정밀화 + 공명 구조                   |
| **P14** | 천왕성·해왕성계             | 4~6d    | 계획 중     | 주요 위성 각 5~6 + 자전축 기울기 특성 + 고리 암고리                          |
| **P15** | 소행성대 + 카이퍼대         | 5~8d    | 계획 중     | JPL SBDB 수십만 샘플 + BH N-body 폴백 + GPU compute 통합                     |
| **P16** | 배포 + 기술 부채 청산       | 3~5d    | 계획 중     | Vercel/Netlify 공식 배포 + CI 성능 게이트 + `docs/reports/` 자동 갱신        |

**총: 32~47 영업일**

> \* **P11 일정 경고** (Gemini 2차 교차검증 수용, 2026-04-20): Floating Origin + LOD 3단계 + tier preset 이 **아키텍처 근간 변경 3건** 을 동시 포함. 6~10d 는 기준 추정이며, **PM 착수 시 Floating Origin 복잡도 실측 기반 재조정** 필수. 이는 낙관적 일정 편향 방어를 위한 구조적 경고.

---

## 의존 관계

```
P10 (Fact Audit)
   ↓
P11 (Visual Foundation)
   ↓
P12 (Texture Pipeline)
   ↓
P13 (토성계) ─┐
P14 (천/해계) ─┼── 병렬 가능 (P12 까지 선행 필수)
P15 (소행성) ─┘
   ↓
P16 (배포 + 부채 청산)
```

---

## P10 — Fact Audit + 시각 원칙 정비 (진행 중)

**계약 문서**: [p10-plan.md](p10-plan.md) (#266 merged)

핵심 산출물:

- `docs/principles/fact-first.md` — 상위 원칙 박제 (P10-A #268)
- `docs/decisions/20260420-mobile-support-suspension.md` — 모바일 보류 + 재도전 조건 (P10-A)
- `packages/shared/src/types/celestial.ts` — `dataSource`/`lastVerified`/`uncertainty`/`epoch`/`colorSource` 필드 추가 (P10-B)
- `packages/shared/src/constants/solar-system.ts` — IAU 2015 전수 대조 + 수정 (P10-B)
- 뷰 모드 스토어 + URL sync + 배지 UI + 온보딩 + 크레딧 뷰 (P10-C)
- #261 / #263 / #255 정확도 이슈 소화 (P10-D)
- P9 baseline 대비 벤치 회귀율 < 5% (P10-D.5)

---

## P11 — Visual Foundation (계획)

**핵심 산출물**:

- **Floating Origin** — 카메라 원점을 주변 body 에 동적으로 이동시켜 float32 좌표 정밀도 유지. 태양계 + 위성 뷰에서 jitter 해소.
- **LOD 3단계** — `high` (근거리, full mesh + PBR) / `mid` (중거리, impostor 텍스처) / `low` (원거리, billboard). 카메라 거리 기준 자동 전환.
- **Distance Scale 모드** — `log-distance` / `linear-distance` / `uniform-distance` 3종 모드. `scientific` 모드에서 특히 유용.
- **Tier Preset 1급 설계** — `tier-a`(데스크톱 고성능 GPU) / `tier-b`(데스크톱 중급 또는 고성능 모바일) / `tier-c`(모바일 또는 저전력). `is-mobile.ts` 를 `detect-gpu-tier.ts` 로 리팩토링. 각 tier 는 (LOD 임계, 파티클 상한, shadow 해상도, AA) 프로파일.

### Tier Preset 스케치 (P10-A 박제 — P11 구현 시 참조)

| Tier       | GPU 조건 (detect 기준)                   | LOD 임계 | 파티클 상한 | Shadow 해상도    | AA      | 대상                       |
| ---------- | ---------------------------------------- | -------- | ----------- | ---------------- | ------- | -------------------------- |
| **tier-a** | discrete GPU, WebGPU, VRAM > 4GB         | 보수적   | 50k+        | 2048²            | MSAA 8× | 데스크톱 고성능            |
| **tier-b** | integrated GPU + WebGPU, 또는 M1+ 태블릿 | 중간     | 20k         | 1024²            | MSAA 4× | 데스크톱 중급, 고급 모바일 |
| **tier-c** | WebGL2 fallback, 또는 저전력 모바일      | 공격적   | 5k          | 512² 또는 비활성 | FXAA    | 모바일, 저전력 데스크톱    |

tier 감지는 `navigator.gpu` + `GPUAdapter.requestAdapterInfo()` + `devicePixelRatio` + `hardwareConcurrency` 조합. 명시 override (`?tier=c`) 지원으로 사용자가 강제 전환 가능. 상세 설계는 P11 착수 시 ADR 작성.

- **모바일 Graceful Degradation 모달** — `tier-c` 진입 시 자동 안내 + `scientific` 디폴트 + 파티클 축소 안내 (모바일 보류 ADR §"Graceful Degradation UX" 상세).

**관련 이슈**: #256 (에너지 보존 DoD), #247 (Osculating 동기화 — P9 흡수되었으나 LOD 전환 시 재검증 필요).

---

## P12 — Texture Pipeline (계획)

**핵심 산출물**:

- **PBR 머티리얼** — 30+ body (태양/행성/주요 위성) albedo + roughness + metalness 맵.
- **Normal 맵** — 지형 디테일 (화성 올림푸스 화산, 달 크레이터, Iapetus 이분경계).
- **Cloud Layer** — 지구/금성/목성/토성 투명 cloud shell (자전 속도 차등).
- **Ring Detail** — 토성 Cassini 간극 + 목성 Halo/Main/Gossamer 세분화 (P9 기반 확장).
- **텍스처 라이선스 감사** — NASA/ESA/JAXA public domain 확인, attribution JSON 에 박제.

**관련 이슈**: #257 (고리 shader 섀도우 매핑 — 본 Phase 로 이관).

---

## P13 — 토성계 (계획)

**핵심 산출물**:

- **주요 위성 9**: Mimas, Enceladus, Tethys, Dione, Rhea, Titan, Hyperion, Iapetus, Phoebe.
- **공명 구조**: Mimas-Tethys 4:2, Enceladus-Dione 2:1, Titan-Hyperion 4:3.
- **고리 정밀화**: A/B/C/F 고리 세분화, Cassini 간극, Encke 간극, 양치기 위성(Prometheus/Pandora).
- **궤도 정확도**: 주기 ±1%, 공명 잔차 ±1% (P9 Galilean 기준 계승).

---

## P14 — 천왕성·해왕성계 (계획)

**핵심 산출물**:

- **천왕성 위성 5**: Miranda, Ariel, Umbriel, Titania, Oberon. 자전축 97.8° 기울기 특성 반영.
- **해왕성 위성 2**: Triton (역행 궤도), Nereid (고이심률 0.75).
- **고리**: 천왕성 13고리 (암고리 중심), 해왕성 5고리 (아크 구조).
- **해왕성 트로이 소행성**: L4/L5 대표 샘플 10+ (P15 선행 연동).

---

## P15 — 소행성대 + 카이퍼대 (계획)

**핵심 산출물**:

- **JPL SBDB (Small-Body Database) 샘플**: 수십만 급 N-body. BH (Barnes-Hut) + WebGPU compute.
- **Kirkwood 간극** 시각화: 주기 2:1, 3:1, 5:2, 7:3 공명.
- **카이퍼대 객체**: Pluto, Eris, Makemake, Haumea + Plutinos/cubewanos 샘플.
- **GPU compute 폴백**: WebGPU 미지원 시 WASM BH N-body + tier-c 자동 축소.

**관련 이슈**: v1 로드맵 P3 의 카이퍼대·오르트 구름을 본 Phase 로 승격 (규모 축소 — 오르트 구름은 보류).

---

## P16 — 배포 + 기술 부채 청산 (계획)

**핵심 산출물**:

- **Vercel/Netlify 공식 배포**: `main=production` / `develop=staging` / PR=preview (CLAUDE.md 브랜치 전략 완성).
- **CI 성능 게이트**: `bench-scene*.mjs` 회귀율 ≥ 5% 시 자동 차단.
- **`docs/reports/` 자동 갱신**: 각 Phase 완료 시 성능·정확도 리포트 자동 생성.
- **기술 부채 청산**: TODO 주석 → 이슈 승격, unused export 제거, 타입 strict 강화.

---

## 비-범위 (v2 에서 다루지 않음)

- ❌ 항성 카탈로그 (Gaia DR3) → v1 P4 의 근거리 100광년 확장. **보류** (v3 후보).
- ❌ 외계행성 → v1 P5. **보류**.
- ❌ 은하/은하단/우주거대구조 → v1 P6/P7. **보류**.
- ❌ 가상/이론 천체 (웜홀 등) → v1 P8. **보류**.

---

## 참조

- v1 로드맵: [roadmap-v1-cosmic-scale.md](roadmap-v1-cosmic-scale.md) — 초기 설계 및 은하/우주거대구조 확장 원안
- P10 계약: [p10-plan.md](p10-plan.md) (#266 merged)
- 원칙: [../principles/fact-first.md](../principles/fact-first.md)
- 모바일 보류 ADR: [../decisions/20260420-mobile-support-suspension.md](../decisions/20260420-mobile-support-suspension.md)

## §Amendments

| 날짜       | 변경 요약                                                                                           | 근거 PR/이슈                  |
| ---------- | --------------------------------------------------------------------------------------------------- | ----------------------------- |
| 2026-04-20 | P11 일정에 "\*" 각주 + PM 착수 시 재조정 필수 경고 — Gemini 2차 교차검증 낙관적 일정 편향 징후 수용 | 본 PR (P10-A 보강) / volt #29 |
