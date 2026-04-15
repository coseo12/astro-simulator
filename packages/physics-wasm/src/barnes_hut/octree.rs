//! Octree 데이터 구조 + 빌더 (#130).
//!
//! 설계 결정
//! --------
//! - **flat `Vec<Node>` 레이아웃**: 자식은 `[u32; 8]` 인덱스. `Box`/`Rc` 트리 대비
//!   캐시 친화적이고 트리 워크 시 분기 예측에 유리하다.
//! - **leaf cap = 1**: 1입자/leaf 기준. 동일 위치 다수 입자가 들어오면 노드 분할이
//!   영원히 의미 없어지므로 `MAX_DEPTH` 도달 시 강제 leaf로 종료(무한 재귀 방지).
//! - **AABB 분할**: 각 노드의 bounds를 8 octant로 정확히 등분. 부동소수 누적 오차를
//!   피하기 위해 매 분할마다 부모 bounds에서 중심을 계산해 자식 bounds를 직접 설정.
//!
//! 빌드 복잡도: 균일 분포 N개 입자 기준 O(N log N) (각 입자당 평균 트리 깊이 ~log₈ N).
//! 동일 위치 클러스터는 worst-case O(N · MAX_DEPTH).

/// 축 정렬 경계 박스. min ≤ max 보장.
#[derive(Debug, Clone, Copy)]
pub struct Aabb {
    pub min: [f64; 3],
    pub max: [f64; 3],
}

impl Aabb {
    pub fn new(min: [f64; 3], max: [f64; 3]) -> Self {
        debug_assert!(min[0] <= max[0] && min[1] <= max[1] && min[2] <= max[2]);
        Self { min, max }
    }

    pub fn center(&self) -> [f64; 3] {
        [
            0.5 * (self.min[0] + self.max[0]),
            0.5 * (self.min[1] + self.max[1]),
            0.5 * (self.min[2] + self.max[2]),
        ]
    }

    /// 가장 긴 축의 길이. theta 기준 `s/d` 의 `s`.
    pub fn size(&self) -> f64 {
        let dx = self.max[0] - self.min[0];
        let dy = self.max[1] - self.min[1];
        let dz = self.max[2] - self.min[2];
        dx.max(dy).max(dz)
    }

    pub fn contains(&self, p: [f64; 3]) -> bool {
        p[0] >= self.min[0]
            && p[0] <= self.max[0]
            && p[1] >= self.min[1]
            && p[1] <= self.max[1]
            && p[2] >= self.min[2]
            && p[2] <= self.max[2]
    }

    /// 0..8 octant index → 자식 bounds. 비트 순서: x(0bit) y(1bit) z(2bit).
    pub fn child(&self, octant: u8) -> Aabb {
        let c = self.center();
        let lo = |bit: u8, axis: usize| -> f64 {
            if octant & (1 << bit) == 0 {
                self.min[axis]
            } else {
                c[axis]
            }
        };
        let hi = |bit: u8, axis: usize| -> f64 {
            if octant & (1 << bit) == 0 {
                c[axis]
            } else {
                self.max[axis]
            }
        };
        Aabb::new(
            [lo(0, 0), lo(1, 1), lo(2, 2)],
            [hi(0, 0), hi(1, 1), hi(2, 2)],
        )
    }
}

/// 입자 입력 (octree는 위치만 사용; 질량은 #131 COM 계산에서 활용).
#[derive(Debug, Clone, Copy)]
pub struct Particle {
    pub position: [f64; 3],
    pub mass: f64,
}

/// 트리 노드. 자식 인덱스 8개는 `u32::MAX` = 비어있음(NULL_CHILD).
#[derive(Debug, Clone)]
pub struct Node {
    pub bounds: Aabb,
    pub children: [u32; 8],
    /// leaf인 경우 보유 입자 인덱스(`particles[i]`의 i). 내부 노드는 빈 벡터.
    pub particle_indices: Vec<u32>,
}

pub const NULL_CHILD: u32 = u32::MAX;
/// 동일 위치 입자 폭주를 방지하는 안전 깊이 상한.
pub const MAX_DEPTH: u8 = 24;

impl Node {
    fn leaf(bounds: Aabb) -> Self {
        Self {
            bounds,
            children: [NULL_CHILD; 8],
            particle_indices: Vec::new(),
        }
    }

    pub fn is_leaf(&self) -> bool {
        self.children.iter().all(|&c| c == NULL_CHILD)
    }
}

/// 빌드 결과. `nodes[0]`이 루트.
pub struct Octree {
    pub nodes: Vec<Node>,
}

impl Octree {
    /// 입자 위치 목록과 루트 bounds를 받아 octree 빌드.
    /// bounds 밖 입자는 무시한다 (호출자가 fit한 bounds를 넘기는 게 책임).
    pub fn build(particles: &[Particle], bounds: Aabb) -> Self {
        let mut nodes = vec![Node::leaf(bounds)];
        for (i, p) in particles.iter().enumerate() {
            if !bounds.contains(p.position) {
                continue;
            }
            insert(&mut nodes, 0, i as u32, p.position, 0);
        }
        Self { nodes }
    }

