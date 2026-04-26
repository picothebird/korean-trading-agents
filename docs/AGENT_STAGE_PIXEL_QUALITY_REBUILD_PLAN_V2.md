# Agent Stage 픽셀 품질 전면 개편 — 최종 실행안 v2 (최종)

> 작성일: 2026-04-26
> 상태: **구현 가능 확정안 + 자동 구축 진행 중**
> 대상: `frontend/src/components/game/*`, `frontend/src/components/stage/*`, `frontend/public/game/*`
>
> 본 문서는 v1 실행안의 방향성을 유지하되, **실제 코드/자산 실측**으로 발견한 오류·누락·허들을 반영한 최종본이다. Live/Story/Report 모드 토글 제거 핫픽스(§I)와 자동 구축 범위·제외 항목(§J)을 추가했다.

---

## §0. 결론

현 KTA 트레이딩 에이전트 화면이 레퍼런스(`pixel-agents-ref`, `ai-town-ref`)보다 낮은 이유는 디자인 감각이 아니라 **렌더링 구조 등급 차이**:

- 캐릭터/가구가 사각형·원 합성 (실제 픽셀 PNG 아님).
- 카메라가 폴백 상수 `MAP_COLS × SCREEN_TILE`만 신뢰 (외부 맵 cols/rows 무시).
- 리사이즈 시 `centerCameraOnMap()` 강제 호출로 사용자 시점 파괴.
- 분석 단계 변화에 카메라/캐릭터가 반응하지 않음.
- Live/Story/Report 3 모드 토글이 그리드 폭을 바꿔 카메라를 매번 리셋시킴 (→ §I에서 제거).

처방:
1. 실제 맵 크기를 카메라/미니맵의 SSOT로 만든다.
2. 첫 진입과 리사이즈를 fit/follow/free 모드로 분리.
3. thought/status/decision을 카메라 포커스 이벤트로 연결.
4. 도형 캐릭터/가구를 PNG 스프라이트 + manifest 기반으로 교체.
5. 단일 타일맵을 layout/seats/zones/furniture/depth 시스템으로 확장.
6. 분석 단계에 따라 캐릭터가 일하고/토론하고/결정하는 시각 상태 머신 추가.

---

## §A. 검증 결과 — v1 실행안의 어디가 맞고 어디가 틀렸나

### A-1. 그대로 진행

| v1 주장 | 실측 결과 |
|---|---|
| 카메라 bounds가 `MAP_COLS * SCREEN_TILE` 고정 | `OfficeScene.centerCameraOnMap()`, `getCameraInfo()` 모두 폴백 상수 사용 — externalMap 무시 |
| `onResize()`가 `centerCameraOnMap()` 강제 호출 | 동일 |
| `AgentActor`가 rect/circle 합성 | 확인 |
| `DeskProps`가 도형 합성 | 확인 |
| 상황 포커스 API 부재 | `OfficeSceneController` 5개 메서드만 존재 |

### A-2. 부분 보정

| v1 가정 | 실측 / 보정 |
|---|---|
| 외부 맵 일부 지원 | `drawDefaultOffice()`만 외부 cols/rows를 쓰고 카메라/미니맵은 내부 상수. **혼합 상태** → Phase 1에서 SSOT 일원화 |
| 단일 layer 폴백 | externalMap 스키마는 이미 `layers[]` 배열. v2 layout 스키마 추가 필요 |
| 미니맵 viewport 부정확 | `Minimap.tsx`는 비례 변환 정상. 문제는 `getCameraInfo`의 worldWidth — Phase 1에서 자동 해결 |

### A-3. 잘못된 가정 (수정 필요)

- **자산 라이선스**: pixel-agents-ref는 **MIT** (Copyright 2026 Pablo De Lucca). 상업 사용 OK. 단 크레딧 의무 (수동, §J 참조).
- **가구 manifest**: `image` 필드 **없음**. 컨벤션 `{ID}/{ID}.png`로 도출.
  ```json
  { "id": "BIN", "name": "Bin", "category": "misc", "type": "asset",
    "canPlaceOnWalls": false, "canPlaceOnSurfaces": false,
    "backgroundTiles": 0, "width": 16, "height": 16,
    "footprintW": 1, "footprintH": 1 }
  ```
