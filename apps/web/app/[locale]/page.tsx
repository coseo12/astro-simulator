import { useTranslations } from 'next-intl';

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
    </main>
  );
}
