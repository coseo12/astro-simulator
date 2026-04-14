# 시간 역행 대칭성 (Velocity-Verlet)

## 보장 조건

astro-simulator의 Newton N-body 적분기는 **Velocity-Verlet (Leapfrog)** 을 사용한다.
이 적분기는 심플렉틱·시간 대칭이며, 다음 조건을 모두 만족할 때 전진+역행 왕복 시 초기 상태를 복원한다 (부동소수점 rounding 제외).

1. **고정 dt** — 전진 구간과 역행 구간의 서브스텝 dt 절댓값이 동일해야 한다.
   `NBodyEngine.advance(±T)` 내부의 `step_chunked(total, max_dt)`는
   `sub_count = ceil(|total|/max_dt)`, `sub_dt = total/sub_count`로 분할 —
   `advance(+T)`와 `advance(-T)`에서 `sub_count`가 같고 `sub_dt`의 부호만 반전되므로 조건 충족.
2. **동일한 힘 계산** — O(N²) 직접 합은 순서 독립 (덧셈 교환). 가속도는 위치에만 의존하고 속도와 무관.
3. **동일한 N, 동일한 질량** — 역행 중에 바디 추가·삭제·질량 변경 금지.

## 파괴 조건 (주의)

- 가변 dt (frame time에 따라 서브스텝 증감) → 대칭성 파괴.
  현재 구현은 `maxSubstepSeconds`로 dt 상한만 걸고 분할은 균등하므로 안전.
- 역행 중 바디 추가/삭제 (P2-B 소천체 동적 생성 시 주의)
- 감쇠·소산 항 추가 (공기저항, 조석 등) — 본질적으로 비가역
- GPU Compute 비결정적 reduction 순서 (P3에서 재검토 필요)

## 검증

단위 테스트: `packages/core/src/physics/time-reversal.test.ts`

| 시나리오                            | 서브스텝 dt | T         | 상대 오차 한계 |
| ----------------------------------- | ----------- | --------- | -------------- |
| 태양계 9체 ±10일                    | 1h          | 10 일     | < 1e-9         |
| 태양계 9체 ±1년                     | 10 min      | 365.25 일 | < 1e-9         |
| 분할 왕복 (5×2일 전진 + 5×2일 역행) | 1h          | 10 일     | < 1e-9         |

위치 오차는 해왕성 궤도(30 AU), 속도 오차는 수성 최대 속도(~60 km/s) 기준으로 정규화한다.

## 향후 영향

- **P2-C 파라미터 UI** — 파라미터(질량/속도) 변경 시점부터는 원 상태를 역행으로 복원 불가.
  UI에 "시간 리셋" 버튼으로 초기 상태 재로드 경로 제공 필요.
- **P3 WebGPU N-body** — 병렬 reduction이 비결정적이면 역행 왕복에서 bit-exact 복원 실패 가능.
  결정적 reduction 순서를 compute shader에 강제해야 한다.
- **감쇠 효과**는 본 프로젝트 P2~P4 범위에서 도입하지 않는다. 도입 시 역행 모드 비활성화 UI 필요.
