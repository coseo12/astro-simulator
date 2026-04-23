import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { routing } from '@/i18n/routing';
import type { ReactNode } from 'react';
import 'pretendard/dist/web/variable/pretendardvariable.css';
import './globals.css';

export const metadata = {
  title: 'astro-simulator',
  description: '웹 기반 천체물리 시뮬레이터',
};

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-space-grotesk',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains',
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  return (
    <html
      lang={locale}
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      data-mode="observe"
    >
      <body>
        <NuqsAdapter>
          <NextIntlClientProvider>{children}</NextIntlClientProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
