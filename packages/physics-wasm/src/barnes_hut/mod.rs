//! Barnes-Hut O(N log N) N-body 가속 (P3-A).
//!
//! 모듈 구성:
//!  - `octree`: AABB 분할 octree 빌더 + 노드 구조 (#130)
//!  - (P3-A 후속) COM/multipole + 트리 워크 force 계산은 #131에서 추가
//!  - (P3-A 후속) Velocity-Verlet 통합 + WASM 노출은 #132에서 추가

pub mod octree;
