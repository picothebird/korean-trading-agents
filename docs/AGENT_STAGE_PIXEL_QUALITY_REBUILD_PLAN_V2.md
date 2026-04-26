# Agent Stage 픽셀 품질 전면 개편 — 최종 실행안 v2

> 작성일: 2026-04-26
> 상태: **구현 가능 확정안** (v1 실행안 + 코드 실측 + 레퍼런스 자산 실측 + 위험 분석)
> 대상: `frontend/src/components/game/*`, `frontend/src/components/stage/*`, `frontend/public/game/*`
> 전제: v1 [`AGENT_STAGE_PIXEL_QUALITY_REBUILD_PLAN.md`](./AGENT_STAGE_PIXEL_QUALITY_REBUILD_PLAN.md)의 방향성은 유지. 본 문서는 **실제 코드/자산을 검증한 결과 발견한 오류·누락·허들**을 보강한 최종본이다.
>
> v1과의 차이: §A(검증 결과 v1의 어디가 틀렸나) + §B(실제 적용 시 마주칠 허들) + §C(안전한 단계 전환 전략) + §D(파일 단위 마이그레이션 계약) + §E(롤백/관측/완료 게이트). v1 문서의 6단계 Phase 구조는 유지하되, 각 Phase 앞에 **선행 조건**과 **롤백 절차**를 명시한다.

---

## §A. v1 실행안 검증 결과 — 무엇이 맞고 무엇이 틀렸나

v1 문서의 진단 중 일부는 **현재 코드 기준으로 이미 부분 해결돼 있거나, 가정한 자산 구조와 실제가 다르다**. 그대로 진행하면 Phase 1~2에서 막힌다.

### A-1. 맞았던 진단 (그대로 진행)

| v1 주장 | 실측 결과 | 결론 |
|---|---|---|
| 카메라 bounds가 `MAP_COLS * SCREEN_TILE` 고정 | [`OfficeScene.ts`](../frontend/src/components/game/OfficeScene.ts)의 `centerCameraOnMap()`, `getCameraInfo()`가 폴백 상수 사용 — externalMap 무시 | 수정 필요 (Phase 1 §5.1) |
| `onResize()`가 `centerCameraOnMap()` 강제 호출 | 동일 파일 `onResize()`에서 무조건 호출 확인 | 수정 필요 (Phase 1 §5.3) |
| `AgentActor`가 rect/circle 합성 | 확인됨. `HEAD_W=8` 등 픽셀 사각형 합성 | 교체 필요 (Phase 3) |
| `DeskProps`가 도형 합성 | 확인됨 | 교체 필요 (Phase 4) |
| `panCameraTo()`만 있고 상황 포커스 API 없음 | [`OfficeSceneController.ts`](../frontend/src/components/game/OfficeSceneController.ts) 5개 메서드만 존재 — 확인 | 확장 필요 (Phase 1 §5.2) |

### A-2. 부분적으로 틀렸던 진단

| v1 주장 | 실측 | 보정 |
|---|---|---|
| "외부 맵을 일부 지원" | `drawDefaultOffice()`는 externalMap의 cols/rows로 그리지만 **카메라/미니맵은 폴백 상수 사용** — 즉 "그리기는 외부, 카메라는 내부"라는 **혼합 상태** | Phase 1에서 카메라/미니맵까지 일원화. `WorldMetrics`는 단일 진실 소스(SSOT) |
| "단일 layer 폴백" | `defaultOfficeMap.ts` 폴백은 단일 grid지만, externalMap 스키마는 `layers[]` 배열로 확장 가능하게 이미 설계됨 ([`mapLoader.ts`](../frontend/src/components/game/mapLoader.ts)) | layers 배열 활용 — Phase 4에서 floor/wall/furniture로 확장. 스키마 v2 별도 정의 |
| 미니맵 viewport 부정확 | 실제로는 [`Minimap.tsx`](../frontend/src/components/game/Minimap.tsx)가 `getCameraInfo()` 결과를 비례 변환. 문제는 `getCameraInfo`가 잘못된 worldWidth를 돌려준다는 것 | 미니맵 자체 수정보다 `getCameraInfo()` 진실값 수정으로 자동 해결 |

### A-3. 잘못된 가정 (이대로 따르면 막힘)

#### A-3-1. Pixel Agents 자산 라이선스/구조 가정 오류

v1: "사용자가 비상업 목적이라고 명시했으므로 pixel-agents 자산을 우선 사용".

**실측**: [`pixel-agents-ref/LICENSE`](../../pixel-agents-ref/LICENSE) = MIT (Copyright 2026 Pablo De Lucca). **상업/비상업 무관**하게 사용 가능. 단, 저작권 표기는 필수.

→ "비상업 한정"이라는 잘못된 제약을 제거. 다만 **앱 내 라이선스 페이지에 MIT 고지 + 원저자 크레딧** 필수.

#### A-3-2. 가구 manifest 스키마 가정 오류

v1이 가정한 `FurnitureAsset.image` 필드가 manifest에 **존재하지 않는다**. 실측 manifest:

