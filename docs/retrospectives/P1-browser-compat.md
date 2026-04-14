# P1 브라우저 호환성 검증 보고서 (E4)

## 자동화 범위

Playwright headless Chromium은 하드웨어 GPU 미제공 환경이라 **WebGL2만 검증 가능**.
WebGPU 경로는 실제 브라우저 수동 확인이 필요하다.

## WebGL2 경로 (자동)

`pnpm verify:browser` 결과:

- `renderer · webgl2` HUD 텍스트 확인
- 8행성 + 궤도선 렌더링
- 카메라 조작 / 시간 진행 정상
- 콘솔/런타임 에러 0건

→ **WebGL2 경로 검증 통과** ✓

## WebGPU 경로 (수동)

### 검증 절차

1. `pnpm dev`로 개발 서버 기동
2. Chrome/Edge/Safari Tech Preview에서 `http://localhost:3000/ko` 접속
3. 개발자 도구 Console 확인:
   - `navigator.gpu.requestAdapter()` 반환 adapter 확인
   - HUD에 `renderer · webgpu` 표시 확인
4. DevTools Performance 탭에서 GPU 프로파일 활성 확인

### 지원 브라우저 (2026-04 기준)

| 브라우저                | WebGPU 상태              | 기대 렌더러             |
| ----------------------- | ------------------------ | ----------------------- |
| Chrome 120+ (데스크톱)  | 활성                     | `webgpu`                |
| Edge 120+ (데스크톱)    | 활성                     | `webgpu`                |
| Safari 17.4+ (macOS)    | 활성                     | `webgpu`                |
| Firefox 127+ (데스크톱) | 부분 활성 (Nightly 우선) | 환경 따라 webgpu/webgl2 |
| 모바일 Chrome/Safari    | 부분 활성                | 환경 따라               |

### Fallback 경로

`packages/core/src/engine/engine-factory.ts`:

- `navigator.gpu.requestAdapter()` 사전 확인
- adapter null 또는 WebGPU 초기화 실패 시 WebGL2로 자동 전환
- Babylon 내부 console.error 오염 없음

## 검증된 기능 (헤드리스 WebGL2)

- `pnpm verify:browser`: 25 PASS
- `pnpm verify:mobile`: 7 PASS (480×900)
- `pnpm verify:scale`: 9 PASS (스케일 전환)
- `pnpm verify:perf`: 5 시나리오, 헤드리스 30+ fps
- `pnpm verify:a11y`: 8 PASS, axe 위반 0건

## P2 계획

- CI에서 playwright `headless=chrome` 전환 실험 (GPU 하드웨어 필요 — 가능 시)
- BrowserStack / LambdaTest 등 클라우드 그리드 도입 검토
- WebGPU Compute 활용 후 성능 비교 벤치
