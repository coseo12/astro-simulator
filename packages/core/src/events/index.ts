// #1347 — 시간 이벤트 마커 계산 (ADR `docs/decisions/20261016-1347-event-markers.md`). Babylon 비의존 순수 모듈.
// #1354 — 일식 · 월식 판정식 (ADR `docs/decisions/20261017-1354-lunar-precession-eclipses.md` 결정 E2).
export * from './event-kinds.js';
export * from './eclipse-geometry.js';
export * from './compute-events.js';
