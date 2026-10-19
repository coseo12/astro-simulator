'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';

interface Source {
  name: string;
  purpose: string;
  url: string;
  license: string;
  /** #1373 PR2 — 라이선스 원문 URI (클릭 가능한 링크로 그린다 — PR #1375 qa 관측 2). */
  licenseUrl?: string;
}

const SOURCES: readonly Source[] = [
  {
    name: 'IAU 2015 Resolution B3',
    purpose: '태양·지구·목성 nominal 값 (질량·반경)',
    url: 'https://www.iau.org/static/resolutions/IAU2015_English.pdf',
    license: '© IAU — 학술/교육 목적 인용 허용',
  },
  {
    name: 'NASA Planetary Fact Sheet',
    purpose: '수성·금성·화성·토성·천왕성·해왕성 (질량·반경·궤도)',
    url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/',
    license: 'Public Domain (NASA)',
  },
  {
    name: 'NASA JPL Horizons / SSD',
    purpose: '위성 (Moon / Galilean / Phobos / Deimos) + 왜소행성 + 혜성',
    url: 'https://ssd.jpl.nasa.gov/horizons/',
    license: 'Public Domain (NASA JPL)',
  },
  {
    name: 'Standish & Williams (1992) / DE440',
    purpose: '행성 J2000.0 궤도 요소',
    url: 'https://ssd.jpl.nasa.gov/planets/approx_pos.html',
    license: 'Public Domain (NASA JPL)',
  },
  {
    // #1373 — 실측 별 카탈로그 (ADR 20261018-1373 결정 D1 · D4). 고지는 원천 LICENSE 원문 문장을 인용한다.
    name: 'HYG Stellar Database v4.4 (astronexus)',
    purpose: '배경 별 8,922개 — 위치 (J2000) · 실시 등급 · 색지수 (V ≤ 6.5 + 별자리 선 끝점 별)',
    url: 'https://codeberg.org/astronexus/hyg',
    license:
      'CC BY-SA 4.0 — “This work is licensed under a Creative Commons Attribution-ShareAlike 4.0 International License.” 변경: 등급 컷 · 4개 열만 남김 · 바이너리 양자화 (파생 파일도 CC BY-SA 4.0)',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
  {
    // #1373 PR2 — 별자리 선 · 이름 · 라벨 위치 (ADR 20261018-1373 결정 D3 · D4 · D5). 고지는 원천 LICENSE 원문 첫 줄을 인용한다.
    name: 'd3-celestial (Olaf Frohn)',
    purpose:
      '별자리 88개의 선 · 이름 라벨 위치 · 한국어 이름 출발점 (일부 이름은 한국천문연구원 표기로 바꿈)',
    url: 'https://github.com/ofrohn/d3-celestial',
    license:
      'BSD-3-Clause — “Copyright (c) 2015, Olaf Frohn. All rights reserved.” 변경: 선 정점을 별 카탈로그 인덱스로 바꿈 · 뱀자리 두 조각을 1개로',
    licenseUrl:
      'https://github.com/ofrohn/d3-celestial/blob/7e720a3de062059d4c5400a379146a601d9010e0/LICENSE',
  },
];

/**
 * About 모달 — 데이터 출처 attribution + 정밀도 안내.
 *
 * - 데이터 출처 (IAU / NASA / JPL)
 * - 정밀도 ±0.01% 및 불확실성 표기 안내
 * - 3단 tier (Solar / Inner / Body) 자동 전환은 카메라 거리 / focus body 로 결정
 *
 * #405 — v3 incremental build 정책으로 전환. 폐기된 P12-C fact-first 원칙 / educational·scientific
 * 토글 / 절대 비율 IAU 고정 표현 정리 (Roadmap v3 §`docs/phases/roadmap-v3-incremental.md`).
 *
 * 헤더 우측 버튼 ("?") 으로 열기, Esc 또는 닫기 버튼으로 닫기.
 *
 * #848 — 공용 `Modal` 로 셸 이관. 이전에는 비-portal `z-40` 이라 실 Chrome 에서 Babylon WebGPU
 * canvas 합성 레이어에 가릴 수 있었고(#704 D-T2 가 sensitivity 에서 겪은 버그 클래스), focus trap
 * 도 없어 Tab 이 배경 UI 로 탈출했다. portal + `z-[100]` + trap + focus 복원은 이제 `Modal` 계약.
 */
export function AboutModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="about-button"
        title="데이터 출처 / 크레딧 / 과장 요약"
        aria-label="데이터 출처 정보"
        className="num text-caption shrink-0 whitespace-nowrap bg-bg-surface/80 backdrop-blur border border-border-subtle rounded-sm px-2 py-1 text-fg-secondary hover:bg-bg-elevated transition-colors"
        style={{ transitionDuration: 'var(--duration-fast)' }}
      >
        ?
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="데이터 출처 · 크레딧"
        titleId="about-title"
        testId="about-modal"
        closeTestId="about-close"
        panelClassName="max-w-2xl max-h-[80vh]"
      >
        <section className="mb-5">
          <h3 className="text-body-sm text-fg-secondary mb-2">출처</h3>
          <ul className="flex flex-col gap-3" data-testid="about-sources">
            {SOURCES.map((s) => (
              <li key={s.name} className="text-body-sm">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-fg-primary hover:text-primary underline"
                >
                  {s.name}
                </a>
                <p className="text-caption text-fg-secondary mt-0.5">{s.purpose}</p>
                <p className="text-caption text-fg-secondary italic">
                  {s.license}
                  {s.licenseUrl ? (
                    <>
                      {' — '}
                      <a
                        href={s.licenseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-primary not-italic"
                      >
                        {s.licenseUrl}
                      </a>
                    </>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-5 pt-4 border-t border-border-subtle">
          <h3 className="text-body-sm text-fg-secondary mb-2">스케일 정책</h3>
          <p className="text-caption text-fg-secondary">
            Roadmap v3 incremental build — 각 R-Phase (R1 태양, R2 수성, R3 금성, R4+ 예정) 가
            활성된 천체만 표시 + 시각 과장 배수 박제. 카메라 거리·focus 대상에 따라 3단 tier (Solar
            / Inner / Body) 로 자동 전환되며, 화면 이동은 ExponentialEase 300ms interp 로 자연스럽게
            연결됩니다.
          </p>
        </section>

        <section className="mb-5 pt-4 border-t border-border-subtle" data-testid="about-stars">
          <h3 className="text-body-sm text-fg-secondary mb-2">배경 별</h3>
          <p className="text-caption text-fg-secondary">
            별의 위치는 실측 카탈로그 (J2000) 그대로이며, 별의 크기와 밝기는 실시 등급을 화면에
            보이게 시각화한 값입니다 (실제 별의 크기가 아님). 색은 색지수 (B−V) 에서 추정한 온도로
            채도를 낮춰 칠했습니다. 은하수 띠는 실제 은하면 위치에 그린 장식이며 관측 데이터가
            아닙니다.
          </p>
          <p className="text-caption text-fg-secondary mt-2" data-testid="about-constellations">
            별자리 선은 별자리 그림을 잇는 관례적인 선이며 (IAU 경계선이 아님), 기본으로 꺼져
            있습니다. 「표시」 패널의 「별자리」 로 켜며, 이름은 「이름 라벨」 도 켜져 있을 때
            보입니다.
          </p>
        </section>

        <section className="pt-4 border-t border-border-subtle">
          <p className="text-caption text-fg-secondary">
            정밀도: IAU 2015 ±0.01% 공차. 불확실성(관측 부정확, 비구형 body)은 각 천체 정보 패널의
            오차 필드(±%)로 표시됩니다.
          </p>
        </section>
      </Modal>
    </>
  );
}
