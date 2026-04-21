'use client';

import { useEffect, useState } from 'react';
import { useSimStore } from '@/store/sim-store';

const SOURCES = [
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
];

const SCALE_SUMMARY = [
  { kind: '항성 (태양)', max: '×20' },
  { kind: '행성 / 위성', max: '×500' },
  { kind: '왜소행성', max: '×2,000' },
  { kind: '혜성', max: '×20,000' },
];

/**
 * P10-C-3 #278 — About 모달 (Fact-First 원칙 §"크레딧 뷰").
 *
 * - 데이터 출처 attribution (IAU / NASA / JPL)
 * - 현재 과장 요약 (educational 모드의 kind 별 상한)
 * - 모드별 비율 정책 안내
 *
 * 헤더 우측 버튼 ("?") 으로 열기, Esc 또는 닫기 버튼으로 닫기.
 */
export function AboutModal() {
  const viewMode = useSimStore((s) => s.viewMode);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="about-button"
        title="데이터 출처 / 크레딧 / 과장 요약"
        aria-label="데이터 출처 정보"
        className="num text-caption bg-bg-surface/80 backdrop-blur border border-border-subtle rounded-sm px-2 py-1 text-fg-secondary hover:bg-bg-elevated transition-colors"
        style={{ transitionDuration: 'var(--duration-fast)' }}
      >
        ?
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-bg-base/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="max-w-2xl w-full max-h-[80vh] overflow-y-auto bg-bg-surface border border-border-subtle rounded-sm p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-title"
            data-testid="about-modal"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="about-title" className="font-display text-h3 text-fg-primary">
                데이터 출처 · 크레딧
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                data-testid="about-close"
                aria-label="닫기"
                className="text-fg-secondary hover:text-fg-primary text-body transition-colors"
                style={{ transitionDuration: 'var(--duration-fast)' }}
              >
                ✕
              </button>
            </div>

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
                    <p className="text-caption text-fg-tertiary mt-0.5">{s.purpose}</p>
                    <p className="text-caption text-fg-tertiary italic">{s.license}</p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mb-5 pt-4 border-t border-border-subtle">
              <h3 className="text-body-sm text-fg-secondary mb-2">
                현재 뷰 모드: {viewMode === 'educational' ? '교육 (과장)' : '사실 (1.0 비율)'}
              </h3>
              {viewMode === 'educational' ? (
                <>
                  <p className="text-caption text-fg-tertiary mb-2">
                    시각 이해를 위해 천체 크기가 카메라 거리에 비례해 과장됩니다. 상한 요약:
                  </p>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-body-sm">
                    {SCALE_SUMMARY.map((s) => (
                      <div key={s.kind} className="flex items-baseline justify-between">
                        <dt className="text-caption text-fg-tertiary">{s.kind}</dt>
                        <dd className="num text-fg-primary">{s.max}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : (
                <p className="text-caption text-fg-tertiary">
                  IAU 2015 실측 비율 1.0 — 대부분 천체가 sub-pixel 로 표시됩니다. 줌 인으로 특정
                  천체에 초점을 맞추세요.
                </p>
              )}
            </section>

            <section className="pt-4 border-t border-border-subtle">
              <p className="text-caption text-fg-tertiary">
                정밀도: IAU 2015 ±0.01% 공차. 불확실성(관측 부정확, 비구형 body)은 각 천체 정보
                패널의 오차 필드(±%)로 표시됩니다.
              </p>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
