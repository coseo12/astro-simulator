'use client';

import type { SimMode } from '@astro-simulator/shared';
import { parseAsFloat, parseAsString, parseAsStringEnum, useQueryState } from 'nuqs';
import { useEffect, useRef } from 'react';
import { useSimStore } from '@/store/sim-store';
import { useSimCommand } from './sim-context';

const MODE_VALUES: SimMode[] = ['observe', 'research', 'education', 'sandbox'];
const ENGINE_VALUES = ['kepler', 'newton'] as const;
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
