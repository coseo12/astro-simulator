import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    // #849 — include glob 이 리팩토링으로 깨져 0건 수집돼도 조용히 PASS 하는 함정 차단
    // (web 과 동일 값으로 통일). 수집 0건이면 vitest 가 exit 1 로 FAIL 한다.
    passWithNoTests: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      // __test-utils__ 는 테스트 전용 mock 헬퍼 (#849) — 프로덕션 커버리지 분모에서 제외.
      exclude: ['src/**/*.{test,spec}.ts', 'src/**/index.ts', 'src/**/__test-utils__/**'],
    },
  },
});
