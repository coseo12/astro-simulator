import { useTranslations } from 'next-intl';
import { AU, SOLAR_MASS } from '@astro-simulator/shared';

export default function HomePage() {
  const t = useTranslations('app');

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        fontFamily: 'system-ui, sans-serif',
        background: '#0E1018',
        color: '#E8EBF5',
      }}
    >
      <h1 style={{ fontSize: '2.25rem', margin: 0 }}>{t('title')}</h1>
      <p style={{ color: '#9BA3B8', margin: 0 }}>{t('subtitle')}</p>
      <p style={{ color: '#626978', fontSize: '0.875rem', margin: 0 }}>{t('scaffold')}</p>
      <p
        style={{
          color: '#626978',
          fontSize: '0.75rem',
          margin: 0,
          fontFamily: 'ui-monospace, monospace',
        }}
      >
        AU = {AU.toExponential(3)} m · M☉ = {SOLAR_MASS.toExponential(3)} kg
      </p>
    </main>
  );
}
