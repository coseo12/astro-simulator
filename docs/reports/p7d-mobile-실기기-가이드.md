# P7-D 실기기 측정 가이드 — iOS Safari 17.4+ Yoshida4 vs VV bench

> **#219 자동화 불가 영역 보조 인프라**. 사용자가 실 기기로 1-step 측정 진행 가능하도록 절차 + URL + 기록 양식 박제. 측정 결과는 본 가이드 옆 신규 리포트 (`p7d-mobile-실기기-<YYYYMMDD>.md`) 로 박제 후 #219 close.

---

## 측정 목적

P7-D (#209) Playwright iPhone 14 에뮬레이션으로 Yoshida4 / VV A/B 교차 측정 완료 (ratio 1.054, best-effort 범위). 다만 에뮬은 **실 모바일 WebGPU 런타임과 차이** — iOS Safari 17.4+ 실기기 측정으로 검증 필요.

## 측정 환경 (사전 준비)

### 필수

- **iOS 17.4+ 디바이스** (iPhone X 이상 권장 — WebGPU 지원 모델)
- **Safari 17.4+** (Settings → Safari → Advanced → Feature Flags → WebGPU **ON**)
- **로컬 dev 서버 또는 public URL** — 아래 §"URL 확보" 참조

### 권장

- **iPad WebGPU 호환** (옵션) — iPad 측정 병행 시 본 가이드 동일 적용
- **Android Chrome WebGPU 지원 기기** (옵션) — 비교군

## URL 확보 (3 옵션)

### A. LAN tunneling — ngrok (즉시 측정 가능, 권장)

```bash
# 1. dev 서버 시작 (별도 터미널)
pnpm dev

# 2. ngrok 설치 후 dev 서버 tunneling (https 자동)
brew install ngrok    # macOS
ngrok http 3000

# 3. 출력된 https URL 을 iOS Safari 주소창에 입력
#    예: https://abc123.ngrok-free.app/ko
```

`ngrok` 무료 플랜은 세션당 2시간 + 매번 새 URL. 측정 1회 완료에는 충분.

### B. LAN tunneling — localtunnel (간단)

```bash
# 1. dev 서버 시작
pnpm dev

# 2. localtunnel 설치 후 tunneling
npx localtunnel --port 3000

# 3. 출력된 https URL 을 iOS Safari 에 입력
```

### C. Public URL (배포 후)

P14 배포 phase 완료 후 (예: Vercel staging) `https://<deployed>` 직접 사용.

## 측정 시나리오 (3 URL)

dev 서버 또는 public URL 뒤에 다음 query parameter 를 붙여 진입:

### 1. Yoshida4 + N=200 (DoD 핵심)

```
<BASE_URL>/ko?engine=newton&integrator=yoshida4&belt=200&fps=1&bh=0
```

### 2. VV + N=200 (baseline 비교)

```
<BASE_URL>/ko?engine=newton&integrator=velocity-verlet&belt=200&fps=1&bh=0
```

### 3. Yoshida4 + N=10000 (best-effort)

```
<BASE_URL>/ko?engine=newton&integrator=yoshida4&belt=10000&fps=1&bh=0
```

> `?fps=1` 은 HUD 좌하단에 fps 카운터를 표시. 안 보이면 `?debug=draw-calls` 도 같이 추가.

## 측정 절차

### Step 1. 진입 확인

- HUD 우상단 `renderer · webgpu` 박지 확인 (Safari 17.4+ WebGPU 활성)
- `webgl2` 가 박지면 Safari Feature Flag 재확인

### Step 2. 안정화 대기

- URL 진입 후 **30초 idle** — 초기 wasm 로드 + LOD 정착 + 페이지 폰트 캐싱
- HUD fps 가 안정값 (편차 ±2fps) 도달까지 대기

### Step 3. 측정 (60초)

- HUD fps 의 1초 평균 값을 1분간 5회 (12s 간격) 기록
- iPhone 발열 / fps drop 발생 시 별도 기록

### Step 4. 시나리오 전환

- 다음 시나리오 URL 로 이동
- Step 1~3 반복

## 기록 양식 (사용자가 새 리포트 파일로 박제)

`docs/reports/p7d-mobile-실기기-<YYYYMMDD>.md` 신규 파일로 박제:

````markdown
# P7-D 실기기 iPhone Safari 17.4+ 측정 — YYYY-MM-DD

## 환경

- **기종**: <iPhone X 이상 모델명>
- **OS**: iOS <17.4+ 버전>
- **브라우저**: Safari (iOS 내장)
- **WebGPU**: <ON / OFF — HUD renderer 박지 박제>
- **네트워크**: <ngrok / localtunnel / public URL>
- **측정 방법**: HUD fps 카운터 (`?fps=1` 옵트인) — 1초 평균 12s × 5회

## 결과

### 시나리오 1 — Yoshida4 + N=200

| 측정 # | fps  | 비고                |
| ------ | ---- | ------------------- |
| 1 (0s) | <값> | <초기 안정화 직후>  |
| 2 (12s)| <값> |                     |
| 3 (24s)| <값> |                     |
| 4 (36s)| <값> |                     |
| 5 (48s)| <값> |                     |
| **평균** | **<평균>** | <DoD 충족 여부> |

### 시나리오 2 — VV + N=200

(동일 양식)

### 시나리오 3 — Yoshida4 + N=10000 (best-effort)

(동일 양식)

## 비교

| 항목                  | 측정값                      | DoD 기준                 | 판정       |
| --------------------- | --------------------------- | ------------------------ | ---------- |
| Yoshida4 vs VV ratio  | <yoshida 평균 / vv 평균>    | ≥ 0.90 (P7-D 에뮬 1.054) | ✅ / ❌    |
| N=10000 크래시 없음   | <fps>                       | 크래시 안 함             | ✅ / ❌    |
| WebGPU 경로 활성      | <renderer 박지>             | webgpu                   | ✅ / ❌    |

## 관찰 사항 (선택)

- 발열 / 배터리 드레인
- iPhone 회전 / 멀티태스킹 영향
- Safari WebGPU 의 dropped frame 패턴
````

## 측정 완료 후

1. `docs/reports/p7d-mobile-실기기-<YYYYMMDD>.md` 박제 + PR
2. PR 본문에 위 비교 표 인용
3. **#219 close** + close 코멘트에 본 가이드 + 결과 리포트 cross-link
4. 본 가이드 (`p7d-mobile-실기기-가이드.md`) 는 향후 R-Phase 별 실기기 재측정 SSoT 로 유지

## 측정 미수행 시

- #219 OPEN 유지
- 본 가이드만 박제 (close 안 함)
- P14 배포 phase 완료 또는 사용자 권한 영역 도달 시 트리거 발동

## 관련

- 발화: PR [#218](https://github.com/coseo12/astro-simulator/pull/218) (`72650ce`)
- QA 코멘트: https://github.com/coseo12/astro-simulator/pull/218#issuecomment-4273679332
- Reviewer Q4: https://github.com/coseo12/astro-simulator/pull/218#issuecomment-4273649075
- 본 이슈: #219
- ADR: P7-D (#209) — 에뮬레이션 기준 SSoT (실기기 검증 후속)
