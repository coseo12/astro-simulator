# 적분기 선택 아키텍처 (P7-B #207)

## 배경

P7-A (#206) 에서 Yoshida 1990 4차 심플렉틱 적분기를 WASM 코어에 추가했다.
P7-B 에서는 사용자/QA 가 Velocity-Verlet ↔ Yoshida4 를 **초기화 시점**에 선택할 수 있는
API 와 URL 파라미터를 도입한다.

기본값 전환(VV → Yoshida4)은 P7-D 벤치 (에너지 드리프트 개선 % + 비용 3× 수용 여부) 결과 후
별도 ADR Amendment 로 결정한다. 현 시점 기본값은 VV 유지 (후방 호환).

## 선택지 (`IntegratorKind`)

TS 타입(`packages/core/src/physics/nbody-engine.ts`):

```ts
export type IntegratorKind = 'velocity-verlet' | 'yoshida4';
```

WASM 매핑(`packages/physics-wasm/src/integrator.rs::IntegratorKind`):

| IntegratorKind    | u8  | 차수 | kick/step | 비용 (VV 대비) |
| ----------------- | --- | ---- | --------- | -------------- |
| `velocity-verlet` | 0   | 2    | 1         | 1.0× (기본)    |
| `yoshida4`        | 1   | 4    | 3         | ≈3.0×          |

향후 추가 후보(현재 미구현, `2` 예약): RK8 passive · PEFRL · Blanes-Moan 6차.

## URL 파라미터

- `?integrator=velocity-verlet` — 공식명
- `?integrator=verlet` — 별칭 (정확히 1개)
- `?integrator=yoshida4` — 공식명
- 미지정 / `?integrator=` — `velocity-verlet` (기본값)
- 알 수 없는 값 — `velocity-verlet` 폴백 + `console.warn` (토스트 비표시)
- 대소문자 무시

파서: `apps/web/src/core/parse-integrator.ts` (Vitest 단위 테스트 동반).

> 약어(`vv`/`yo4`)는 도입하지 않는다. 문서화 비용 + 사용자 혼란 최소화.

## 런타임 핫스왑 — 비지원

`NBodyEngine` 은 생성자에서만 `integrator` 를 받는다. 다음은 **의도된 제약**이다:

- `setIntegrator(kind)` 같은 public 메서드를 노출하지 않는다.
- UI 토글 버튼도 제공하지 않는다 (`?integrator=` 는 디버그 파라미터 성격).
- 런타임 전환이 필요하면 페이지 reload (URL 변경) 경로를 사용한다.

이유:

1. **심플렉틱 적분기 전환은 에너지 오프셋을 유발**한다 — 중간 스위치 시 궤도가 점프한다.
2. **Yoshida4 + EIH 1PN 조합의 장기 안정성은 보장되지 않음** (속도의존력). 런타임 스위치를 허용하면
   디버그 과정에서 의도치 않게 비수렴 경로에 진입할 수 있다. 초기화 시점 고정으로 회피.
3. WASM 쪽은 `set_integrator(u8)` 를 노출하지만 TS 계약상 생성 직후 1회만 호출한다.

## HUD 배지 가시성

`?integrator=` URL 이 **명시된 경우에만** HUD 우상단에 배지가 표시된다:

```
integrator · yoshida4
```

- `data-testid="integrator-badge"` — E2E 선택자.
- `window.__simIntegrator: IntegratorKind` — 스크립트 폴링용 전역 노출 (read-only).
- 기본값(VV, URL 미지정) 시 배지 숨김 — 일반 사용자 노출 UX 간섭 방지.

## 조합 — `?gr=eih&integrator=yoshida4`

- 파서 2개는 독립이라 자동 성립.
- P7-B DoD: 단기 (1 주기) NaN 미발생 + perihelion ±5% 만 검증.
- **장기 (수년+) 안정성 미검증** — 심플렉틱은 위치-운동량 분리 해밀토니안을 가정하는데
  1PN/EIH 는 속도의존 가속도라 이론적 보장 없음. P7-D 벤치에서 정량 측정 예정.

## 재검토 조건

- P7-D 벤치 결과 Yoshida4 에너지 드리프트 개선 ≥ 10× (고정 dt 동일 조건) 확인 시 기본값 전환 검토.
- 장기 perihelion 회귀(예: 수성 1000년) ±5% 유지 재측정 결과 후 ADR Amendment.
- 기존 사용자/자동화 스크립트 호환 영향도 조사 (URL 파라미터 확산 정도).

## 관련 문서

- ADR: `docs/decisions/20260418-p7-integrator-upgrade.md` (P7-A 에서 작성)
- 이슈: #206 (P7-A Yoshida4 구현), #207 (P7-B API/URL), #211 (P7 마스터)
- 소스:
  - `packages/physics-wasm/src/integrator.rs`
  - `packages/core/src/physics/nbody-engine.ts`
  - `packages/core/src/scene/solar-system-scene.ts`
  - `apps/web/src/core/parse-integrator.ts`
  - `apps/web/src/components/sim-canvas.tsx`
  - `apps/web/src/components/layout/hud-corners.tsx`
  - `scripts/browser-verify-integrator.mjs`
