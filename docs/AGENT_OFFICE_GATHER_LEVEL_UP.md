# Agent Office — Gather.town 수준으로 끌어올리기 위한 개편 플랜

> 작성: 2026-04-26  
> 대상 컴포넌트: `frontend/src/components/PixelOffice.tsx`, `AgentOffice.tsx` (사이드 우측 패널의 "에이전트 컨트롤룸" 영역)  
> 목표: 게더타운(Gather.town) 수준의 "살아있는 가상 사무실" 시각화로 에이전트들의 협업·이동·발화를 표현. 가능한 한 **공개 오픈소스/에셋**을 차용하여 자체 개발 비용을 최소화.

---

## 0. TL;DR (한 장 요약)

| 영역 | 현재 (자체 캔버스 픽셀 페인트) | 변경 후 (Phaser 4 + Tiled + LimeZu/Kenney 에셋) |
| --- | --- | --- |
| 렌더러 | `<canvas>`에 손으로 `fillRect` | **Phaser 4 WebGL** (TilemapGPULayer, SpriteGPULayer) |
| 맵 | 코드 안 좌표 하드코딩 | **Tiled Map Editor**로 디자이너가 편집하는 `.tmj` (JSON) |
| 캐릭터 | `drawCharacter()` 픽셀 직접 찍기 | **LimeZu Character Generator 2.0** 16×16 4방향 스프라이트 + idle/walk/sit 애니 |
| 가구/타일 | 직접 픽셀 그림 | **LimeZu Modern Office/Interiors v4** 또는 **Kenney 1‑bit/Tiny Town** |
| 길찾기 | 수동 `ROOM_WAYPOINTS` | **easystarjs** (A*) on tile grid |
| 말풍선 | 절대좌표 div + framer-motion | Phaser 9‑slice `RexUI` 말풍선 + DOM 오버레이 (긴 텍스트만) |
| 톤 | 진한 CRT 다크 (라이트 테마와 충돌) | **라이트 테마와 일치하는 16비트 모던 오피스** + day/night 셰이더 |
| 인터랙션 | 보기 전용, 마우스 무반응 | 카메라 팬·줌, 캐릭터 호버 툴팁, 클릭 시 해당 에이전트 패널 포커스 |

핵심 결정: **자체 픽셀 엔진을 폐기하고 Phaser 4 + Tiled + LimeZu/Kenney 에셋으로 재구성**. 우리는 ① 에이전트 상태 → 씬 명령 어댑터, ② Tiled 맵 파일, ③ 라이트 테마 셰이더만 만들면 되며, 나머지(스프라이트 애니, 길찾기, 말풍선, 카메라)는 전부 검증된 OSS가 처리한다.

---

## 1. 현재 상태 진단

### 1.1 코드 위치
- `frontend/src/components/PixelOffice.tsx` — **약 1100줄**의 단일 파일에 캔버스 드로잉(`drawBackground`, `drawCharacter`, `drawDesk`, `drawLabel`)·타일 라우팅(`buildRoutedPath`, `ROOM_WAYPOINTS`)·React 오버레이(말풍선, HUD 칩) 전부 혼재.
- `frontend/src/components/AgentOffice.tsx` — 카드형 폴백 (현재 라이트 테마 친화적이지만 "오피스" 시각화는 아님).

