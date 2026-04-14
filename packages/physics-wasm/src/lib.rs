//! astro-simulator Newton N-body WASM 코어.
//!
//! - `add`: TS ↔ WASM 왕복 스모크 (#84)
//! - `nbody`: Velocity-Verlet 적분기 + O(N²) 중력 합 (#85)
//!
//! 좌표계: SI 단위 (m, kg, s). 위치/속도는 3N-flat `Vec<f64>` (SoA 아닌 AoS-flat).
//! 심플렉틱 특성상 고정 dt에서 에너지 오차가 장기적으로 bounded oscillation.

use wasm_bindgen::prelude::*;

pub mod nbody;

/// 스모크 테스트용 함수. #84.
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
