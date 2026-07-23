import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as AstroCore from '@astro-simulator/core';
import { useSimStore } from '@/store/sim-store';
import { CelestialInfoPanel } from './celestial-info-panel';

// R10b #664 — info-panel 차단 분기 negative 를 vi.mock 부분 mock 으로 승계 (ADR 20260612-r10b §축 5 ②).
// phase 11 진입으로 미진입 실데이터 body 0 → 차단 분기는 data.nameKo 렌더를 요구해 실데이터 body
// 필수 (가상 ID 는 data === null 로 info-panel-empty 폴백 — 가상 ID 전환 불가). isRPhaseFocusable
// 만 지정 body 에 false 반환 (importOriginal partial mock) 으로 "isRPhaseFocusable=false 일 때
// blocked 분기 렌더" UI 계약을 phase 진행과 영구 비종속으로 검증. mock drift 위험은 membership
// 가드 가상 ID 실모듈 테스트가 직교 커버 (ADR §위험 #5).
const rPhaseMock = vi.hoisted(() => ({ disabledIds: [] as string[] }));
// #841 — 공전주기 fail-visible 분기 (모체 미해석) 검증용 getSolarSystem override.
// null 이면 실데이터 passthrough — 기존 테스트 무영향.
const ephemerisMock = vi.hoisted(() => ({ solarSystemOverride: null as unknown }));
vi.mock('@astro-simulator/core', async (importOriginal) => {
  const actual = await importOriginal<typeof AstroCore>();
  return {
    ...actual,
    isRPhaseFocusable: (bodyId: string | null | undefined) =>
      typeof bodyId === 'string' && rPhaseMock.disabledIds.includes(bodyId)
        ? false
        : actual.isRPhaseFocusable(bodyId),
    ephemeris: {
      ...actual.ephemeris,
      getSolarSystem: () =>
        (ephemerisMock.solarSystemOverride ?? actual.ephemeris.getSolarSystem()) as ReturnType<
          typeof actual.ephemeris.getSolarSystem
        >,
    },
  };
});

beforeEach(() => {
  rPhaseMock.disabledIds = []; // 기본 passthrough (실모듈) — blocked 계약 테스트만 개별 지정
  ephemerisMock.solarSystemOverride = null; // #841 — 기본 실데이터 passthrough
  useSimStore.setState({
    rendererKind: null,
    engineError: null,
    mode: 'observe',
    julianDate: null,
    selectedBodyId: null,
    timeScale: 86_400,
    fps: null,
  });
});

/**
 * #403 — CelestialInfoPanel R-Phase Allowlist 가드 단위 테스트 (defense-in-depth UI 측면 2번째 축).
 *
 * ADR `docs/decisions/20260506-403-r-phase-ui-guard.md` §결정 §InfoPanel UI 가드 박제 패턴.
 * R4 #532 — earth + moon 진입 (Allowlist 5개 활성).
 *
 * 검증:
 *  - selectedBodyId === null: info-panel-empty 렌더 (기존 분기 회귀 0)
 *  - R-Phase 박제 body (sun / mercury / venus / earth / moon): info-panel 정상 분기 렌더
 *  - blocked UI 계약 (R10b #664 — vi.mock 부분 mock 승계, ADR 20260612-r10b §축 5 ②):
 *    isRPhaseFocusable=false 인 body 는 info-panel-r-phase-blocked 분기 렌더
 *  - R-Phase 차단 분기는 body 이름 포함 + R-Phase 메시지 박제
 *  - 분기 위치 — 정상 분기 *이전* (selected/data 존재 후 R-Phase 검사)
 */