### 1.2 결정적 약점
1. **수공예 픽셀**: `S = 2` 도트 단위로 모든 가구·캐릭터를 직접 `fillRect`. 신체 부위, 그림자, 모자/머리/옷 색을 다 코드로 박아 둠. 결과적으로 **5등신 이상/4방향/걷기 6프레임/앉기/대화 모션 등 추가 시 파일이 폭발**.
2. **다크 CRT 미감**: `rgba(11,13,22,0.9)` HUD, `VT323` 폰트, scanline 오버레이 — 2026‑04 라이트 톤 리브랜드 결과물(`UI_REDESIGN_LIGHT.md`, `--bg-canvas` 크림톤)과 충돌. 사용자 표현대로 "톤 안 맞고 퀄리티 낮음".
3. **고정 좌표/경로**: `AGENTS` 객체에 `x/y` 하드코딩, 9개 역할만 지원, `ROLE_SCENE_TARGETS` 안의 6가지 상태만 지원. 새 에이전트 추가 = 좌표 재계산 + 회피 경로 직접 설계.
4. **길찾기 부재**: 두 캐릭터가 같은 칸에 겹치고, 책상·벽 콜리전 없음. `buildRoutedPath`는 단순 L자 경로.
5. **인터랙션 0**: 마우스/터치/줌/팬 전부 미지원. "보고만 있는" 정적 시각화.
6. **퍼포먼스**: 매 프레임 캔버스 클리어 + 모든 픽셀 재드로잉(`requestAnimationFrame`). 9 캐릭터·~120 가구 픽셀이라 지금은 견디지만, 확장 시 60fps 무너짐.

### 1.3 게더타운과의 시각적 격차
| 항목 | Gather.town | 우리 PixelOffice |
| --- | --- | --- |
| 캐릭터 디테일 | 32×48 5등신, 4방향, 의상/헤어 풀 커스텀, 깜빡임/말하기 모션 | 16×24 비례 깨진 도트, 정면+측면 단순 |
| 가구 다양성 | 수백 종 가구·식물·기기, 3D 벽, 그림자, 카펫 | 책상·의자 몇 종 |
| 맵 편집 | 드래그&드롭 Mapmaker (Tiled 기반) | 코드 수정 |
| 카메라 | 부드러운 팬·줌·캐릭터 추적 | 고정 |
| 인터랙션 영역 | 임피던스(영상/문서) 트리거 타일 | 없음 |
| 사운드 | 발걸음·UI SFX·앰비언스 | 없음 |
| 라이트/시간대 | 낮밤 셰이더, 램프 라이트 | 단색 배경 |

---

## 2. 게더타운 기술 스택 분석 (오픈 정보 기반)

게더 측은 풀스택 비공개지만 공개된 인터뷰·구인 공고·자체 분석을 종합하면:

- **렌더러**: Canvas 2D → WebGL로 마이그레이션 (Gather 2.0). 자체 타일 렌더러 + 스프라이트 배칭.
- **맵**: 내부 Mapmaker는 **Tiled** TMX/JSON 포맷과 호환되는 자체 포맷. 16×16 또는 32×32 타일 그리드.
- **캐릭터**: 부위별 레이어 컴포지션(헤어·의상·피부·악세서리)을 런타임에 합성, 4방향 walk cycle.
- **네트워크**: Colyseus 계열 룸 기반 동기화 + WebRTC (영상/오디오는 LiveKit/Twilio).
- **클라이언트 프레임워크**: React + 자체 게임 루프, Electron 데스크톱.

→ **우리에게 시사점**: 영상/오디오 P2P가 필요 없고(에이전트는 LLM, 사용자는 관전자), **렌더러·맵·스프라이트·길찾기**만 게더 수준으로 끌어올리면 된다. 그리고 그 4개는 모두 무료 OSS로 해결 가능.

---

## 3. 차용할 오픈소스/에셋 (검증 완료)

### 3.1 게임 엔진 — **Phaser 4** ⭐ 선택
- **GitHub**: https://github.com/phaserjs/phaser (39.5k★, MIT, 2026‑04 v4.0.0 릴리스).
- **이유**:
  - Tiled 맵 직접 import (`this.load.tilemapTiledJSON`).
  - **TilemapGPULayer**: 4096×4096 타일을 단일 드로콜로 렌더 → 모바일 60fps 보장.
  - **SpriteGPULayer**: 100만 스프라이트까지 처리. 향후 NPC·파티클 확장 여유.
  - React 19 + Vite 공식 템플릿(`phaserjs/template-react-ts`, MIT) — 우리 Next.js 16에 그대로 이식 가능.
  - 내장 Filter: Pixelate, Bloom, Vignette, ColorMatrix → 라이트/다크 테마 셰이더 토큰화 용이.
  - 풍부한 LLM 학습 데이터 → AI 코딩 에이전트(우리 자신)와 잘 맞음.
