import { describe, expect, it } from 'vitest';
import { detectIsMobile } from './is-mobile';

describe('detectIsMobile', () => {
  it('Android Chrome UA → true', () => {
    expect(
      detectIsMobile({
        userAgent:
          'Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
        maxTouchPoints: 5,
      }),
    ).toBe(true);
  });

  it('iPhone Safari UA → true', () => {
    expect(
      detectIsMobile({
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        maxTouchPoints: 5,
      }),
    ).toBe(true);
  });

  it('iPad 구형 UA (iPad 문자열) → true', () => {
    expect(
      detectIsMobile({
        userAgent:
          'Mozilla/5.0 (iPad; CPU OS 12_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Mobile/15E148 Safari/604.1',
        maxTouchPoints: 5,
      }),
    ).toBe(true);
  });

  it('iPadOS 13+ desktop UA (Macintosh + maxTouchPoints=5) → true', () => {
    // #220 핵심 케이스 — Apple 공식 권고 감지.
    expect(
      detectIsMobile({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        maxTouchPoints: 5,
      }),
    ).toBe(true);
  });

  it('macOS 데스크톱 Safari (Macintosh, maxTouchPoints=0) → false', () => {
    expect(
      detectIsMobile({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        maxTouchPoints: 0,
      }),
    ).toBe(false);
  });

  it('Windows 데스크톱 Chrome → false', () => {
    expect(
      detectIsMobile({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        maxTouchPoints: 0,
      }),
    ).toBe(false);
  });

  it('Linux 데스크톱 Firefox → false', () => {
    expect(
      detectIsMobile({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
        maxTouchPoints: 0,
      }),
    ).toBe(false);
  });

  it('maxTouchPoints 미지원 (undefined) + 데스크톱 UA → false', () => {
    // 오래된 브라우저 또는 테스트 환경 — maxTouchPoints 부재 시 false로 안전 폴백.
    expect(
      detectIsMobile({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      }),
    ).toBe(false);
  });

  it('Macintosh + maxTouchPoints=1 → false (트랙패드 단일 터치 포인트 오탐 방지)', () => {
    // Apple 권고: `> 1` 엄격 비교로 터치 대응 트랙패드 오탐 방지.
    expect(
      detectIsMobile({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        maxTouchPoints: 1,
      }),
    ).toBe(false);
  });
});