- **캐릭터 수**: char_0~5 = **6장**. 9 role 매핑 시 3 role은 `tint` 재사용.
- **캐릭터 시트 프레임**: idle + walk만 즉시 사용, type/talk/decide는 effect overlay (느낌표/체크/말풍선 흔들림).
- **Phaser Container 마찰**: 현 `AgentActor` 주석에 "Container 미상속"이 의도적으로 명시됨. `SpriteAgentActor`도 같은 패턴 강제.
- **타일 크기 충돌**: KTA `TILE_SCALE=2`(16→32). 가구는 manifest.width/height가 다양 → 가구별 개별 scale.

---

## §B. 실제 적용 시 허들 (회피책 포함)

| # | 허들 | 회피 |
|---|---|---|
| B-1 | `MAP_COLS` 등 상수가 여러 파일에서 직접 import | 점진 deprecation. 새 코드만 `WorldMetrics` 사용 |
| B-2 | externalMap 신뢰성 | `validateOfficeMap`에 `cols/rows ≥ 4` + `layers[0].data` 검증 |
| B-3 | 자동 포커스 vs 사용자 입력 충돌 | wheel/drag 시 `manualOverrideUntil = now + 8000` + 진행 중 tween cancel |
| B-4 | Phaser tween + React resize race | 리사이즈 핸들러에서 진행 tween stop + 단일 진입점 `applyMode()` |
| B-5 | Bundle 크기 (수백 KB ~ 1~2 MB) | `OfficeScene.preload()`가 Stage 진입 시점에만 로드 (현행 유지) |
| B-6 | layout 스키마 호환성 | `ktt-office-layout@2`로 분리. v1(`@1`)/v2 둘 다 인식, 폴백 우선순위 v2→v1→default |
| B-7 | depth 정렬 시 라벨 가림 | `DEPTH` enum 강제 (bubble≥1000) |
| B-8 | SpriteAgentActor API 호환성 | `IAgentActor` 인터페이스 추출 (Phase 0). OfficeScene은 인터페이스만 의존 |
| B-9 | navmesh 미설치 시 동선 불가 | Phase 5b 분리. 5a는 자리 effect만 |
| B-10 | Minimap의 `DESK_POSITIONS` 직접 import | `controller.getSeats()` / `getZones()` 노출 |
| B-11 | 테스트 부재 | WorldMetrics, fitZoom 같은 순수 함수만 단위 테스트 |
| B-12 | 백엔드 status 분포 미검증 | Phase 1에서 콘솔 로그 1회 측정. 없는 status는 우선순위 표에서 제외 |
| B-13 | reduced-motion 미지원 | `CameraSystem.tweenDuration()`이 0~150ms 단축 + 즉시 setScroll 옵션 |

---

## §C. Phase 가드레일

각 Phase = **선행 조건 + 변경 범위 + 비-변경 보장 + 롤백 토글 + 종료 게이트**.

### Phase 0 — 준비
- `IAgentActor` 인터페이스 + `DEPTH` 상수 + 빈 라이선스 placeholder.
- 기존 `AgentActor`가 `implements IAgentActor` 추가 (동작 변경 없음).
- 종료 게이트: 빌드 통과, 화면 변화 0.

### Phase 1 — 카메라/월드 SSOT
- 신규: `systems/WorldMetrics.ts`, `systems/CameraSystem.ts`, `systems/FocusSystem.ts`.
- 변경: `OfficeScene` 내부 / `OfficeSceneController` 메서드 추가 / `Minimap` worldWidth 경유 / `defaultOfficeMap` deprecation 주석 / `HudControls` fit 버튼.
- 시그니처 보존: 기존 5개 컨트롤러 메서드 100% 보존.
- 롤백 토글: `USE_FIT_ZOOM`, `USE_FOCUS_SYSTEM` flag (모듈 상수).
- 종료 게이트: 다양한 office.json 크기에서 잘림 없음, 리사이즈 시 카메라 튐 없음, thought 도착 시 자동 포커스 동작.

### Phase 2 — Pixel Agents 자산
- `frontend/public/game/pixel-agents/`에 characters/floors/walls/furniture 복사.
- `assets/assetCatalog.ts`, `assets/furnitureCatalog.ts` 작성.
- `OfficeScene.preload()`에 신규 키 등록. 기존 Kenney 시트 유지.
- 비-변경 보장: 자산은 등록만, 화면 미사용.

### Phase 3 — SpriteAgentActor
- `actors/SpriteAgentActor.ts` (`IAgentActor` 구현, Container 비상속).
- 9 role → 6 char + tint 3종 매핑.
- `USE_SPRITE_ROLES` Set으로 점진 전환 (1 role → 9 role).

