'use client';

import {
  ephemeris as ephemerisApi,
  isRPhaseFocusable,
  R_PHASE_BODY_ALLOWLIST,
} from '@astro-simulator/core';
import { J2000_JD, type SimMode } from '@astro-simulator/shared';
import { parseAsFloat, parseAsString, parseAsStringEnum, useQueryState } from 'nuqs';
import { useEffect, useRef } from 'react';
import { parseTourParam } from '@/lib/tours/parse-tour-param';
import { useSimStore } from '@/store/sim-store';
import { useTourStore } from '@/store/tour-store';
import { useSimCommand } from './sim-context';
import { parseLodLevel } from './parse-lod-level';
import { parseRulerAnchor } from './parse-ruler-anchor';

const MODE_VALUES: SimMode[] = ['observe', 'research', 'education', 'sandbox'];
// P3-0 #126 — barnes-hut/webgpu/auto는 URL로는 받지만 런타임은 미구현 폴백.
// 후방호환: 기존 newton/kepler URL은 그대로 동작.
const ENGINE_VALUES = ['kepler', 'newton', 'barnes-hut', 'webgpu', 'auto'] as const;
type PhysicsEngineUrl = (typeof ENGINE_VALUES)[number];

/**
 * URL ↔ 시뮬레이션 상태 동기화.
 *  - mode, focus, speed, ruler (#1341 PR2): store ↔ URL 양방향
 *  - t (Julian Date): 초기 로드 시 URL → store. store → URL 은 **일시정지 (`timeScale === 0`) 중에만** 쓴다 (#1381).
 *    재생 중에는 쓰지 않는다 — 시각이 매 프레임 바뀌어 URL 쓰기가 리렌더 폭주가 된다. 일시정지 중 시각은 사용자의
 *    이산 조작 (사건 선택 · 스크러버 · 「지금」 · 날짜 입력) 으로만 바뀌므로 쓰기 횟수가 조작 횟수다.
 *    재생으로 돌아가도 `t` 는 지우지 않는다 — 마지막 정지 시각이 재로드 시작점으로 남는다 (`?t=` 직접 입력과 같은 성질).
 *    J2000 이면 키를 지운다 (`t` 부재 = J2000 — `speed` 의 기본값 삭제 규약과 같다).
 *
 * 재생 중 임의 시점의 공유는 북마크 버튼 (`bookmark-button.tsx`) 이 스냅샷으로 담는다.
 *
 * #1390 — `?tour=<id>&step=<n>` (ADR `20261021-1390` 결정 · URL). 초기 적용 진입점은 **이 컴포넌트의 초기 effect 하나**다 —
 * 유효하면 교육 모드로 들어가고 (`?tour` 가 `?mode=education` 을 함의) `t` · `focus` · `speed` · `ruler` 적용을 건너뛴 채 투어
 * 시작을 요청한다 (단계가 그 네 축의 정본 — §교차검증 합의 1). 실제 적용은 투어 컨트롤러가 장면 가용성을 기다려 한다. 이후
 * store → URL 은 진행 중인 투어 · 단계를 쓴다 (`history: 'replace'`).
 */