```json
{
  "id": "BIN",
  "name": "Bin",
  "category": "misc",
  "type": "asset",
  "canPlaceOnWalls": false,
  "canPlaceOnSurfaces": false,
  "backgroundTiles": 0,
  "width": 16,
  "height": 16,
  "footprintW": 1,
  "footprintH": 1
}
```

PNG는 `{ID}/{ID}.png` 컨벤션 (예: `furniture/BIN/BIN.png`). v1의 `FurnitureAsset` 인터페이스를 다음과 같이 보정:

```ts
interface FurnitureAsset {
  id: string;                  // manifest.id (e.g., "DESK")
  name: string;
  category: string;
  imageUrl: string;            // 규약: `/game/pixel-agents/furniture/${id}/${id}.png` — 코드에서 도출
  width: number;               // px (manifest.width)
  height: number;              // px (manifest.height)
  footprintW: number;          // tile 단위
  footprintH: number;
  canPlaceOnWalls: boolean;
  canPlaceOnSurfaces: boolean;
  backgroundTiles: number;
  // KTA 확장:
  seat?: { col: number; row: number; direction: "down"|"up"|"left"|"right" };
  zOffset?: number;
}
```

**`seat`/`zOffset`는 manifest에 없으므로 KTA의 `furnitureCatalog.ts`에서 ID별로 매핑**한다 (manifest를 그대로 신뢰하지 말 것).

#### A-3-3. 캐릭터 수 부족

v1은 "9 role × char 시트" 가정. 실측: `char_0.png` ~ `char_5.png` = **6장**.

→ 9 role 매핑 시 **3 role은 시트 재사용** 필요. 옵션:
- (A) 색조 tint로 차별화 (Phaser `setTint()` — 단순)
- (B) 모자/안경 오버레이 추가 (복잡, 별도 자산 필요)
- (C) 추가 캐릭터 시트 생성/구입 (Phase 3 범위 초과)

**채택**: (A) tint 차별화 + role label로 식별. `SpriteAgentActor`의 옵션 `tint?: number`로 노출.

#### A-3-4. 캐릭터 시트의 프레임 구조 미정의

v1은 `idle/walk/type/talk/decide/done` 6개 상태를 가정하지만, `char_0.png`의 실제 레이아웃은 작은 스프라이트 시트 (대략 2행 × 8열, 4방향 walk 추정).

→ Phase 3 시작 전 **프레임 레이아웃 실측 + `spriteFrameMap.ts`에 frame index 명시**가 선행되어야 함. v1의 6 상태는 다음으로 보정:

| 상태 | Phase 3 (즉시) | Phase 5 (확장) |
|---|---|---|
| idle | 단일 frame | idle blink (2 frame) |
| walk | walk 4-frame loop | 방향별 4 set |
| type | idle frame + 작은 bob | 별도 typing frame (없으면 idle 유지) |
| talk | idle frame + 입 부분 sprite swap (불가시 idle) | 표정 frame (없으면 idle) |
| decide | idle + 별도 effect (느낌표 sprite) | — |
| done | idle + 체크 effect | — |

즉 **Phase 3에서는 idle + walk만 진짜 애니메이션**, 나머지는 effect overlay로 보강. 실제 talk/type frame이 시트에 없으면 우회 불가능하므로 솔직하게 인정한다.

#### A-3-5. Phaser 버전과 타이핑 마찰

[`AgentActor.ts`](../frontend/src/components/game/AgentActor.ts) 주석: "Phaser.GameObjects.Container 미상속 (typings 마찰 회피)". 즉 **Container 상속을 피한 이유**가 코드에 명시돼 있다. v1은 `SpriteAgentActor`를 "Sprite 또는 Container 기반"이라고만 적었지만, 동일 마찰을 다시 만난다.

→ Phase 3 결정사항: `SpriteAgentActor`도 **Container 비상속**. 내부 Sprite + Effect 객체들을 owner-managed `setPosition()`으로 함께 이동. 기존 `AgentActor`와 동일 패턴 유지.

#### A-3-6. 타일 크기 충돌

KTA: source 16px → screen 32px (`TILE_SCALE=2`).
Pixel Agents 가구: 16px (BIN) ~ ?? — `width`/`height`가 manifest에 명시. 일부는 32px, 48px일 수 있음.

→ 가구 sprite는 **manifest.width/height 기준으로 직접 scale 적용**, `TILE_SCALE`을 가구에 일률 적용하지 말 것. `LayoutSystem`에서 가구 좌표는 `(col * SCREEN_TILE) + offset`, sprite는 `setScale(TILE_SCALE)` 일괄이 아니라 가구별 결정.

---

## §B. 실제 적용 시 마주칠 허들 (사전 식별)

v1을 그대로 "Phase 1부터 시작" 하면 다음에서 막힌다. 각 항목은 **회피책**까지 포함.

### B-1. WorldMetrics 도입 시 충돌

`MAP_COLS`, `MAP_ROWS`, `MAP_TILE`, `SCREEN_TILE`은 [`Minimap.tsx`](../frontend/src/components/game/Minimap.tsx), [`deskPositions.ts`](../frontend/src/components/game/deskPositions.ts), [`RoomLabels.ts`](../frontend/src/components/game/RoomLabels.ts) 등에서 **직접 import**돼 있다. 한 번에 끊으면 빌드 깨짐.

