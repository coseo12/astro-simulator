/**
 * #1234 C2-H3 — 장면 부팅 **단계 계측 훅** (타입 + 계약).
 *
 * ## 왜 필요한가
 *
 * `shader-pixel-guard` 의 `bootstrapScene` 은 `window.__solarScene` 노출까지를 20 s 안에
 * 기다린다. C1 계측이 실패 표본 1건을 잡았는데 (run 35489961871 attempt 3), 그 시점 상태가
 * `readyState=complete` · `__simCore="object"` · **`__solarScene="undefined"`** 였다 —
 * 페이지도 번들도 다 떴고 초기화 effect 도 이미 돌기 시작했는데 장면만 안 나온 것이다.
 * 그 구간 안쪽 (엔진 생성 / 어댑터 / mesh 생성 / 물리 엔진 빌드) 은 **하나의 블랙박스**였다.
 *
 * ## 계약
 *
 * - `onBootPhase(name)` 는 **`name` 이 가리키는 구간이 방금 끝났다**는 뜻이다 (시작 아님).
 *   소요 시간은 소비자가 **직전 호출과의 차**로 계산한다.
 * - core 는 시각을 재지도 저장하지도 않는다 — `performance.now()` 의 소유권과 dev 게이트는
 *   전적으로 소비자 (apps/web `boot-phases.ts`) 에 있다. core 가 전역을 잡으면 prod 번들에서
 *   DCE 되지 않고, 계측 정책 (상한·노출 방식) 이 두 곳으로 갈린다.
 * - 미지정이면 호출 0 이다 (`onBootPhase?.(…)`). 즉 **계측 비활성 = 도입 전과 같은 경로**.
 * - 훅은 동기·무예외여야 한다. core 는 방어 try/catch 를 두지 않는다 — 진단이 조용히
 *   삼켜지면 「구간이 없다」와 「훅이 터졌다」가 같은 로그로 보인다.
 *
 * ## 비-계약
 *
 * 이름 문자열은 **진단용 라벨**이지 API 가 아니다. 판정·임계·시나리오는 이 훅을 읽지 않는다
 * (#1234 계약 C5 — 계측은 관측만 한다).
 */
export type BootPhaseHook = (name: string) => void;