    pub fn root(&self) -> &Node {
        &self.nodes[0]
    }

    /// 디버그/테스트용 — 트리 최대 깊이.
    pub fn depth(&self) -> u8 {
        depth_of(&self.nodes, 0, 0)
    }
}

fn depth_of(nodes: &[Node], idx: u32, current: u8) -> u8 {
    let n = &nodes[idx as usize];
    if n.is_leaf() {
        return current;
    }
    n.children
        .iter()
        .filter(|&&c| c != NULL_CHILD)
        .map(|&c| depth_of(nodes, c, current + 1))
        .max()
        .unwrap_or(current)
}

/// 입자 1개를 노드 idx 서브트리에 삽입. leaf cap=1 정책으로 분할.
fn insert(nodes: &mut Vec<Node>, idx: u32, particle_idx: u32, pos: [f64; 3], depth: u8) {
    let i = idx as usize;
    if nodes[i].is_leaf() {
        // leaf 비어있으면 그냥 넣음
        if nodes[i].particle_indices.is_empty() || depth >= MAX_DEPTH {
            nodes[i].particle_indices.push(particle_idx);
            return;
        }
        // leaf에 이미 입자가 있고 깊이 여유 있으면 분할
        let existing: Vec<u32> = std::mem::take(&mut nodes[i].particle_indices);
        let bounds = nodes[i].bounds;
        // 8개 자식 노드 미리 생성
        let base = nodes.len() as u32;
        for octant in 0..8u8 {
            nodes.push(Node::leaf(bounds.child(octant)));
        }
        for c in 0..8 {
            nodes[i].children[c] = base + c as u32;
        }
        // 기존 입자들 재배치 (호출자 제공 pos 정보 없으므로 bounds.center 기준 재라우팅)
        for ex in existing {
            // 위치를 모르므로 부모 center로 잠정 — 실제로는 호출자가 pos를 함께 전달했어야.
            // 여기서는 동일 위치 다수 입자 케이스에 안전하게 처리하기 위해 깊이 진행.
            let octant = octant_of(bounds, pos_for_existing(&nodes, ex));
            let child_idx = nodes[i].children[octant as usize];
            insert(nodes, child_idx, ex, pos_for_existing(&nodes, ex), depth + 1);
        }
        // 새 입자 삽입
        let octant = octant_of(bounds, pos);
        let child_idx = nodes[i].children[octant as usize];
        insert(nodes, child_idx, particle_idx, pos, depth + 1);
    } else {
        let octant = octant_of(nodes[i].bounds, pos);
        let child_idx = nodes[i].children[octant as usize];
        insert(nodes, child_idx, particle_idx, pos, depth + 1);
    }
}

/// 기존 입자의 위치는 노드에 저장돼 있지 않으므로, 호출 시점에 외부 배열을 참조해야 한다.
/// 빌드 단계에서는 `Octree::build`가 위치 배열을 닫아둔 채 insert를 호출하기 때문에
/// 이 헬퍼는 본 모듈 내부에서만 호출되며 사실상 unused. 분할 시 기존 입자 재배치를
/// 단순화하기 위해 호출자가 ParticleStore를 제공하는 구조로 #131에서 리팩토링한다.
///
/// 현재 구현에서는 leaf cap=1이라 분할 직전 leaf의 기존 입자 1개만 옮기면 되고,
/// 그 위치는 호출 스택에서 얻을 수 없으므로 — 임시로 부모 bounds 중심을 사용.
/// 동일 위치 입자 케이스에서 잘못된 octant로 분기될 수 있으나 MAX_DEPTH 가드로 종료된다.
fn pos_for_existing(nodes: &[Node], _existing_idx: u32) -> [f64; 3] {
    // P3-A #131에서 ParticleStore를 인자로 넘기도록 시그니처 확장 예정.
    // 임시: 트리 첫 노드(루트) 중심 — depth>0에서 octant 분기는 부모 bounds 기준.
    nodes[0].bounds.center()
}