회피: 상수는 그대로 두고 **deprecation 주석** + `getWorldMetrics()`를 새 진실로 추가. 호출부를 한 파일씩 점진 전환. v1의 "직접 사용 금지"는 최종 상태이지 1차 PR 목표가 아니다.

### B-2. externalMap 신뢰성

[`OfficeScene.preload()`](../frontend/src/components/game/OfficeScene.ts)는 `office-map` JSON을 로드하지만 fail handler 없음. **현 코드는 cache.json.has() 체크로 우회**. WorldMetrics가 externalMap을 진실로 삼으면, 잘못된 JSON이 들어왔을 때 카메라가 `0×0` 월드를 가리켜 검은 화면이 된다.

회피: `validateOfficeMap()` 강화 — `cols >= 4`, `rows >= 4`, `layers[0].data` 존재 검증. 실패 시 폴백 + console.error.

### B-3. 자동 포커스 vs 사용자 조작 충돌

v1 §6.4의 "manual override 8초"는 좋지만, 현재 [`OfficeScene.setupCameraControls()`](../frontend/src/components/game/OfficeScene.ts)는 wheel/drag 이벤트를 직접 카메라에 연결한다. FocusSystem이 동시에 `cam.pan()` tween을 돌리면 **사용자 wheel과 tween이 충돌**해 카메라가 떨린다.

회피:
- FocusSystem이 active tween일 때는 wheel/drag가 즉시 tween을 cancel.
- 사용자 입력 → `manualOverrideUntil = now + 8000` 갱신 → FocusSystem polling 시 이 timestamp 체크.
- `cam.pan()` 진행 중 사용자 입력 발생 → `cam.panEffect.reset()` 호출 후 사용자 제어로 즉시 양도.

### B-4. Phaser tween + React resize race

리액트 컨테이너 리사이즈가 빈번 (사이드바 토글). 리사이즈 → `CameraSystem.fit()` 또는 follow target 재계산 중에 **tween이 동시에 진행**되면 마지막 호출자가 이긴다.

회피: 리사이즈 핸들러에서 진행 중 tween을 항상 stop, 모드별 `applyMode(currentMode)` 단일 진입점으로 통일.

### B-5. Bundle 크기

Pixel Agents 자산 일부 (캐릭터 6장 + 가구 25 카테고리 + 바닥/벽) ≈ **수백 KB ~ 1~2 MB**. KTA frontend는 Next.js 16. `public/`에 두면 lazy 로드는 되지만 **첫 진입 응답성**에 영향.

회피:
- Phase 2에서 자산을 `public/game/pixel-agents/`에 놓되, `OfficeScene.preload()`는 **Stage 진입 시점에만** 호출 (이미 그렇게 동작 — 확인됨).
- 라이선스 문서 1KB만 항상 노출.
- 큰 sprite는 atlas로 합치지 않는다 (overhead vs ergonomic 트레이드오프 — Phase 2에서는 개별 PNG 유지).

### B-6. Layout JSON 스키마 호환성

현재 `office.json` 스키마 = `ktt-office-map@1` (단일 layer tile grid). v1의 `trading-office-v1.json`은 floors/walls/furniture/seats/zones를 가진 **완전히 다른 스키마**. 같은 endpoint로 두면 파싱 실패.

회피: 새 스키마는 `schema: "ktt-office-layout@2"` + 별도 파일 `/game/layouts/trading-office-v1.json`. v1 스키마와 v2 스키마 둘 다 mapLoader가 인식 (분기). 폴백 우선순위: layout v2 → map v1 → defaultOfficeMap.

### B-7. Depth 정렬 도입 시 라벨/말풍선 가림

현재 `AgentActor`의 라벨/말풍선은 **별도 depth 관리 없음** (생성 순서). y-기반 depth 도입 시, 캐릭터보다 화면 아래에 있는 가구가 캐릭터의 말풍선 위로 올라올 수 있다.

회피: depth 규약을 v1 §7.6대로 적용하되, **bubble/label은 무조건 `1000+`**. 코드 enum으로 강제:

```ts
export const DEPTH = {
  FLOOR: 0,
  WALL_BACK: 50,
  ENTITY_BASE: 100,    // + zY
  WALL_FRONT: 900,
  BUBBLE: 1000,
  LABEL: 1100,
  HUD_OVERLAY: 2000,
} as const;
```

### B-8. SpriteAgentActor 도입 시 API 호환성

`OfficeScene.applySnapshot()`은 `actor.setStatus()`, `actor.showMessage()`, `actor.onPointerDown()`, `actor.pulse()`를 호출. SpriteAgentActor가 같은 시그니처를 안 지키면 호출부 모두 수정 필요.

회피: **인터페이스 분리**. `IAgentActor`를 추출 → 기존 `AgentActor`와 신규 `SpriteAgentActor`가 모두 구현. OfficeScene은 인터페이스만 안다. Phase 3는 인터페이스 추출 → 신규 actor 작성 → 한 role씩 점진 교체.

