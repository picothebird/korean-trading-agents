# Agent Stage 픽셀 품질 전면 개편 실행안

> 작성일: 2026-04-26  
> 대상: `frontend/src/components/game/*`, `frontend/src/components/stage/*`, `frontend/public/game/*`  
> 목적: 현재 에이전트 회의실이 "맵은 잘리고, 포커스는 안 따라오고, 캐릭터/가구가 조악해 보이는" 문제를 실제 코드 기준으로 해결한다.  
> 참고 코드: `ai-town-ref`, `pixel-agents-ref`  
> 상태: 구현 전 실행 사양서

---

## 0. 결론

현재 트레이딩 에이전트 화면이 레퍼런스보다 낮아 보이는 이유는 **디자인 감각 부족이 아니라 렌더링 구조의 등급 차이**다.

`pixel-agents`와 `ai-town`은 다음을 갖고 있다.

- 진짜 픽셀 스프라이트 시트
- 밀도 높은 가구/바닥/벽/소품 레이어
- 캐릭터 상태 머신과 애니메이션
- y축 기반 depth/z-sort
- 월드 크기를 기준으로 한 카메라/뷰포트 시스템
- 현재 상황에 따라 보는 위치가 바뀌는 포커스 시스템
- React UI와 게임 월드의 역할 분리

반면 현재 KTA는 Phaser를 쓰고 있지만, 핵심 시각 요소가 아직 "게임"이 아니라 **프리미티브 도형으로 만든 자리표시자**다.

- [AgentActor.ts](../frontend/src/components/game/AgentActor.ts)는 캐릭터를 `rectangle`, `circle`, `ellipse`, `text`로 합성한다.
- [DeskProps.ts](../frontend/src/components/game/DeskProps.ts)는 책상/모니터/화분을 `rectangle`, `circle`로 합성한다.
- [defaultOfficeMap.ts](../frontend/src/components/game/defaultOfficeMap.ts)는 30x20 단일 레이어 폴백 맵이다.
- [OfficeScene.ts](../frontend/src/components/game/OfficeScene.ts)는 외부 맵을 읽어도 카메라 기준은 `MAP_COLS`, `MAP_ROWS` 고정값을 계속 쓴다.
- [OfficeScene.ts](../frontend/src/components/game/OfficeScene.ts)의 `onResize()`는 매번 `centerCameraOnMap()`을 호출해 사용자의 시점과 상황 포커스를 초기화한다.

따라서 개선 방향은 "색을 조금 예쁘게"가 아니다. **프리미티브 무대에서 스프라이트 기반 월드로 갈아타야 한다.**

---

## 1. 왜 레퍼런스는 고급스러워 보이나

### 1.1 Pixel Agents의 품질 원인

`pixel-agents-ref`는 KTA에 가장 직접적으로 맞는 레퍼런스다. 오피스 안에서 AI 에이전트가 일하는 장면이기 때문이다.

| 품질 요소 | Pixel Agents 방식 | KTA 현재 방식 | 차이 |
|---|---|---|---|
| 캐릭터 | `char_0.png` 등 실제 픽셀 캐릭터 스프라이트 | 사각형 머리/몸통/다리 합성 | 캐릭터가 장난감 블록처럼 보임 |
| 가구 | manifest 기반 PNG 가구, 회전/상태/애니메이션 그룹 | 사각형 책상/모니터/화분 | 공간 밀도와 물성이 없음 |
| 맵 | `OfficeLayout` JSON + 바닥/벽/가구/좌석 분리 | 단일 tile layer + 코드 좌표 | 방이 아니라 타일 배경처럼 보임 |
| 렌더 순서 | furniture/character를 `zY`로 정렬 | 생성 순서 중심 | 앞뒤 관계가 약함 |
| 상태 | `TYPE`, `IDLE`, `WALK` FSM | status dot + glow + bob | 에이전트가 일하는 느낌 부족 |
| 카메라 | pan/zoom/follow/editor hit-test | wheel zoom + drag + reset | 상황이 바뀌어도 화면 연출 없음 |
| 에셋 구조 | asset loader + catalog + layout serializer | `assets.ts`와 hardcoded desk positions | 확장/커스터마이징 어려움 |

핵심은 "예쁜 색"이 아니다. **이미지 자산, 레이어 구조, 상태 머신, 카메라가 함께 작동**하기 때문에 고급스러워 보인다.

### 1.2 AI Town의 품질 원인

`ai-town-ref`는 오피스 UI보다는 "살아있는 월드" 구조가 중요하다.

