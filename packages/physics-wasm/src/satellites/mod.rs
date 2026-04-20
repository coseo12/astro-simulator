//! 위성 운동 측정 헬퍼 (P9 #254).
//!
//! ADR: `docs/decisions/20260420-p9-galilean-laplace-rings.md` §결정 #1 (5체 N-body),
//!      §결정 #3 (Osculating early return), §결정 #5 (peak-to-peak/2).
//!
//! 모듈 구성:
//!  - `laplace`: Galilean 4위성 공전주기 + Laplace 1:2:4 공명 측정
//!  - `osculating`: state vector → Kepler 6원소 (Jupiter-centric)

pub mod laplace;
pub mod osculating;
