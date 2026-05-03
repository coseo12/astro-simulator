'use client';

import { ephemeris as ephemerisApi, scene as sceneApi } from '@astro-simulator/core';
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
  const setSelectedBody = useSimStore((s) => s.setSelectedBody);

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
    // R1 #329 — `?focus=<bodyId>` 허용 body id 검증.
    // 미정의 id (예: `?focus=invalid`) 는 무시 + dev 경고 (CRITICAL #2 모호한 입력 방어).
    //
    // #402 — R-Phase allowlist 가드 (URL 직접 진입 우회 차단).
    // ADR `20260504-r-phase-allowlist-guard.md` §결정 3 — "URL `?focus=earth` 진입도 동일 가드 통과 필수".
    // url-sync 가 `setSelectedBody(urlFocus)` 를 직접 호출 (event 우회 경로) 하므로 본 가드가
    // simulation-core focusOn 가드와 일관 동작하도록 박제 — 양쪽 모두 차단.
    if (urlFocus) {
      const validIds = new Set(ephemerisApi.getSolarSystem().bodies.map((b) => b.id));
      if (!validIds.has(urlFocus)) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[url-sync] ?focus=${urlFocus} 는 알 수 없는 body id — 무시. 허용 id 예: sun / earth / jupiter / neptune.`,
          );
        }
      } else if (!sceneApi.isRPhaseFocusable(urlFocus)) {
        // R-Phase 미활성 body (earth/jupiter/neptune 등) URL 진입 차단 — store/scene 변화 0.
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[url-sync] ?focus=${urlFocus} 는 R-Phase 미활성 body — 무시 (ADR 20260504-r-phase-allowlist-guard.md).`,
          );
        }
      } else {
        // 카메라 focus + store selectedBodyId sync (info-panel 표시 트리거).
        // shortcut 버튼 클릭 경로는 controller.focusOn 후 'bodySelected' event 가 emit 되지만,
        // URL 직접 진입 시 그 event 가 발생하지 않아 selectedBodyId 가 set 되지 않는 기존 동작 보강.
        sendCommand({ type: 'focusOn', bodyId: urlFocus });
        setSelectedBody(urlFocus);
      }
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