describe('CelestialInfoPanel — R-Phase Allowlist 가드 UI (#403 + R4 #532)', () => {
  it('selectedBodyId === null: info-panel-empty 렌더 (기존 분기 회귀 가드)', () => {
    render(<CelestialInfoPanel />);
    expect(screen.getByTestId('info-panel-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('info-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('info-panel-r-phase-blocked')).not.toBeInTheDocument();
  });

  it('selectedBodyId === "sun": info-panel 정상 분기 렌더 (R1 회귀 보호)', () => {
    useSimStore.setState({ selectedBodyId: 'sun' });
    render(<CelestialInfoPanel />);
    expect(screen.getByTestId('info-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('info-panel-r-phase-blocked')).not.toBeInTheDocument();
  });

  it('selectedBodyId === "mercury": info-panel 정상 분기 렌더 (R2 회귀 보호)', () => {
    useSimStore.setState({ selectedBodyId: 'mercury' });
    render(<CelestialInfoPanel />);
    expect(screen.getByTestId('info-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('info-panel-r-phase-blocked')).not.toBeInTheDocument();
  });

  it('selectedBodyId === "venus": info-panel 정상 분기 렌더 (R3 회귀 보호)', () => {
    useSimStore.setState({ selectedBodyId: 'venus' });
    render(<CelestialInfoPanel />);
    expect(screen.getByTestId('info-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('info-panel-r-phase-blocked')).not.toBeInTheDocument();
  });

  it('selectedBodyId === "earth": info-panel 정상 분기 렌더 (R4 #532 진입)', () => {
    useSimStore.setState({ selectedBodyId: 'earth' });
    render(<CelestialInfoPanel />);
    expect(screen.getByTestId('info-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('info-panel-r-phase-blocked')).not.toBeInTheDocument();
  });

  it('selectedBodyId === "moon": info-panel 정상 분기 렌더 (R4 #532 satellite 첫 본 사례)', () => {
    useSimStore.setState({ selectedBodyId: 'moon' });
    render(<CelestialInfoPanel />);
    expect(screen.getByTestId('info-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('info-panel-r-phase-blocked')).not.toBeInTheDocument();
  });

  it('selectedBodyId === "jupiter": info-panel 정상 분기 렌더 (R6 #621 진입 — 차단 아님)', () => {
    useSimStore.setState({ selectedBodyId: 'jupiter' });
    render(<CelestialInfoPanel />);
    expect(screen.getByTestId('info-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('info-panel-r-phase-blocked')).not.toBeInTheDocument();
  });

  it('selectedBodyId === "neptune": info-panel 정상 분기 렌더 (R9 #653 진입 — 차단 아님)', () => {
    useSimStore.setState({ selectedBodyId: 'neptune' });
    render(<CelestialInfoPanel />);
    expect(screen.getByTestId('info-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('info-panel-r-phase-blocked')).not.toBeInTheDocument();
  });

  it('selectedBodyId === "triton": info-panel 정상 분기 렌더 (R9 #653 — 역행 위성 첫 사례)', () => {
    useSimStore.setState({ selectedBodyId: 'triton' });
    render(<CelestialInfoPanel />);
    expect(screen.getByTestId('info-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('info-panel-r-phase-blocked')).not.toBeInTheDocument();
  });

  it('selectedBodyId === "pluto": info-panel 정상 분기 렌더 (R10a #659 진입 — negative → positive 전환)', () => {
    useSimStore.setState({ selectedBodyId: 'pluto' });
    render(<CelestialInfoPanel />);
    expect(screen.getByTestId('info-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('info-panel-r-phase-blocked')).not.toBeInTheDocument();
  });

  it('selectedBodyId === "halley": info-panel 정상 분기 렌더 (R10b #664 진입 — negative → positive 전환)', () => {
    useSimStore.setState({ selectedBodyId: 'halley' });
    render(<CelestialInfoPanel />);
    expect(screen.getByTestId('info-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('info-panel-r-phase-blocked')).not.toBeInTheDocument();
  });

  it('selectedBodyId === "encke" / "swift-tuttle": info-panel 정상 분기 렌더 (R10b #664 — URL-only 진입 경로)', () => {
    useSimStore.setState({ selectedBodyId: 'encke' });
    const { unmount } = render(<CelestialInfoPanel />);
    expect(screen.getByTestId('info-panel')).toBeInTheDocument();
    unmount();
    useSimStore.setState({ selectedBodyId: 'swift-tuttle' });
    render(<CelestialInfoPanel />);
    expect(screen.getByTestId('info-panel')).toBeInTheDocument();
  });

  it('blocked UI 계약 — isRPhaseFocusable=false 인 body 는 blocked 분기 렌더 (vi.mock 부분 mock 승계, ADR §축 5 ②)', () => {
    rPhaseMock.disabledIds = ['halley'];
    useSimStore.setState({ selectedBodyId: 'halley' });
    render(<CelestialInfoPanel />);
    expect(screen.getByTestId('info-panel-r-phase-blocked')).toBeInTheDocument();
    expect(screen.queryByTestId('info-panel')).not.toBeInTheDocument();
  });

  it('차단 분기는 body 이름 (핼리 혜성) 포함 — 사용자 인지 우수', () => {
    rPhaseMock.disabledIds = ['halley'];
    useSimStore.setState({ selectedBodyId: 'halley' });
    render(<CelestialInfoPanel />);
    const blocked = screen.getByTestId('info-panel-r-phase-blocked');
    expect(blocked.textContent ?? '').toMatch(/핼리 혜성/);
  });

  it('차단 분기는 R-Phase 메시지 박제', () => {
    rPhaseMock.disabledIds = ['halley'];
    useSimStore.setState({ selectedBodyId: 'halley' });
    render(<CelestialInfoPanel />);
    const blocked = screen.getByTestId('info-panel-r-phase-blocked');
    expect(blocked.textContent ?? '').toMatch(/R-Phase/);
  });

  it('차단 분기는 body 별 이름이 정확히 박제 (jupiter / halley 회귀 0)', () => {
    rPhaseMock.disabledIds = ['halley'];
    useSimStore.setState({ selectedBodyId: 'halley' });
    render(<CelestialInfoPanel />);
    const blocked = screen.getByTestId('info-panel-r-phase-blocked');
    expect(blocked.textContent ?? '').toMatch(/핼리 혜성/);
    expect(blocked.textContent ?? '').not.toMatch(/목성/);
  });

  it('알 수 없는 body id (data 없음): info-panel-empty 폴백 (R-Phase 분기 미진입)', () => {
    useSimStore.setState({ selectedBodyId: 'invalid-body-id' });
    render(<CelestialInfoPanel />);
    // data === null 이므로 정상 빈 패널 분기로 폴백.
    expect(screen.getByTestId('info-panel-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('info-panel-r-phase-blocked')).not.toBeInTheDocument();
  });
});

/**
 * #841 — 공전주기 모체 μ 계약 회귀 가드.
 *
 * 기존 버그: μ = G·M_sun 하드코딩 → 위성(orbit.semiMajorAxis = 모체 중심 거리)의 주기가
 * 수백 배 오계산 (달 27.3일 → 약 1.1시간 = "0.05 일" 표시).
 * 수정 계약: μ = G·(M_parent + m) — parentId 로 모체를 데이터 SSoT 에서 조회.
 * 모체 미해석 시 조용한 태양 질량 폴백 금지 (fail-visible 표기).
 */
describe('CelestialInfoPanel — 공전주기 모체 μ 계약 (#841)', () => {
  it('달 (moon): 공전주기 약 27.3일 표시 — 태양 μ 오계산(1.1시간) 회귀 가드', () => {
    useSimStore.setState({ selectedBodyId: 'moon' });
    render(<CelestialInfoPanel />);
    const panel = screen.getByTestId('info-panel');
    // μ = G·(M_earth + M_moon) → 항성월 27.32일. 태양 μ 버그면 "0.05 일" 수준.
    expect(panel.textContent ?? '').toMatch(/27\.3\d 일/);
  });

  it('지구 (earth): 행성 경로 회귀 0 — 공전주기 약 1년 유지', () => {
    useSimStore.setState({ selectedBodyId: 'earth' });
    render(<CelestialInfoPanel />);
    const panel = screen.getByTestId('info-panel');
    expect(panel.textContent ?? '').toMatch(/(1\.000|0\.999) 년/);
  });

  it('트리톤 (triton): 해왕성 위성 — 주기 약 5.88일 (모체 질량 기준)', () => {
    useSimStore.setState({ selectedBodyId: 'triton' });
    render(<CelestialInfoPanel />);
    const panel = screen.getByTestId('info-panel');
    expect(panel.textContent ?? '').toMatch(/5\.8\d 일/);
  });

  it('fail-visible — orbit 존재 + 모체 미해석 시 "계산 불가" 표기 (조용한 태양 μ 폴백 금지)', () => {
    // 모체(earth)가 데이터에 없는 고아 위성 시나리오 — getSolarSystem override.
    ephemerisMock.solarSystemOverride = {
      bodies: [
        {
          id: 'moon',
          kind: 'moon',
          nameKo: '달',
          nameEn: 'Moon',
          mass: 7.342e22,
          radius: 1.7374e6,
          parentId: 'earth', // 데이터에 earth 부재 → parent 미해석
          orbit: {
            semiMajorAxis: 3.84748e8,
            eccentricity: 0.0549,
            inclination: 0.0898,
          },
        },
      ],
    };
    useSimStore.setState({ selectedBodyId: 'moon' });
    render(<CelestialInfoPanel />);
    const panel = screen.getByTestId('info-panel');
    expect(panel.textContent ?? '').toMatch(/계산 불가/);
    // 태양 μ 로 조용히 계산된 수치("N.NN 일")가 표기되지 않아야 한다.
    expect(panel.textContent ?? '').not.toMatch(/\d 일/);
  });
});
