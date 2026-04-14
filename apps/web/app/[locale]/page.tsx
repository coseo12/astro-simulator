import { useTranslations } from 'next-intl';
import { AU, SOLAR_MASS } from '@astro-simulator/shared';

export default function HomePage() {
  const t = useTranslations('app');

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 bg-bg-base text-fg-primary">
      <h1 className="text-h1 font-display tracking-tight">{t('title')}</h1>
      <p className="text-body text-fg-secondary">{t('subtitle')}</p>
      <p className="text-body-sm text-fg-tertiary">{t('scaffold')}</p>

      {/* 토큰 시각 검증 섹션 */}
      <section className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3 text-caption">
        <TokenChip color="var(--star-o)" label="O · 30,000K+" />
        <TokenChip color="var(--star-b)" label="B · 10,000K" />
        <TokenChip color="var(--star-a)" label="A · 7,500K" />
        <TokenChip color="var(--star-g)" label="G · 5,800K" />
        <TokenChip color="var(--star-k)" label="K · 4,500K" />
        <TokenChip color="var(--star-m)" label="M · 3,200K" />
        <TokenChip color="var(--nebula-teal)" label="Tier 1 관측" />
        <TokenChip color="var(--nebula-violet)" label="Tier 4 예술" />
      </section>

      <p className="mt-4 num text-fg-tertiary text-body-sm">
        AU = {AU.toExponential(3)} m · M☉ = {SOLAR_MASS.toExponential(3)} kg
      </p>
    </main>
  );
}

function TokenChip({ color, label }: { color: string; label: string }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-sm border"
      style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' }}
    >
      <span
        className="w-3 h-3 rounded-full"
        style={{ background: color, boxShadow: `0 0 8px ${color}` }}
      />
      <span className="num text-fg-secondary">{label}</span>
    </div>
  );
}