```ts
export interface IAgentActor {
  readonly role: AgentRole;
  readonly x: number;
  readonly y: number;
  setStatus(status: AgentStatus): void;
  showMessage(text: string): void;
  onPointerDown(handler: () => void): void;
  pulse(time: number): void;
  destroy(): void;
}
```

### B-9. AgentStateSystem (Phase 5) 동선 충돌

캐릭터 9명이 동시에 토론 테이블로 이동하면 **겹친다**. `phaser-navmesh`는 v1에서 "이후 도입"이라고만 적혀 있다. 단순 tween만 쓰면 가구를 통과한다.

회피: Phase 5 시작 시점에 navmesh 미도입이면 **이동을 비활성화**하고 "자리에서 head turn + bubble" 연출만. 동선이 필요한 토론/결정 연출은 Phase 5b로 분리.

### B-10. 미니맵의 `DESK_POSITIONS` 직접 import

[`Minimap.tsx`](../frontend/src/components/game/Minimap.tsx)는 `DESK_POSITIONS`를 직접 import. Phase 4에서 좌석을 layout JSON 기반으로 바꾸면 미니맵도 동시 업데이트 필요.

회피: Phase 4에서 `layoutSerializer.getSeats()` 결과를 `controller.getSeats()`로 노출 → Minimap이 컨트롤러 경유. 폴백은 `DESK_POSITIONS`.

### B-11. 테스트 부재

`frontend/src/components/game/`에 **단위 테스트 0개** (vitest 미설치 또는 미사용 추정). 카메라 fit 수식이나 focus 우선순위는 로직 버그가 회귀하기 쉽다.

회피: WorldMetrics, fitZoom, FocusSystem.priority 같은 **순수 함수만 단위 테스트** 추가. Phaser 인스턴스 모킹은 시도하지 않는다.

### B-12. 백엔드 결합

v1 §6.3은 thought status에 따라 카메라가 따라가게 한다고 적었지만, 현재 백엔드 `AgentThought.status`가 v1이 가정한 모든 상태(`thinking/analyzing/debating/deciding/done`)를 정확히 보내는지 미검증.

회피: Phase 1에서 **현재 status 전송 분포**를 콘솔 로그로 1회 측정 → 부족한 status는 클라이언트에서 추론하지 않고 백엔드 보강. v1 §6.3 우선순위 표는 "관측된 status에 한정"으로 축소.

### B-13. prefers-reduced-motion / 접근성

v1 §6.5는 tween 520ms 권장. reduced-motion 사용자에게 강제 시 멀미 유발. 별도 처리 필요.

회피: `CameraSystem.tweenDuration()`이 `window.matchMedia('(prefers-reduced-motion)')` 결과에 따라 0~150ms 단축. tween 대신 즉시 `setScroll()` + `setZoom()` 가능.

---

## §C. 안전한 단계 전환 전략 (Phase별 가드레일)

v1의 6 Phase 순서는 유지. 각 Phase에 **선행 조건 / 변경 범위 / 비-변경 보장 / 롤백 절차 / 종료 게이트**를 명시.

### Phase 0 — 준비 (신규 추가)

목적: Phase 1 이후의 모든 변경을 안전하게 만든다.

작업:
1. `IAgentActor` 인터페이스 추출 (B-8 대비). 기존 `AgentActor`가 구현하도록 declaration만 추가. 동작 변경 없음.
2. `DEPTH` 상수 enum 정의 (B-7 대비). 기존 코드는 미사용. 새 코드만 사용.
3. `frontend/src/components/game/__tests__/` 디렉터리 생성. vitest config 확인. 없으면 vitest 설치 + 최소 smoke 테스트 1개 ("WorldMetrics returns positive width") 추가.
4. **자산 라이선스 헤더 파일** `frontend/public/game/licenses/pixel-agent-assets.md` 생성 — Phase 2에서 자산 들어오기 전에 비어 있는 채로라도 commit. CI에서 자산 디렉터리에 README 누락 시 fail 옵션 검토.
5. 기존 시각 회귀 테스트를 위해 **현 화면 스크린샷 1장** 확보 (수동, `docs/screenshots/before-rebuild.png`).

종료 게이트: 빌드 통과, 기존 화면 변화 0.

### Phase 1 — 카메라/월드 SSOT (v1과 동일, 가드 추가)

선행 조건: Phase 0 완료.

신규 파일:
- `frontend/src/components/game/systems/WorldMetrics.ts` — 순수 함수 `getWorldMetrics(map: OfficeMapData | null): WorldMetrics`.
- `frontend/src/components/game/systems/CameraSystem.ts` — Phaser scene을 받아 fit/free/follow/cinematic 모드 관리.
- `frontend/src/components/game/systems/FocusSystem.ts` — thoughts/decision을 받아 target role/zone 결정 (순수 로직 + scene 호출 분리).

변경 파일:
- `OfficeScene.ts` — `centerCameraOnMap()` 내부만 WorldMetrics 사용. `getCameraInfo()`도 동일.
- `OfficeSceneController.ts` — 신규 메서드 추가 (`fitToWorld`, `setCameraMode`, `focusAgent`, `focusZone`). 기존 메서드 시그니처 **불변**.
- `Minimap.tsx` — `MAP_COLS/ROWS` 직접 사용을 `controller.getCameraInfo()`의 worldWidth/Height로 교체.
- `defaultOfficeMap.ts` — 상수 export는 유지하되 `@deprecated use WorldMetrics` 주석.

