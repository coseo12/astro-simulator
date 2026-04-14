//! astro-simulator Newton N-body WASM 코어.
//!
//! P2-A 스캐폴딩 — 현재는 TS ↔ WASM 왕복만 검증.
//! 실제 Leapfrog/Verlet 적분기는 #85에서 구현.

use wasm_bindgen::prelude::*;

/// 스모크 테스트용 함수. TS 바인딩 왕복 검증 전용.
#[wasm_bindgen]
pub fn add(a: f64, b: f64) -> f64 {
    a + b
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_basic() {
        assert_eq!(add(1.5, 2.25), 3.75);
    }
}
