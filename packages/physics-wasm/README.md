# @astro-simulator/physics-wasm

Newton N-body WASM 코어. Rust + wasm-pack 기반. P2-A에서 심플렉틱 적분기(Leapfrog/Verlet)로 확장 예정.

## 요구 사항

- Rust 툴체인 (자동 관리: 루트 `rust-toolchain.toml` → 1.94.1 + `wasm32-unknown-unknown` target + minimal profile)
- `wasm-pack`: `cargo install wasm-pack` (권장, 재현성 최상)

## 빌드

```bash
pnpm -C packages/physics-wasm build          # Node 소비용 pkg/
pnpm -C packages/physics-wasm build:bundler  # 웹 번들러 소비용 pkg-bundler/
```

`pkg/`, `pkg-bundler/`, `target/`는 빌드 산출물이므로 커밋하지 않는다 (`.gitignore`).

## 테스트

```bash
pnpm -C packages/physics-wasm test   # Rust 측 cargo test는 별도: cd 후 cargo test
cargo test --manifest-path packages/physics-wasm/Cargo.toml
```

`pnpm test`는 사전에 `build`(nodejs target)를 실행한 뒤 vitest로 TS ↔ WASM 왕복을 검증한다.

## 구조

```
packages/physics-wasm/
├── Cargo.toml          # 크레이트 메타
├── src/lib.rs          # Rust 소스 (wasm-bindgen exports)
├── package.json        # 워크스페이스 멤버
├── vitest.config.ts    # TS 바인딩 테스트 설정
├── tests/              # TS 테스트 (pkg/ import)
├── pkg/                # wasm-pack 산출물 (gitignored)
└── target/             # cargo 빌드 캐시 (gitignored)
```

## 로드맵

- #84 스캐폴딩 (현재)
- #85 Leapfrog/Verlet 적분기 + 에너지 보존 테스트
- #86 TS 바인딩 확장 + 씬 통합
- #87 Kepler 대비 정확도 검증
- #88 역행 대칭성 테스트
