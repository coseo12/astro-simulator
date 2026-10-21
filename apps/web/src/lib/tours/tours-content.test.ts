import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isRPhaseFocusable } from '@astro-simulator/core';
import { describe, expect, it } from 'vitest';
import { decodeTimeEvents } from '@/lib/time-events-data';
import { SCRUBBER_MAX_JD, SCRUBBER_MIN_JD } from '@/lib/time-scrubber';
import { TOURS } from './index';
import { TOUR_BODY_MAX_CHARS, TOUR_OVERVIEW } from './types';

/**
 * #1390 DoD E11 — 콘텐츠 유효성 (전 투어 전 단계). 투어를 더하면 이 테스트가 그대로 새 투어를 순회한다.
 *
 * 사건 id 는 실제 사전 계산 파일 (`public/data/events/time-events.json`) 에서 찾는다 — 사건 모델이 바뀌어 id (날짜) 가 움직이면
 * 여기서 FAIL 한다 (단계가 JD 를 하드코딩하지 않고 id 로 참조하는 이유 — ADR 1-F).
 */

const DATA_PATH = resolve(__dirname, '../../../public/data/events/time-events.json');
const EVENT_IDS = new Set(
  decodeTimeEvents(JSON.parse(readFileSync(DATA_PATH, 'utf8')), {
    startJd: SCRUBBER_MIN_JD,
    endJd: SCRUBBER_MAX_JD,
  }).map((e) => e.id),
);

describe.each(TOURS.map((t) => [t.id, t] as const))('투어 %s', (_id, tour) => {
  it('id 는 kebab-case · 단계 1개 이상 · 단계 id 중복 없음', () => {
    expect(tour.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(tour.steps.length).toBeGreaterThan(0);
    expect(new Set(tour.steps.map((s) => s.id)).size).toBe(tour.steps.length);
  });

  it.each(tour.steps.map((s, i) => [i + 1, s] as const))('단계 %i', (_n, step) => {
    // 포커스 — R-Phase allowlist 또는 개요. 시점은 천체 포커스에서만.
    if (step.camera.focus === TOUR_OVERVIEW) {
      expect(step.camera.view).toBeUndefined();
    } else {
      expect(isRPhaseFocusable(step.camera.focus)).toBe(true);
    }
    // 사건 id 존재.
    if (step.time && 'eventId' in step.time) {
      expect(EVENT_IDS.has(step.time.eventId)).toBe(true);
    }
    // 시각 범위 — 스크러버 범위 안.
    if (step.time && 'julianDate' in step.time) {
      expect(step.time.julianDate).toBeGreaterThanOrEqual(SCRUBBER_MIN_JD);
      expect(step.time.julianDate).toBeLessThan(SCRUBBER_MAX_JD);
    }
    // 재생 구간 — 시각을 지정한 정방향 재생 단계에서만.
    if (step.windowDays !== undefined) {
      expect(step.windowDays).toBeGreaterThan(0);
      expect(step.timeScale ?? 0).toBeGreaterThan(0);
      expect(step.time).toBeDefined();
    }
    // 거리 자 기준점 — 선택 가능한 천체.
    if (step.ruler !== undefined && step.ruler !== null) {
      expect(isRPhaseFocusable(step.ruler)).toBe(true);
    }
    // 본문 길이 (375 바텀시트 접힘 없이) · 문안 비어 있지 않음.
    expect(step.title.trim().length).toBeGreaterThan(0);
    expect(step.body.trim().length).toBeGreaterThan(0);
    expect([...step.body].length).toBeLessThanOrEqual(TOUR_BODY_MAX_CHARS);
  });
});