비-변경 보장:
- `AgentActor`, `DeskProps`, `RoomLabels`, sfx, 기존 wheel/drag 거동 모두 동일 동작.
- 시각적으로는 **첫 진입 시 fit zoom**만 달라짐.

롤백:
- `CameraSystem.fit()` 사용 부분을 `centerOn(map/2)` + `setZoom(1)`로 되돌리는 1라인 토글 (`USE_FIT_ZOOM` 환경변수 또는 dev flag).

종료 게이트:
- `office.json`을 30×20, 40×28, 60×40으로 바꿔 빌드/실행 → 미니맵·카메라 잘림 0.
- 사이드바 토글 시 카메라 중앙으로 튀지 않음.
- thought 도착 시 해당 role 책상으로 카메라 pan (manual override 8초 동작 확인).

### Phase 2 — 자산 가져오기 (v1과 동일, 라이선스/atlas 보강)

선행 조건: Phase 1 완료.

작업:
1. `pixel-agents-ref/webview-ui/public/assets`에서 다음만 복사:
   - `characters/char_0.png` ~ `char_5.png`
   - `floors/*.png` (전체)
   - `walls/*.png` (전체)
   - `furniture/{DESK,PC,WHITEBOARD,BOOKSHELF,DOUBLE_BOOKSHELF,SOFA,CUSHIONED_CHAIR,WOODEN_CHAIR,COFFEE_TABLE,SMALL_TABLE,PLANT,LARGE_PLANT,CACTUS,CLOCK,COFFEE,LARGE_PAINTING,SMALL_PAINTING,BIN,WOODEN_BENCH,CUSHIONED_BENCH}/{ID}.png + manifest.json`
2. 복사 위치: `frontend/public/game/pixel-agents/`.
3. **라이선스**: MIT 전문 + "© 2026 Pablo De Lucca" 표기를 `frontend/public/game/licenses/pixel-agent-assets.md`에 작성. 앱 about/credits 페이지에서 링크.
4. `assetCatalog.ts`, `furnitureCatalog.ts` 작성. **manifest.json 스키마 보정**(§A-3-2) 그대로 반영.
5. `OfficeScene.preload()`에 신규 자산 등록. 기존 Kenney 시트는 **유지** (Phase 4 전까지는 폴백/혼합).

비-변경 보장: 등록만 하고 실제 화면에는 사용하지 않는다 (Phase 3에서 캐릭터부터 사용).

롤백: 자산 디렉터리 삭제 + `preload()` registration 주석. 기존 화면 영향 0.

종료 게이트:
- DevTools Network에서 신규 자산 PNG 200 응답.
- Phaser texture cache에 신규 키 등록 확인 (콘솔 1회 디버그).
- 기존 화면은 변화 없음.

### Phase 3 — SpriteAgentActor (v1 + B-8 인터페이스 + A-3-3 tint + A-3-6 scale)

선행 조건: Phase 2 완료, `IAgentActor` 인터페이스 존재 (Phase 0).

작업:
1. `actors/SpriteAgentActor.ts` 작성. `IAgentActor` 구현. Container **비상속**.
2. `actors/AgentAnimationController.ts`: 우선 **idle + walk만** 정의. type/talk/decide는 effect overlay (느낌표/체크/말풍선 흔들림)로 보강.
3. 9 role → 6 char skin 매핑:
   ```ts
   const ROLE_SKIN: Record<AgentRole, { sheet: string; tint?: number }> = {
     technical_analyst:   { sheet: "char_0" },
     fundamental_analyst: { sheet: "char_1" },
     sentiment_analyst:   { sheet: "char_2" },
     macro_analyst:       { sheet: "char_3" },
     bull_researcher:     { sheet: "char_4" },
     bear_researcher:     { sheet: "char_5" },
     risk_manager:        { sheet: "char_0", tint: 0xff9999 }, // 재사용 + 붉은 tint
     portfolio_manager:   { sheet: "char_1", tint: 0xa0c4ff }, // 푸른 tint
     guru_agent:          { sheet: "char_2", tint: 0xffd166 }, // 금색 tint
   };
   ```
4. `OfficeScene.spawnActors()`를 **role 단위 토글 가능**하게 변경:
   ```ts
   const useSprite = (role: AgentRole) => USE_SPRITE_ROLES.has(role);
   ```
   초기 `USE_SPRITE_ROLES = new Set(["technical_analyst"])` → 검증 후 1명씩 추가.
5. 기존 `AgentActor`는 **legacy로 옮기지 않는다**(아직). Phase 5 종료 후 일괄 정리.

비-변경 보장: USE_SPRITE_ROLES에 들어간 role만 변경. 나머지는 기존 사각형 캐릭터 유지.

롤백: `USE_SPRITE_ROLES = new Set()`.

종료 게이트:
- 1 role → 9 role까지 점진 전환 완료.
- 클릭 hit area 정상 (책상에서 actor 클릭 시 React panel 열림).
- 말풍선 위치/타이밍 회귀 없음.
- depth 규약상 가구·캐릭터·말풍선 가림 정상.