| 품질 요소 | AI Town 방식 | KTA에 가져올 것 |
|---|---|---|
| 월드 상태 | backend simulation이 위치/대화/행동을 소유 | 분석 이벤트를 `WorldState`로 변환 |
| 보간 | `useHistoricalTime`, `useHistoricalValue`로 자연스러운 이동 | thought 도착 시 바로 텔레포트하지 않고 tween/interpolation |
| 뷰포트 | `pixi-viewport`의 drag/pinch/wheel/clamp | Phaser 카메라에 동일 개념 구현 |
| 맵 | tiled layer + animated sprites | Phaser tile/furniture/object layer 분리 |
| 캐릭터 | 방향별 AnimatedSprite | `idle/walk/type/talk/decide` 애니메이션 |

AI Town 전체를 이식할 필요는 없다. KTA는 이미 Phaser가 있으므로 **카메라/월드 상태/보간 철학만 가져오면 된다.**

---

## 2. 현재 KTA의 정확한 문제 진단

### 2.1 맵이 잘리는 이유

현재 [OfficeScene.ts](../frontend/src/components/game/OfficeScene.ts)는 외부 맵을 일부 지원하지만, 카메라와 HUD는 여전히 폴백 맵 크기를 기준으로 동작한다.

문제 지점:

```ts
worldWidth: MAP_COLS * SCREEN_TILE,
worldHeight: MAP_ROWS * SCREEN_TILE,
```

```ts
const mapW = MAP_COLS * SCREEN_TILE;
const mapH = MAP_ROWS * SCREEN_TILE;
cam.setBounds(0, 0, mapW, mapH);
cam.centerOn(mapW / 2, mapH / 2);
```

외부 `/game/maps/office.json`의 `cols`, `rows`, `tileSize`가 달라도 카메라는 `defaultOfficeMap.ts`의 `30 x 20 x 32px`만 진짜 월드라고 믿는다. 그래서 다음 현상이 생긴다.

- 외부 맵이 30x20보다 크면 오른쪽/아래쪽이 미니맵과 카메라 기준에서 잘린다.
- 외부 맵이 30x20보다 작거나 타일 크기가 다르면 여백/중앙 위치가 틀어진다.
- 컨테이너 크기가 변할 때마다 `centerCameraOnMap()`으로 강제 중앙 이동한다.
- 사용자가 보고 있던 위치, 방금 클릭한 에이전트, 진행 중인 토론 포커스가 사라진다.

### 2.2 포커스가 상황을 따라오지 않는 이유

현재 컨트롤러는 다음 메서드만 제공한다.

- `zoomBy(delta)`
- `resetCamera()`
- `panCameraTo(worldX, worldY)`
- `getCameraInfo()`
- `setAgentClickHandler(handler)`

즉, **"누가 지금 중요한가"를 카메라가 알 수 없다.**

분석 이벤트가 들어와도 [OfficeScene.ts](../frontend/src/components/game/OfficeScene.ts)의 `applyThoughts()`는 actor 상태와 말풍선만 바꾸고 카메라에는 아무 지시를 내리지 않는다.

```ts
actor.setStatus(snap.status);
actor.showMessage(snap.content);
```

필요한 것은 `panCameraTo()`가 아니라 `focusAgent(role, reason)` / `focusZone(zone)` / `setCameraMode(mode)` 같은 상황 중심 API다.

### 2.3 캐릭터가 멍청해 보이는 이유

[AgentActor.ts](../frontend/src/components/game/AgentActor.ts)는 "픽셀 캐릭터"라고 주석이 있지만 실제로는 스프라이트가 아니다.

현재 구성:

- 머리: 8x8 rectangle
- 몸통: 12x10 rectangle
- 다리: 8x4 rectangle
- 머리카락: 8x4 rectangle
- 상태: circle dot
- 말풍선: Phaser text background

이 방식은 빠르게 프로토타입을 만들 때는 좋지만, 고급 픽셀아트처럼 보일 수 없다. 픽셀아트의 품질은 다음에서 나온다.

- 얼굴/머리/옷의 실루엣
- 픽셀 단위 명암
- 걷기/타이핑/대기 프레임
- 방향별 포즈
- 캐릭터와 가구의 동일한 시점/팔레트

현재 방식은 이 모든 것이 없기 때문에, 역할 색만 다른 블록 캐릭터처럼 보인다.

### 2.4 가구와 공간이 싸 보이는 이유

[DeskProps.ts](../frontend/src/components/game/DeskProps.ts)는 책상, 모니터, 화분을 모두 도형으로 그린다. 여기에 단일 바닥 타일이 깔리니 공간이 "사무실"이 아니라 "격자판 위의 아이콘"처럼 보인다.

`pixel-agents`의 스크린샷이 좋아 보이는 이유는 책상 하나가 예뻐서가 아니라, 다음이 동시에 있다.

