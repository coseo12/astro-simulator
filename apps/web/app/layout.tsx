import { JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
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

// (#908) i18n 제거 — 전 화면 한국어 하드코딩 상태(카탈로그 소비 0)라 locale 라우팅 없이 ko 단일 고정.
// /ko 하위호환 리다이렉트는 next.config.mjs redirects (308) 담당. 재도입 시 제거 커밋 revert 기점은 이슈 #908 코멘트 참조.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="ko"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      data-mode="observe"
    >
      <body>
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  );
}