### Phase 4 — Trading Office Layout (v1 + B-6 스키마 분리 + B-10 미니맵 분리)

선행 조건: Phase 3 완료, `furnitureCatalog.ts` 안정.

작업:
1. `layout/OfficeLayoutTypes.ts` — 스키마 v2 정의:
   ```ts
   interface TradingOfficeLayout {
     schema: "ktt-office-layout@2";
     id: string;
     cols: number;
     rows: number;
     tileSize: number;
     floors: PlacedTile[];
     walls: PlacedTile[];
     furniture: PlacedFurniture[];
     seats: Record<AgentRole, Seat>;
     zones: Record<OfficeZone, Rect>;
   }
   ```
2. `layout/layoutSerializer.ts` — JSON 로드 + validate. v1 스키마(`@1`) 들어오면 기존 mapLoader 경유, v2면 신규 경유.
3. `layout/tradingOfficePreset.ts` — 코드로 만든 기본 layout (JSON 작성 전 임시 fallback). 9 role seat + 5 zone + 20+ furniture.
4. `/game/layouts/trading-office-v1.json` 작성 — preset과 같은 데이터.
5. `LayoutSystem`이 layout을 받아 floor/wall/furniture sprite 생성. 기존 `drawDefaultOffice()`는 v1 스키마 처리 전용으로 축소.
6. `controller.getSeats()`, `controller.getZones()` 추가 → Minimap이 이를 사용 (B-10).
7. `DESK_POSITIONS`는 layout seats에서 파생되도록 변경 (혹은 layout 부재 시 폴백).

비-변경 보장: layout JSON 로드 실패 시 v1 스키마 또는 defaultOfficeMap 폴백.

롤백: 신규 layout JSON 제거 → 기존 office.json으로 자동 복귀.

종료 게이트:
- Trading office가 5개 zone, 20+ 가구로 채워져 있다.
- 좌석 좌표 변경 시 캐릭터/미니맵 모두 일관 갱신.
- depth 규약 지켜짐.

### Phase 5 — 상태 머신/동선 (v1 + B-9 동선 분리)

선행 조건: Phase 4 완료, navmesh 라이브러리 설치 여부 결정.

작업 (5a, 동선 없음):
1. `AgentStateSystem` 작성. thought status → animation/effect 매핑.
2. L1: 자리에서 typing effect.
3. L2/L3: 자리 그대로 + 카메라 포커스 + bubble 강조 (이동 없음).

작업 (5b, 동선 추가, 옵션):
4. `phaser-navmesh` 설치 + walls/furniture를 navmesh polygon으로 변환.
5. L2 토론 시 bull/bear가 토론 테이블로 이동.
6. L3 결정 시 risk/portfolio/guru가 결정실로 이동.

비-변경 보장: 5a는 좌표 변동 없음. 5b는 navmesh 빌드 실패 시 자동으로 5a로 폴백.

롤백: 5b만 비활성화 가능 (`USE_NAVMESH_MOTION = false`).

종료 게이트:
- 분석 단계 변화에 따라 캐릭터 시각 상태가 바뀜.
- 5b 활성 시 가구 통과 0건, 겹침 0건.

### Phase 6 — HUD/미니맵/모드 polish (v1과 동일)

선행 조건: Phase 4 완료. (Phase 5와 병렬 가능)

작업: v1 §8 Phase 6 그대로. fit/follow/free 토글, 미니맵 active dot pulse, reduced-motion 처리(B-13).

롤백: HUD 변경은 시각만이므로 1 PR 단위 revert.

---

## §D. 파일 단위 마이그레이션 계약

각 파일이 어떤 Phase에 어떻게 변하는지, **시그니처 보존 여부**를 명시.