- 벽/바닥이 공간을 만든다.
- 책상/의자/PC/소파/책장/식물/소품이 시선을 채운다.
- 각 가구가 좌석, 충돌, 정렬 기준을 갖는다.
- 캐릭터가 그 공간 안에 앉거나 걸어간다.
- 말풍선과 선택 윤곽이 픽셀 월드 톤과 맞는다.

KTA는 아직 "캐릭터 + 책상 + 바닥"만 있다. 그래서 빈 무대처럼 느껴진다.

---

## 3. 목표 상태

### 3.1 한 줄 목표

**트레이딩 분석 과정을 9명의 픽셀 에이전트가 실제 회의실에서 움직이고, 말하고, 자료를 보고, 토론하고, 결론을 내리는 장면으로 만든다.**

### 3.2 목표 화면

```
┌────────────────────────────────────────────────────────────┐
│  [에이전트 회의실]                         [fit] [follow] │
│                                                            │
│  ┌──────────── 데이터 분석실 ────────────┐                 │
│  │  기술/펀더/심리/거시 에이전트         │                 │
│  │  PC, 차트보드, 자료 더미, 책장         │                 │
│  └───────────────────────────────────────┘                 │
│                                                            │
│             ┌──── 중앙 토론 테이블 ────┐                   │
│             │ 강세 ↔ 약세 토론          │                   │
│             └──────────────────────────┘                   │
│                                                            │
│  ┌──────────── 리스크/결정실 ───────────┐                  │
│  │ 리스크, 포트폴리오, GURU             │                  │
│  │ 금고, 리스크 보드, 승인 스탬프        │                  │
│  └──────────────────────────────────────┘                  │
│                                                            │
│  미니맵: 실제 월드 크기 + 현재 viewport + active agent       │
└────────────────────────────────────────────────────────────┘
```

### 3.3 UX 목표

- 처음 열면 맵 전체가 잘리지 않고 한눈에 들어온다.
- 분석이 시작되면 카메라가 현재 말하는 에이전트로 부드럽게 이동한다.
- L1 데이터 수집 중에는 분석실을 본다.
- L2 토론 중에는 중앙 토론 테이블을 본다.
- L3 리스크/결정 중에는 결정실을 본다.
- 사용자가 드래그/줌하면 자동 포커스가 잠시 멈춘다.
- 사용자가 `follow`를 다시 켜면 자동 포커스가 재개된다.
- 캐릭터와 가구는 모두 실제 픽셀 PNG/스프라이트 기반이다.

---

## 4. 목표 아키텍처

### 4.1 현재 구조

```
AgentStage
└─ PhaserCanvas
   └─ PhaserCanvasInner
      └─ OfficeScene
         ├─ drawDefaultOffice()
         ├─ createDeskProps()
         └─ new AgentActor()
```

현재 구조는 유지하되, `OfficeScene` 내부를 시스템 단위로 쪼갠다.

### 4.2 개편 후 구조

```
frontend/src/components/game/
├── OfficeScene.ts                  # Scene 조립자만 담당
├── OfficeSceneController.ts         # React에서 호출할 공개 API 확장
├── systems/
│   ├── WorldMetrics.ts              # 실제 맵/레이아웃 크기 계산
│   ├── CameraSystem.ts              # fit/free/follow/cinematic
│   ├── FocusSystem.ts               # thought/status -> 카메라 target 결정
│   ├── DepthSystem.ts               # y 기반 depth 정렬
│   ├── LayoutSystem.ts              # layout JSON -> tile/furniture/seat
│   └── AgentStateSystem.ts          # thought -> animation/action
├── actors/
│   ├── SpriteAgentActor.ts          # PNG 스프라이트 기반 에이전트
│   └── AgentAnimationController.ts  # idle/walk/type/talk/decide
├── assets/
│   ├── assetCatalog.ts              # 캐릭터/가구/타일 카탈로그
│   ├── furnitureCatalog.ts          # Pixel Agents manifest 변환
│   └── spriteFrameMap.ts            # 스프라이트 프레임 정의
├── layout/
│   ├── OfficeLayoutTypes.ts
│   ├── layoutSerializer.ts
│   └── tradingOfficePreset.ts
└── legacy/
    ├── PrimitiveAgentActor.ts       # 기존 AgentActor 보존 또는 제거 전 백업
    └── PrimitiveDeskProps.ts
```

public assets:

```
frontend/public/game/
├── pixel-agents/
│   ├── characters/char_0.png ...
│   ├── floors/*
│   ├── walls/*
│   ├── furniture/**/manifest.json
│   └── furniture/**/*.png
├── layouts/
│   └── trading-office-v1.json
└── licenses/
    └── pixel-agent-assets.md
```