- **대안**: PixiJS v8 (더 가볍지만 게임 시스템 직접 구현해야 함), Excalibur.js (TS first지만 커뮤니티/에셋 부족).

### 3.2 React 통합 템플릿 — **`phaserjs/template-react-ts`**
- https://github.com/phaserjs/template-react-ts (MIT, 공식).
- **EventBus 패턴**: React ↔ Phaser 양방향 통신용 단순 emitter.
- 우리 작업: `src/PhaserGame.tsx` 어댑터 + `src/game/scenes/OfficeScene.ts`만 작성.

### 3.3 맵 에디터 — **Tiled** ⭐ 선택
- https://www.mapeditor.org/ (GPL, 무료). Shovel Knight/Carrion/Coromon 등 대작이 사용.
- TMX/JSON export, 무한 맵, 자동 타일링, 오브젝트 레이어(트리거 영역, 스폰 포인트).
- 디자이너 없이도 우리가 직접 한국식 트레이딩 사무실 레이아웃을 클릭으로 그림.

### 3.4 타일/가구 에셋
1. **LimeZu — Modern Office** ($2.50, 상업용 OK, 크레딧만) https://limezu.itch.io/modernoffice  
   ▸ 현금 시세표·트레이더 데스크·미팅룸·카페·러닝머신까지. **Phase 2 메인 후보**.
2. **LimeZu — Modern Interiors v4** (free Lite + $1.50 full)  
   ▸ 100k+ 다운로드, 10k+ 스프라이트, **Character Generator 2.0** (의상 100+, 헤어 200+, 액세서리 80+) 무료 동봉. 9명 에이전트 캐릭터를 1시간 내 9종 생성 가능.
3. **Kenney.nl — Tiny Town / Roguelike Modern City / UI Pack Pixel Adventure** — **CC0 (퍼블릭 도메인)**, 크레딧 불필요. https://kenney.nl/assets/category:2D  
   ▸ Phase 1 프로토타입 무료 자산. 라이트한 16×16 미니멀 픽셀.