| 파일 | Phase | 변경 종류 | 외부 시그니처 보존 |
|---|---|---|---|
| [`OfficeScene.ts`](../frontend/src/components/game/OfficeScene.ts) | 1, 3, 4, 5 | 내부 구현만 변경 | ✅ Phaser scene key, applyThoughts(), public method 모두 보존 |
| [`OfficeSceneController.ts`](../frontend/src/components/game/OfficeSceneController.ts) | 1, 4 | **추가만** (기존 메서드 변경 없음) | ✅ 기존 5개 메서드 100% 보존 |
| [`AgentActor.ts`](../frontend/src/components/game/AgentActor.ts) | 0 (interface only), Phase 5 종료 후 legacy 이동 | Phase 0에 `implements IAgentActor` 추가 | ✅ |
| [`DeskProps.ts`](../frontend/src/components/game/DeskProps.ts) | Phase 4 종료 후 폐기 또는 fallback | 신규 LayoutSystem이 가구 그림 | ⚠️ 호출부(OfficeScene.spawnActors)는 Phase 4에서 제거 |
| [`defaultOfficeMap.ts`](../frontend/src/components/game/defaultOfficeMap.ts) | 1 (deprecation 주석), Phase 4 (폴백 전용) | 상수 export 유지 | ✅ |
| [`mapLoader.ts`](../frontend/src/components/game/mapLoader.ts) | 4 | v2 스키마 인식 추가 | ✅ 기존 `loadOfficeMap()` 보존 |
| [`PhaserCanvas.tsx`](../frontend/src/components/game/PhaserCanvas.tsx) | 6 | camera mode 상태 prop 전달 | ✅ |
| [`PhaserCanvasInner.tsx`](../frontend/src/components/game/PhaserCanvasInner.tsx) | 2, 4 | scene 생성 시 asset/layout config | ✅ |
| [`Minimap.tsx`](../frontend/src/components/game/Minimap.tsx) | 1, 4 | 상수 import → controller 경유 | ✅ |
| [`HudControls.tsx`](../frontend/src/components/game/HudControls.tsx) | 1 (fit 버튼 추가), 6 (mode UI) | 버튼 추가만 | ✅ |
| [`AgentStage.tsx`](../frontend/src/components/stage/AgentStage.tsx) | 5 | focus hint prop 전달 | ✅ |
| [`deskPositions.ts`](../frontend/src/components/game/deskPositions.ts) | 4 | layout 기반 도출 | ⚠️ Phase 4에서 명시적 마이그레이션 |
| [`RoomLabels.ts`](../frontend/src/components/game/RoomLabels.ts) | 4 | layout zones 기반 | ⚠️ |
| [`assets.ts`](../frontend/src/components/game/assets.ts) | 2 | 신규 sheet 추가 | ✅ |
| 신규: `systems/WorldMetrics.ts` | 1 | 순수 함수 | — |
| 신규: `systems/CameraSystem.ts` | 1 | scene 의존 | — |
| 신규: `systems/FocusSystem.ts` | 1 | 순수 + scene 호출 분리 | — |
| 신규: `systems/DepthSystem.ts` | 4 | 헬퍼 | — |
| 신규: `systems/LayoutSystem.ts` | 4 | scene 의존 | — |
| 신규: `systems/AgentStateSystem.ts` | 5 | scene 의존 | — |
| 신규: `actors/SpriteAgentActor.ts` | 3 | `IAgentActor` 구현 | — |
| 신규: `actors/AgentAnimationController.ts` | 3 | sprite frame controller | — |
| 신규: `actors/IAgentActor.ts` | 0 | 인터페이스 | — |
| 신규: `assets/assetCatalog.ts` | 2 | 데이터 | — |
| 신규: `assets/furnitureCatalog.ts` | 2 | 데이터 | — |
| 신규: `assets/spriteFrameMap.ts` | 3 | 데이터 | — |
| 신규: `layout/OfficeLayoutTypes.ts` | 4 | 타입 | — |
| 신규: `layout/layoutSerializer.ts` | 4 | 로직 | — |
| 신규: `layout/tradingOfficePreset.ts` | 4 | 데이터 | — |

---

## §E. 관측·검증·롤백

### E-1. 관측 지점

각 Phase 직후 다음 항목을 1회 이상 콘솔/스크린샷 기록:

1. **Phase 1**: `controller.getCameraInfo()` 호출 결과를 dev console에 1회 dump. `worldWidth/Height`가 externalMap 기준인지 확인.
2. **Phase 2**: `scene.textures.list` 키 목록 dump. 신규 자산 키 존재 확인.
3. **Phase 3**: `actor.constructor.name` per role을 1회 dump. 의도한 role만 SpriteAgentActor인지 확인.
4. **Phase 4**: layout JSON load 결과 + furniture count + seat count.
5. **Phase 5**: thought 시퀀스 vs animation state transition을 1 회차 캡처.
6. **Phase 6**: prefers-reduced-motion 기준 tween 시간 측정.

### E-2. 회귀 테스트 체크리스트

각 Phase 종료 시 수동:

- [ ] 사이드바 열고 닫을 때 카메라 튐 없음.
- [ ] thought 도착 시 해당 actor 위치 카메라 이동.
- [ ] 사용자가 wheel 후 8초간 자동 포커스 멈춤.
- [ ] actor 클릭 → React panel 열림.
- [ ] 말풍선이 가구·캐릭터·미니맵에 가리지 않음.
- [ ] light/dark 테마에서 가독성 정상.
- [ ] Lighthouse score 큰 폭 하락 없음 (참조용).

### E-3. 롤백 매트릭스

| Phase | 단일 PR로 revert 가능? | 부분 롤백 토글 |
|---|---|---|
| 0 | ✅ | — |
| 1 | ✅ | `USE_FIT_ZOOM`, `USE_FOCUS_SYSTEM` env flag |
| 2 | ✅ | 자산 register block 주석 |
| 3 | ✅ | `USE_SPRITE_ROLES` Set 비우기 |
| 4 | ✅ | layout v2 → v1 자동 폴백 |
| 5a | ✅ | `USE_STATE_SYSTEM = false` |
| 5b | ✅ | `USE_NAVMESH_MOTION = false` |
| 6 | ✅ | UI 토글만 숨김 |

### E-4. 완료 정의 (DoD, v1 §10 보강)

v1의 §10.1~10.4 모두 + 다음을 추가:

- 라이선스 페이지에 MIT 고지 표시 (Pablo De Lucca, 2026).
- `legacy/` 디렉터리 정리 또는 삭제 결정 PR 1건.
- WorldMetrics, fitZoom, FocusSystem.priority에 단위 테스트 존재.
- `prefers-reduced-motion` 사용자에서 카메라 tween 0~150ms.
- `office.json`이 v1 스키마, v2 스키마, 미존재의 3 케이스 모두 첫 화면 정상 렌더 (회귀 테스트로 캡처).

---

## §F. v1 대비 변경 요약 (한 페이지)

| 영역 | v1 | v2 (본 문서) |
|---|---|---|
| 가구 manifest | `image` 필드 가정 | `{ID}/{ID}.png` 컨벤션 + `imageUrl` 도출 |
| 캐릭터 수 | "9 role × char 시트" | 6 char + 3 role tint |
| 캐릭터 애니메이션 | 6 상태 즉시 도입 | Phase 3은 idle+walk만, 나머지 effect overlay |
| Phaser Container | "Sprite 또는 Container" | **비상속 강제** (기존 패턴 유지) |
| 자산 라이선스 | "비상업 명시" | MIT — 상업 OK + 크레딧 의무 |
| 타일 크기 | TILE_SCALE 일괄 | 가구는 manifest.width/height 기준 개별 scale |
| WorldMetrics 도입 | "직접 사용 금지" 즉시 | 점진 deprecation, 한 호출부씩 전환 |
| externalMap 검증 | 가벼움 | `cols/rows ≥ 4` + layers[0].data 강제 |
| Focus vs 사용자 입력 | 8초 override | + tween cancel + 단일 진입점 `applyMode()` |
| layout 스키마 | `trading-office-v1.json` 즉시 | `@2` 별도 + v1 폴백 |
| 동선 (navmesh) | Phase 5 후반 | Phase 5b 분리, navmesh 없으면 5a로 폴백 |
| `IAgentActor` | 언급 없음 | Phase 0에서 인터페이스 추출 |
| Depth 규약 | y-기반 일반론 | `DEPTH` enum + bubble 1000+ 강제 |
| 테스트 | 언급 없음 | WorldMetrics/fitZoom/FocusSystem 단위 테스트 |
| 백엔드 status 분포 | 가정 | Phase 1에서 측정 후 우선순위 표 보정 |
| reduced-motion | 짧게 줄임 | 0~150ms 명시 + 즉시 setScroll 옵션 |
| 라이선스 노출 | 디렉터리 메모 | 앱 about 페이지 링크 + CI 검사 옵션 |

---

## §G. 권장 작업 순서 (실행 가능 단위)

1. **PR-0** (Phase 0): IAgentActor + DEPTH + 라이선스 빈 파일 + 빌드 통과 (저 위험).
2. **PR-1a** (Phase 1, 분할): `WorldMetrics` + `getCameraInfo()` 수정만. 시각 변화 거의 없음.
3. **PR-1b** (Phase 1, 분할): `CameraSystem.fit` + `resetCamera` 동작 변경 + `onResize` 가드. **첫 가시 효과**.
4. **PR-1c** (Phase 1, 분할): `FocusSystem` + `OfficeSceneController` 메서드 추가 + thought 자동 포커스.
5. **PR-2** (Phase 2): 자산 import + preload + 라이선스 페이지.
6. **PR-3a** (Phase 3): `SpriteAgentActor` + 1 role 적용 (technical_analyst만).
7. **PR-3b**: 9 role 전체 적용.
8. **PR-4a** (Phase 4): layout 타입/serializer/preset (코드 데이터만).
9. **PR-4b**: JSON 파일 + `LayoutSystem` 적용.
10. **PR-5a**: AgentStateSystem (effect 위주, 이동 없음).
11. **PR-5b** (옵션): navmesh + 동선.
12. **PR-6**: HUD/미니맵 polish.

각 PR은 **롤백 토글 1개 + 회귀 체크리스트 통과**가 머지 조건.

---

## §H. 마지막 결론

v1은 방향이 옳다. 다만 **자산 구조와 코드 호환성을 실측 없이 가정**한 부분이 있어 그대로 시작하면 Phase 2~3에서 막힌다.

본 v2는 다음을 보장한다.

- v1의 모든 목표를 유지한다.
- 자산은 MIT라 상업/비상업 무관, 다만 크레딧 표기 의무.
- 가구 manifest 스키마는 실측 기준으로 보정.
- 캐릭터는 6장 + tint 3종 = 9 role 매핑.
- 모든 Phase는 **롤백 토글 + 종료 게이트**를 갖는다.
- 외부 시그니처(`OfficeSceneController`, `AgentActor` 호출부)는 마지막까지 보존된다.
- v1의 "단번에 끊기" 항목들(`MAP_COLS` 직접 사용 금지, `centerCameraOnMap` 호출 금지)은 **점진 전환 + deprecation**으로 완화.

이 순서대로 가면 어떤 Phase에서도 화면이 깨지지 않고, 어느 PR에서든 단독 revert가 가능하며, Phase 1만 끝나도 사용자가 체감하는 "맵 잘림"과 "포커스 멍함"이 즉시 해결된다.