export function UrlSync() {
  const [urlMode, setUrlMode] = useQueryState(
    'mode',
    parseAsStringEnum<SimMode>(MODE_VALUES).withOptions({ history: 'replace' }),
  );
  const [urlT, setUrlT] = useQueryState('t', parseAsFloat.withOptions({ history: 'replace' }));
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
  // #1341 PR2 — `?ruler=<기준점 id>` (ADR `20261015-1341` 결정 R7). B 는 `?focus=` 가 정한다. store ↔ URL 양방향.
  const [urlRuler, setUrlRuler] = useQueryState(
    'ruler',
    parseAsString.withOptions({ history: 'replace' }),
  );
  // #1390 — 투어 · 단계 (1-based). 값 검증은 `parseTourParam` 이 한다 — 여기서는 문자열 그대로 읽고 쓴다.
  const [urlTour, setUrlTour] = useQueryState(
    'tour',
    parseAsString.withOptions({ history: 'replace' }),
  );
  const [urlStep, setUrlStep] = useQueryState(
    'step',
    parseAsString.withOptions({ history: 'replace' }),
  );

  const mode = useSimStore((s) => s.mode);
  // #1381 — 정지 중 시각만 구독한다. 재생 중에는 `null` 로 고정돼 매 프레임 `timeChanged` 가 이 컴포넌트를 다시 그리지 않는다
  // (`pausedUrlTime(null, …)` 은 `undefined` = 쓰지 않음이라 의미는 같다 — PR #1384 리뷰 권고 2).
  const pausedJulianDate = useSimStore((s) => (s.timeScale === 0 ? s.julianDate : null));
  const selectedBodyId = useSimStore((s) => s.selectedBodyId);
  const timeScale = useSimStore((s) => s.timeScale);
  const physicsEngine = useSimStore((s) => s.physicsEngine);
  const setMode = useSimStore((s) => s.setMode);
  const setPhysicsEngine = useSimStore((s) => s.setPhysicsEngine);
  const rulerAnchorId = useSimStore((s) => s.rulerAnchorId);
  const setRulerAnchor = useSimStore((s) => s.setRulerAnchor);
  const activeTourId = useTourStore((s) => s.activeTourId);
  const tourStepIndex = useTourStore((s) => s.stepIndex);
  const tourPending = useTourStore((s) => s.pendingStart !== null);
  // #419 §결정 2 — `setSelectedBody` 직접 호출 제거 (race fallback 폐기, event 단일 진실원 회복).

  const sendCommand = useSimCommand();
  const initialized = useRef(false);

  // 초기 URL → store (최초 1회)
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // #1390 — 투어 진입. 키가 있으면 (무효여도) 교육 모드 — 무효는 키를 지우고 목록을 보인다 (`?focus=` #418 처분).
    const tourParam = parseTourParam(urlTour, urlStep);
    if (tourParam.kind === 'invalid') {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[url-sync] ${tourParam.reason} — 무시 (투어 목록 표시).`);
      }
      setUrlTour(null);
      setUrlStep(null);
    } else if (tourParam.kind === 'none' && urlStep !== null && urlStep !== undefined) {
      // 투어 없는 `?step=` 은 의미가 없다.
      setUrlStep(null);
    }
    const tourEntry = tourParam.kind === 'valid' ? tourParam : null;
    const initialMode = tourParam.kind === 'none' ? urlMode : 'education';
    if (initialMode) {
      setMode(initialMode);
      sendCommand({ type: 'setMode', mode: initialMode });
    }
    if (tourEntry) {
      useTourStore.getState().requestStart(tourEntry.tourId, tourEntry.stepIndex);
    }
    // 유효한 투어면 시각 · 포커스 · 배속 · 기준점은 단계가 정한다 — 여기서 보내면 같은 축에 명령이 두 번 간다.
    if (!tourEntry && urlT !== null && urlT !== undefined && Number.isFinite(urlT)) {
      sendCommand({ type: 'jumpToJulianDate', julianDate: urlT });
    }
    // R1 #329 — `?focus=<bodyId>` 허용 body id 검증.
    // 미정의 id (예: `?focus=invalid`) 는 무시 + dev 경고 (CRITICAL #2 모호한 입력 방어).
    //
    // #415 — R-Phase allowlist 가드 (defense-in-depth store mutation 측면, 3번째 방어선).
    // ADR: docs/decisions/20260504-415-url-sync-guard.md §결정 1 (옵션 B).
    // #402 부모 ADR §결정 2 (UI) + §결정 3 (scene) 와 직교 — url-sync 의 store 직접 mutation 우회 차단.
    if (!tourEntry && urlFocus) {
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
    if (!tourEntry && urlSpeed !== null && urlSpeed !== undefined && Number.isFinite(urlSpeed)) {
      sendCommand({ type: 'setTimeScale', scale: urlSpeed });
    }
    // #1341 PR2 — 기준점은 store 만 쓴다. 화면 선은 sim-canvas 가 store (기준점 · 선택) 를 구독해 `setRuler` 명령으로 보낸다.
    // 무효 값은 파서가 warn 후 null — URL 에서도 지운다 (`?focus=` #418 과 같은 처분).
    if (!tourEntry && urlRuler !== null && urlRuler !== undefined) {
      const anchor = parseRulerAnchor(urlRuler);
      if (anchor !== null) setRulerAnchor(anchor);
      else setUrlRuler(null);
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

  // #1381 — 일시정지 중에만 store → URL `t` (모듈 머리 주석). 사건 선택은 `setTimeScale(0)` 으로 끝나므로 여기서 실린다.
  useEffect(() => {
    if (!initialized.current) return;
    const target = pausedUrlTime(pausedJulianDate, timeScale);
    if (target === undefined || target === urlT) return;
    setUrlT(target);
  }, [pausedJulianDate, timeScale, urlT, setUrlT]);

  useEffect(() => {
    if (!initialized.current) return;
    setUrlEngine(physicsEngine === 'kepler' ? null : physicsEngine);
  }, [physicsEngine, setUrlEngine]);

  useEffect(() => {
    if (!initialized.current) return;
    setUrlRuler(rulerAnchorId);
  }, [rulerAnchorId, setUrlRuler]);

  // #1390 — 진행 중인 투어 · 단계. 시작 대기 중에는 쓰지 않는다 (URL 진입 값을 시작 전에 지우지 않게). 대기 여부는 **지금** store 를
  // 읽는다 — 초기 effect 가 시작을 요청한 같은 커밋에서는 렌더 시점 값 (`tourPending`) 이 아직 false 다.
  useEffect(() => {
    if (!initialized.current || tourPending || useTourStore.getState().pendingStart !== null)
      return;
    setUrlTour(activeTourId);
    setUrlStep(activeTourId === null ? null : String(tourStepIndex + 1));
  }, [activeTourId, tourStepIndex, tourPending, setUrlTour, setUrlStep]);

  return null;
}

/**
 * #1381 — 일시정지 중 URL `t` 에 쓸 값. `undefined` = 쓰지 않는다 (재생 중 · 시각 미정), `null` = 키 삭제 (J2000 기본값).
 * 순수 함수로 둔 이유: 「재생 중에는 쓰지 않는다」 를 배속 부호 · 크기 전반에 대해 싸게 단언하기 위해서다 (`url-sync.test.tsx`).
 */
export function pausedUrlTime(
  julianDate: number | null,
  timeScale: number,
): number | null | undefined {
  if (timeScale !== 0 || julianDate === null || !Number.isFinite(julianDate)) return undefined;
  return julianDate === J2000_JD ? null : julianDate;
}