4. **OpenGameArt LPC (Liberated Pixel Cup)** — CC‑BY‑SA 3.0/GPL. Universal LPC Spritesheet Generator (https://github.com/sanderfrenken/Universal-LPC-Spritesheet-Character-Generator) 로 캐릭터 합성 자동화.

> **라이선스 정리**: 상업 SaaS로 운영할 가능성이 있으면 LimeZu(개인 라이선스 — 재배포·재판매만 금지, 게임/앱 내 사용 OK) + Kenney CC0 조합이 가장 안전. LPC는 SA(Share‑Alike)라 우리 코드 일부에 영향 가능 → 캐릭터 자산만 별도 디렉토리로 격리하면 OK.

### 3.5 길찾기 — **easystarjs**
- https://github.com/prettymuchbryce/easystarjs (3.6k★, MIT). A* 비동기, 콜리전 그리드 입력.
- Phaser 타일맵의 collision 레이어를 그대로 입력 → 9개 에이전트 동시 경로 계산 안전.

### 3.6 UI 플러그인 — **phaser3‑rex‑plugins**
- https://github.com/rexrainbow/phaser3-rex-notes (5.1k★, MIT). 9‑slice 말풍선·다이얼로그·텍스트 타이핑·BBcode 색상 인라인 — 현재 우리가 React로 절대좌표 계산하는 말풍선을 깔끔하게 대체.

### 3.7 (선택) 폰트/사운드
- **Pretendard** (이미 사용 중) — 라이트 톤 한국어 가독성 유지.
- **Press Start 2P / DungGeunMo** (오픈 폰트) — 8비트 강조용 한국어 픽셀 폰트.
- **Kenney Audio Pack** (CC0) — UI bleep, 발걸음. 저음량 프리셋만 사용 (사용자 ON/OFF 토글).

### 3.8 (참고만, 차용은 안 함) 풀스택 게더 클론
- **WorkAdventure** https://github.com/workadventure/workadventure (5.4k★, AGPL‑3.0). TypeScript 78% + Svelte 19% + Phaser. 게더의 직접 OSS 대체.  
  ▸ AGPL이라 우리 코드 라이선스 오염 위험 + WebRTC/Matrix Synapse/LiveKit 등 우리에게 불필요한 사이드카 다수. **풀 채택 X, 다만 그들의 Phaser 씬 구조·Pathfinding/PlayerMovement 코드는 좋은 레퍼런스**(AGPL이므로 코드 복붙 금지, 패턴만 참고).

---

## 4. 새 아키텍처 (목표 구조)

```
frontend/
├─ src/
│  ├─ components/
│  │  ├─ PixelOffice.tsx                ← 얇은 React shell (Phaser 마운트)
│  │  └─ AgentOffice.tsx                ← 폴백/접근성 카드 모드 유지
│  ├─ game/                              ← (신규) Phaser 영역
│  │  ├─ PhaserMount.tsx                ← React 브릿지 (forwardRef + EventBus)
│  │  ├─ EventBus.ts                    ← React ↔ Phaser 단방향+양방향 버스
│  │  ├─ scenes/
│  │  │  ├─ BootScene.ts                ← 에셋 preload, 로딩 progress
│  │  │  ├─ OfficeScene.ts              ← 메인 씬: 타일맵 + 캐릭터 + 카메라
│  │  │  └─ HudScene.ts                 ← 진행률/액티브 칩 (Phaser native)
│  │  ├─ actors/
│  │  │  ├─ AgentActor.ts               ← 1 에이전트 = 1 클래스 (스프라이트+상태머신)
│  │  │  └─ AgentRegistry.ts            ← role → AgentActor 매핑
│  │  ├─ pathfinding/
│  │  │  └─ TileNavigator.ts            ← easystarjs 래퍼 (collision layer 입력)
│  │  ├─ ui/
│  │  │  └─ SpeechBubble.ts             ← rex 9-slice 말풍선
│  │  └─ adapters/
│  │     └─ thoughtToSceneCommand.ts    ← AgentThought → SceneCommand 변환
│  └─ types.ts (확장)
├─ public/
│  └─ game/
│     ├─ tiled/
│     │  └─ kta-office.tmj              ← Tiled로 만든 메인 맵 (JSON)
│     ├─ tilesets/
│     │  ├─ kenney-tiny-town.png        ← Phase 1 (CC0)
│     │  └─ limezu-modern-office.png    ← Phase 2 (paid)
│     ├─ characters/
│     │  ├─ technical_analyst.png       ← 9개 에이전트 4방향 walk
│     │  └─ ...
│     └─ audio/                         ← (선택) Kenney CC0
```

### 4.1 데이터 흐름

```
WebSocket (agent thoughts) ─┐
                             ▼
              React state (thoughts: Map<AgentRole, AgentThought>)
                             │
                             ▼
              EventBus.emit('agent:update', { role, status, content })
                             │
                             ▼
              OfficeScene 핸들러 ─→ AgentActor.setStatus(status)
                             │           │
                             │           ├─ 상태머신: idle/investigate/debate/report/decide/execute
                             │           ├─ TileNavigator.findPath(현재타일, 목표타일) → walk
                             │           └─ SpeechBubble.show(content) (5s 후 fade)
                             │
                             ▼
              Phaser RAF loop (Phaser 자체 게임 루프, React와 분리)
```

### 4.2 React 어댑터 코드 스케치

```tsx
// PixelOffice.tsx (신규, 약 80줄)
"use client";
import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import type { AgentThought, AgentRole } from "@/types";

const PhaserMount = dynamic(() => import("@/game/PhaserMount"), { ssr: false });

export function PixelOffice({
  thoughts,
  activeAgents,
}: {
  thoughts: Map<AgentRole, AgentThought>;
  activeAgents: Set<AgentRole>;
}) {
  const ref = useRef<{ syncAgents: (t: Map<AgentRole, AgentThought>, a: Set<AgentRole>) => void } | null>(null);
  useEffect(() => { ref.current?.syncAgents(thoughts, activeAgents); }, [thoughts, activeAgents]);
  return (
    <div className="pixeloffice-frame">
      <PhaserMount apiRef={ref} />
    </div>
  );
}
```

```ts
// game/scenes/OfficeScene.ts (요지)
export class OfficeScene extends Phaser.Scene {
  private actors = new Map<AgentRole, AgentActor>();
  private nav!: TileNavigator;

  preload() {
    this.load.tilemapTiledJSON("office", "/game/tiled/kta-office.tmj");
    this.load.image("tiles", "/game/tilesets/limezu-modern-office.png");
    AGENT_ROLES.forEach(r =>
      this.load.spritesheet(`char-${r}`, `/game/characters/${r}.png`, { frameWidth: 16, frameHeight: 32 })
    );
  }

  create() {
    const map = this.make.tilemap({ key: "office" });
    const tiles = map.addTilesetImage("modern-office", "tiles");
    map.createLayer("Floor", tiles!);
    map.createLayer("Furniture", tiles!);
    const collision = map.createLayer("Collision", tiles!)!.setVisible(false);
    this.nav = new TileNavigator(map, collision);

    AGENT_ROLES.forEach(role => {
      const spawn = map.findObject("Spawn", o => o.name === role)!;
      this.actors.set(role, new AgentActor(this, role, spawn.x!, spawn.y!, this.nav));
    });

    this.cameras.main.setZoom(2).startFollow(this.cameras.main); // 후속: 활성 에이전트 추적
    EventBus.on("agent:update", this.onAgentUpdate, this);
  }
}
```

### 4.3 라이트 테마 통합
- 기존 토큰(`--bg-canvas`, `--brand`, `--bull`, `--bear`, `--text-primary`)을 Phaser 씬 배경/필터에 그대로 주입:
  ```ts
  const css = getComputedStyle(document.documentElement);
  this.cameras.main.setBackgroundColor(css.getPropertyValue("--bg-canvas").trim());
  ```
- ThemeProvider의 `light/dark` 변경 → EventBus `theme:change` → `OfficeScene`에서 ColorMatrix 필터로 톤 시프트 (다크: 채도 -10% & 명도 -25%).
- 픽셀아트는 *항상 정수배 줌*만 사용 (`setRoundPixels(true)`) — 흐림 방지 (LimeZu/Kenney 권고).

---

## 5. 단계별 마일스톤 (Phase 0 → 5)

### Phase 0 — 사전 준비 & 의사결정 (작업 0.5일)
- [ ] **에셋 라이선스 컨펌**: LimeZu Modern Office $2.50 + Modern Interiors $1.50 (총 \$4) 결제 또는 Kenney CC0 단독으로 갈지 결정.
- [ ] **Tiled 설치**(디자인 담당): https://thorbjorn.itch.io/tiled.
- [ ] **현재 PixelOffice 백업**: `PixelOffice.legacy.tsx`로 이름 변경, 새 파일에서 시작.
- [ ] **브랜치**: `feat/agent-office-phaser`.

### Phase 1 — 기술 스파이크: Phaser ↔ Next.js 부트스트랩 (1일)
- [ ] `npm i phaser easystarjs` (Phaser 4.0.0+, easystarjs 0.4.4+).
- [ ] `next.config.ts`에 `transpilePackages: ["phaser"]` 추가, SSR 회피 위해 `dynamic(() => import, { ssr: false })`.
- [ ] `phaserjs/template-react-ts`의 `EventBus.ts`, `PhaserGame.tsx` 패턴 이식 (MIT, 코드 복사 OK).
- [ ] **첫 마일스톤**: 회색 16×16 grid + 1개 Kenney 캐릭터 좌우 이동 → React에서 버튼으로 트리거. (검증: Phaser+Next.js 통합 가능)
- [ ] 빌드: `npm run build` 통과, 번들 사이즈 영향 측정 (Phaser 4 min+gzip ≈ 345 KB → 청크 분리 필수).

### Phase 2 — 정적 맵 & 캐릭터 (2~3일)
- [ ] Tiled에서 **kta-office.tmj** 디자인:
  - Layers: `Floor`, `Walls`, `Furniture`, `Collision` (불투명 영역), `Object/Spawn` (9개 에이전트 시작 위치 + 4 zone: TraderDesks/MeetingRoom/RiskCorner/CEORoom).
  - 32×24 타일 (16px) ≈ 512×384 캔버스. 라이트 톤 회색 카펫 + 우드.
- [ ] LimeZu Character Generator로 9명 캐릭터 PNG export → `public/game/characters/`.
- [ ] 정적 렌더링만 (이동 X) — **두 번째 마일스톤**: 라이트 테마 톤과 어울리는지 PR 스크린샷 리뷰.

### Phase 3 — 에이전트 액터 + 길찾기 + 상태머신 (2~3일)
- [ ] `AgentActor`: idle / walking / sitting / talking 4상태, 각 상태별 스프라이트 애니 (4프레임 × 4방향).
- [ ] `TileNavigator` (easystarjs): 콜리전 레이어를 1/0 그리드로 변환, 비동기 `findPath`.
- [ ] **AgentThought.status → SceneCommand 매퍼** (`adapters/thoughtToSceneCommand.ts`):
  - `analyzing` → 자기 책상 위치로 이동 후 typing emote
  - `debating` → 미팅룸 좌석으로 모임
  - `deciding` → CEO룸으로 이동 + 라이트 셰이더 강조
  - `done` → 자리 복귀, 초록 체크 이펙트
- [ ] **세 번째 마일스톤**: 백엔드 mock thoughts 시퀀스로 9명이 사무실에서 회의→결정 흐름 자연스럽게 재현.

### Phase 4 — 비주얼 폴리시 & 인터랙션 (2일)
- [ ] **말풍선**: rex `roundRectangle` + Korean(Pretendard 12px) 텍스트 타이핑. 화면 밖이면 화살표 indicator.
- [ ] **카메라**: 마우스 wheel 줌 (1x~3x), 드래그 팬, 액티브 에이전트 자동 추적 토글.
- [ ] **호버 툴팁**: 캐릭터 마우스오버 시 "기술분석가 — 분석 중 (3.2s)".
- [ ] **클릭 → React 콜백**: `EventBus.emit("agent:click", role)` → `page.tsx`에서 해당 에이전트 카드 스크롤/하이라이트.
- [ ] **라이트/다크 셰이더**: ColorMatrix Filter로 ThemeProvider 동기.
- [ ] **사용자 모션 감소(prefers-reduced-motion)**: 걷기 애니 비활성, 즉시 텔레포트 모드.

### Phase 5 — 폴백·접근성·QA (1일)
- [ ] **AgentOffice 카드 폴백 유지**: WebGL 미지원 / `prefers-reduced-motion` / 접근성 사용자에게 자동 노출. 기존 코드 그대로 두고 Feature flag (`?office=cards`).
- [ ] 키보드 내비: Tab 순환으로 각 에이전트 포커스 → 화면 패닝.
- [ ] aria-live 영역: 활성 에이전트 변경 시 스크린리더에 한국어 알림.
- [ ] Lighthouse: TBT/CLS 영향 측정.
- [ ] E2E (Playwright): "백엔드 mock 스트림 → 4초 내 5명 walking" 시나리오.

---

## 6. 위험 요소 & 완화

| 위험 | 영향 | 완화 |
| --- | --- | --- |
| Phaser 4 + Next.js 16 SSR 충돌 | 빌드 실패 | `dynamic(..., {ssr:false})` + Phaser는 클라이언트 onlly. 검증 PoC를 Phase 1 첫날 처리 |
| 번들 사이즈 +345 KB(gzip) | 초기 LCP +0.3s | 라우트 분리(`/?office=on`) + 동적 import. AgentOffice 카드 폴백을 디폴트로 두고 사용자 토글 시 로드 |
| LimeZu 라이선스 (개인 라이선스, 재판매 금지) | SaaS 배포 시 모호함 | LimeZu Discord 통해 SaaS 임베딩 가능 여부 확인. 불가시 Kenney CC0 단독으로 다운그레이드 |
| 한글 폰트 픽셀 매칭 | LimeZu 영문 가구와 한글 라벨 톤 불일치 | DungGeunMo(SIL OFL) 또는 Galmuri(SIL OFL) 사용 — 16px 픽셀 한글 |
| 길찾기 9명 동시 충돌 | 캐릭터 겹침 | easystarjs + 동적 reservation table (각 에이전트가 다음 1~2 타일 점유 표시) |
| 기존 `data-tour="office"` 등 코치마크 ID 깨짐 | 온보딩 회귀 | React shell `<div data-tour="office">` 유지, Phaser는 그 안에서만 캔버스 차지 |

---

## 7. 산출물 (이번 PR이 끝났을 때)

1. `frontend/src/game/**` 신규 (약 600줄, Phaser/EventBus/Actor/Navigator).
2. `frontend/public/game/**` 정적 에셋 (LimeZu/Kenney + Tiled JSON).
3. `frontend/src/components/PixelOffice.tsx` 80줄로 다이어트.
4. `frontend/src/components/PixelOffice.legacy.tsx` 보존 (롤백용, 1개월 후 제거).
5. `docs/AGENT_OFFICE_GATHER_LEVEL_UP.md` (본 문서) + `docs/AGENT_OFFICE_TILED_GUIDE.md` (Tiled 사용법, Phase 2에서 추가).
6. `frontend/AGENTS.md`에 "Phaser 씬 추가 시 EventBus 이벤트 등록 필수" 가이드 1줄.

---

## 8. 결정해야 하는 것 (사용자 입력 필요)

1. **에셋 결제 OK?** ($4 LimeZu) — 결정에 따라 Phase 2 캐릭터/맵 톤이 갈림.
2. **인터랙션 범위**: 보기 전용(현재 사용자 의도) vs 클릭→해당 에이전트 패널 포커스(권장).
3. **사운드**: 기본 OFF + 토글 vs 완전 미도입.
4. **폴백 컴포넌트(`AgentOffice` 카드 모드)** 유지 vs 삭제? (권장: 유지 — 접근성/저사양 디바이스).
5. **마일스톤 순서**: 위 5단계대로 vs Phase 1 PoC 후 사용자 리뷰 → Phase 2~5 진행 (권장: 후자).

---

## 9. 참고 링크 (검증된 OSS / 에셋)

- Phaser 4 — https://github.com/phaserjs/phaser (MIT, 39.5k★)
- Phaser React TS Template — https://github.com/phaserjs/template-react-ts (MIT)
- Tiled Map Editor — https://www.mapeditor.org (GPL)
- easystarjs — https://github.com/prettymuchbryce/easystarjs (MIT)
- phaser3-rex-plugins — https://github.com/rexrainbow/phaser3-rex-notes (MIT)
- LimeZu Modern Office — https://limezu.itch.io/modernoffice (개인 라이선스, $2.50)
- LimeZu Modern Interiors v4 — https://limezu.itch.io/moderninteriors (lite free, full $1.50)
- Kenney 2D Assets — https://kenney.nl/assets/category:2D (CC0)
- Universal LPC Spritesheet Generator — https://github.com/sanderfrenken/Universal-LPC-Spritesheet-Character-Generator (CC-BY-SA / GPL)
- WorkAdventure (참고용) — https://github.com/workadventure/workadventure (AGPL, 5.4k★)
- Galmuri 한글 픽셀 폰트 — https://github.com/quiple/galmuri (SIL OFL)
- DungGeunMo 한글 픽셀 폰트 — https://cactus.tistory.com/193 (SIL OFL)

---

**다음 액션**: 위 §8의 5개 결정사항 답변 → Phase 0 체크리스트 시작.