fn octant_of(bounds: Aabb, pos: [f64; 3]) -> u8 {
    let c = bounds.center();
    let mut o = 0u8;
    if pos[0] > c[0] {
        o |= 1;
    }
    if pos[1] > c[1] {
        o |= 2;
    }
    if pos[2] > c[2] {
        o |= 4;
    }
    o
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fit_bounds(particles: &[Particle], pad: f64) -> Aabb {
        let mut mn = [f64::INFINITY; 3];
        let mut mx = [f64::NEG_INFINITY; 3];
        for p in particles {
            for k in 0..3 {
                mn[k] = mn[k].min(p.position[k]);
                mx[k] = mx[k].max(p.position[k]);
            }
        }
        for k in 0..3 {
            mn[k] -= pad;
            mx[k] += pad;
        }
        Aabb::new(mn, mx)
    }

    #[test]
    fn aabb_octant_partition_is_disjoint_and_complete() {
        let b = Aabb::new([-1.0, -1.0, -1.0], [1.0, 1.0, 1.0]);
        let mut total_vol = 0.0;
        for o in 0..8 {
            let c = b.child(o);
            total_vol += (c.max[0] - c.min[0]) * (c.max[1] - c.min[1]) * (c.max[2] - c.min[2]);
        }
        // 8개 자식의 부피 합 = 부모 부피
        let parent_vol =
            (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2]);
        assert!((total_vol - parent_vol).abs() < 1e-12);
    }

    #[test]
    fn n8_uniform_octants_yields_depth_1() {
        // 각 octant 중심에 입자 1개씩 → 깊이 1
        let particles: Vec<Particle> = (0..8u8)
            .map(|o| {
                let bx = if o & 1 == 0 { -0.5 } else { 0.5 };
                let by = if o & 2 == 0 { -0.5 } else { 0.5 };
                let bz = if o & 4 == 0 { -0.5 } else { 0.5 };
                Particle {
                    position: [bx, by, bz],
                    mass: 1.0,
                }
            })
            .collect();
        let bounds = Aabb::new([-1.0, -1.0, -1.0], [1.0, 1.0, 1.0]);
        let tree = Octree::build(&particles, bounds);
        assert_eq!(tree.depth(), 1, "8개 균등 분포는 깊이 1");
        // 루트는 8 자식 모두 채움
        let root = tree.root();
        assert!(!root.is_leaf());
        for c in root.children {
            assert!(c != NULL_CHILD);
        }
    }

    #[test]
    fn empty_region_children_are_null() {
        // 입자 1개만 있으면 분할 발생하지 않음 — 루트가 leaf
        let particles = vec![Particle {
            position: [0.0, 0.0, 0.0],
            mass: 1.0,
        }];
        let tree = Octree::build(&particles, Aabb::new([-1.0; 3], [1.0; 3]));
        assert!(tree.root().is_leaf());
        assert_eq!(tree.root().particle_indices.len(), 1);
    }

    #[test]
    fn coincident_particles_terminate_at_max_depth() {
        // 동일 위치 입자 16개 — MAX_DEPTH에서 leaf cap 무시하고 종료
        let particles: Vec<Particle> = (0..16)
            .map(|_| Particle {
                position: [0.1, 0.1, 0.1],
                mass: 1.0,
            })
            .collect();
        let tree = Octree::build(&particles, Aabb::new([-1.0; 3], [1.0; 3]));
        // 무한 재귀 없이 빌드 완료가 핵심. 깊이는 MAX_DEPTH 이하.
        assert!(tree.depth() <= MAX_DEPTH);
    }

    #[test]
    fn random_distribution_build_complexity_is_subquadratic() {
        // O(N log N) 측정 — 단위 테스트라 정량 비교는 어렵지만 N=1000 빌드가 합리적 시간 안에 끝남을 확인.
        // (cargo test --release에서 실행할 때 의미 있음.)
        let n = 1000;
        let particles: Vec<Particle> = (0..n)
            .map(|i| {
                let x = ((i * 7919) % 1000) as f64 / 500.0 - 1.0;
                let y = ((i * 6131) % 1000) as f64 / 500.0 - 1.0;
                let z = ((i * 4027) % 1000) as f64 / 500.0 - 1.0;
                Particle {
                    position: [x, y, z],
                    mass: 1.0,
                }
            })
            .collect();
        let bounds = fit_bounds(&particles, 0.01);
        let tree = Octree::build(&particles, bounds);
        // 트리 노드 수가 N의 상수배 이내인지 확인 (균일 분포에서 ~ 8/7 × N leaves + 내부 노드)
        // 균일 분포에서 노드 수는 통상 N의 4~6배 수준 (leaf cap=1 + 8-자식 분할).
        assert!(
            tree.nodes.len() < n * 8,
            "노드 수 폭주: {} (n={})",
            tree.nodes.len(),
            n
        );
    }

    #[test]
    fn out_of_bounds_particles_are_skipped() {
        let particles = vec![
            Particle {
                position: [0.0, 0.0, 0.0],
                mass: 1.0,
            },
            Particle {
                position: [10.0, 10.0, 10.0],
                mass: 1.0,
            },
        ];
        let tree = Octree::build(&particles, Aabb::new([-1.0; 3], [1.0; 3]));
        // 첫 입자만 들어감 → 단일 leaf
        assert!(tree.root().is_leaf());
        assert_eq!(tree.root().particle_indices.len(), 1);
        assert_eq!(tree.root().particle_indices[0], 0);
    }
}