---

## 5. 즉시 고쳐야 할 3대 문제

## 5.1 맵 크기/클리핑 수정

### 문제

카메라와 미니맵은 실제 맵이 아니라 `MAP_COLS`, `MAP_ROWS`를 본다.

### 구현

`WorldMetrics`를 만든다.

```ts
export interface WorldMetrics {
  cols: number;
  rows: number;
  sourceTileSize: number;
  screenTileSize: number;
  width: number;
  height: number;
  padding: number;
}
```

계산 규칙:

```ts
function getWorldMetrics(map: OfficeMapData | null): WorldMetrics {
  const cols = map?.cols ?? MAP_COLS;
  const rows = map?.rows ?? MAP_ROWS;
  const sourceTileSize = map?.tileSize ?? MAP_TILE;
  const screenTileSize = sourceTileSize * TILE_SCALE;
  return {
    cols,
    rows,
    sourceTileSize,
    screenTileSize,
    width: cols * screenTileSize,
    height: rows * screenTileSize,
    padding: screenTileSize * 2,
  };
}
```

적용 위치:

- [OfficeScene.ts](../frontend/src/components/game/OfficeScene.ts) `drawDefaultOffice()`
- [OfficeScene.ts](../frontend/src/components/game/OfficeScene.ts) `centerCameraOnMap()`
- [OfficeScene.ts](../frontend/src/components/game/OfficeScene.ts) `getCameraInfo()`
- [Minimap.tsx](../frontend/src/components/game/Minimap.tsx)

수정 원칙:

- `MAP_COLS * SCREEN_TILE` 직접 계산 금지.
- `externalMap`이 있으면 `externalMap.cols`, `externalMap.rows`, `externalMap.tileSize`를 진실로 사용.
- 카메라 bounds는 `world.width`, `world.height` 기준.
- 미니맵 viewBox도 `world.width`, `world.height` 기준.

### 완료 기준

- `/game/maps/office.json`을 30x20, 40x28, 60x40으로 바꿔도 맵이 잘리지 않는다.
- 미니맵의 viewport rectangle이 실제 카메라와 일치한다.
- 리사이즈 후에도 맵 오른쪽/아래쪽이 접근 가능하다.

## 5.2 fit-to-screen 카메라

### 문제

현재 초기 카메라는 `zoom=1` + 중앙 정렬이다. 컨테이너가 작으면 맵이 당연히 잘려 보인다.

### 구현

`CameraSystem.fitToWorld()`를 만든다.

```ts
function fitZoom(viewW: number, viewH: number, worldW: number, worldH: number, padding: number) {
  const zx = (viewW - padding * 2) / worldW;
  const zy = (viewH - padding * 2) / worldH;
  return Phaser.Math.Clamp(Math.min(zx, zy), 0.35, 1.25);
}
```

동작:

- 최초 진입: 전체 맵이 보이도록 zoom 자동 계산.
- `resetCamera()`: zoom=1이 아니라 `fitToWorld()`.
- 사용자가 `+/-` 줌을 누르면 `cameraMode = "free"`.
- 사용자가 `fit` 버튼을 누르면 다시 전체 보기.

컨트롤러 확장:

```ts
export interface OfficeSceneController {
  zoomBy(delta: number): void;
  resetCamera(): void;
  fitToWorld(): void;
  setCameraMode(mode: "fit" | "free" | "follow" | "cinematic"): void;
  focusAgent(role: AgentRole, reason?: FocusReason): void;
  focusZone(zone: OfficeZone, reason?: FocusReason): void;
  panCameraTo(worldX: number, worldY: number): void;
  getCameraInfo(): CameraInfo;
}
```

### 완료 기준

- 에이전트 회의실 진입 직후 맵 전체가 보인다.
- 좁은 화면에서도 잘리는 대신 적절히 축소된다.
- `reset` 버튼이 "1배율 중앙"이 아니라 "전체 보기"로 작동한다.

## 5.3 리사이즈 때 카메라 강제 초기화 금지

### 문제

현재 [OfficeScene.ts](../frontend/src/components/game/OfficeScene.ts)의 `onResize()`는 매번 `centerCameraOnMap()`을 부른다.

결과:

- 사용자가 확대해서 보던 위치가 사라진다.
- active agent를 보고 있던 카메라가 중앙으로 튄다.
- 사이드 패널/브라우저 크기 변화 때 장면 연속성이 깨진다.

### 구현

`CameraSystem`에 모드를 둔다.

```ts
type CameraMode = "fit" | "free" | "follow" | "cinematic";
```

리사이즈 규칙:

| 현재 모드 | 리사이즈 처리 |
|---|---|
| `fit` | 새 화면 크기로 `fitToWorld()` 다시 계산 |
| `follow` | 현재 target을 새 화면 중앙에 유지 |
| `cinematic` | 진행 중 tween target 유지 |
| `free` | 기존 `scrollX`, `scrollY`, `zoom` 최대한 보존 후 bounds clamp |

절대 하지 말 것:

```ts
onResize() {
  this.centerCameraOnMap();
}
```

### 완료 기준

- 사용자가 어떤 에이전트를 확대해서 보고 있을 때 창 크기를 바꿔도 그 에이전트를 계속 본다.
- 모바일/좁은 레이아웃 전환 시 화면이 중앙으로 튀지 않는다.

---

## 6. 상황별 포커스 시스템

### 6.1 목표

카메라가 "현재 가장 중요한 이벤트"를 따라간다. 단, 사용자가 직접 조작하면 방해하지 않는다.

### 6.2 FocusReason

```ts
type FocusReason =
  | "analysis-start"
  | "agent-thought"
  | "debate-start"
  | "decision-start"
  | "final-decision"
  | "user-click"
  | "manual-reset";
```

### 6.3 포커스 우선순위

| 우선순위 | 조건 | 포커스 대상 |
|---|---|---|
| 1 | 사용자가 actor 클릭 | 해당 actor, 8초 manual override |
| 2 | `decision` 도착 | 결정실 또는 중앙 회의 테이블 |
| 3 | `status === "deciding"` | `risk_manager` / `portfolio_manager` / `guru_agent` 구역 |
| 4 | `status === "debating"` | bull/bear 토론 테이블 |
| 5 | `status === "analyzing"` 또는 `thinking` | latest thought의 actor |
| 6 | idle | 전체 맵 fit |

### 6.4 사용자 조작 보호

자동 포커스가 사용자를 괴롭히면 안 된다.

규칙:

- 사용자가 drag/zoom을 하면 `manualOverrideUntil = now + 8000`.
- 이 시간 동안 자동 포커스 금지.
- 우상단 `follow` 버튼을 누르면 즉시 override 해제.
- actor 클릭은 자동 포커스가 아니라 사용자 포커스이므로 즉시 이동.

### 6.5 이동 연출

Phaser 카메라 이동은 즉시 `centerOn()`이 아니라 tween으로 처리한다.

```ts
camera.pan(targetX, targetY, 520, "Sine.easeInOut");
camera.zoomTo(targetZoom, 520, "Sine.easeInOut");
```

추천 zoom:

| 상황 | zoom |
|---|---|
| 전체 보기 | fit zoom |
| 단일 에이전트 말풍선 | 1.15 |
| 토론 테이블 | 0.95 |
| 최종 결정 | 0.9 |
| 사용자가 직접 확대 | 제한 없음, max 2.0 |

### 6.6 완료 기준

- 기술적 분석가 thought가 오면 카메라가 해당 책상으로 이동한다.
- 강세/약세 토론이 시작되면 중앙 토론 테이블로 이동한다.
- 최종 결정이 오면 결정실/회의 테이블로 이동한다.
- 사용자가 드래그하면 8초 동안 자동 이동이 멈춘다.

---

## 7. 그래픽 품질 개편

## 7.1 에셋 원칙

사용자가 비상업 목적이라고 명시했으므로, 구현 속도를 위해 `pixel-agents-ref`의 번들 자산을 우선 사용한다.

다만 프로젝트에 남길 때는 다음을 지킨다.

- `frontend/public/game/licenses/pixel-agent-assets.md`에 출처와 용도 기록.
- 원본 디렉터리 구조를 유지해 나중에 교체 가능하게 한다.
- 코드 구조는 KTA에 맞게 새로 작성한다. 무리한 복붙보다 asset/data 구조를 이식한다.

### 7.2 복사 대상

`pixel-agents-ref/webview-ui/public/assets/`에서 우선 복사:

- `characters/char_0.png` ~ `char_5.png`
- `floors/*`
- `walls/*`
- `furniture/**/manifest.json`
- `furniture/**/*.png`
- `default-layout-1.json`은 참고용으로만 사용하고, KTA용 `trading-office-v1.json`을 새로 작성

### 7.3 캐릭터 교체

현재 [AgentActor.ts](../frontend/src/components/game/AgentActor.ts)를 직접 계속 키우지 않는다. 새 파일을 만든다.

```
frontend/src/components/game/actors/SpriteAgentActor.ts
```

역할:

- `Phaser.GameObjects.Sprite` 또는 `Container` 기반
- 캐릭터 PNG를 texture로 로드
- `idle`, `walk`, `type`, `talk`, `decide`, `done` 상태별 frame/animation 관리
- 말풍선 anchor 제공
- hit area 제공
- depth 기준점(`zY`) 제공

