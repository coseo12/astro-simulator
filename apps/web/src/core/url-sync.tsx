'use client';

import type { SimMode } from '@astro-simulator/shared';
import { parseAsFloat, parseAsString, parseAsStringEnum, useQueryState } from 'nuqs';
import { useEffect, useRef } from 'react';
import { useSimStore } from '@/store/sim-store';
import { useSimCommand } from './sim-context';
import { parseLodLevel } from './parse-lod-level';

const MODE_VALUES: SimMode[] = ['observe', 'research', 'education', 'sandbox'];
// P3-0 #126 — barnes-hut/webgpu/auto는 URL로는 받지만 런타임은 미구현 폴백.
// 후방호환: 기존 newton/kepler URL은 그대로 동작.
const ENGINE_VALUES = ['kepler', 'newton', 'barnes-hut', 'webgpu', 'auto'] as const;
type PhysicsEngineUrl = (typeof ENGINE_VALUES)[number];

/**
 * URL ↔ 시뮬레이션 상태 동기화.
 *  - mode, focus, speed: store ↔ URL 양방향
 *  - t (Julian Date): 초기 로드 시에만 URL → store (매 프레임 쓰기 하면 리렌더 폭주)
 *
 * 시간 공유는 향후 "스냅샷/북마크" 기능으로 분리.
 */
export function UrlSync() {
  const [urlMode, setUrlMode] = useQueryState(
    'mode',
    parseAsStringEnum<SimMode>(MODE_VALUES).withOptions({ history: 'replace' }),
  );
  const [urlT] = useQueryState('t', parseAsFloat.withOptions({ history: 'replace' }));
  const [urlFocus, setUrlFocus] = useQueryState(
    'focus',
    parseAsString.withOptions({ history: 'replace' }),
  );
  const [urlSpeed, setUrlSpeed] = useQueryState(
    'speed',
    parseAsFloat.withOptions({ history: 'replace' }),
  );
  const [urlEngine, setUrlEngine] = useQueryState(
    'engine',
    parseAsStringEnum<PhysicsEngineUrl>([...ENGINE_VALUES]).withOptions({ history: 'replace' }),
  );
  // P11-B #289 — ?lod=high|mid|low|auto 초기 1회 파싱 → sendCommand.
  // store 에 저장하지 않음 (LOD 는 scene 내부 상태) — URL → Core → Scene 단방향 파이프.
  const [urlLod] = useQueryState('lod', parseAsString.withOptions({ history: 'replace' }));

  const mode = useSimStore((s) => s.mode);
  const selectedBodyId = useSimStore((s) => s.selectedBodyId);
  const timeScale = useSimStore((s) => s.timeScale);
  const physicsEngine = useSimStore((s) => s.physicsEngine);
  const setMode = useSimStore((s) => s.setMode);
  const setPhysicsEngine = useSimStore((s) => s.setPhysicsEngine);

  const sendCommand = useSimCommand();
  const initialized = useRef(false);

  // 초기 URL → store (최초 1회)
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    if (urlMode) {
      setMode(urlMode);
      sendCommand({ type: 'setMode', mode: urlMode });
    }
    if (urlT !== null && urlT !== undefined && Number.isFinite(urlT)) {
      sendCommand({ type: 'jumpToJulianDate', julianDate: urlT });
    }
    if (urlFocus) {
      sendCommand({ type: 'focusOn', bodyId: urlFocus });
    }
    if (urlSpeed !== null && urlSpeed !== undefined && Number.isFinite(urlSpeed)) {
      sendCommand({ type: 'setTimeScale', scale: urlSpeed });
    }
    if (urlEngine) {
      setPhysicsEngine(urlEngine);
    }
    // P11-B #289 — `?lod=` 초기 1회 전달. 미지정 (null) 이면 parseLodLevel 이 'auto' 반환 → override 해제.
    const parsedLod = parseLodLevel(urlLod);
    sendCommand({ type: 'setLodOverride', level: parsedLod });
    // P12-C #298 — `?view=scientific|educational` 은 단일 모드 전환으로 폐기.
    // 기존 북마크는 파라미터를 조용히 무시하고 단일 모드로 자연 진입 (backward-ignore, ADR §재검토 암묵 전제).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // store → URL (mode/focus/speed만)
  useEffect(() => {
    if (!initialized.current) return;
    setUrlMode(mode === 'observe' ? null : mode);
  }, [mode, setUrlMode]);

  useEffect(() => {
    if (!initialized.current) return;
    setUrlFocus(selectedBodyId);
  }, [selectedBodyId, setUrlFocus]);

  useEffect(() => {
    if (!initialized.current) return;
    setUrlSpeed(timeScale === 86_400 ? null : timeScale);
  }, [timeScale, setUrlSpeed]);

  useEffect(() => {
    if (!initialized.current) return;
    setUrlEngine(physicsEngine === 'kepler' ? null : physicsEngine);
  }, [physicsEngine, setUrlEngine]);

  return null;
}