### Phase 4 — Trading Office Layout
- `layout/OfficeLayoutTypes.ts`(v2 스키마), `layout/layoutSerializer.ts`, `layout/tradingOfficePreset.ts`.
- `systems/LayoutSystem.ts`, `systems/DepthSystem.ts`.
- `/game/layouts/trading-office-v1.json` 작성.
- 미니맵·`DESK_POSITIONS`를 layout seats 기반으로 도출.

### Phase 5 — 상태 머신
- 5a: `systems/AgentStateSystem.ts` — status 별 effect overlay (이동 없음).
- 5b (옵션): `phaser-navmesh` + 토론/결정 동선.

### Phase 6 — HUD/미니맵 polish
- HUD에 fit/follow/free 모드 버튼 + 활성 표시.
- 미니맵에 active dot pulse + zone label.
- reduced-motion 처리.

---

## §D. 파일 단위 마이그레이션 계약

| 파일 | Phase | 외부 시그니처 보존 |
|---|---|---|
| `OfficeScene.ts` | 1, 3, 4, 5 | ✅ 모든 public method |
| `OfficeSceneController.ts` | 1, 4 | ✅ 추가만 |
| `AgentActor.ts` | 0 (interface), 후행 정리 | ✅ |
| `DeskProps.ts` | Phase 4에 폐기/fallback | ⚠️ |
| `defaultOfficeMap.ts` | 1 (deprecation), 4 (폴백 전용) | ✅ |
| `mapLoader.ts` | 4 | ✅ |
| `Minimap.tsx` | 1, 4 | ✅ |
| `HudControls.tsx` | 1, 6 | ✅ |
| `PhaserCanvas(Inner).tsx` | 2, 4, 6 | ✅ |
| `deskPositions.ts` | 4 | ⚠️ layout 도출로 전환 |
| 신규 systems / actors / assets / layout | 모두 신규 | — |

---

## §E. 관측·검증·롤백

### E-1. 관측 지점
1. Phase 1: `getCameraInfo()` 결과 dump → worldWidth/Height가 externalMap 기준인지.
2. Phase 2: `scene.textures.list` 키에 신규 자산 존재.
3. Phase 3: `actor.constructor.name` per role.
4. Phase 4: layout JSON load + furniture/seat count.
5. Phase 5: thought 시퀀스 vs animation 전이.
6. Phase 6: reduced-motion 기준 tween 시간.

### E-2. 회귀 체크리스트 (각 Phase)
- 사이드바 토글 시 카메라 튐 없음
- thought 도착 시 actor 위치 카메라 이동
- wheel 후 8초 자동 포커스 멈춤
- actor 클릭 → React panel 열림
- 말풍선 가림 0
- light/dark 가독성 정상

### E-3. 롤백 매트릭스
| Phase | 토글 |
|---|---|
| 0 | 영향 없음 |
| 1 | `USE_FIT_ZOOM`, `USE_FOCUS_SYSTEM` |
| 2 | 자산 register block 주석 |
| 3 | `USE_SPRITE_ROLES` 비우기 |
| 4 | layout v2 → v1 자동 폴백 |
| 5a | `USE_STATE_SYSTEM=false` |
| 5b | `USE_NAVMESH_MOTION=false` |
| 6 | UI 토글 숨김 |

---

## §G. PR 분할 (구현 권장 순서)

1. PR-A 핫픽스: Live/Story/Report 모드 제거 (§I)
2. PR-0 Phase 0: IAgentActor + DEPTH + 라이선스 placeholder
3. PR-1a: WorldMetrics + getCameraInfo 수정
4. PR-1b: CameraSystem.fit + resetCamera + onResize 가드
5. PR-1c: FocusSystem + 컨트롤러 메서드 + 자동 포커스
6. PR-2: 자산 import + preload + 카탈로그
7. PR-3a: SpriteAgentActor + 1 role 적용
8. PR-3b: 9 role 전체
9. PR-4a: layout 타입/serializer/preset
10. PR-4b: layout JSON + LayoutSystem
11. PR-5a: AgentStateSystem (effect만)
12. PR-5b (옵션): navmesh 동선
13. PR-6: HUD/미니맵 polish + reduced-motion

---

## §I. Live/Story/Report 모드 토글 제거 (PR-A, 적용 완료)

### I-1. 문제

기존 `StageModeToggle` + `useAgentStage` 스토어가 만든 부작용:

- **창 크기 변동**: `AgentStage.tsx`의 `gridTemplateColumns`가 `mode === "report" ? "200px 1fr" : "1fr 340px"` + transition. 모드 변경 시 캔버스 폭 변동 → ResizeObserver → `OfficeScene.onResize()` → `centerCameraOnMap()`로 카메라 강제 중앙 이동.
- **자동 전환 폭주**: `autoMode` 기본 ON. 분석 종료 6초 후 `setMode("story")` 자동 호출 → 사용자 시점 + 진행 중 tween 모두 파괴.
- **복구 불가**: 모드 복귀 버튼이 캔버스 폭만 되돌리고, 그 사이 줌/스크롤은 이미 사라진 상태.
- **본문 잉여**: 모드별 회의록 본문은 분석 탭 `AnalysisResult`에 일원화돼 중복.

### I-2. 조치 (적용 완료)

물리 삭제:
- `frontend/src/stores/useAgentStage.ts`
- `frontend/src/components/stage/StageModeToggle.tsx`

단순화:
- `AgentStage.tsx`: `mode` 상태/모드 분기 제거. `gridTemplateColumns: "1fr 340px"` 고정. `StageRecentStrip` 항상 표시. `MeetingMinutes`는 decision 도착 시 항상 표시. SFX/aria-live 유지.
- `MeetingMinutes.tsx`: `mode` prop 제거, "라이브로 돌아가기" 버튼 제거.
- `stage/index.ts`: `StageModeToggle` export 제거.

`StageTopLine.onClickHeadline`은 옵셔널이라 호환.

### I-3. 후속

Phase 1의 `CameraSystem.onResize` 가드(B-4)는 유효. 사이드바/창 크기 변경은 사용자 의도와 별개로 일어나기 때문.

---

## §J. 라이선스/크레딧 작업 분리 (수동)

자동 구축 범위에서 제외:
- `frontend/public/game/licenses/pixel-agent-assets.md` 본문
- 앱 about/credits 페이지의 링크
- CI 라이선스 검사

자동 구축 범위에 포함:
- 자산 디렉터리 복사·preload 등록
- 라이선스 placeholder 빈 파일 생성

DoD §E-4의 "라이선스 페이지 표기" 항목은 사용자가 별도로 작성한다.

---

## §H. 마지막 결론

이 v2 안대로 진행하면

- 어떤 Phase에서도 화면이 깨지지 않는다 (각 Phase가 단독 revert 가능).
- 외부 시그니처(`OfficeSceneController`, `IAgentActor`)는 전체 마이그레이션 동안 보존.
- v1의 "단번에 끊기" 항목들은 **점진 전환 + deprecation**으로 완화.
- Phase 1만 끝나도 사용자 체감 "맵 잘림"·"카메라 튐"이 즉시 해결.
- Live/Story/Report 모드 부작용은 PR-A 핫픽스로 이미 제거됨.
- 라이선스/크레딧은 수동 분리.

## §K. 적용 완료 체크리스트 (자동 실행 결과)

- ✅ PR-A: Live/Story/Report 토글 제거
- ✅ Phase 0: `IAgentActor` 인터페이스 + `DEPTH` 상수
- ✅ Phase 1: `WorldMetrics` + `CameraSystem`(fit/free/follow) + `FocusSystem` + 컨트롤러 API 확장
- ✅ Phase 2: Pixel Agents 캐릭터 시트 6종 preload + `assetCatalog`
- ✅ Phase 3: 9개 role `SpriteAgentActor` 활성 (USE_SPRITE_ROLES)
- ✅ Phase 4a: 자산 49 파일 복사 (floors/walls/15 furniture)
- ✅ Phase 4b: `furnitureCatalog.ts` (24 가구 + 2 floor + 1 wall)
- ✅ Phase 4c: `OfficeLayoutTypes.ts` (`ktt-office-layout@2`)
- ✅ Phase 4d: `tradingOfficePreset.ts` (30×20 트레이딩 오피스, 9 desks + 회의실)
- ✅ Phase 4e: `LayoutSystem` + `DepthSystem`, `OfficeScene.drawDefaultOffice` 교체
- ✅ Phase 4f: `controller.getSeats/getZones`, Minimap migration + 활성 도트 펄스
- ✅ Phase 5a: `AgentStateSystem` (status별 이모지 오버레이)
- ✅ Phase 6 (부분): HUD fit/follow/free + 모드 배지
- ✅ 폴리시: `validateOfficeMap` cols/rows ≥ 4 가드, `defaultOfficeMap` deprecation
- ⏭️ 테스트 (Phase 5b 후속): vitest 미도입 (의존성 추가 보류). TS strict + production build이 quality gate 역할.
- ⏭️ §J: 라이선스/크레딧 (수동, 사용자 작업)

`npm run build` 통과 (TypeScript strict, 7개 페이지 정적 prerender 완료).