상태 매핑:

| AgentStatus | 애니메이션 | 보조 연출 |
|---|---|---|
| `idle` | idle blink | 낮은 alpha 금지, 살아있는 대기 |
| `thinking` | type 또는 read | 작은 생각 bubble |
| `analyzing` | type | 모니터/자료 하이라이트 |
| `debating` | talk | 말풍선 길게, 토론 테이블 포커스 |
| `deciding` | decide | 결정실 조명/스탬프 효과 |
| `done` | idle happy 또는 sit | 완료 체크 말풍선 |

### 7.4 가구 교체

현재 [DeskProps.ts](../frontend/src/components/game/DeskProps.ts)는 폐기 대상이다. 대신 manifest 기반 catalog를 만든다.

```
frontend/src/components/game/assets/furnitureCatalog.ts
frontend/src/components/game/layout/layoutSerializer.ts
```

필요 타입:

```ts
interface FurnitureAsset {
  id: string;
  image: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  blocks?: Array<{ col: number; row: number }>;
  seat?: { col: number; row: number; direction: Direction };
  zOffset?: number;
}
```

### 7.5 레이아웃 교체

현재 `defaultOfficeMap.ts`의 단일 레이어는 폴백으로만 둔다. 실제 기본 화면은 KTA 전용 layout JSON을 사용한다.

```
frontend/public/game/layouts/trading-office-v1.json
```

구조:

```ts
interface TradingOfficeLayout {
  id: "trading-office-v1";
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

zones:

```ts
type OfficeZone =
  | "overview"
  | "data-room"
  | "debate-table"
  | "risk-room"
  | "decision-room";
