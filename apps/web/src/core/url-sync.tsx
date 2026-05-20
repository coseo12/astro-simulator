'use client';

import {
  ephemeris as ephemerisApi,
  isRPhaseFocusable,
  R_PHASE_BODY_ALLOWLIST,
} from '@astro-simulator/core';
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
  // #419 §결정 2 — `setSelectedBody` 직접 호출 제거 (race fallback 폐기, event 단일 진실원 회복).

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
    // #415 — R-Phase allowlist 가드 (defense-in-depth store mutation 측면, 3번째 방어선).
    // ADR: docs/decisions/20260504-415-url-sync-guard.md §결정 1 (옵션 B).
    // #402 부모 ADR §결정 2 (UI) + §결정 3 (scene) 와 직교 — url-sync 의 store 직접 mutation 우회 차단.
    if (urlFocus) {
      const validIds = new Set(ephemerisApi.getSolarSystem().bodies.map((b) => b.id));
      if (!validIds.has(urlFocus)) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[url-sync] ?focus=${urlFocus} 는 알 수 없는 body id — 무시. 허용 id 예: sun / earth / jupiter / neptune.`,
          );
        }
        // #418 — 무효 URL 파라미터 자동 제거 (replaceState). URL 일관성 보장 + 사용자 혼란 차단.
        setUrlFocus(null);
      } else if (!isRPhaseFocusable(urlFocus)) {
        // R-Phase 미진입 body — store mutation 우회 차단.
        // sendCommand({type:'focusOn'}) 와 setSelectedBody 둘 다 skip
        // (PR #414 simulation-core focusOn 가드는 그대로 작동하지만 1차 방어선으로 url-sync 에서 차단).
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[url-sync] ?focus=${urlFocus} 는 R-Phase 미진입 body — 무시. ` +
              `R_PHASE_BODY_ALLOWLIST: ${R_PHASE_BODY_ALLOWLIST.join(', ')}.`,
          );
        }
        // #418 — R-Phase 미진입 body URL 진입 시 URL 자동 제거 (옵션 A).
        // ADR `20260504-415-url-sync-guard.md` cross-validate Gemini 고유 발견 #1 후속.
        // 시각적 변화 0 + URL 잔존으로 인한 "왜 동작 안 하지?" 혼란 차단.
        // backward-compat 손실 없음 — 가드 거부된 URL 은 의미 없음.
        setUrlFocus(null);
      } else {
        // 카메라 focus + store selectedBodyId sync (info-panel 표시 트리거).
        // #419 ADR `docs/decisions/20260510-419-sim-canvas-mount-race.md` §결정 2 (mount 순서 정합화 후 race fallback 제거).
        //   sendCommand({type:'focusOn'}) → simulation-core focusOn → emit 'bodySelected' → core-adapter → setSelectedBody 자동
        //   race condition 부재로 setSelectedBody fallback 제거 — event 단일 진실원
        //   (R1 #334+#335 ADR `20260425-r1-store-scene-sync-unification.md` §결정 3 정신 회복).
        // 부모 ADR `20260504-415-url-sync-guard.md` §재검토 조건 1 충족.
        sendCommand({ type: 'focusOn', bodyId: urlFocus });
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
