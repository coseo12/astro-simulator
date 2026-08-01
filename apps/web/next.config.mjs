/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ['192.168.0.12'],
  // (#908) i18n 제거 후 /ko 하위호환 — 외부 북마크/공유 링크 영구 이전 (308 permanent).
  // 쿼리 파라미터 (?focus= 등) 는 Next.js redirects 가 자동 보존한다.
  async redirects() {
    return [
      { source: '/ko', destination: '/', permanent: true },
      { source: '/ko/:path*', destination: '/:path*', permanent: true },
    ];
  },
  // (#908) Next 16 Turbopack 기본 빌드 — 기존에는 next-intl plugin 이 turbopack 키를 주입해
  // webpack 설정과 공존했으나, plugin 제거 후 webpack 단독이면 fatal error. 빈 설정으로 명시.
  // (wasm 은 Turbopack 이 네이티브 지원 — webpack 블록은 --webpack 폴백 경로용 유지)
  turbopack: {},
  webpack: (config) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };
    return config;
  },
};

export default nextConfig;