```

### 7.6 Depth/z-sort

Phaser object의 depth를 y좌표 기반으로 갱신한다.

```ts
function depthFor(y: number, layer = 0) {
  return Math.round(y * 10 + layer);
}
```

규칙:

- floor: depth 0
- wall/background: depth 10~50
- furniture/character: `depthFor(zY)`
- overhead/front wall: depth 900
- bubble/label: depth 1000+

완료 기준:

- 캐릭터가 책상 뒤로 가면 책상 앞/뒤 관계가 자연스럽다.
- 소파/책장/식물 앞뒤가 위치에 따라 맞는다.
- 말풍선은 항상 캐릭터 위에 보인다.

---

## 8. 구현 단계

## Phase 1 — 카메라/맵 클리핑 즉시 수정

목표: 지금 불만인 "맵이 잘림"과 "포커스 안 움직임"을 먼저 해결한다.

수정 파일:

- [OfficeScene.ts](../frontend/src/components/game/OfficeScene.ts)
- [OfficeSceneController.ts](../frontend/src/components/game/OfficeSceneController.ts)
- [Minimap.tsx](../frontend/src/components/game/Minimap.tsx)
- [HudControls.tsx](../frontend/src/components/game/HudControls.tsx)

신규 파일:

- `frontend/src/components/game/systems/WorldMetrics.ts`
- `frontend/src/components/game/systems/CameraSystem.ts`
- `frontend/src/components/game/systems/FocusSystem.ts`

작업:

1. `MAP_COLS * SCREEN_TILE` 직접 사용 제거.
2. `externalMap` 기준 world metrics 계산.
3. `fitToWorld()` 구현.
4. `resetCamera()`를 fit 동작으로 변경.
5. `onResize()`에서 무조건 중앙 이동 제거.
6. `focusAgent()`, `focusZone()` 컨트롤러 추가.
7. `applyThoughts()`에서 latest active thought 기준 자동 포커스 호출.
8. manual override 8초 규칙 추가.

검증:

- `office.json` 크기를 바꿔도 잘리지 않는다.
- 브라우저 폭을 바꿔도 보고 있던 대상이 유지된다.
- thought가 들어오면 해당 에이전트/zone으로 카메라가 이동한다.

## Phase 2 — Pixel Agents 에셋 가져오기

목표: 프리미티브 도형을 실제 픽셀 PNG로 교체할 준비를 한다.

작업:

1. `pixel-agents-ref/webview-ui/public/assets` 일부를 `frontend/public/game/pixel-agents`로 복사.
2. 출처 문서 작성: `frontend/public/game/licenses/pixel-agent-assets.md`.
3. asset catalog 생성.
4. Phaser preload에 characters/floors/walls/furniture 등록.
5. loading 실패 시 기존 primitive actor로 fallback.

검증:

- DevTools Network에서 character/furniture PNG 404 없음.
- Phaser texture cache에 캐릭터/가구 asset이 올라온다.

## Phase 3 — SpriteAgentActor 도입

목표: "멍청한 사각형 캐릭터"를 제거한다.

작업:

1. `SpriteAgentActor` 생성.
2. 9개 role에 서로 다른 character skin 배정.
3. 기존 `AgentActor`의 status/bubble/click API를 최대한 동일하게 유지.
4. [OfficeScene.ts](../frontend/src/components/game/OfficeScene.ts)의 `new AgentActor()`를 `new SpriteAgentActor()`로 교체.
5. 말풍선은 Phaser text background가 아니라 pixel bubble texture 또는 9-slice 스타일로 교체.

검증:

- 캐릭터가 실제 PNG로 보인다.
- 상태 변화마다 idle/type/talk/decide 애니메이션이 다르다.
- 클릭 hit area가 정상이다.
- 말풍선이 캐릭터 머리 위에 붙는다.

## Phase 4 — Trading Office layout 구축

목표: 빈 타일판을 밀도 있는 트레이딩 회의실로 바꾼다.

작업:

1. `trading-office-v1.json` 작성.
2. zones 정의: `data-room`, `debate-table`, `risk-room`, `decision-room`.
3. 9개 role seat 정의.
4. furniture 배치: 책상, PC, 의자, 책장, 식물, 보드, 소파, 회의 테이블.
5. `LayoutSystem`이 JSON을 읽어 Phaser object 생성.
6. `DESK_POSITIONS`를 layout seats에서 파생하도록 변경.

검증:

- 좌석 위치를 JSON에서 바꾸면 캐릭터 위치도 바뀐다.
- 가구가 충분히 밀도 있게 보인다.
- 중앙 토론 테이블과 결정실이 시각적으로 구분된다.

## Phase 5 — 에이전트 상태 머신/동선

목표: 에이전트가 그냥 제자리에서 빛나는 것이 아니라 실제로 일하는 것처럼 보이게 한다.

작업:

1. `AgentStateSystem` 생성.
2. thought status별 action 결정.
3. L1: 각자 자리에서 typing/reading.
4. L2: bull/bear가 토론 테이블로 이동.
5. L3: risk/portfolio/guru가 결정실로 이동.
6. final decision: 중앙 테이블 또는 결과 보드로 모인다.
7. 경로는 Phase 5 초기에는 단순 tween, 이후 `phaser-navmesh`로 확장.

검증:

- 분석 단계가 바뀌면 캐릭터 위치/포즈가 바뀐다.
- 캐릭터가 한꺼번에 겹치지 않는다.
- 토론/결정 구간에서 카메라 포커스와 캐릭터 동선이 맞는다.

## Phase 6 — HUD/미니맵/모드 polish

목표: 게임 장면과 React HUD가 하나의 제품처럼 느껴지게 한다.

작업:

1. `HudControls`에 `fit`, `follow`, `free` 상태 표시.
2. 미니맵에 실제 world bounds와 viewport rectangle 표시.
3. active agent dot pulse.
4. zone label 표시/숨김 토글.
5. reduced motion이면 카메라 pan/tween을 짧게 줄임.

검증:

- 사용자가 현재 카메라 모드를 이해할 수 있다.
- 미니맵 클릭 위치와 실제 이동 위치가 정확하다.
- 자동 포커스가 켜졌는지 꺼졌는지 명확하다.

---

## 9. 파일별 변경 지시서

| 파일 | 작업 |
|---|---|
| [OfficeScene.ts](../frontend/src/components/game/OfficeScene.ts) | Scene 조립자 역할만 남기고 camera/layout/actor 로직 분리 |
| [OfficeSceneController.ts](../frontend/src/components/game/OfficeSceneController.ts) | `fitToWorld`, `setCameraMode`, `focusAgent`, `focusZone` 추가 |
| [AgentActor.ts](../frontend/src/components/game/AgentActor.ts) | `legacy/PrimitiveAgentActor.ts`로 이동 또는 fallback 전용으로 격하 |
| [DeskProps.ts](../frontend/src/components/game/DeskProps.ts) | `legacy/PrimitiveDeskProps.ts`로 이동 또는 제거 |
| [defaultOfficeMap.ts](../frontend/src/components/game/defaultOfficeMap.ts) | 폴백 전용으로 유지, 기본 화면에서는 사용하지 않음 |
| [mapLoader.ts](../frontend/src/components/game/mapLoader.ts) | 단순 tile map에서 layout/furniture/seats/zones 지원으로 확장 |
| [PhaserCanvas.tsx](../frontend/src/components/game/PhaserCanvas.tsx) | camera mode/follow 상태를 HUD에 전달 |
| [PhaserCanvasInner.tsx](../frontend/src/components/game/PhaserCanvasInner.tsx) | scene 생성 시 asset/layout config 전달 |
| [Minimap.tsx](../frontend/src/components/game/Minimap.tsx) | 고정 `DESK_POSITIONS` 대신 layout seats/world metrics 사용 |
| [HudControls.tsx](../frontend/src/components/game/HudControls.tsx) | fit/follow/free 버튼과 상태 표시 추가 |
| [AgentStage.tsx](../frontend/src/components/stage/AgentStage.tsx) | `decision`, latest thought를 focus hint로 전달 가능하게 확장 |

---

## 10. 수용 기준

### 10.1 기능 기준

- 맵이 어떤 크기여도 잘리지 않는다.
- 최초 진입 시 전체 맵이 보인다.
- 리사이즈해도 카메라가 멋대로 중앙으로 튀지 않는다.
- 분석 이벤트에 따라 카메라가 active agent 또는 zone으로 이동한다.
- 사용자가 직접 조작하면 자동 포커스가 잠시 멈춘다.
- `follow`를 켜면 자동 포커스가 재개된다.

### 10.2 시각 기준

- 캐릭터는 도형 합성이 아니라 실제 픽셀 PNG다.
- 가구는 도형 합성이 아니라 실제 픽셀 PNG다.
- 바닥/벽/가구/캐릭터의 시점과 팔레트가 맞는다.
- 최소 20개 이상의 가구/소품이 배치되어 빈 공간 느낌이 없다.
- 캐릭터가 상태별로 다른 포즈/애니메이션을 가진다.
- 말풍선/선택/포커스 UI가 게임 월드 톤과 맞는다.

### 10.3 성능 기준

- 1080p에서 60fps 근접.
- 저사양에서도 30fps 이상.
- PNG 로드 실패 시 앱 전체가 깨지지 않고 fallback 표시.
- Next.js build 성공.

### 10.4 QA 기준

- 데스크톱 1440x900, 1280x720에서 맵 전체 보기 정상.
- 모바일 폭 390px에서 맵이 잘리지 않고 fit zoom 적용.
- light/dark theme에서 배경과 말풍선 가독성 정상.
- `prefers-reduced-motion`에서 카메라 이동 과하지 않음.

---

## 11. 작업 순서 권장

가장 먼저 해야 할 것은 에셋 교체가 아니라 **카메라/월드 기준 수정**이다. 맵이 계속 잘리는 상태에서 캐릭터만 예뻐져도 화면은 여전히 답답하다.

권장 순서:

1. Phase 1: `WorldMetrics` + `CameraSystem` + `FocusSystem`
2. Phase 2: Pixel Agents asset import
3. Phase 3: `SpriteAgentActor`
4. Phase 4: `trading-office-v1.json` + `LayoutSystem`
5. Phase 5: 상태 머신/동선
6. Phase 6: HUD/minimap polish

Phase 1만 끝나도 "맵 잘림"과 "포커스 안 움직임"은 바로 개선된다. Phase 3~4가 끝나야 "구리고 멍청해 보임"이 사라진다.

---

## 12. 구현 시 금지할 것

- `MAP_COLS * SCREEN_TILE`를 카메라/미니맵 기준으로 직접 쓰지 않는다.
- 리사이즈 때 무조건 중앙 정렬하지 않는다.
- 캐릭터를 rectangle/circle 조합으로 계속 고도화하지 않는다.
- 가구를 rectangle/circle 조합으로 계속 늘리지 않는다.
- React state로 매 프레임 렌더링을 돌리지 않는다.
- 게임 월드 내부 텍스트를 과도하게 늘리지 않는다. 긴 정보는 React 패널에 둔다.
- 캔버스 안에 SaaS 카드 스타일 UI를 많이 얹지 않는다.

---

## 13. 최종 판단

현재 KTA가 레퍼런스보다 낮아 보이는 이유는 Phaser를 써서가 아니다. **Phaser 안에서 아직 레퍼런스급 월드를 만들지 않았기 때문**이다.

정확한 처방은 다음이다.

1. 실제 맵 크기를 카메라/미니맵의 진실로 만든다.
2. 최초 보기와 리사이즈를 fit/follow/free 모드로 분리한다.
3. thought/status/decision을 카메라 포커스 이벤트로 연결한다.
4. 도형 캐릭터/도형 가구를 버리고 PNG 스프라이트/manifest 기반으로 교체한다.
5. 단일 타일맵을 layout/seats/zones/furniture/depth 시스템으로 바꾼다.
6. 분석 단계에 따라 캐릭터가 이동하고 일하고 토론하고 결정하게 만든다.

이렇게 바꾸면 "픽셀 그림이 붙은 대시보드"가 아니라, `pixel-agents`처럼 **살아있는 트레이딩 에이전트 회의실**이 된다.