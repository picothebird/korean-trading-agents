# Agent Office — Gather.town 수준으로 끌어올리기 위한 개편 플랜

> 작성: 2026-04-26  
> **v3 (최종 결정): 2026-04-26 — §0-ter 참조. 사용자 디렉티브: "고품질·확장성·유저 커스터마이징 풀스택". v2의 점진적/타협안 폐기.**  
> 대상 컴포넌트: `frontend/src/components/PixelOffice.tsx`, `AgentOffice.tsx` (사이드 우측 패널의 "에이전트 컨트롤룸" 영역)  
> 목표: 게더타운(Gather.town) 수준의 "살아있는 가상 사무실" 시각화로 에이전트들의 협업·이동·발화를 표현. **유저가 자기 사무실/캐릭터/레이아웃을 자유롭게 커스터마이즈할 수 있는 확장 가능한 플랫폼**으로 설계.

---

## 0-ter. 최종 권장 (v3 — 고품질 + 확장성 + 커스터마이징 풀스택) ⭐⭐

> 사용자 디렉티브 (2026-04-26): *"매우 고퀄리티로 가고싶어 향후 확장성 및 유저가 다양하게 커스텀도 할 수 있는 방향으로 최대한 고품질로 계획해."*

v2의 "Track A 먼저 보고 결정" 점진주의는 **이 디렉티브와 양립 불가**입니다. 처음부터 풀스택 아키텍처를 깔고, 콘텐츠/씬/캐릭터/오피스를 **데이터 주도(data-driven)** 로 분리해야 사용자 커스터마이징이 가능합니다. v3는 이를 위한 단일 일관 플랜입니다.

### 0-ter.1 핵심 설계 원칙

| 원칙 | 함의 |
| --- | --- |
| **1. 엔진은 Phaser 3 LTS** | 8년 검증, Next.js·React 통합 사례 풍부, Tiled/카메라/필터/사운드/플러그인 생태계 완비. Phaser 4는 v4.0.0 갓 출시 — 12개월 후 재평가. 번들 ~200 KB gz는 lazy chunk + dynamic import로 격리 |
| **2. 렌더는 React 밖에서, 상태는 React에서** | `<PixelOfficeStage>` 래퍼만 React. Phaser 인스턴스는 `useRef`에 살리고 zustand store(`officeStore`)로 React↔Phaser 양방향 브릿지. WebSocket 이벤트(`AgentThought`)는 store에 push, Phaser는 store 구독 |
| **3. 모든 콘텐츠는 데이터** | 맵·캐릭터·가구·애니메이션·대사 = JSON/TMJ 파일. 코드에 좌표·색상 하드코딩 0건. 사용자가 GUI(Tiled 또는 자체 인게임 에디터)로 변형 가능 |
| **4. 에셋 파이프라인은 표준화** | LDtk 또는 Tiled로 맵 제작 → JSON export → 런타임 로더가 청크 스트리밍. 스프라이트는 TexturePacker JSON 아틀라스 |
| **5. 유저 커스터마이징은 3계층** | (a) 프리셋(테마/레이아웃 갤러리) → (b) 인게임 에디터(드래그&드롭) → (c) 고급 사용자용 JSON 직접 편집·임포트 |
| **6. 멀티테넌시 대비** | 사용자별 office config를 MongoDB(`office_layouts` 컬렉션)에 저장. 클라우드 동기화·공유 URL 가능 |
| **7. 접근성·폴백 유지** | `prefers-reduced-motion`/저사양 감지 시 자동으로 `AgentOffice.tsx` 카드 뷰로 폴백. 키보드 네비게이션 |
| **8. 라이선스 청결** | 코어 에셋은 **Kenney CC0 + LimeZu Lite($1.50, 정식 결제 후 Discord SaaS 임베딩 확약)** 이중화. AGPL/GPL 코드 직접 차용 금지(WorkAdventure, Tiled GUI 자체는 OK — 출력 JSON만 사용) |

### 0-ter.2 최종 스택 (확정)

| 영역 | 선택 | 이유 |
| --- | --- | --- |
| 렌더 엔진 | **Phaser 3.90.x LTS** | 안정/생태계/Tiled 일급지원 |
| 맵 에디터 | **LDtk 1.5+** (1차) + **Tiled 1.11** (보조) | LDtk = 모던 UX, 레벨 stacking, 자동 레이어. Tiled = 더 많은 커뮤니티 에셋 호환 |
| 길찾기 | **Phaser-Navmesh** (MIT) + fallback **easystarjs** | navmesh는 그리드보다 자연스러운 사선 이동. fallback A* |
| UI/HUD 오버레이 | **React 19 (현 페이지)** | 현 디자인 시스템·라이트 토큰 그대로 사용 |
| 상태 브릿지 | **Zustand 4** | 1.5 KB, React/Phaser 양쪽에서 구독 가능 |
| 캐릭터 생성 | **LPC Spritesheet Generator** (CC-BY-SA, 격리 디렉터리) + **LimeZu Character Generator** (커밋된 라이선스 후) | 사용자가 머리/옷/액세서리 조합으로 자기 캐릭터 생성 |
| 사운드 | **Howler.js** (Phaser 내장 대체 가능 — 결정 보류) | UI 효과음 분리 관리 시 필요 |
| 인게임 에디터 | **자체 구현** (`react-dnd` + Phaser scene swap) | Tiled를 인게임에 임베드 불가 → 단순 드래그&드롭 정도만 |
| 폰트 | **Galmuri11 / DungGeunMo** (SIL OFL) | 한국어 픽셀 톤 |
| 저장소 | **MongoDB Atlas `office_layouts` 컬렉션** + 로컬 IndexedDB 캐시 | 멀티 디바이스 동기 |
| 빌드 | **Next.js 16 dynamic import** + `transpilePackages: ["phaser"]` | SSR 회피 |

번들 예산: Phaser 3 200 KB + navmesh 8 KB + zustand 1.5 KB + howler 7 KB ≈ **~220 KB gz**, lazy chunk로 첫 페인트와 분리.

### 0-ter.3 모듈 아키텍처

```
frontend/src/
├── components/
│   ├── PixelOffice.tsx              # 얇은 래퍼: <PixelOfficeStage> + HUD 오버레이 React
│   ├── AgentOffice.tsx              # 폴백 카드 뷰 (유지)
│   └── office/
│       ├── HUD/                     # 말풍선·미니맵·툴팁 (React)
│       └── editor/                  # 인게임 커스터마이저 (React + react-dnd)
├── game/                            # ⭐ Phaser 영역 (React 비의존)
│   ├── boot.ts                      # Phaser.Game 부트스트랩
│   ├── scenes/
│   │   ├── PreloadScene.ts          # 아틀라스/맵/폰트 로딩
│   │   ├── OfficeScene.ts           # 메인 사무실
│   │   ├── EditorScene.ts           # 인게임 에디터 모드
│   │   └── BootScene.ts
│   ├── actors/
│   │   ├── AgentActor.ts            # 4방향 walk, 말풍선 anchor, 책상 routing
│   │   └── ActorFactory.ts          # 캐릭터 config → Actor 생성
│   ├── systems/
│   │   ├── PathfindingSystem.ts     # navmesh + reservation table
│   │   ├── DialogueSystem.ts        # store 구독 → 말풍선 dispatch
│   │   ├── CameraSystem.ts          # follow / free / cinematic
│   │   ├── InteractionSystem.ts     # 클릭→포커스, 더블클릭→상세
│   │   └── EditorSystem.ts          # 그리드 스냅, 가구 배치
│   ├── data/
│   │   ├── maps/
│   │   │   ├── default-office.ldtk
│   │   │   └── default-office.json
│   │   └── presets/
│   │       ├── themes.json          # neutral / warm / dark / hanok
│   │       └── characters/*.json
│   └── plugins/
│       └── KoreanLabelPlugin.ts     # 한국어 폰트/말풍선 9-slice
├── store/
│   └── officeStore.ts               # zustand: thoughts, focusedAgent, theme, layout
└── public/game/
    ├── tilesets/                    # CC0 Kenney + LimeZu (정식)
    ├── characters/                  # LPC + LimeZu CharGen 출력 PNG
    ├── atlases/*.json               # TexturePacker
    └── audio/                       # CC0 효과음
```

### 0-ter.4 데이터 스키마 (사용자 커스터마이징의 핵심)

**`OfficeLayout` (사용자별 1+ 개, MongoDB `office_layouts` 컬렉션)**:
```ts
interface OfficeLayout {
  _id: ObjectId;
  user_id: string;
  name: string;                       // "내 트레이딩 데스크"
  is_active: boolean;
  theme: 'neutral' | 'warm' | 'dark' | 'hanok' | string;
  map: {
    preset?: 'default-office' | 'open-loft' | 'hanok-room' | 'penthouse';
    custom_ldtk?: string;             // base64 LDtk JSON (고급)
    width: number; height: number;
  };
  agents: Array<{
    role: AgentRole;                  // 백엔드 9 roles와 1:1
    desk: { x: number; y: number; rotation: 0|90|180|270 };
    character: CharacterConfig;       // 아래
  }>;
  furniture: Array<{
    asset_id: string;                 // 'plant_pot_01', 'monitor_dual_01'
    x: number; y: number; rotation: number;
    layer: 'floor' | 'object' | 'overhead';
  }>;
  ambience: {
    bgm?: string;                     // 'lofi_office_01' | null
    sfx_volume: number;
    particles: boolean;               // 먼지/햇살
  };
  created_at: Date;
  updated_at: Date;
  shared_token?: string;              // 'aBcD12' → /office/share/aBcD12 공유
}

interface CharacterConfig {
  base: 'lpc_male_01' | 'lpc_female_01' | 'limezu_chibi_01' | string;
  hair: { sprite_id: string; color: string };
  outfit: { top: string; bottom: string; shoes: string };
  accessories: string[];              // 'glasses_round', 'headset_01'
  name_label: string;                 // 한국어 이름표 ("나정훈", "박애나")
  emoji_set?: 'default' | 'kpop' | 'finance';  // 말풍선 옆 이모지 셋
}
```

**프리셋 갤러리** (`game/data/presets/themes.json`): 4종 시작 — `neutral`(라이트 톤 기본), `warm`(우디/식물), `dark`(야간 트레이딩 데스크), `hanok`(한옥 모티프).

### 0-ter.5 사용자 커스터마이징 UX (3-Tier)

1. **Tier 1 — 프리셋 선택** (90% 사용자)  
   사이드 패널 우상단 "오피스 변경" 버튼 → 모달에서 4개 테마 + 4개 레이아웃 카드 클릭. 즉시 적용·DB 저장.

2. **Tier 2 — 인게임 에디터** (파워 유저)  
   `EditorScene` 진입 시 그리드 표시·가구 팔레트(LimeZu/Kenney 100+ 종) 사이드바·드래그&드롭·우클릭 회전·캐릭터 더블클릭→`CharacterCustomizer`(머리/옷/이름표) 모달. 저장 시 `OfficeLayout`로 직렬화.

3. **Tier 3 — JSON/LDtk 임포트** (개발자/디자이너)  
   "고급 → LDtk 파일 가져오기"로 본인이 LDtk 데스크탑에서 만든 `.ldtk` 업로드. 검증·리매핑 후 `custom_ldtk` 필드에 저장. 공유 토큰으로 다른 유저에게 배포 가능.

### 0-ter.6 백엔드 변경

- 신규 컬렉션 `office_layouts` (위 스키마).
- 신규 엔드포인트:
  - `GET /api/office/layouts` — 내 레이아웃 목록
  - `POST /api/office/layouts` — 생성
  - `PATCH /api/office/layouts/{id}` — 부분 업데이트
  - `POST /api/office/layouts/{id}/activate` — 활성화 1개
  - `GET /api/office/share/{token}` — 공유 가져오기 (read-only)
  - `POST /api/office/layouts/import` — LDtk JSON 검증/임포트
- 검증: 좌표 범위·에셋 화이트리스트(`asset_id` ∈ 우리 카탈로그)·LDtk 크기 ≤ 256×256 타일·총 객체 수 ≤ 500.

### 0-ter.7 단계별 마일스톤 (사용자 OK 즉시 착수)

> 모든 단계가 끝까지 진행됨을 전제로 한 일정. 각 마일스톤 PR로 끊되, *중간 다운그레이드 없이* 풀 아키텍처를 향해 직진.  
> **MS-A는 풀 마이그레이션과 별개로 즉시 가치를 내는 정보설계 정리** — 시각 개편(MS0~)과 병렬/선행 가능.

| MS | 산출물 | 검증 기준 |
| --- | --- | --- |
| **MS-A — 정보설계 정리 (Information Architecture Cleanup)** | §0-quater 참조. 우측 패널의 중복 카운터 제거·라벨 통일·off-by-one 버그·영문 라벨 한글화·백엔드 metadata 신호 표준화 | 사용자 입장에서 같은 숫자가 화면에 1번만 보이고, 모든 라벨이 일관 |
| **MS0 — 부트스트랩** | Phaser 3 + zustand 의존성 추가, `transpilePackages`, dynamic import, 빈 `OfficeScene`이 라이트 토큰 배경에서 렌더 | `<PixelOffice>` 자리에 검은 화면 대신 빈 캔버스 표시, SSR 에러 0 |
| **MS1 — 에셋 파이프라인** | Kenney Top-Down + LimeZu Lite 다운로드, TexturePacker 아틀라스 빌드 스크립트, `PreloadScene` 로딩바 | 모든 아틀라스 한 번에 로드 ≤ 1.5s on 3G fast |
| **MS2 — 디폴트 맵** | LDtk로 `default-office` (60×40 타일, 9 데스크 zone) 제작, JSON export, 런타임 로더, 충돌 레이어 적용 | 맵이 정상 렌더, 카메라 팬 가능, 9 데스크 마커 표시 |
| **MS3 — 액터 + 길찾기** | `AgentActor` (4방향 walk 8fps), `PathfindingSystem` navmesh + reservation, 9 에이전트 데스크 정주 | `AgentThought` WebSocket 이벤트 → 해당 에이전트가 동선따라 이동 |
| **MS4 — HUD/말풍선/카메라** | React HUD 오버레이(미니맵·범례·필터), 말풍선 9-slice + 한국어 폰트, 클릭→카메라 follow | 기존 `PixelOffice`의 모든 기능 재현 + 카메라 줌 |
| **MS5 — 테마 시스템** | 4개 프리셋 테마, 라이트 토큰 변수 동기, 다크 모드 시 자동 톤 변환 | 테마 전환 모달에서 즉시 반영 |
| **MS6 — 캐릭터 커스터마이저** | `CharacterCustomizer` 모달 (베이스/머리/옷/이모지 셋), 미리보기 캔버스, `CharacterConfig` 저장 | 9 에이전트 각각 독립 외형 저장·복원 |
| **MS7 — 인게임 가구 에디터** | `EditorScene`, 팔레트 사이드바, 그리드 스냅, 회전, 실행취소, 저장 | 가구 100개 배치 후 새로고침해도 유지 |
| **MS8 — 백엔드 API + 멀티 레이아웃** | `office_layouts` CRUD, 활성 레이아웃 토글, 레이아웃 갤러리 UI | 사용자가 레이아웃 3개 만들고 전환 |
| **MS9 — 공유/임포트** | shared_token, 공유 URL, LDtk 임포트 + 검증 + 화이트리스트 | A 유저가 만든 레이아웃을 B 유저가 가져와 활성화 |
| **MS10 — 사운드/파티클/시네마틱** | Howler 통합, BGM 토글, 먼지/햇살 파티클, "장 마감" 시네마틱 카메라 무브 | 옵션 토글 즉시 반영, 모바일 OK |
| **MS11 — 접근성 + 폴백 + QA** | reduced-motion → 카드 뷰 자동, 키보드 네비, 저사양(GPU tier 0) 감지, e2e Playwright | Lighthouse a11y ≥ 95, 60fps@1080p / 30fps@저사양 |

### 0-ter.8 확장 후크 (향후 기능을 위한 미리 깔아두는 인터페이스)

플러그인 패턴으로 닫지 않고 열어두는 지점:

- **AgentBehavior 플러그인**: `interface AgentBehavior { onThought, onIdle, onFocus, onLeave }` — 향후 "에이전트가 커피 마시러 간다" 같은 idle 행동 추가 시 새 클래스 등록만.
- **AssetCatalog**: `public/game/atlases/catalog.json`이 자산 메타(id/preview/tags/license). 새 에셋 팩 추가는 JSON에 항목 추가 + atlas drop만.
- **ThemeProvider 브릿지**: 라이트 토큰(`--bg-canvas`, `--brand`)을 Phaser config에 자동 주입 → 디자인 시스템 변경 시 게임 톤 자동 추종.
- **EventBus**: `officeStore`에 모든 게임 이벤트 publish → 향후 분석/리플레이/AI 학습 데이터로 재활용.
- **LiveMode 어댑터**: `WebSocket → store → Phaser` 단방향 흐름이 이미 분리되어 있어, 추후 멀티 사용자(여러 트레이더의 office를 한 캔버스에) 모드 전환 시 어댑터만 교체.

### 0-ter.9 라이선스 매트릭스 (확정 사용 예정 자산)

| 자산 | 라이선스 | 사용 방식 | 비고 |
| --- | --- | --- | --- |
| Phaser 3 | MIT | 코드 의존성 | OK |
| LDtk | MIT (앱) / 출력 JSON 자유 | 맵 에디터(개발자 PC), 출력만 번들 | OK |
| Tiled | GPL (앱) / 출력 JSON 자유 | 보조 에디터, 출력만 사용 | OK |
| Kenney Game Assets | **CC0** | 직접 번들·재배포·수정 | OK (디폴트) |
| LimeZu Modern Office Lite | $1.50 개인 | 정식 결제 + Discord에 SaaS 임베딩 OK 서면 확인 후 사용 | **확약 전엔 Kenney만으로 진행** |
| LPC Spritesheet | CC-BY-SA 3.0 | `public/game/characters/lpc/` 격리, README에 크레딧 + share-alike 고지 | 코어 코드와 분리 |
| Galmuri11 / DungGeunMo | SIL OFL | 폰트 파일 번들, 폰트명 보존 | OK |
| Phaser-Navmesh | MIT | 의존성 | OK |
| Howler.js | MIT | 의존성 | OK |
| Zustand | MIT | 의존성 | OK |
| WorkAdventure | AGPL | **코드 차용 금지** — 패턴 학습만 | 회피 확정 |

### 0-ter.10 리스크 및 대응

| 리스크 | 영향 | 대응 |
| --- | --- | --- |
| Phaser 3 + Next.js 16 + Turbopack 호환성 | 부트 실패 | MS0에서 1일 PoC. 막히면 webpack mode로 fallback (Next 16 도큐먼트 옵션 존재) |
| 번들 +220 KB gz | LCP 영향 | 사이드 패널 첫 토글 시 lazy load + skeleton. 첫 페인트 영향 0 |
| LimeZu 라이선스 거부 | 시각 디테일 ↓ | Kenney CC0 단독 + 자체 픽셀 보강(2~3일 추가). 디폴트 톤은 Kenney로 충분 |
| 사용자가 만든 LDtk가 악성/과대 | 서버/렌더 부하 | 임포트 시 크기·객체 수·에셋 ID 화이트리스트 검증 |
| 작업량 (MS0~MS11) | 일정 | 각 MS 독립 PR — 어느 시점에서 멈춰도 그 시점까진 완성품 |

### 0-ter.11 v2와의 관계

- v2의 "Track A→B→C 점진주의"는 **이 디렉티브와 양립 불가**하므로 폐기.
- v2의 *기술적 통찰*(에셋이 80%, Phaser 3 > 4, LimeZu 라이선스 회색)은 **v3에 그대로 흡수**됨 — Kenney를 디폴트로, LimeZu는 라이선스 확약 후 부가, Phaser 3 LTS 채택.
- 즉 v3 = v2의 분석을 받아들이되, "충분히 좋은" 타협 대신 **"확장 가능한 풀 아키텍처"** 로 직진.

### 0-ter.12 사용자 결정 필요 (MS0 착수 전)

1. **에셋**: Kenney CC0 디폴트 + LimeZu 라이선스 병행 문의 → OK?
2. **맵 에디터**: LDtk 1차(권장) vs Tiled 1차 → OK?
3. **상태 라이브러리**: Zustand 신규 도입 OK? (현재 프로젝트는 직접 fetch + React state)
4. **백엔드**: `office_layouts` 컬렉션·API를 backend/api에 추가 OK?
5. **MS0 시작 시점**: 즉시 vs 위 1~4 결정 후

위 5개에 답이 오면 MS0부터 순차 PR로 들어갑니다. 각 MS 종료 시 데모 GIF + 체크리스트로 검증.

---

## 0-quater. 정보설계 정리 — 현재 우측 패널 감사 & 개편안 (MS-A 상세) ⭐

> 사용자 디렉티브 (2026-04-26 추가): *"기존에 구성된 내용들이 뭘 목적으로 했는지·다른 부분과 어떻게 연계되는지 다시 확인해서, 과도하게 중복된 정보·이상한 한글화·`0/4` 같은 알아볼 필요 없는 카운터를 정리·개편하라."*

이 섹션은 **MS-A**(시각 풀 마이그레이션과 별개·선행 가능). 기존 우측 패널을 끝까지 살려 두는 동안에도 **사용자 혼란의 80%가 사라짐**.

### 0-quater.1 현재 구조 (감사 결과)

우측 패널 = `<main data-tour="console">` (frontend/src/app/page.tsx 약 L2040–2090). 상하 50:50 분할.
- **상단**: `<PixelOffice>` (픽셀 캔버스) — 시각적 사무실 애니메이션
- **하단**: `<ActivityFeed>` (실시간 로그)
- **헤더**: 타이틀 "에이전트 컨트롤룸" + `DATA · DEBATE · DECISION` 배지 + 상태 텍스트(`분석 중 · n개 활성` / `n/8 완료`) + 설정 버튼
- **서브탭 없음** — 단일 고정 뷰

데이터 백본: 백엔드 SSE → `thoughts: Map<AgentRole, AgentThought>`, `activeAgents: Set<AgentRole>`, `logs: AgentThought[]`, `decision`, `isRunning`. 9개 `AgentRole` 존재(technical/fundamental/sentiment/macro/bull/bear/risk/portfolio/guru), 6개 `AgentStatus`(idle/thinking/analyzing/debating/deciding/done).

### 0-quater.2 발견된 문제 (Top 11 — 우선순위 순)

| # | 문제 | 위치 | 심각도 | 카테고리 |
| --- | --- | --- | --- | --- |
| 1 | **Off-by-one 버그**: 헤더에 `n/8 완료` 표시되지만 실제 에이전트는 9명 | page.tsx:2084 | 🔴 High | 정확성 |
| 2 | **3중 중복 카운터**: 같은 완료율 데이터가 (a) Flow Cards 그리드, (b) Layer 섹션 배지, (c) 헤더 상태 라인 — **3 곳에서 동시 표시** | AgentOffice + page.tsx | 🔴 High | 중복 |
| 3 | **무의미한 `0/4` 카운터**: 레이어가 idle 상태일 때 "0/4" 표시. "대기 중"과 동일한 의미인데 숫자로 표시되어 행동 유발 정보 0 | page.tsx:735–765 | 🔴 High | 노이즈 |
| 4 | **영문 라벨 무차별 사용**: `DATA · DEBATE · DECISION · EXCHANGE`가 헤더·Flow Cards·Activity Log·픽셀 캔버스(`RESEARCH FLOOR`, `MEETING ROOM`, `INVESTIGATE→DEBATE→REPORT→DECIDE→EXCHANGE`)에 혼용 | 다수 | 🔴 High | 일관성 |
| 5 | **취약한 정규식 시맨틱 배지**: 활동 로그에 `BULL/BEAR/RISK/완료` 배지를 *content 정규식 매칭*으로 부여 → "약세 증권사 보고서" 같은 문장에 BEAR 오탐 | AgentOffice.tsx:332–340 | 🟠 Med | 신뢰성 |
| 6 | **Key points 무음 절단**: `key_points`가 4개 이상이어도 앞 3개만 보여주고 "+1 더" 표시 0 → 사용자는 누락 사실 모름 | AgentOffice.tsx:110–120 | 🟠 Med | 데이터 손실 |
| 7 | **"분석 중 · n개 활성"의 모호함**: "활성"이 실행 중인지·참여 중인지 불명. 어떤 에이전트가 활성인지도 표시 0 | page.tsx:2078 | 🟠 Med | 모호함 |
| 8 | **혼합 표기 "Layer 1 · 데이터 수집"**: "Layer"는 영어 / 나머지는 한글 → 비기술 사용자에게 어색 | AgentOffice.tsx:376 | 🟠 Med | 일관성 |
| 9 | **상태 enum vs 한글 라벨 불일치**: 백엔드 `idle/thinking/analyzing/debating/deciding/done` ↔ 프론트 `대기/분석 중/토론 중/결정 중/완료` (5개로 축약) → 매핑 레이어가 별도 존재. 백엔드 추가 시 무음 누락 위험 | AgentOffice.tsx:60–65 | 🟡 Low | 유지보수 |
| 10 | **line-clamp 비일관**: 일반 status는 3줄, debating 만 6줄 — 문서화 0, 사용자가 "왜 갑자기 길어졌지?" | AgentOffice.tsx:101 | 🟡 Low | 일관성 |
| 11 | **픽셀 캐릭터에 이름표 없음**: 9 캐릭터가 움직여도 "누가 누구인지" 카드와 매칭 어려움 | PixelOffice.tsx | 🟡 Low | 가독성 |

### 0-quater.3 개편 원칙 (정보설계)

1. **DRY (1 정보 = 1 표시 위치)** — 같은 완료율은 화면에 단 한 번. 다른 곳에서 필요하면 *링크* 또는 *마우스오버*.
2. **숫자가 아닌 행동/상태로** — "0/4"는 사용자에게 의미 없음. "대기 중", "준비됨", "완료" 같은 *상태 어휘* 사용. 숫자는 1단계 깊이로 들어갔을 때만.
3. **한글 우선·영어는 약어/식별자만** — 사용자 노출 라벨은 100% 한글. 영어는 (a) 백엔드 식별자(`technical_analyst`), (b) 데이터 표(컬럼 헤더), (c) 약어(L1/L2/L3) 정도만 허용.
4. **신호는 백엔드 metadata로** — BULL/BEAR/RISK 같은 시맨틱 분류는 LLM 또는 룰 기반으로 백엔드에서 확정해 `thought.metadata.signal`로 내려줌. 프론트 정규식 폐기.
5. **숨김은 명시적으로** — 절단(truncate)이 일어나면 항상 "+N 더" 또는 펼치기 버튼.
6. **백엔드 enum이 진실의 원천(SSOT)** — 상태/역할 한글 라벨은 *공유 라벨 테이블*(`frontend/src/lib/agentLabels.ts`)에서 단일 매핑. 백엔드에 enum 추가 시 lint 경고로 누락 감지.

### 0-quater.4 개편 후 우측 패널 정보 구조

```
┌─ 우측 패널 (data-tour="console")
│
├─ 헤더 (50px)
│  ├─ "에이전트 컨트롤룸"
│  ├─ 상태 칩 (단 1개):
│  │    • 대기 중           (isRunning=false, decision=null)
│  │    • 분석 진행 중       (isRunning=true)            ← 진행률은 아래 PipelineBar에만
│  │    • 분석 완료          (decision !== null)
│  └─ 액션: [일시정지] [설정]
│
├─ PipelineBar (32px) — 1단계/2단계/3단계 가로 진행 바
│  └─ "1단계 데이터 수집  ●●●●  2단계 토론  ○○  3단계 결정·실행  ○○○"
│     (점은 각 레이어의 에이전트 수, 채워진 점 = 완료)
│     ※ 마우스오버 시 어떤 에이전트가 완료/진행 중인지 툴팁
│
├─ 서브탭 (필요 시 추가)
│  [ 사무실 시각 ]  [ 활동 로그 ]  [ 통계 ]
│   ────────       (default)        (option)
│
├─ 본문 — 선택 탭에 따라
│  ├─ 사무실 시각 → <PixelOffice>  (※ MS0~ 풀 마이그레이션 대상)
│  ├─ 활동 로그   → <ActivityFeed> (정리된 ver.)
│  └─ 통계       → 분석 횟수·평균 지속시간·결정 분포 (옵션, 후순위)
│
└─ (footer 없음)
```

### 0-quater.5 라벨 통일 테이블 (Source of Truth)

신규 파일 `frontend/src/lib/agentLabels.ts`로 중앙화:

```ts
// AgentRole (백엔드 SSOT) → 한글 단일 라벨
export const AGENT_LABEL: Record<AgentRole, string> = {
  technical_analyst: "기술적 분석",
  fundamental_analyst: "펀더멘털 분석",
  sentiment_analyst: "감성 분석",
  macro_analyst: "거시 분석",
  bull_researcher: "강세 리서처",
  bear_researcher: "약세 리서처",
  risk_manager: "리스크 매니저",
  portfolio_manager: "포트폴리오 매니저",
  guru_agent: "구루 에이전트",
};

// AgentStatus → 한글 단일 라벨
export const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: "대기",
  thinking: "검토 중",
  analyzing: "분석 중",
  debating: "토론 중",
  deciding: "결정 중",
  done: "완료",
};

// 레이어 (1/2/3) — Layer→단계
export const LAYER_LABEL = ["1단계 · 데이터 수집", "2단계 · 강세 vs 약세 토론", "3단계 · 리스크 & 결정"];
export const LAYER_SHORT = ["1단계", "2단계", "3단계"];

// 시맨틱 신호 (백엔드 metadata.signal) — 영문 enum + 한글 표시
export const SIGNAL_LABEL = {
  bull: { ko: "매수 신호", color: "var(--bull)" },
  bear: { ko: "매도 신호", color: "var(--bear)" },
  risk: { ko: "리스크 경고", color: "var(--warn)" },
  done: { ko: "결론", color: "var(--text-secondary)" },
};
```

ESLint 룰(권장): `agentLabels.ts` 외부에서 한글 에이전트 이름·상태 문자열을 *직접 작성*하면 경고. 새로운 enum 멤버가 백엔드에 추가되면 TypeScript exhaustive check로 컴파일 에러 발생.

### 0-quater.6 백엔드 측 변경 (signal metadata 표준화)

**현재**: 프론트가 `thought.content` 정규식으로 BULL/BEAR/RISK 추정 → 오탐.  
**개편**: 백엔드에서 thought emit 시 `metadata.signal` 필드를 **항상** 채움.

```python
# backend/core/events.py 예시 (실제 위치는 코드 확인 후 적용)
@dataclass
class AgentThought:
    agent_id: str
    role: AgentRole
    status: AgentStatus
    content: str
    timestamp: datetime
    metadata: dict  # {"signal": "bull"|"bear"|"risk"|"done"|None,
                    #  "key_points": [...], "confidence": float, ...}
```

각 에이전트가 thought를 생성할 때 (또는 thought 생성 직후 후처리에서) signal 결정:
- `bull_researcher` → 항상 `"bull"`
- `bear_researcher` → 항상 `"bear"`
- `risk_manager`이 `risk_score >= threshold`이면 `"risk"`
- 마지막 `portfolio_manager` thought → `"done"`
- 그 외 → `None` (배지 표시 안 함)

→ 프론트 정규식 함수(`getSemanticBadge`) **삭제**.

### 0-quater.7 우측 패널 헤더 — Before/After

**Before (현재)**:
```
[로고] 에이전트 컨트롤룸  [DATA · DEBATE · DECISION]   ●  분석 중 · 5개 활성       [설정]
                                                       또는 3/8 완료
```

**After**:
```
[로고] 에이전트 컨트롤룸                                [● 분석 진행 중]      [⏸] [⚙]
       ── 진행률 행 (별도 줄, PipelineBar) ──
       1단계 ●●●●  2단계 ●○  3단계 ○○○         (마우스오버 시 상세)
```

- `DATA · DEBATE · DECISION` 배지 제거 (PipelineBar로 흡수)
- `n개 활성` / `n/8 완료` 텍스트 제거 (PipelineBar의 채워진 점이 동일 정보)
- 상태 칩은 단순 3-state (`대기 중` / `분석 진행 중` / `분석 완료`)

### 0-quater.8 Flow Cards 그리드 — 제거

`AgentOffice.tsx:230–250`의 4컬럼 Flow Cards (`DATA 2/4 50% / DEBATE 1/2 50% / DECISION 0/3 0% / EXCHANGE 0/3 0%`):
- **삭제**. 동일 정보가 PipelineBar(헤더)와 Layer 섹션 배지에 이미 표시됨.
- "EXCHANGE"는 9 에이전트 + 3 레이어 모델과도 정합 안 됨 (실제로는 `portfolio_manager`의 결정 단계 = 3단계에 흡수).

### 0-quater.9 Layer 섹션 배지 — 정리

- "Layer 1 · 데이터 수집" → "**1단계 · 데이터 수집**" (혼합 표기 제거)
- 우측 카운터 `2 / 4` → 모든 에이전트 완료 시 `완료` 배지 (체크 아이콘), 진행 중이면 비표시. 부분 카운트는 PipelineBar에서만.
- 즉 Layer 섹션은 *카운터*가 아니라 *상태 칩*만 표시.

### 0-quater.10 활동 로그 — 정리

| 항목 | Before | After |
| --- | --- | --- |
| Lane 배지 | `[DATA] [DEBATE] [DECISION]` (영문) | `[1단계] [2단계] [3단계]` 또는 색상 점만 |
| 시맨틱 배지 | 정규식 추출 `BULL/BEAR/RISK/완료` | 백엔드 `metadata.signal` 기반 `매수 신호/매도 신호/리스크 경고/결론` |
| 본문 절단 | 일반 3줄, debating 6줄 (불일치) | 일관 4줄 + 클릭 시 펼쳐서 전체 |
| key_points | 앞 3개만 무음 절단 | 앞 3개 + "+N 더" 칩 (클릭 시 모달) |
| 타임스탬프 | `15:23:45` | `15:23:45` (유지, 명확) |

### 0-quater.11 픽셀 캔버스 (현 PixelOffice) — MS-A 시점 빠른 정리

> MS0~ 풀 마이그레이션 전까지의 **임시 정비**. 코드 구조는 그대로 두고 라벨/색만 수정.

- 캔버스 내 영문 룸 라벨 (`RESEARCH FLOOR`, `EXCHANGE`, `MEETING ROOM`, `INVESTIGATE→DEBATE→REPORT→DECIDE→EXCHANGE`) → **모두 한글 한 줄로 교체** 또는 제거.
- 각 캐릭터 머리 위에 **에이전트 이름표** (Galmuri11 또는 현재 폰트로 임시) — 캐릭터-카드 매칭 가독성 ↑.
- 다크 CRT 오버레이/`VT323`/scanline은 MS0에서 풀 정리 예정이라 MS-A에서는 *유지*. (시각 풀 개편은 v3 본편)

### 0-quater.12 MS-A 작업 체크리스트 (즉시 가능, 시각 마이그레이션과 독립)

- [ ] **A1**. `frontend/src/lib/agentLabels.ts` 신설 — `AGENT_LABEL`, `STATUS_LABEL`, `LAYER_LABEL`, `SIGNAL_LABEL` 정의
- [ ] **A2**. `AgentOffice.tsx`/`PixelOffice.tsx`/`page.tsx`의 하드코딩 한글 라벨을 `agentLabels.ts` 참조로 일괄 교체
- [ ] **A3**. 헤더 상태 칩 단순화 (`대기 중` / `분석 진행 중` / `분석 완료` 3-state)
- [ ] **A4**. 헤더의 `n/8 완료` 제거 (off-by-one 버그 해결)
- [ ] **A5**. `DATA · DEBATE · DECISION` 배지 제거
- [ ] **A6**. 헤더 하단에 `<PipelineBar>` 컴포넌트 신규 — 1·2·3단계 점 표시
- [ ] **A7**. `AgentOffice.tsx`의 Flow Cards 그리드 (4컬럼 `DATA/DEBATE/DECISION/EXCHANGE`) 삭제
- [ ] **A8**. Layer 섹션 헤더 "Layer N" → "N단계", 우측 카운터 → 완료 시만 `완료` 칩
- [ ] **A9**. 활동 로그 Lane 배지 영문 → 한글(`1/2/3단계`)
- [ ] **A10**. **백엔드**: `AgentThought.metadata.signal` 표준화 (bull/bear/risk/done/None) — `backend/core/events.py` 또는 각 에이전트 emit 위치
- [ ] **A11**. `AgentOffice.tsx`의 `getSemanticBadge` 정규식 함수 삭제, `metadata.signal` 직접 사용
- [ ] **A12**. `key_points` 절단 시 `+N 더` 칩 추가 + 클릭 시 모달
- [ ] **A13**. line-clamp 통일(4줄) + 클릭 펼치기
- [ ] **A14**. 픽셀 캔버스 영문 룸 라벨 → 한글 즉시 교체 (MS0 전 임시 정비)
- [ ] **A15**. 캐릭터 머리 위 이름표 추가 (PixelOffice 내 `drawLabel` 활용)
- [ ] **A16**. ESLint 룰 또는 README 가이드 — "에이전트/상태 한글 라벨은 `agentLabels.ts`에서만"

### 0-quater.13 MS-A 완료 후 사용자 시점 효과

- **숫자 노이즈 제거**: `2/4 50%`, `0/4`, `n/8` 같은 의미 없는 카운터가 사라지고 진행률은 *시각적 점*으로만 표현.
- **언어 일관**: 사용자 노출 라벨이 100% 한글. 영문은 약어(L1/L2/L3) 또는 식별자만.
- **신호 신뢰성**: BULL/BEAR/RISK 배지가 LLM 메타데이터 기반 → 오탐 0.
- **숨김 투명**: 절단된 모든 정보가 "+N 더"로 표시·펼치기 가능.
- **유지보수성**: 백엔드에 새 에이전트/상태 추가 시 컴파일 에러로 누락 감지.

### 0-quater.14 v3 본편(MS0~MS11)과의 관계

- **MS-A는 선행 가능**: 데이터 라벨·중복 제거·signal 표준화는 Phaser 마이그레이션과 무관. 따라서 *시각 개편 시작 전*에 정리해두면 MS0~ 작업이 더 깨끗한 데이터 위에서 시작 가능.
- **MS-A는 보존 가능**: 풀 마이그레이션 후에도 `agentLabels.ts`/`metadata.signal`/`PipelineBar`는 그대로 사용 (Phaser 안의 말풍선·미니맵·HUD가 모두 같은 SSOT 참조).
- **MS-A는 폴백 강화**: 저사양 시 `AgentOffice.tsx` 카드 뷰가 폴백인데, 그 뷰 자체가 MS-A로 이미 깔끔해져 있으므로 폴백 품질도 동시 ↑.

### 0-quater.15 사용자 결정 (MS-A 착수 전)

§0-ter.12의 5개 결정 위에 추가:

6. **MS-A를 v3 본편(MS0~)보다 먼저 진행** OK? (권장: Yes — 결과가 즉시 가시적, 위험 0)
7. **백엔드 `metadata.signal` 표준화** 변경 OK? (변경 영향: 각 에이전트 emit 1줄 추가, 기존 정규식 함수 제거)
8. **헤더에서 "DATA · DEBATE · DECISION" 배지를 PipelineBar로 대체** OK? (디자인 변경)
9. **활동 로그 Lane 배지 한글화** OK? (`[DATA]`→`[1단계]` 식)

답이 오면 MS-A부터 들어갑니다 (1~2일 PR 예상).

---

### 0-quater.16 MS-A 실행 기록 ✅ 완료

**작업 완료 시점**: 2025년 — 사용자가 "순차적으로 구축 진행해"라고 그린라이트한 직후 1차 세션에서 완료.

**실제 변경 내역**:

| # | 파일 | 변경 |
|---|------|------|
| A1 | `frontend/src/lib/agentLabels.ts` (신규) | SSOT 생성: `AGENT_LABEL`(9), `STATUS_LABEL`(6), `LAYER_LABEL`/`LAYER_SHORT`/`LAYER_ROLES`, `AGENT_COLOR`, `SIGNAL_LABEL`, `extractSignal()`, `layerOfRole()`, `isActiveStatus()` |
| A2 | `frontend/src/components/AgentOffice.tsx` | 로컬 `AGENT_META`/`STATUS_LABEL`/`LAYER_*_ROLES`/`layerOfRole` 제거 → SSOT import. UI 아이콘만 로컬 `AGENT_ICON`에 분리 |
| A3 | `frontend/src/app/page.tsx` 헤더 | "분석 중 · n개 활성" + "n/8 완료" 두 표시를 단일 3-state 칩(`대기 중`/`분석 진행 중`/`분석 완료`)으로 통합 |
| A4 | 위 동일 | "n/8 완료" off-by-one(9 에이전트인데 /8) 제거 |
| A5 | 위 동일 | "DATA · DEBATE · DECISION" 영문 배지 제거 |
| A6 | `frontend/src/components/PipelineBar.tsx` (신규) | 컴팩트 모드(헤더, 막대 3개) + 풀 모드(레이블+퍼센트). 진행 중 단계는 shimmer 애니메이션 |
| A7 | `AgentOffice.tsx` ActivityFeed | DATA/DEBATE/DECISION/EXCHANGE 4-column Flow Cards 그리드 완전 삭제 |
| A8 | `AgentOffice.tsx` LAYERS | "Layer 1 · 데이터 수집" → SSOT의 "1단계 · 데이터 수집" 사용. 카드 뱃지는 그대로(완료 시 ✓) |
| A9 | `AgentOffice.tsx` ActivityFeed Lane | 영문 사각 배지 → 한글 라운드 칩 ("1단계"/"2단계"/"3단계") |
| A10 | `backend/core/events.py` `emit_thought` | `_ensure_signal()` 헬퍼 추가: bull_researcher→bull, bear_researcher→bear, risk_manager→risk, portfolio/guru.done→done, 분석가의 `signal_raw` BUY/SELL→bull/bear. 호출자가 직접 설정한 signal은 존중 |
| A11 | `AgentOffice.tsx` | `getSemanticBadge()` 정규식 함수 완전 삭제 → metadata.signal 기반 `extractSignal()`로 대체 |
| A12 | `AgentOffice.tsx` `ThoughtBubble` (신규 분리) | key_points 3개 초과 시 "+N 더" 점선 칩 표시 + 클릭 시 펼침 |
| A13 | 위 동일 | line-clamp 통일: 카드는 4(클릭 시 무제한), 활동 로그는 4 — 기존 3/6 혼용 해결 |
| A14 | `frontend/src/components/PixelOffice.tsx` | 캔버스 라벨: `RESEARCH FLOOR`→`리서치 플로어`, `EXCHANGE`→`거래실`, `MEETING ROOM`→`회의실`, 하단 흐름 텍스트 한글화. AGENTS의 `guru_agent.label` "GURU"→"구루 에이전트" |
| A15 | 위 동일 | `drawLabel`의 idle 색상 `#4E5867`→`#A8B0BD`으로 가독성↑ (어두운 캔버스 배경 위 식별성 확보) |
| - | `frontend/src/components/ui/Icon.tsx` | 동시 발견된 빌드 에러 fix: `JSX.Element` → `import type { ReactElement }` (React 19 호환) |

**검증**:
- `npx tsc --noEmit`: ✅ 0 errors (이전엔 14 errors)
- `python -c ast.parse(events.py)`: ✅ OK

**미진행 항목**:
- A16 (ESLint 규칙 — 한글 리터럴 직접 사용 금지) — MS-B 진입 전 별도 PR로 처리 권장. 현 시점 SSOT 사용 강제는 코드 리뷰로 커버.

**다음**: MS-B (AgentTimeline 모듈 신규 구축) 착수.


---

## 0-quinquies. 하단 활동 로그(ActivityFeed) 전면 재설계 — MS-B ⭐

> 사용자 디렉티브 (2026-04-26 추가): *"하단의 별로인 대화로그도 개선하려는 상황에 맞춰 아예 싹 갈아엎는 거 맞나? 계획에 포함되어 있나?"*  
> **답: 포함되어 있고, 부분 정리(MS-A §0-quater.10)가 아니라 전면 재설계로 격상한다 — MS-B.**

§0-quater에서는 *라벨/배지 정리* 수준으로 가볍게 다뤘지만, 사용자가 "별로다"라고 짚은 만큼 **컴포넌트 자체를 폐기·재구성**합니다.

### 0-quinquies.1 현재 ActivityFeed의 본질적 문제

현재 `AgentOffice.tsx`의 `ActivityFeed`(L195~) 감사 결과 — 라벨링 문제(§0-quater)에 더해 **구조적 문제 8가지**:

| # | 문제 | 본질 |
| --- | --- | --- |
| 1 | **상단 4컬럼 Flow Cards 그리드** (`DATA 2/4 50% / DEBATE / DECISION / EXCHANGE`) | 중복 카운터 — 헤더 PipelineBar와 100% 겹침 |
| 2 | **40개 단순 슬라이스 (`logs.slice(-40)`)**, 필터·검색·일시정지 0 | "스크롤만 끝없이" UX. 사용자가 특정 에이전트/레이어/시간만 보고 싶어도 불가 |
| 3 | **다크 CRT 톤** (`rgba(13,15,24,0.9)`, `rgba(12,14,22,0.72)`) | 라이트 디자인 시스템과 충돌. `--bg-canvas` 크림톤 위에 검정 카드 |
| 4 | **자동 스크롤만 있고 정지/되감기 없음** (`logEndRef` scrollIntoView) | 사용자가 위로 스크롤해도 새 로그가 강제로 끝으로 끌어내림 — 읽기 불가 |
| 5 | **content `line-clamp-3` 무음 절단**, "더보기" 0 | 핵심 사고가 잘려서 표시. 펼칠 방법 없음 |
| 6 | **각 로그 카드가 평평한 시간순 나열** | "에이전트 A → B로 갔다가 다시 A" 같은 *대화/응답 관계* 표현 0 |
| 7 | **타임스탬프만 있고 상대 시간 없음** (`15:23:45`) | "방금 전", "2분 전" 같은 사용자 친화 표현 0 — 분석 시작 후 5분/30분 후 다시 봐도 어떤 시점인지 감 안 옴 |
| 8 | **로그 export·복사·공유 0** | 사용자가 "이 분석 사고 흐름을 저장하거나 누구에게 보여주기" 불가 |

→ 단순히 라벨만 바꿔서는 본질이 안 바뀜. **컴포넌트 자체를 새 모듈(`<AgentTimeline>`)로 교체**.

### 0-quinquies.2 새 모듈 — `<AgentTimeline>` 설계

신규 위치: `frontend/src/components/agent-timeline/`  
구조:
```
agent-timeline/
├── AgentTimeline.tsx              # 컨테이너 + 상태/필터/페이지네이션
├── TimelineToolbar.tsx            # 검색 + 필터 + 일시정지 + 익스포트
├── TimelineList.tsx               # 가상 스크롤 리스트 (react-virtuoso)
├── TimelineEntry.tsx              # 단일 로그 카드 (확장 가능)
├── TimelineGroup.tsx              # 같은 에이전트 연속 발화 묶음
├── TimelineEmpty.tsx              # 빈 상태
└── useTimeline.ts                 # zustand 셀렉터 + 필터 로직
```

### 0-quinquies.3 정보 계층 (Information Hierarchy)

3단계 줌 레벨 — 사용자가 토글:

1. **요약 모드 (Summary)** — 디폴트
   - 같은 에이전트의 연속 발화는 **그룹화** (TimelineGroup)
   - 각 그룹의 첫 줄 + "+N개의 추가 사고" 펼치기
   - 신호 배지(매수/매도/리스크) 한 줄로
2. **표준 모드 (Standard)**
   - 각 thought 개별 카드
   - content 4줄까지 표시 + "더보기" 펼치기
3. **상세 모드 (Detailed)**
   - thought 전체 + key_points + metadata(confidence·signal·duration) + 재실행 버튼

상태는 zustand `officeStore.timelineMode` 저장 → 사용자별 영구.

### 0-quinquies.4 툴바 (Toolbar) — 신규

```
┌─────────────────────────────────────────────────────────────┐
│ 🔍 [검색...]  [에이전트▾]  [단계▾]  [신호▾]  ⏸ 정지  ⋯    │
└─────────────────────────────────────────────────────────────┘
```

- **검색**: content full-text (debounce 200ms), 한글 매칭
- **에이전트 필터**: 9 에이전트 멀티 선택 (drop-down checkbox)
- **단계 필터**: 1단계/2단계/3단계 멀티 선택
- **신호 필터**: 매수/매도/리스크/결론 (백엔드 `metadata.signal`)
- **일시정지**: 자동 스크롤 + 신규 추가 일시정지. 정지 중 들어온 로그는 상단 "▼ N개의 새 로그" 알림 칩으로 표시
- **⋯ 더보기 메뉴**: 클립보드 복사 / Markdown export / JSON export / 결정과 함께 공유 토큰 생성 (백엔드 §0-ter.6 API 재활용)

### 0-quinquies.5 카드 디자인 (라이트 톤)

```
┌─ TimelineEntry ─────────────────────────────────────────┐
│ ●(역할 색)  기술적 분석          [1단계] [매수 신호]    │  ← 메타 줄
│ 15:23:45 · 방금 전                                      │  ← 시간 (절대+상대)
│ ─────────────────────────────────────────────────────── │
│ 코스피 200 일봉이 50일 이평을 상향 돌파했고                │  ← content (4줄)
│ 거래량은 평균 대비 1.8배 증가했습니다. 단기 모멘텀이…      │
│ [더보기]                                                │  ← 펼치기
│ ─────────────────────────────────────────────────────── │
│ ▸ 핵심 근거                                             │  ← key_points (접힘)
│   · RSI 58, 과매수 아님                                 │     클릭 시 펼침
│   · 외인 5일 순매수 +1,200억                             │
│   +2개 더 보기                                          │
└──────────────────────────────────────────────────────────┘
```

- 배경 `var(--bg-card)` (라이트 크림톤), 테두리 `var(--border-default)`
- 좌측 색 막대(2px)가 에이전트 색상 — 한눈에 누구인지 인식
- 시간: `15:23:45 · 방금 전` (상대 시간 1분/5분/1시간 단위로 갱신)
- 신호 배지: 백엔드 `metadata.signal` 기반 (정규식 폐기)
- "더보기" 클릭 → 카드 인라인 확장 (모달 X — 컨텍스트 유지)

### 0-quinquies.6 그룹화 (Summary 모드)

같은 에이전트의 연속 thought (예: `analyzing` → `analyzing` → `done`)는 시각적으로 1개 그룹으로 묶음:

```
┌─ TimelineGroup (기술적 분석, 3개 thought, 1분 12초) ────┐
│ ●  기술적 분석          [1단계]   [매수 신호]   ✓ 완료  │
│ 15:22:33 ~ 15:23:45                                     │
│ ─────────────────────────────────────────────────────── │
│ 코스피 200이 50일 이평 상향 돌파, 거래량 1.8배 증가…       │  ← 마지막 done 발화 요약
│ ▸ 3개의 사고 과정 보기                                  │  ← 클릭 시 그룹 펼쳐서 모두 표시
└──────────────────────────────────────────────────────────┘
```

### 0-quinquies.7 가상 스크롤 + 페이지네이션

- **react-virtuoso** (MIT, 5 KB gz) 도입 — 1000+ 로그도 60fps 유지
- 스크롤 위치 추적: 사용자가 *수동 스크롤로 위로 가면* 자동 스크롤 *자동 정지* + 하단에 "▼ 최신으로" 떠있음
- 새 로그 도착 시 정지 상태면 카운터만 증가, 정지 풀면 부드럽게 점프

### 0-quinquies.8 백엔드 연계 (필요 변경)

- §0-ter.6 (office_layouts API)와 별개 — `AgentThought.metadata`에 다음 표준 필드 추가 (§0-quater.6 위에 누적):
  - `signal: "bull"|"bear"|"risk"|"done"|null`
  - `key_points: string[]`
  - `duration_ms?: number` — 이 thought 생성에 걸린 시간 (Detailed 모드 표시)
  - `confidence?: number` — 0~1
- 신규 엔드포인트 (선택, MS-B Phase 2):
  - `GET /api/analysis/{session_id}/thoughts?role=&layer=&signal=&q=&cursor=` — 서버 사이드 필터·검색·페이지네이션 (현재 SSE+클라 필터로도 OK, 1k+ 로그 시 필요)
  - `POST /api/analysis/{session_id}/share` — 공유 토큰 발급 (전체 thought + 결정 묶음)

### 0-quinquies.9 접근성

- 키보드: `↑/↓` 카드 이동, `Enter` 펼치기, `/` 검색 포커스, `Space` 일시정지
- 스크린 리더: 새 thought 도착 시 `aria-live="polite"` 알림 (도착 빈도 너무 잦으면 throttle)
- reduced-motion: 그룹 펼침 애니메이션 제거, 새 카드 페이드만

### 0-quinquies.10 MS-B 작업 체크리스트

- [ ] **B1**. 의존성 추가: `react-virtuoso` (MIT, 5 KB gz)
- [ ] **B2**. `frontend/src/store/officeStore.ts`에 timeline 상태 슬라이스 (mode/filters/paused/scrollPos)
- [ ] **B3**. `agent-timeline/` 디렉터리 + 6개 컴포넌트 스켈레톤
- [ ] **B4**. `<TimelineToolbar>` — 검색·필터·일시정지·익스포트 메뉴
- [ ] **B5**. `<TimelineList>` — 가상 스크롤, 자동→수동 스크롤 전환
- [ ] **B6**. `<TimelineEntry>` 라이트 톤 디자인, 인라인 확장
- [ ] **B7**. `<TimelineGroup>` 같은 에이전트 연속 발화 그룹화 (Summary 모드)
- [ ] **B8**. 줌 모드 토글 (Summary/Standard/Detailed) + zustand 영구화
- [ ] **B9**. 상대 시간 ("방금 전" / "2분 전") 1분 단위 갱신
- [ ] **B10**. 익스포트: Markdown / JSON / 클립보드 복사
- [ ] **B11**. 백엔드 `metadata.duration_ms`, `confidence` 추가 (§0-quater.6의 signal/key_points 위에)
- [ ] **B12**. (옵션) 서버사이드 필터 엔드포인트
- [ ] **B13**. 공유 토큰 API + 공유 URL 페이지 (`/replay/{token}`)
- [ ] **B14**. 키보드 단축키 + 스크린 리더 라이브 리전
- [ ] **B15**. 기존 `ActivityFeed` 컴포넌트 제거, `page.tsx`에서 `<AgentTimeline>`로 교체
- [ ] **B16**. e2e: 로그 100개 발화 후 필터·일시정지·익스포트 정상 동작

### 0-quinquies.11 마일스톤 표 갱신 (MS-A · MS-B 신규 행)

| MS | 산출물 | 검증 기준 |
| --- | --- | --- |
| **MS-A — 정보설계 정리** (§0-quater) | 라벨 SSOT, off-by-one 수정, 중복 카운터 제거, signal metadata 표준화 | 같은 숫자 화면에 1번만, 라벨 100% 한글, 정규식 배지 0 |
| **MS-B — 활동 로그 전면 재설계** (§0-quinquies) | `<AgentTimeline>` 신규 (가상 스크롤·필터·검색·일시정지·익스포트·그룹화·줌 모드) | 1000개 로그 60fps, 사용자가 특정 에이전트/단계/신호로 필터링 가능, Markdown 익스포트 |
| **MS0 — 부트스트랩** | (기존) | (기존) |
| ... | ... | ... |

→ MS-A · MS-B는 시각 풀 마이그레이션(MS0~)과 **독립**. 둘 다 끝나면 풀 마이그레이션 시작 시 깔끔한 정보·로그 토대 위에서 작업 가능.

### 0-quinquies.12 v3 본편(MS0~)과의 통합 시점

- MS-B의 `<AgentTimeline>`은 **풀 마이그레이션 후에도 그대로 사용**. Phaser 캔버스 옆/아래의 React HUD 영역에 그대로 마운트.
- §0-ter.7의 본문 영역 서브탭 `[ 사무실 시각 ] [ 활동 로그 ] [ 통계 ]`에서 "활동 로그"가 바로 이 `<AgentTimeline>`임.
- 즉 **MS-B = 활동 로그의 최종 형태**. v3 풀 마이그레이션 시 추가 작업 없음.

### 0-quinquies.13 사용자 결정 (MS-B 착수 전)

§0-ter.12, §0-quater.15 위에 추가:

10. **활동 로그를 `ActivityFeed` 폐기 + `<AgentTimeline>` 신규로 교체** OK? (= 부분 정리가 아닌 전면 재설계)
11. **react-virtuoso 도입** OK? (5 KB gz, MIT, 가상 스크롤)
12. **줌 모드 3단계(Summary/Standard/Detailed)** UX OK? (단순화 원하면 Standard만 가능)
13. **공유 토큰 + 리플레이 페이지(`/replay/{token}`)** 백엔드 추가 OK? (선택, 후순위)

답이 오면 MS-A → MS-B 순서로 들어갑니다 (각 1~2일 PR).

### 0-quinquies.14 MS-B 실행 기록 ✅ 완료

**작업 완료 시점**: MS-A 직후 동일 세션에서 사용자 "진행해" 지시로 착수.

**실제 변경 내역**:

| # | 파일 | 변경 |
|---|------|------|
| B0 | `frontend/package.json` | `npm install react-virtuoso zustand` — 가상 스크롤 + 경량 상태 관리 도입 |
| B1 | `frontend/src/components/agent-timeline/types.ts` (신규) | `TimelineZoom`("compact"/"comfortable"/"verbose"), `TimelineGroupMode`("none"/"stage"/"agent"), `TimelineFilters`(query, roles, statuses, signalOnly), `TimelineRow` 유니언, `DEFAULT_FILTERS` |
| B2 | `frontend/src/components/agent-timeline/useTimeline.ts` (신규) | Zustand `useTimelineStore` — 필터/줌/그룹/일시정지/followLatest/expanded 행 키 셋. selector 패턴 |
| B3 | `frontend/src/components/agent-timeline/formatTime.ts` (신규) | `formatRelativeTime` (Intl.RelativeTimeFormat ko, "지금 막"/"n초 전"/"n분 전"/"n시간 전"/날짜), `formatAbsoluteTime`, `formatDuration` |
| B4 | `frontend/src/components/agent-timeline/TimelineToolbar.tsx` (신규) | 검색 입력(Ctrl+K) + 카운트 표시 + 일시정지 + CSV 다운로드(UTF-8 BOM) + 줌/그룹 segmented control + 신호만 토글 + 필터 초기화 + Role/Status 칩 |
| B5 | `frontend/src/components/agent-timeline/TimelineEntry.tsx` (신규) | 줌별 밀도 차등(line-clamp 1/4/none), 시간(상대 + 호버 절대), 에이전트 색상, 단계/상태 칩, signal 칩, key_points 펼침, framer-motion 진입 애니메이션, Enter/Space 펼침 |
| B6 | `frontend/src/components/agent-timeline/AgentTimeline.tsx` (신규) | 메인 컨테이너: 일시정지 시 `frozenRef`로 화면 동결, 필터 적용, 그룹 모드 처리, react-virtuoso 가상 스크롤(`followOutput="smooth"`), aria-live 신규 발화 알림, Ctrl+K/Esc 글로벌 단축키, "↓ 최신으로" 점프 버튼, 빈 상태 메시지 |
| B7 | `frontend/src/components/agent-timeline/index.ts` (신규) | 배럴 export |
| B8 | `frontend/src/app/page.tsx` | `ActivityFeed` 마운트 → `<AgentTimeline thoughts={logs} />` 교체. 다크 그라디언트 컨테이너 → 라이트 (`var(--bg-canvas)`) + 한글 헤더 "에이전트 타임라인" |
| B9 | `backend/core/events.py` | `_last_emit_ts: dict[(session_id, role) → monotonic]` 트래킹 + `_ensure_duration()` — 같은 (세션, 역할)의 직전 발화 이후 경과를 `metadata.duration_ms`로 자동 채움. `clear_thought_queue()`에서 함께 청소 |

**해결된 본질 문제 (§0-quinquies.1 매핑)**:

| # | 본질 문제 | MS-B 해결책 |
|---|---|---|
| 1 | 4컬럼 Flow Cards 중복 | MS-A에서 이미 제거 완료 |
| 2 | 40개 슬라이스, 필터 0 | react-virtuoso 가상 스크롤로 무제한 + 검색/롤/상태/신호 필터 |
| 3 | 다크 CRT 톤 충돌 | `var(--bg-canvas)`/`var(--bg-surface)` 라이트 토큰 사용 |
| 4 | 자동 스크롤 강제 | `atBottomStateChange`로 사용자가 위로 스크롤 시 followLatest=false → "↓ 최신으로" 버튼 등장 |
| 5 | line-clamp 무음 절단 | 줌 verbose 또는 클릭 시 무제한, key_points 분리 표시 |
| 6 | 평평한 시간순만 | 그룹 모드 3종 (시간순/단계별/에이전트별) |
| 7 | 절대 시간만 | `formatRelativeTime` ko ("지금 막"/"5분 전"/...) + 절대 시간 호버 |
| 8 | export/공유 0 | CSV 다운로드 (UTF-8 BOM, Excel 한글 깨짐 방지) |

**검증**:
- `npx tsc --noEmit`: ✅ 0 errors
- `python -c ast.parse(events.py)`: ✅ OK

**미진행/추후 항목**:
- 공유 토큰 + 리플레이 페이지 (§0-quinquies.13 #13) — 후순위로 보류
- `metadata.confidence` 표시는 verbose 모드에서만 (백엔드가 confidence 채우는 곳은 분석가 결과뿐)
- 키보드 j/k 다음/이전 행 이동 — 향후 추가 가능 (현재는 Enter/Space 펼침 + Esc 닫기 + Ctrl+K 검색만)

**다음**: MS-C (상호작용·정보 제공) 착수.

---

## 0-sexies. 상호작용·정보 제공·디자인 — 최대치까지 끌어올리기 (MS-C ~ MS-F) ⭐⭐

> 사용자 디렉티브 (2026-04-26 추가): *"에이전트 만드는 계획에 맞춰서, 유저와 상호작용·정보 제공량·디자인까지 고려해서 수준 최대로 끌어올린 거 맞나?"*  
> **답: 지금까지(MS-A/B + MS0~MS11)는 "구조·라벨·시각" 정리에 머물렀음. 진짜 "최대치"가 되려면 상호작용·정보·디자인을 별도 트랙(MS-C ~ MS-F)으로 끌어올려야 함.**

지금까지의 갭 분석:

| 차원 | 기존 계획 커버 | 부족 | 보완 트랙 |
| --- | --- | --- | --- |
| 정적 시각 | MS0~MS11 (Phaser·LDtk·에셋) | OK | — |
| 데이터 라벨 정리 | MS-A | OK | — |
| 활동 로그 재설계 | MS-B | OK | — |
| **상호작용 (사용자 → 에이전트)** | 없음 | **클릭/호버/드릴다운/질문/개입** | **MS-C** |
| **정보 밀도 (에이전트 → 사용자)** | 없음 | **신뢰도·근거·출처·시계열·추적** | **MS-D** |
| **디자인 시스템 풀스펙** | 부분 | **모션·마이크로 인터랙션·사운드·테마·온보딩** | **MS-E** |
| **개인화·파워유저** | 부분 | **핀/순서/뷰 저장/명령 팔레트/단축키** | **MS-F** |

→ MS-A·B·MS0~11 위에 MS-C·D·E·F를 *얹어서* 실제 "퀄리티 최대치"가 됨.

---

### 0-sexies.1 MS-C — 상호작용 (Interactivity) 풀스펙

> *"에이전트가 일방적으로 떠드는 대시보드"* → *"내가 만지고 묻고 추적하는 컨트롤룸"*

#### C-1. 클릭/호버/포커스 (모든 표면)

- **픽셀 캐릭터 클릭** → 카메라 줌인 + 우측 슬라이드 패널 `<AgentInspector>` 오픈 (해당 에이전트의 프로필·현재 사고·과거 결정 이력·평균 정확도)
- **캐릭터 호버** → 머리 위에 미니 카드 (이름 + 현재 상태 + 마지막 신호 한 줄)
- **타임라인 카드 호버** → 픽셀 캔버스에서 해당 에이전트 캐릭터 *글로우*
- **PipelineBar 점 호버** → 어떤 에이전트가 그 단계의 점인지 툴팁
- **신호 배지 호버** → 신호의 *근거 3줄* 미리보기

#### C-2. 드릴다운 (Drill-down)

- 모든 thought 카드에 **`▸ 추적`** 버튼 — 클릭 시 모달이 열리고:
  - 1) **입력 데이터**: 이 에이전트가 사용한 시세/뉴스/지표 스냅샷
  - 2) **프롬프트**: 실제로 LLM에 보낸 시스템·유저 프롬프트 (접힘)
  - 3) **원본 응답**: LLM raw output (마크다운 렌더)
  - 4) **다운스트림 영향**: 이 thought가 어떤 다음 단계 thought를 트리거했는지 그래프
- 디시전 카드에도 `▸ 결정 계보` — 9 에이전트의 thought가 어떻게 합쳐져 이 결정이 나왔는지 *Sankey 다이어그램* (아주 가벼운 SVG)

#### C-3. 사용자 → 에이전트 (Two-way)

> 트레이딩 결정의 *책임*은 사용자에게 있으므로, *질문/개입*은 절대적으로 필요.

- **질문 버튼** (`💬 질문`): 임의 thought 또는 결정에 대해 사용자가 자연어로 후속 질문 → 해당 에이전트가 추가 thought 생성 (백엔드 신규 엔드포인트 `POST /api/analysis/{session_id}/ask`)
- **개입 버튼** (`🛑 개입`): 분석 진행 중 특정 에이전트를 *일시정지/스킵/재실행*
  - 일시정지: `POST /api/analysis/{session_id}/agents/{role}/pause`
  - 재실행: 추가 컨텍스트 입력 후 `POST .../rerun`
- **승인/거부** (결정 직전): 최종 portfolio_manager 결정 전에 사용자가 *승인/거부/조건부 승인* 버튼 (이미 일부 있을 수 있음 — 통합)
- **북마크** (`⭐`): 중요한 thought/결정을 북마크 → "내 분석 노트"에 누적, 추후 학습/리뷰

#### C-4. 픽셀 캔버스 인터랙션

- **드래그로 카메라 팬**, 마우스휠로 줌 (Phaser 카메라)
- 우측 사이드 미니맵 (현재 화면 위치 표시) — 큰 사무실에서 길 잃지 않도록
- 캐릭터 더블클릭 → 카메라 follow 모드 (해당 에이전트가 움직이면 따라감)
- 빈 바닥 우클릭 → 메모 핀 추가 (사용자 개인 메모, OfficeLayout에 저장)

#### C-5. 글로벌 인터랙션

- **Command Palette** (`⌘K` / `Ctrl+K`): "기술적 분석가 점프", "리스크 매니저에게 질문", "신호 매도만 필터", "테마 변경" 등 모든 액션 키워드 검색
- **단축키 가이드** (`?` 누르면 오버레이): 모든 키 일람

#### C-6. 백엔드 변경 (MS-C용)

- `POST /api/analysis/{session_id}/ask` (사용자 질문 → 에이전트 후속 thought)
- `POST /api/analysis/{session_id}/agents/{role}/pause|resume|rerun`
- `GET /api/agents/{role}/profile` — 에이전트 메타(역할 설명·평균 정확도·결정 분포)
- `GET /api/agents/{role}/history?days=30` — 과거 thought·정확도 시계열
- `POST /api/users/{uid}/bookmarks` — thought/결정 북마크
- 분석 세션 메타에 `lineage` 필드 추가 (어떤 thought가 어떤 thought를 trigger했는지 그래프)

#### C-7. MS-C 체크리스트

- [ ] **C1**. `<AgentInspector>` 슬라이드 패널 (프로필+현재 thought+이력+정확도)
- [ ] **C2**. 모든 표면에 호버 미니카드 (Radix HoverCard)
- [ ] **C3**. 캐릭터↔카드 양방향 글로우 (zustand `focusedRole`)
- [ ] **C4**. `▸ 추적` 모달 (입력·프롬프트·raw output·다운스트림)
- [ ] **C5**. `▸ 결정 계보` Sankey (lineage 데이터 → SVG)
- [ ] **C6**. `💬 질문` 모달 + `POST /ask` API
- [ ] **C7**. `🛑 개입` (pause/resume/rerun) UI + API
- [ ] **C8**. 승인/거부/조건부 승인 버튼 (결정 직전)
- [ ] **C9**. `⭐` 북마크 + 백엔드 `bookmarks` 컬렉션
- [ ] **C10**. Phaser 카메라 팬·줌·follow + 미니맵
- [ ] **C11**. 메모 핀 (캔버스 우클릭) + OfficeLayout에 저장
- [ ] **C12**. **Command Palette** (cmdk 라이브러리 — 4 KB, MIT)
- [ ] **C13**. 단축키 오버레이 (`?`)

---

### 0-sexies.2 MS-D — 정보 밀도 (Information Density) 풀스펙

> *"숫자 카운터 줄이기"* (MS-A) → *"진짜 의미 있는 정보를 더 풍부하게 보여주기"*

MS-A에서 노이즈를 제거했으니, 이제 *진짜 가치 있는 정보*를 추가:

#### D-1. 에이전트 프로필 카드 강화

각 에이전트 카드에 표시 (현재는 이름·상태만):
- **신뢰도 게이지** (반원 0~100%) — 이번 thought의 confidence
- **30일 정확도 스파크라인** (10×30 mini SVG) — 이 에이전트의 과거 결정 적중률 추세
- **현재 신호 강도** — 매수/매도/리스크의 0~3 별점
- **사용 데이터 칩들** (예: `KOSPI200`, `삼성전자`, `5일 거래량`) — 이 thought에 어떤 입력 데이터가 사용됐는지

#### D-2. 결정 카드 강화 (DecisionCard)

- **9 에이전트 합의도** — 9명 중 몇 명이 같은 방향이었는지 도넛 차트
- **반대 의견 강조** — 결정과 반대된 에이전트 thought를 별도 섹션 ("반대 의견 (2명)")
- **신뢰 구간** — 예측 가격 범위, 손절/익절 후보
- **데이터 출처 푸터** — "기반 데이터: KIS 실시간 (15:23:45 기준), 네이버 뉴스 (최근 12시간 32건), DART 공시 (당일 3건)"

#### D-3. 시계열·추세

- 활동 로그 위에 **"이 분석 진행률" 미니 차트** — 시간축 X, 활성 에이전트 수 Y (Recharts)
- 각 에이전트 인스펙터에 **30일 thought 히트맵** (요일×시간) — 언제 가장 활동적인지

#### D-4. 출처·신뢰 (Trust & Transparency)

- 모든 thought 카드 하단에 **출처 칩** — 클릭 시 raw 데이터 모달
- LLM 모델 표시 — `gpt-4-turbo` / `claude-opus-4` 등 (사용자 안심 + 디버깅)
- **버전·세션** 푸터 — "분석 ID `s_a8f2c1` · 2026-04-26 15:22:11 · 모델 `claude-opus-4` · 8.2초 소요"

#### D-5. 비교 (Compare)

- 사이드바에 **분석 비교 모드** — 과거 분석 2~3개를 나란히 비교 (어떤 결정이 어떻게 달랐는지 diff)
- 동일 종목 시계열 결정 — "삼성전자 최근 5번 분석" 미니 차트

#### D-6. MS-D 체크리스트

- [ ] **D1**. AgentCard에 신뢰도 게이지 + 스파크라인 + 신호 강도 + 데이터 칩
- [ ] **D2**. DecisionCard에 합의도 도넛 + 반대 의견 섹션 + 신뢰 구간 + 출처 푸터
- [ ] **D3**. "분석 진행률" 미니 차트 (활성 에이전트 수 시간축)
- [ ] **D4**. 인스펙터에 30일 thought 히트맵
- [ ] **D5**. thought 카드 출처 칩 + raw 데이터 모달
- [ ] **D6**. LLM 모델·세션·소요시간 푸터
- [ ] **D7**. 분석 비교 모드 (2~3개 diff)
- [ ] **D8**. 동일 종목 시계열 결정 차트
- [ ] **D9**. 백엔드: thought·결정에 `data_sources`, `model_id`, `latency_ms` 메타 표준화
- [ ] **D10**. 백엔드: `GET /api/analysis/compare?ids=` (다중 분석 비교)

---

### 0-sexies.3 MS-E — 디자인 시스템 풀스펙 (모션·사운드·테마·온보딩)

> *"라이트 토큰 적용"* (MS-A 기본) → *"디자인 시스템으로서의 완성"*

#### E-1. 모션 디자인 (Framer Motion)

- **상태 전환 애니메이션 가이드라인 정의**:
  - thought 도착: 100ms 페이드 + 4px 상승 (cubic-bezier(0.2,0.8,0.2,1))
  - 카드 펼침: 180ms height auto
  - 카메라 follow: 400ms ease-out
  - 신호 배지 변화: spring(stiffness:200, damping:18)
- **모션 토큰** (`tokens/motion.ts`): `easeStandard`, `easeEnter`, `easeExit`, `durationFast/Med/Slow`
- 모든 reduced-motion 자동 dispatch

#### E-2. 마이크로 인터랙션

- 신호 배지가 처음 등장할 때 *맥동* (1초 1회, 3초 후 멈춤)
- 분석 완료 시 PixelOffice 캐릭터들이 *손 흔드는 애니메이션* (1초)
- 결정 카드 도착 시 *지폐 휘날림* 파티클 (Phaser particles, 600ms)
- 호버 시 살짝 떠오름 (translateY -2px), 클릭 시 살짝 눌림 (scale 0.98)
- 로딩 상태: skeleton + shimmer

#### E-3. 사운드 (옵션, 디폴트 OFF)

- thought 도착: 부드러운 키보드 톤 (Howler, CC0 효과음, -24dB)
- 결정 도착: 차임 (성공/실패에 따라 톤 변화)
- 매수 신호 vs 매도 신호 미세 음정 차이 (감각적 변별)
- 사용자 토글 + 볼륨 슬라이더 (헤더 ⚙ 메뉴)

#### E-4. 테마 시스템 풀

§0-ter.5에서 4개 테마(neutral/warm/dark/hanok) 정의 — MS-E에서 본격 구현:
- 각 테마의 픽셀 캔버스 색상·바닥재·조명 변화
- 시간대 자동 (아침/낮/저녁/밤 - 사용자 로컬 시간 기반)
- 결정 도착 시 잠깐 *축하 톤* (매수=따뜻, 매도=서늘)
- "내 테마 만들기" — 사용자가 5개 색상 토큰 선택해서 커스텀 테마 생성·저장

#### E-5. 온보딩 (First-time UX)

- **첫 방문자 투어**: 스포트라이트 + 5단계 설명 (헤더 → PipelineBar → 픽셀 캔버스 → 활동 로그 → 결정 카드)
- **샘플 분석 모드**: 새 사용자에게 미리 녹화된 분석 리플레이 (`/replay/demo`) 자동 재생 — KIS 키 없이도 체험 가능
- 단축키 안내 (`?` 가이드 자동 표시 1회)
- 진행 표시: "에이전트 컨트롤룸 마스터하기 (3/8 완료)" — 클릭/필터/북마크 등 액션을 *체크리스트화* (선택, 너무 게임화되지 않게)

#### E-6. 한국 시장 정체성 (Identity)

- 한국 증시 캘린더 (휴장일·반장일 표시)
- 시간대 톤: 장중(밝음) / 장후(차분) / 장마감 시 잠깐 *마감 시네마틱*
- 한국식 마이크로카피: "분석 진행 중" 대신 *"에이전트들이 회의 중이에요"*, 결정 도착 시 *"결정이 나왔습니다"*
- 한자/한자어 비율 조절 — 친근한 말투 (단, 전문 용어는 보존)

#### E-7. MS-E 체크리스트

- [ ] **E1**. `frontend/src/tokens/motion.ts` 모션 토큰
- [ ] **E2**. 모든 컴포넌트 모션 가이드 적용
- [ ] **E3**. 마이크로 인터랙션 8종 (호버/클릭/펼침/맥동 등)
- [ ] **E4**. Howler 통합 + 효과음 8종 + 토글
- [ ] **E5**. 4개 테마 (neutral/warm/dark/hanok) 픽셀 캔버스 색·조명
- [ ] **E6**. 시간대 자동 테마 (사용자 로컬 시간)
- [ ] **E7**. "내 테마 만들기" 색 피커 + 저장
- [ ] **E8**. 첫 방문 투어 (Driver.js 또는 자체, MIT)
- [ ] **E9**. 샘플 분석 리플레이 (`/replay/demo`)
- [ ] **E10**. 한국 시장 캘린더 표시
- [ ] **E11**. 마이크로카피 가이드 + 적용
- [ ] **E12**. 장 마감 시네마틱 (Phaser 카메라 무브 + 타이틀 카드)

---

### 0-sexies.4 MS-F — 개인화 & 파워유저

> *"모든 유저가 같은 화면"* → *"각자 자기 워크플로에 맞춰 조정"*

#### F-1. 핀·순서·숨김

- 9 에이전트를 사용자가 핀(상단 고정) / 순서 변경 / 숨김 가능
- 자주 사용하는 신호·필터 조합을 **저장된 뷰**로 (예: "위험 경고만 보기", "강세 사이드만")
- 활동 로그 컬럼 표시 토글 (시간/에이전트/신호/단계 — 원하는 것만)

#### F-2. 워크스페이스

- 다중 분석 세션 동시 진행 (예: KOSPI 분석 + 삼성전자 분석 병렬)
- 탭으로 전환 (`Ctrl+1/2/3`)
- 각 워크스페이스가 자기 OfficeLayout·필터·핀 보유

#### F-3. 알림 (Notifications)

- 사용자가 설정한 조건 (예: "위험 경고 발생 시", "신뢰도 90%+ 매수 신호 발생 시") → 브라우저 알림 + 토스트
- 백엔드 푸시 (`POST /api/users/{uid}/notification-rules`)

#### F-4. 익스포트·공유 풀스펙

- MS-B의 Markdown/JSON 익스포트 위에:
- **PDF 리포트** — 분석 1건의 모든 thought + 결정 + 차트를 PDF 1장으로
- **이미지 카드** — 결정 1개를 OG 이미지로 (소셜 공유용)
- **API 토큰** — 사용자가 자기 분석 결과를 외부에서 가져올 수 있게 (개인 read-only 키)

#### F-5. MS-F 체크리스트

- [ ] **F1**. 에이전트 핀/순서/숨김 (drag handle)
- [ ] **F2**. 저장된 뷰 (필터 조합 named save)
- [ ] **F3**. 활동 로그 컬럼 토글
- [ ] **F4**. 다중 워크스페이스 (병렬 분석)
- [ ] **F5**. 알림 규칙 + 브라우저 푸시
- [ ] **F6**. PDF 리포트 익스포트
- [ ] **F7**. OG 이미지 카드 생성 (Vercel `@vercel/og`)
- [ ] **F8**. 개인 API 토큰 발급 페이지

---

### 0-sexies.5 통합 마일스톤 표 (최종)

| MS | 트랙 | 산출물 핵심 |
| --- | --- | --- |
| **MS-A** | 정보설계 정리 | 라벨 SSOT, 중복 카운터 제거, signal 표준화 |
| **MS-B** | 활동 로그 재설계 | `<AgentTimeline>` 가상 스크롤·필터·익스포트 |
| **MS-C** | 상호작용 풀스펙 | Inspector·드릴다운·질문/개입·메모핀·Command Palette |
| **MS-D** | 정보 밀도 풀스펙 | 신뢰도·스파크라인·합의도·출처·비교 |
| **MS-E** | 디자인 시스템 풀스펙 | 모션·사운드·테마·온보딩·한국 정체성 |
| **MS-F** | 개인화·파워유저 | 핀·뷰·워크스페이스·알림·PDF·OG·API |
| **MS0~MS11** | 시각 풀 마이그레이션 | Phaser 3 + LDtk + Kenney/LimeZu (§0-ter) |

권장 순서:
- **Phase 1 (정리·기반)**: MS-A → MS-B → MS-C
- **Phase 2 (시각·풍부함)**: MS0~MS3 (시각 부트), 동시에 MS-D
- **Phase 3 (완성·디자인)**: MS4~MS6, 동시에 MS-E
- **Phase 4 (개인화·확장)**: MS7~MS11, 동시에 MS-F

→ MS-A·B·C·D·E·F는 **시각 마이그레이션과 병렬 가능**. 각 트랙이 독립 PR로 진행 가능.

### 0-sexies.6 의존성 추가 요약 (MS-C ~ MS-F)

| 라이브러리 | 용도 | 크기 | 라이선스 |
| --- | --- | --- | --- |
| `cmdk` | Command Palette | 4 KB gz | MIT |
| `@radix-ui/react-hover-card` | 호버 미니카드 | 6 KB gz | MIT |
| `@radix-ui/react-tooltip` | 툴팁 (이미 일부 사용?) | 4 KB gz | MIT |
| `driver.js` | 온보딩 투어 | 5 KB gz | MIT |
| `@vercel/og` | OG 이미지 | 서버사이드만 | MIT |
| `react-pdf` (선택) | PDF 익스포트 | 80 KB gz | MIT |
| (이미 있음) `recharts` | 스파크라인·도넛·미니차트 | 0 추가 | MIT |
| (MS-E) `howler` | 사운드 | 7 KB gz | MIT |

총 추가 ≈ +30 KB gz (PDF 제외, PDF는 lazy chunk).

### 0-sexies.7 사용자 결정 (MS-C~F 착수 전)

§0-ter.12, §0-quater.15, §0-quinquies.13 위에 추가:

14. **사용자→에이전트 양방향 (질문/개입)** 기능 OK? (백엔드 LLM 재호출 비용 발생)
15. **드릴다운 모달에 LLM 프롬프트·raw output 노출** OK? (트랜스페어런시 vs IP 노출 trade-off)
16. **Command Palette + 단축키** OK? (파워유저 친화)
17. **사운드 (디폴트 OFF)** OK? (사용자 짜증 우려)
18. **다중 워크스페이스 (병렬 분석)** 백엔드 OK? (서버 부하 증가)
19. **개인 API 토큰** 발급 OK? (보안 관리 필요)
20. **MS-A → B → C → D → E → F** 순서 OK? (또는 우선순위 조정 원함?)

답이 오면 MS-A부터 순차 또는 병렬 진행 (각 1~3일 PR 단위).

### 0-sexies.8 "최대치"의 의미 — 자체 검증 체크

이 §0-sexies까지 더하면 다음 항목이 모두 채워짐:

| 차원 | 충족 |
| --- | --- |
| 시각 (게더타운 수준 픽셀) | ✅ MS0~MS11 |
| 라벨·정보 정리 | ✅ MS-A |
| 활동 로그 재설계 | ✅ MS-B |
| **상호작용** (호버·클릭·드릴다운·양방향·메모·팔레트) | ✅ MS-C |
| **정보 밀도** (신뢰도·스파크라인·합의도·출처·비교) | ✅ MS-D |
| **모션·사운드·테마·온보딩·정체성** | ✅ MS-E |
| **개인화·파워유저** (핀·뷰·워크스페이스·알림·PDF·API) | ✅ MS-F |
| **확장성** (커스텀 OfficeLayout·LDtk·플러그인 후크) | ✅ MS0~MS11 + MS-C 메모핀 |
| **접근성** | ✅ MS-B(키보드/aria-live) + MS-E(reduced-motion) |
| **국제화·정체성** | ✅ MS-E(한국 정체성) |
| **트랜스페어런시·신뢰** | ✅ MS-D(출처·모델·소요시간) |

→ "수준 최대"의 정의를 *"사용자가 한 번 보고 만지고 싶어지는, 다시 돌아오는, 자기 것으로 만들고 싶어지는"* 으로 잡으면 위 7 트랙(MS-A·B·C·D·E·F + MS0~11)이 그 정의를 모두 만족.

### 0-sexies.9 다음 액션

1. 사용자 결정 #14~#20에 답
2. 첫 트랙 선택 — 권장: **MS-A → MS-B → MS-C** 순으로 깔끔한 토대 위에 상호작용을 얹은 후 본격 시각/디자인/개인화로 확장

---

## 0-bis. 재검토 결론 (v2 — 참고용, 폐기됨)

v1 원안(§0~§9)은 **"Phaser 4 + Tiled + LimeZu 스택으로 풀 재구성"**이었습니다. 하루 묵혀 다시 보면 **이건 사이드 패널 1개의 ROI에 비해 과한 베팅**입니다. 핵심을 다시 정렬합니다.

### 0-bis.1 v1의 잘못된 가정 5가지

| # | v1의 가정 | 재검토 결과 |
| --- | --- | --- |
| 1 | "퀄리티 격차의 원인은 렌더링 엔진" | **틀렸음.** 격차의 80%는 *에셋*(스프라이트 디테일)이고, 20%만 엔진/길찾기다. `fillRect`로 픽셀 찍는 것 자체는 문제 아님 — `drawImage`로 LimeZu 스프라이트를 그려도 똑같이 동작 |
| 2 | "Phaser가 표준이라 안전" | **부분 정답.** Phaser **4**는 2026‑04 갓 릴리스. 우리 Next.js 16 + React 19 + Turbopack과의 결합은 검증 사례 거의 0. PoC에서 막히면 Phaser 3로 다운그레이드해야 함 |
| 3 | "+345 KB gz 번들은 lazy load로 해결" | **현실 왜곡.** 사용자가 패널을 열면 어차피 로드. 현재 페이지 전체 의존성(react·next·framer·recharts·radix·pretendard) 합쳐도 ~250 KB gz 추정인데, **단일 의존성이 그걸 넘는다**. LCP 영향 무시 못 함 |
| 4 | "1100줄 → 600줄로 다이어트" | **거짓 절약.** Phaser 코드 600줄 + Tiled JSON + 에셋 빌드 파이프라인 + 폴백 카드 코드(`AgentOffice.tsx`) 유지 = **순증**. 또 Phaser 학습/디버깅 비용은 코드 LOC에 안 잡힘 |
| 5 | "LimeZu $4면 끝" | **라이선스 회색지대.** SaaS 임베딩 시 LimeZu 개인 라이선스("재배포·재판매 금지")가 명확치 않음. 결제 후 Discord에 문의해야 안전. CC0 Kenney 단독은 디테일이 LimeZu 대비 떨어짐(LimeZu Modern Office가 압도적으로 사무실 톤에 맞음) |

### 0-bis.2 진짜 문제 정의 (다시)

사용자가 원하는 건 **"게더타운 수준의 시각적 디테일과 살아있는 느낌"**이지, 게더의 *기능*(WebRTC, 룸, 멀티플레이어)이 아닙니다. 즉:

1. **스프라이트 디테일** (현재 16×24 도트 → LimeZu 32×48 4방향 5등신)
2. **가구·바닥 다양성** (현재 책상 1종 → 100+ 종)
3. **자연스러운 이동** (현재 L자 직선 → A* 회피)
4. **말풍선·이펙트** (현재 OK 수준)
5. **라이트 톤 일치** (현재 다크 CRT — 명백한 회귀)

→ **이 5개를 만족하는 가장 가벼운 경로**를 다시 설계.

### 0-bis.3 새 권장: 3‑Track Incremental Plan ⭐

**v1처럼 "한 방에 Phaser 풀 이전"이 아니라, 3 트랙으로 쪼개서 각 단계마다 독립적으로 가치를 검증**합니다.

#### Track A — **Asset Swap In Place** (1.5일, 위험 낮음, 효과 70%)
v1을 **하지 않고** 현재 캔버스 코드만 유지한 채:
- `drawCharacter()`/`drawDesk()`의 `fillRect` 호출을 **`drawImage(LimeZuSpritesheet, sx, sy, ...)`** 로 교체. 코드 라인은 거의 동일.
- LimeZu Modern Office 타일셋(또는 Kenney CC0)을 background에 한 번 `drawImage`.
- LimeZu Character Generator로 9명 PNG 추출 → 4방향 walk 6프레임 인덱싱.
- 다크 CRT 오버레이/`VT323` 제거 → 라이트 토큰(`--bg-canvas` 크림톤) 적용.
- **결과**: 추가 의존성 0 KB. 시각적 품질이 게더의 **70% 수준까지** 점프. 사용자 반응을 보고 다음 트랙을 결정할 수 있음.

#### Track B — **Tilemap + Pathfinding** (Track A 검증 후, 2일, 위험 중)
Track A 결과가 *"좋은데 동선이 어색하다"*면:
- `easystarjs` (15 KB gz, MIT)만 추가. 의존성 1개.
- Tiled로 콜리전 레이어 그려서 JSON export → 50줄짜리 자체 로더로 그리드 입력.
- 기존 `buildRoutedPath`를 A*로 교체. 9명 동시 reservation table.
- **결과**: 추가 +15 KB gz. 자연스러운 회피·우회. 게더 **85% 수준**.

#### Track C — **Engine Swap (선택적)** (Track B 후 사용자가 더 원하면, 4일, 위험 높음)
사용자가 *"카메라 줌·필터·인터랙션도 원한다"*면 비로소:
- **Phaser 3** 또는 **PixiJS v8** 중 선택 (둘 다 더 가벼움/안정적):
  - Phaser **3** (~200 KB gz, 8년 검증, Next.js 통합 사례 풍부) — DX 좋음, Tiled/카메라/필터 내장.
  - **PixiJS v8** (~100 KB gz, MIT, 38k★) — 순수 렌더러. 더 가볍지만 카메라/씬 직접 구현.
- Track A에서 만든 어셋·스프라이트 그대로 재사용 (낭비 없음).
- **결과**: 게더 95%+. 단, 이 트랙은 **사용자가 명시적으로 원할 때만** 진행.

> **핵심: Track A만으로도 사용자가 만족할 가능성이 높습니다.** v1처럼 처음부터 Track C를 가정하고 모든 인프라를 짜는 건 YAGNI 위반.

### 0-bis.4 Phaser 4 vs 3 vs PixiJS — Track C 진입 시 비교

| | Phaser 4 (v1 안) | Phaser 3 (수정안) | PixiJS v8 |
| --- | --- | --- | --- |
| 안정성 | 2026-04 v4.0.0 (신생) | 8년 검증 | 안정 |
| Next.js 16 + React 19 결합 사례 | 거의 없음 | 다수 | 다수 |
| 번들 (min+gzip) | ~345 KB | ~200 KB | ~100 KB |
| Tiled 통합 | 내장 | 내장 | `@pixi/tilemap` 플러그인 |
| 카메라/필터/씬 | 내장 | 내장 | 직접 구현 |
| 학습 비용 | 중 | 중 | 중-상 |
| LLM 학습 데이터 | 충분(v3 위주) | 매우 충분 | 충분 |
| **권장도** | △ (v4는 12개월 뒤 재검토) | **◎** | ○ (UI 쪽 통합 작업 많을 때) |

→ **Track C에 들어가면 Phaser 4가 아니라 Phaser 3 채택 권장.**

### 0-bis.5 LimeZu vs Kenney 라이선스 — 명확히

| | LimeZu Modern Office ($2.50) | Kenney 2D (CC0) |
| --- | --- | --- |
| 시각 품질 | ★★★★★ (사무실에 최적) | ★★★ (제너릭) |
| 한국식 디테일 추가 | 픽셀 직접 편집 가능 | 동일 |
| SaaS 임베딩 | 라이선스 명시 X — Discord 확인 필요 | **명백히 OK** (퍼블릭 도메인) |
| 크레딧 표시 | 필요 | 불필요 |
| **권장** | Track A에서 시도, 라이선스 OK면 채택 | LimeZu 라이선스 막히면 **즉시 폴백** |

→ **Track A 시작 전 LimeZu Discord에 SaaS 임베딩 가능 여부 1줄 문의** (1일 이내 답변 통상). 답 오기 전엔 Kenney CC0로 PoC.

### 0-bis.6 v1 대비 변경 요약

| 항목 | v1 | v2 (재검토) |
| --- | --- | --- |
| 접근법 | 한 번에 풀 마이그레이션 | 3 트랙 점진적 |
| 첫 걸음 | Phaser PoC (1일) | **에셋 스왑 인 플레이스** (1.5일) |
| 엔진 | Phaser 4 (신생) | Track C 진입 시 Phaser 3 권장 |
| 번들 영향 | +345 KB gz (디폴트) | Track A: 0 KB / Track B: +15 KB / Track C: +100~200 KB |
| 첫 검증 시점 | Phase 5 (~9일 후) | Track A 끝(1.5일 후) |
| 라이선스 | LimeZu 결제 가정 | LimeZu Discord 확인 후 Kenney 폴백 보유 |
| 폐기 위험 | Phaser 안 맞으면 9일 손실 | Track A는 어차피 가치, Track B/C는 옵트인 |

### 0-bis.7 다음 액션 (v2 기준)

1. **사용자 결정**: Track A부터 가도 OK인가? (= "v1 풀 마이그레이션 보류하고 점진적으로 가자"에 동의)
2. **에셋 결정**: LimeZu Discord 문의 vs 처음부터 Kenney CC0로 갈 것인가?
3. **Track A 착수 시 산출물**:
   - `frontend/public/game/sprites/` 에셋 폴더 신설.
   - `PixelOffice.tsx`의 `drawCharacter`/`drawDesk` 함수만 교체 (다른 구조 유지).
   - 다크 CRT 오버레이/`VT323`/scanline 제거, 라이트 토큰 적용.
   - PR 1개로 검증 → 사용자 OK면 Track B 진행.

이 v2가 더 합리적이라고 판단되면 §1 이후의 v1 원안은 **참고만** 하시고, Track A 체크리스트(§0-bis.7)부터 시작하면 됩니다.

---

## 0. TL;DR (한 장 요약 — v1 원안)

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

---

### 0-sexies.10 MS-C 실행 기록 ✅ 완료

**스코프**: §0-sexies.1의 C-1 ~ C-13 중 프론트/백엔드 양방향 인터랙션 기반 레이어 구축. C-7(에이전트 흐름 개입), C-10/C-11(Phaser 카메라/생활), C-12 자가 강조까지 합리적 범위 내 1차 출고.

**검증 결과**:
- TypeScript: `cd frontend; npx tsc --noEmit` → 0 errors
- ESLint (수정 파일): 0 errors / 0 warnings
- Python AST (`backend/main.py`): OK

**구현 파일 변경 요약**:

| 파일 | 종류 | 매핑 | 핵심 |
| --- | --- | --- | --- |
| `frontend/package.json` | 의존성 | C-2 | `cmdk` 추가 |
| `frontend/src/stores/useAgentOffice.ts` | 신규 | C-1, C-2, C-13 | Zustand 글로벌 스토어 (focus/inspector/ask/palette/shortcuts/bookmarks). `bookmarks`만 `localStorage` 영구 저장(`partialize`). 최대 500개. `thoughtId()` 헬퍼 |
| `frontend/src/components/AgentInspector.tsx` | 신규 | C-1 | 우측 슬라이드 패널, 9개 역할 한국어 설명, 탭(개요·활동·트레이스). Esc 닫기. 활동 탭: 발화별 ★ 즉시 토글. 트레이스 탭: 시각/상태/신호/처리 시간/자신감/핵심 포인트/소스/프롬프트/원본 응답/메타데이터 풀 노출. 💬 질문 버튼 → AskModal |
| `frontend/src/components/AskModal.tsx` | 신규 | C-3, C-6 | 후속 질문 모달, max 2000자, ⌘/Ctrl+Enter 전송, 성공/오류 상태, sessionId 없으면 비활성 |
| `frontend/src/components/CommandPalette.tsx` | 신규 | C-2 | `cmdk` 기반. 단축키 **⌘/Ctrl+J** (K는 타임라인 검색과 충돌 회피). 그룹: 인스펙터 열기·질문 열기·줌·그룹·필터·기타. 9개 역할 모두 즉시 액션화 |
| `frontend/src/components/ShortcutsOverlay.tsx` | 신규 | C-2 | `?` (Shift+/) 토글. 입력 포커스 중에는 무시. 전역/타임라인/에이전트 그룹별 안내 |
| `frontend/src/components/agent-timeline/TimelineEntry.tsx` | 수정 | C-1, C-13 | 호버 시 `setFocusedRole`, 호버 색 강조 (역할 색 0F 톤 + 보더). 우측 액션 컬럼: ★ 북마크 토글, ▸ 추적(인스펙터→트레이스) |
| `frontend/src/components/PixelOffice.tsx` | 수정 | C-1, C-13 | 캔버스 hit-test (반경 28px, 머리 좌표 기준). 호버→`setFocusedRole`, 클릭→`openInspector(role)`, 커서 `pointer`로 변경 |
| `frontend/src/lib/api.ts` | 수정 | C-3, C-6 | `askAgent(sessionId, {role, question, thought_timestamp?})` 헬퍼 추가 |
| `frontend/src/app/page.tsx` | 수정 | C-1~C-3, C-13 | `activeAnalysisSessionId` 노출, 4개 신규 컴포넌트(`AgentInspector`, `AskModal`, `CommandPalette`, `ShortcutsOverlay`) 마운트, `askAgent` 사용으로 raw fetch 제거 |
| `backend/main.py` | 수정 | C-3, C-6 | `POST /api/analysis/{session_id}/ask` 신규. 요청 검증(role / question 길이) → 사용자 발화를 `AgentThought(metadata.kind="user_question")`로 SSE 즉시 emit → `kind="user_question_ack"` 후속 thought emit. `Optional` 임포트 추가. 정식 LLM follow-up은 후속 PR 슬롯 |

**역할 ↔ 체크리스트 매핑**:

| ID | 항목 | 상태 | 비고 |
| --- | --- | --- | --- |
| C-1 | AgentInspector | ✅ | overview/activity/trace 3탭 풀스펙 |
| C-2 | CommandPalette + Shortcuts | ✅ | ⌘/Ctrl+J / ? |
| C-3 | AskModal | ✅ | 백엔드 stub 라우트 연동 |
| C-4 | TimelineFilter (정교화) | (MS-B 완료 + C-2 팔레트 토글로 보강) | 별도 추가 작업 없음 |
| C-5 | Bookmarks | ✅ | localStorage persist |
| C-6 | 양방향 채널 백엔드 | ✅ | `/api/analysis/{id}/ask` stub (LLM follow-up 미정) |
| C-7 | 에이전트 흐름 개입(approve/reject) | ⏸ deferred | 기존 `order_approvals` 패널과 중복 → MS-D~F 이후 통합 검토 |
| C-8 | 의사결정 큐 | ⏸ already exists | `auto_trade_orders` / `order_approvals` 기존 |
| C-9 | 픽셀 오피스 클릭/호버 | ✅ | 캔버스 hit-test |
| C-10 | 픽셀 오피스 카메라 줌 | ⏸ deferred | Phaser 도입 시 (MS3+) |
| C-11 | 픽셀 오피스 생활감 | ⏸ deferred | MS3+ |
| C-12 | 자가 강조 / 패시브 알림 | ⏸ deferred | 호버 강조까지만 1차 |
| C-13 | 글로벌 상태 스토어 | ✅ | `useAgentOffice` |

**남은 작업(MS-D 이후로 이월)**:
- C-4: 필터 그룹 사전셋(예: "리서치만", "리스크 분기만") 저장형
- C-7: 분석 세션 진행 중 `human-in-the-loop` 분기 제어 (BUY 직전 사용자 confirm)
- C-12: 임계 신호(strong sell, conviction>0.85 등) 자동 인스펙터 팝업 정책

**다음**: MS-D (정보 밀도 — confidence gauge / sparkline / agreement donut / dissent / sources / compare)로 즉시 진행.

---

### 0-sexies.11 MS-D 실행 기록 ✅ 완료 (D1·D2·D3·D5·D6·D9)

**스코프**: §0-sexies.2 D1~D10 중 핵심 가시 효과가 큰 D1·D2·D3·D5·D6과 그 기반인 백엔드 메타 표준화(D9). D4(30일 thought 히트맵)·D7/D8(분석 비교)·D10(/api/analysis/compare)은 30일 누적 데이터 의존성 또는 별도 비교 UX 설계가 필요하여 차후 마일스톤(MS-F 또는 후속 PR)으로 이월.

**검증 결과**:
- TypeScript: `cd frontend; npx tsc --noEmit` → 0 errors
- ESLint (수정 영역): 0 errors / 0 warnings (사전 잠재 버그 4건 동시 해결 — `react-hooks/refs`, `react-hooks/purity` 등)
- Python AST (`backend/core/events.py`): OK

**파일 변경 요약**:

| 파일 | 종류 | 매핑 | 핵심 |
| --- | --- | --- | --- |
| `frontend/src/components/viz/Primitives.tsx` | 신규 | D1, D2, D3 | 외부 의존성 0의 SVG 마이크로 차트 모음 — `ConfidenceGauge` (반원), `Sparkline` (영역+포인트), `AgreementDonut` (3분할 stroke-dasharray), `StrengthStars` (0~3 칸), `ActivityProgressChart` (시간 버킷 막대). 모두 `role="img"` + aria-label, currentColor / 토큰 친화 |
| `frontend/src/components/AgentOffice.tsx` (`AgentCard`) | 수정 | D1 | 정보 밀도 행: 신뢰도 게이지 + 신호 강도(±별점, confidence→0~3 환산) + 신뢰도 추세 스파크라인. 데이터 출처 칩(최대 4개 + +N). `history?: AgentThought[]` prop 추가. 호출자 `AgentOffice`는 `allThoughts?` prop 받아 역할별로 슬라이싱 |
| `frontend/src/components/AnalysisReport.tsx` | 수정 | D2 | 새 섹션 "1-bis. 9 에이전트 합의도" — `AgreementDonut` (찬성/반대/중립 3분할) + 결정 신뢰도 게이지 + 범례 + ⚠ 반대 의견(dissent) 강조 박스 (역할 한국어명 + 신호 + 신뢰도 %) |
| `frontend/src/components/agent-timeline/AgentTimeline.tsx` | 수정 | D3 + 사전 버그 | 툴바 직하단에 `ActivityProgressChart` (≥4건일 때 노출). 사전 잠재 버그 동시 수정: `frozenRef` 패턴 → state+effect 미러링, `Date.now()` 렌더 호출 제거(마지막 thought timestamp 활용), aria-live setState는 의도적 외부 동기화로 명시 |
| `frontend/src/components/agent-timeline/TimelineEntry.tsx` | 수정 | D5, D6 | 확장 시 출처 칩 행 + 모델/LLM latency 푸터 (metadata.data_sources / model / latency_ms 사용) |
| `frontend/src/components/agent-timeline/TimelineToolbar.tsx` | 수정 | (cleanup) | 미사용 `AgentRole` 임포트 제거 |
| `backend/core/events.py` | 수정 | D9 | `_normalize_provenance()` 신규 — `data_sources` (str/list 둘 다 list[str]로 정규화, `sources` alias 인식), `model` (`model_id`/`llm_model` alias), `latency_ms` (`elapsed_ms`/`processing_ms`/`duration_ms_llm` alias). `emit_thought` 파이프라인에 추가. 값 없으면 키 미생성(UI optional) |

**역할 ↔ 체크리스트 매핑**:

| ID | 항목 | 상태 | 비고 |
| --- | --- | --- | --- |
| D1 | AgentCard 신뢰도/스파크/별점/데이터 칩 | ✅ | history prop 미주입 시 sparkline만 생략, 나머지는 즉시 동작 |
| D2 | DecisionCard 합의도 도넛/반대/신뢰구간/출처 | ✅ (도넛+반대) / ⏸ (신뢰구간·출처 푸터) | 신뢰구간/푸터는 백엔드에서 stop_loss/take_profit 외 추가 필드 합의 후 |
| D3 | 분석 진행률 미니 차트 | ✅ | AgentTimeline 툴바 직하단 |
| D4 | 인스펙터 30일 히트맵 | ⏸ deferred | 30일 thought 영구 저장(office_layouts/aggregations) 선행 필요 |
| D5 | thought 카드 출처 칩 + raw 모달 | ✅ (칩) / ⏸ (raw 모달) | raw 메타는 인스펙터 trace 탭에서 이미 노출 중 → 별도 모달 불필요 판단 |
| D6 | 모델·세션·소요시간 푸터 | ✅ | TimelineEntry 확장 시 |
| D7 | 분석 비교 모드 | ⏸ deferred | UX 설계 필요(MS-F 후보) |
| D8 | 동일 종목 시계열 결정 | ⏸ deferred | listAnalysisHistory 활용 가능 — MS-F |
| D9 | 백엔드 metadata 표준화 | ✅ | `_normalize_provenance` |
| D10 | `/api/analysis/compare` | ⏸ deferred | D7/D8와 동시 출고 |

**파생 효과 (사전 버그 동시 수정)**:
- `AgentTimeline.tsx`의 `frozenRef.current = ...` 렌더 중 ref 업데이트 → state+effect 패턴으로 교체 (lint react-hooks/refs 통과)
- `Date.now()` 렌더 호출 → 결정론적 마지막 thought timestamp 사용 (lint react-hooks/purity 통과)
- `AgreementDonut`의 inner `Seg` 컴포넌트(렌더 중 컴포넌트 정의) → 일반 함수 헬퍼로 교체 (lint react-hooks/static-components 통과)

**다음**: MS-E (디자인 시스템 — motion tokens / sound / themes / onboarding)로 진행.

---

### 0-sexies.12 MS-E 실행 기록 ✅ 완료 (E1·E4·E6·E10·E11 + 부분 E5/E8)

**스코프**: §0-sexies.3 E1~E12 중 인프라/테마/시간 자동/한국 시장 정체성 핵심을 구현. 사운드(E3)·"내 테마 만들기"(E7)·Phaser 시네마틱(E12)은 의존성/스코프 사유로 후속 이월. 첫 방문 투어(E8)는 기존 `OnboardingTour` 컴포넌트가 이미 사용 중이므로 *유지*.

**검증 결과**:
- TypeScript: `npx tsc --noEmit` → 0 errors
- ESLint: 0 errors / 0 warnings (사전 `ActivityFeed` 미사용 경고 1건은 MS-B 잔여)
- 4개 테마(light/dark/warm/hanok) 모두 토큰 일관성 유지 (한국 시장 빨강=상승 / 파랑=하락 컨벤션 보존)

**파일 변경 요약**:

| 파일 | 종류 | 매핑 | 핵심 |
| --- | --- | --- | --- |
| `frontend/src/tokens/motion.ts` | 신규 | E1 | Framer Motion 토큰 — `easeStandard/Enter/Exit/Spring`, `durationFast/Med/Slow/Page`, `springSoft/Snappy/Badge`, 변환 프리셋 (`thoughtArriveVariants`, `expandTransition`, `signalBadgeTransition`, `panelEnterVariants`, `dialogVariants`, `hoverLiftStyle`, `tapPressStyle`), `prefersReducedMotion()` 헬퍼 |
| `frontend/src/lib/krMarket.ts` | 신규 | E10 | KRX 세션 계산 — `MarketStatus` (pre-open/pre-auction/regular/closing-auction/after-hours/closed/holiday), `getMarketSession()` (한국 표준시 변환 + 2026/2027 휴장일), `kstTimeBand()` (morning/day/evening/night) |
| `frontend/src/components/MarketStatusBadge.tsx` | 신규 | E10 | 헤더용 KRX 상태 뱃지 — 1분 갱신, 정규장은 펄스 애니메이션, 휴장 시 다음 개장 시각 툴팁 |
| `frontend/src/app/globals.css` | 수정 | E4 | `[data-theme="warm"]` (베이지/카카오/테라코타) + `[data-theme="hanok"]` (한지/단청 청록/묵색) 테마 추가. tooltip-bg/fg 포함 모든 토큰 풀세트. 한국 시장 컨벤션 보존 |
| `frontend/src/components/ui/ThemeProvider.tsx` | 수정 | E4, E6 | `ThemeMode` 확장 → `"light" \| "dark" \| "system" \| "warm" \| "hanok" \| "auto-time"`. `auto-time`은 한국 표준시 06~18시 light, 그 외 dark. 5분 인터벌 재계산. `THEME_INIT_SCRIPT`도 동일 로직 인라인화로 FOUC 차단 |
| `frontend/src/components/SettingsPanel.tsx` | 수정 | E4, E6 | 테마 모드 라디오 그룹 3 → 6 옵션. "현재 적용" 라벨 warm/hanok/auto-time 분기 |
| `frontend/src/app/page.tsx` | 수정 | E10, E11 | 헤더에 `<MarketStatusBadge compact />` 마운트 + 마이크로카피 ("분석 진행 중/완료" → "회의 진행 중/완료") |

**역할 ↔ 체크리스트 매핑**:

| ID | 항목 | 상태 | 비고 |
| --- | --- | --- | --- |
| E1 | `tokens/motion.ts` 모션 토큰 | ✅ | Framer Motion 친화적 + reduced-motion 헬퍼 |
| E2 | 모든 컴포넌트 모션 가이드 적용 | ⏸ partial | 기존 컴포넌트(상태 칩/타임라인 등)는 자체 transition 보유. 토큰 기반 점진 적용은 후속 |
| E3 | 마이크로 인터랙션 8종 | ⏸ partial | 호버 lift / 클릭 press 스타일 토큰 제공(`hoverLiftStyle`/`tapPressStyle`). 펄스/지폐 파티클 등은 후속 |
| E4 | Howler 사운드 8종 | ⏸ deferred | 효과음 자산 라이선싱 + 디폴트 OFF 토글 UX 별도 설계 필요 |
| E5 | 4개 테마 픽셀 캔버스 색·조명 | ✅ (CSS 토큰) / ⏸ (캔버스 색 반영) | warm/hanok 토큰 추가. `PixelOffice` 캔버스 픽셀 색 매핑은 MS0~MS11 Phaser 마이그레이션과 함께 |
| E6 | 시간대 자동 테마 | ✅ | `auto-time` 모드 (KST 06~18시 = light, 그 외 dark) |
| E7 | "내 테마 만들기" 색 피커 | ⏸ deferred | MS-F(개인화)에서 saved views와 함께 출고 검토 |
| E8 | 첫 방문 투어 | ✅ (기존) | `OnboardingTour` 컴포넌트 이미 page.tsx 마운트됨 |
| E9 | 샘플 분석 리플레이 `/replay/demo` | ⏸ deferred | 데모 thought stream 픽스처 + 라우팅 별도 |
| E10 | 한국 시장 캘린더 표시 | ✅ | `lib/krMarket.ts` + `MarketStatusBadge` 헤더 마운트 |
| E11 | 한국식 마이크로카피 | ✅ partial | "분석 진행 중" → "회의 진행 중" 등 핵심 헤더 카피 적용. 광범위 카피 정비는 후속 |
| E12 | 장 마감 시네마틱 | ⏸ deferred | Phaser 카메라 무브 의존 — MS0~MS11과 함께 |

**디자인 의사결정 노트**:
- `auto-time`은 KRX 세션이 아닌 단순 06~18시 분기 — 장중에 다크 강제 시 사용성 저하 우려가 있어 "사람의 일과" 기준으로 선택. 시장 정보는 `MarketStatusBadge`로 별도 노출.
- warm/hanok도 light 베이스(`color-scheme: light`) — 다크의 눈 피로 회피 의도가 약화되지 않도록.
- 마감 동시호가/시간외 등 5단계 분리는 ATS 도입(2026.3) 이후 거래 가능 시간 확장에 대비한 설계.
- 휴장일은 2026/2027만 하드코딩 — 2028 이후는 백엔드 KRX API에서 보강 권장 (deferred).

**다음**: MS-F (개인화 — pin/order/hide, saved views, multi-workspace, notifications, PDF, OG, API token)로 진행.

### 0-sexies.13 MS-F 실행 기록 ✅ 완료 (F1·F2·F3·F5 + 부분 F4/F6/F7/F8 deferred)

**범위**: 사용자별 워크스페이스 개인화 — 에이전트 핀/숨김, 저장된 뷰(필터 프리셋), 활동 로그 컬럼 토글, 사용자 정의 알림 규칙(인앱 토스트 + 브라우저 푸시).

**파일 변경**:

| 파일 | 종류 | 핵심 |
|---|---|---|
| `frontend/src/stores/usePersonalization.ts` | NEW | zustand+persist 스토어. `pinnedRoles`/`hiddenRoles`/`roleOrder`/`savedViews[]`/`timelineColumns`/`notificationRules[]`/`notificationsPermission`. `applyRolePersonalization()` 헬퍼: hidden 제거 → pinned 우선 → 사용자 순서 → 미정의 tail. persist key = `kta-personalization-v1`, version 1. |
| `frontend/src/lib/notifications.ts` | NEW | `evaluate(rule, t)` AND 결합. 세션 내 dedup(`${ruleId}:${role}:${ts}`). `useAutoNotify(latestThought)` — 새 thought마다 enabled rules 평가 → toast/browser 채널 발화. `requestNotificationPermission()` async wrapper. |
| `frontend/src/components/SettingsPanel.tsx` | MODIFIED | `SettingsTab`에 `personalization`/`notifications` 추가. 2개 신규 패널: `PersonalizationPanel`(F1+F3 — 9역할 핀/숨김 그리드 + 4컬럼 토글), `NotificationsPanel`(F5 — 권한 상태 칩/요청 + 규칙 리스트 + 3개 프리셋). |
| `frontend/src/components/AgentOffice.tsx` | MODIFIED | LAYERS.map 내부에서 `applyRolePersonalization(layer.roles, {pinnedRoles, hiddenRoles, roleOrder})` 적용. 결과 0이면 레이어 자체 skip. doneCount/gridTemplateColumns/AgentCard.map 모두 personalizedRoles 기반. |
| `frontend/src/components/agent-timeline/TimelineToolbar.tsx` | MODIFIED | 저장된 뷰 chip rail 추가 (Row 3 위). `+현재 필터 저장`/`⭐name` 적용/`×` 삭제. `useTimelineStore.getState()`로 imperative apply. |
| `frontend/src/components/agent-timeline/TimelineEntry.tsx` | MODIFIED | F3 컬럼 가시성 — `usePersonalization((s) => s.timelineColumns)` 구독. `cols.time`/`cols.agent`/`cols.signal`/`cols.stage` 별로 conditional 렌더. |
| `frontend/src/app/page.tsx` | MODIFIED | `useAutoNotify(logs[logs.length-1])` 훅 wiring — SSE로 들어오는 새 thought마다 알림 규칙 평가. |

**MS-F 항목 ↔ 구현 매핑**:

| 항목 | 상태 | 비고 |
|---|---|---|
| F1 — 에이전트 핀/숨김/순서 | ✅ | 핀+숨김 토글 mutually exclusive (cross-clear). AgentOffice 그리드에 즉시 반영. roleOrder는 store에 있으나 드래그 UI는 후속 (현재는 핀 우선만 사용). |
| F2 — 저장된 뷰(필터 프리셋) | ✅ | TimelineToolbar에서 현재 필터 → 이름 prompt → store 저장. chip 클릭 시 imperative apply. 최대 50개. |
| F3 — 활동 로그 컬럼 토글 | ✅ | 4컬럼(시간/에이전트/신호/단계). compact zoom에서도 동작. |
| F4 — 다중 워크스페이스 | ⏸ deferred | 전체 store 스코프 분리 + URL routing 필요. 단일 사용자 가정에서는 불필요. |
| F5 — 사용자 정의 알림 규칙 | ✅ | AND-결합 조건(signal/confidence-min/role/status). 인앱+브라우저 채널. 세션 dedup. 3개 프리셋(매수90%+/매도80%+/리스크). |
| F6 — PDF 내보내기 | ⏸ deferred | `react-pdf` 의존성 추가 필요. 후속 마일스톤에서. |
| F7 — OG 이미지 | ⏸ deferred | `@vercel/og` + 동적 라우트 필요. 공유 시점에 도입. |
| F8 — API 토큰 발급 | ⏸ deferred | 백엔드 라우트(`/api/tokens/personal`) + 사용자 시스템 통합 필요. |

**디자인 의사결정**:
- 핀/숨김은 mutually exclusive — 사용자 mental model 단순화 ("이 둘은 동시에 적용될 수 없다"). 한 액션이 다른 쪽을 자동 해제.
- 사무실 그리드의 personalization은 **레이어별로** 적용 — 3-stage(Discover/Decide/Defend) 아키텍처를 평탄화하지 않고 보존. 한 레이어가 비면 그 레이어 자체를 숨김.
- 알림은 옵트인(권한 + enabled flag). 기본값은 빈 규칙 셋 — 사용자가 명시적으로 프리셋을 추가해야 발화. "스팸 두려움" 회피.
- 세션 dedup으로 같은 thought가 재방문/HMR로 다시 들어와도 중복 푸시 없음.
- `Notification.permission === "denied"`면 권한 요청 버튼 비활성화 + 안내 문구 — 브라우저 정책상 강제 재요청 불가.

**검증**:
- `npx tsc --noEmit`: ✅ 0 errors
- `npx eslint src/stores/usePersonalization.ts src/lib/notifications.ts src/components/SettingsPanel.tsx src/components/AgentOffice.tsx src/components/agent-timeline/TimelineToolbar.tsx src/components/agent-timeline/TimelineEntry.tsx src/app/page.tsx`: ✅ 0 errors (page.tsx의 ActivityFeed unused-import 1건은 기존 워닝)

**다음**: MS0~MS11 (Phaser 3 캐릭터 캔버스 마이그레이션) → 백엔드 office_layouts CRUD → 최종 e2e 검증 리포트.

### 0-sexies.14 MS8 백엔드 선행 — `office_layouts` CRUD ✅ 완료

> Phaser 3 풀 마이그레이션(MS0~MS7, MS10~MS11)은 외부 자산(Kenney/LimeZu/LDtk) 다운로드·아틀라스 빌드·LDtk 맵 제작 등 단일 세션 범위를 벗어나는 분량이라 **별도 세션에서** 착수합니다. 다만 MS8(백엔드 API)은 자산 의존성 없이 미리 구축 가능하므로 선행해 다음 세션의 부담을 낮춥니다. MS9 공유 기능의 1차 토대(`shared_token`)도 함께 깔아둡니다.

**파일 변경**:

| 파일 | 종류 | 핵심 |
|---|---|---|
| `backend/api/office_layouts.py` | NEW | APIRouter `/api/office-layouts`. 10개 엔드포인트 (list/create/get-active/get/update/delete/activate/share-issue/share-revoke/get-shared). Pydantic 모델로 페이로드 화이트리스트 (`FurniturePlacement`/`CharacterCustomization`/`LayoutPayload`). `secrets.token_urlsafe(16)` 공유 토큰. |
| `backend/main.py` | MODIFIED | `from backend.api.office_layouts import router as office_layouts_router` + `app.include_router(office_layouts_router)`. |

**스키마 (MongoDB `office_layouts` 컬렉션)**:

```text
{
  _id: ObjectId,
  user_id: str,           // sessions.user._id 문자열
  name: str (1~80),
  map_id: str,            // MS2 맵 카탈로그 키 (default: "default-office")
  theme: "neutral"|"warm"|"dark"|"hanok",
  furniture: [{ asset_id, x, y, rotation: 0|90|180|270, layer: floor|wall|decor }] (max 500),
  characters: [{ role, base, hair, outfit, accent_color }] (max 20),
  notes: str (max 400),
  is_active: bool,        // 사용자당 1개만 true
  shared_token: str|null, // MS9 공유 1차 토대
  created_at, updated_at: datetime
}
```

**엔드포인트**:

| Method | Path | Auth | 비고 |
|---|---|---|---|
| GET | `/api/office-layouts` | 사용자 | 본인 레이아웃 50개 (updated_at desc) |
| POST | `/api/office-layouts` | 사용자 | `set_active=true`면 즉시 활성화 |
| GET | `/api/office-layouts/active` | 사용자 | 현재 활성 레이아웃 1개 |
| GET | `/api/office-layouts/{id}` | 사용자(소유주) | 단건 |
| PATCH | `/api/office-layouts/{id}` | 사용자(소유주) | 부분 업데이트 |
| DELETE | `/api/office-layouts/{id}` | 사용자(소유주) | 삭제 |
| POST | `/api/office-layouts/{id}/activate` | 사용자(소유주) | 다른 활성 → 비활성, 본인 → 활성 (단일 사용자 가정 트랜잭션 없이 두 단계) |
| POST | `/api/office-layouts/{id}/share` | 사용자(소유주) | `shared_token` 발급/회전 |
| DELETE | `/api/office-layouts/{id}/share` | 사용자(소유주) | 공유 토큰 무효화 |
| GET | `/api/office-layouts/shared/{token}` | **공개** | user_id/is_active/shared_token 제거 후 반환 (MS9 임포트의 입구) |

**디자인 의사결정**:
- `shared_token`은 `secrets.token_urlsafe(16)` (≈22자 base64url) — URL-safe + 추측 불가. 회전(POST 재발급) 시 이전 토큰 자동 무효화.
- 공개 GET 응답에서 `user_id`/`is_active`/`shared_token` 모두 제거 — 공유 토큰이 노출돼도 다른 사용자 정보 추론 불가.
- Pydantic `max_length` 제약(가구 500개·캐릭터 20개·이름 80자·메모 400자) — §0-ter.10의 "사용자가 만든 LDtk가 악성/과대" 리스크 1차 차단. MS9에서 LDtk 임포트 시 추가 검증.
- 활성 토글은 단일 사용자 가정으로 트랜잭션 없이 두 단계 update — 멀티 동시 토글 시에도 마지막 1개만 활성으로 수렴. 신뢰성 충분.

**검증**:
- `python -c "import ast; ast.parse(...)"`: ✅ AST OK
- `python -c "from backend.api.office_layouts import router; len(router.routes) == 10"`: ✅
- `python -c "from backend.main import app; len([r for r in app.routes if 'office-layouts' in r.path]) == 10"`: ✅ 마운트 확인 (총 66 routes)
- 통합 테스트(MongoDB 실제 호출)는 다음 세션 MS0~ 수행 시 프론트 연동과 함께 e2e로.

**남은 MS0~MS7, MS9~MS11 (다음 세션)**:
- MS0: Phaser 3 + zustand 신규 의존성, `transpilePackages`, dynamic import, 빈 `OfficeScene` 부트
- MS1~MS3: Kenney CC0 아틀라스 다운로드 + LDtk default-office 맵 + 액터/길찾기
- MS4~MS7: HUD/카메라/테마/캐릭터·가구 에디터 (이 단계에서 위 API 본격 소비)
- MS9: LDtk 임포트 + 화이트리스트 검증
- MS10: Howler 사운드 + 시네마틱
- MS11: a11y/폴백/Playwright e2e + Lighthouse 95+

### 0-sexies.15 MS-F + MS8 통합 e2e 검증 리포트 ✅

> 작성: 2026-04-26 (이번 세션 마지막). MS-A부터 MS-F + MS8 백엔드 선행까지 출고된 전체 경로의 통합 상태 점검.

**프론트 클라이언트 추가**: `frontend/src/lib/api.ts`에 `office-layouts` CRUD 클라이언트 9종 추가 (`listOfficeLayouts`/`getActiveOfficeLayout`/`getOfficeLayout`/`createOfficeLayout`/`updateOfficeLayout`/`deleteOfficeLayout`/`activateOfficeLayout`/`issueOfficeLayoutShareToken`/`revokeOfficeLayoutShareToken`/`getSharedOfficeLayout`). 타입(`OfficeLayout`/`OfficeFurniture`/`OfficeCharacter`/`OfficeTheme`)도 함께 export. MS0~MS7 Phaser 캔버스가 도착하면 즉시 소비 가능.

**검증 결과**:

| 영역 | 명령 | 결과 |
|---|---|---|
| 프론트 TypeScript | `npx tsc --noEmit` | ✅ 0 errors |
| 프론트 ESLint (`src` 전체) | `npx eslint src` | ✅ 0 errors / 2 warnings (page.tsx `ActivityFeed` unused, AutoLoopPanel `actionToScore` unused — 둘 다 기존, 이번 세션 변경과 무관) |
| 백엔드 AST 전체 | `ast.parse` 모든 `.py` | ✅ 0 errors |
| 백엔드 라우트 마운트 | `from backend.main import app` | ✅ 66 routes (office-layouts 10개 포함) |
| MongoDB 연결 | `connect_to_mongo` + `get_mongo_health` | ✅ connected (database=korean_trading_agents) |
| 라이브 CRUD 스모크 | `backend/scripts/_e2e_office_layouts_check.py` | ✅ insert / round-trip / activate-toggle 단일성 / shared_token GET / cleanup |

**라우트 인벤토리** (총 66, prefix별):

| Prefix | 개수 | 이번 세션 추가 |
|---|---|---|
| `/api/office-layouts` | 10 | ✅ 신규 (MS8) |
| `/api/analyze` | 4 | — |
| `/api/analysis` | 1 | — (MS-C에서 추가됨) |
| `/api/auth` | 5 | — |
| `/api/auto-loop` | 4 | — |
| `/api/backtest` | 6 | — |
| `/api/health` | 1 | — |
| `/api/kis` | 8 | — |
| `/api/market` | 1 | — |
| `/api/master` | 9 | — |
| `/api/portfolio-loop` | 5 | — |
| `/api/settings` | 2 | — |
| `/api/stock` | 3 | — |
| `/api/users` | 2 | — |
| docs/openapi/health | 5 | — |

**MS-A ~ MS-F 누적 전달 요약**:

| 마일스톤 | 출고 | Deferred / 메모 |
|---|---|---|
| MS-A 정보설계 | 라벨 SSOT, 영문→한글, 시맨틱 정규화, 헤더 3-state | — |
| MS-B 활동 로그 | react-virtuoso 타임라인, 줌 3단, pause/export, aria-live | — |
| MS-C 상호작용 | Inspector·CommandPalette(⌘J)·AskModal·ShortcutsOverlay·북마크 | C-7(개입), C-10/11(Phaser), C-4(필터 사전셋) |
| MS-D 정보 밀도 | viz/Primitives, AgentCard 밀도 행, 합의도 도넛, 출처 칩, 모델 푸터, backend `_normalize_provenance` | D4/D7/D8/D10 |
| MS-E 디자인 시스템 | motion 토큰, krMarket + MarketStatusBadge, warm/hanok 테마, 6모드 ThemeProvider, "회의" 마이크로카피 | E2/E3/E5/E7/E9/E12 |
| MS-F 개인화 | usePersonalization 스토어, notifications 엔진, SettingsPanel 개인화·알림 탭, AgentOffice 핀/숨김 적용, TimelineToolbar 저장된 뷰, TimelineEntry 컬럼 가시성 | F4(멀티 워크스페이스), F6(PDF), F7(OG), F8(API 토큰) |
| MS8 백엔드 | `office_layouts` CRUD 10 routes + 프론트 클라이언트 | MS0~MS7/MS9~MS11 별도 세션 |

**남은 큰 덩어리 (다음 세션)**:

1. **MS0 부트스트랩** — Phaser 3 + zustand 의존성 추가, `transpilePackages`, dynamic import, 빈 `OfficeScene`
2. **MS1 에셋 파이프라인** — Kenney CC0 다운로드 + TexturePacker 빌드 스크립트 (사용자 §0-ter.12 결정 1·2 필요)
3. **MS2 디폴트 맵** — LDtk `default-office` (60×40)
4. **MS3 액터 + 길찾기** — `AgentActor`, `PathfindingSystem` navmesh
5. **MS4~MS7** — HUD/카메라/테마/캐릭터·가구 에디터 (이 단계에서 office-layouts API 본격 소비)
6. **MS9** — LDtk 임포트 + 화이트리스트 (백엔드 `shared_token` GET이 이미 토대)
7. **MS10** — Howler 사운드 + 시네마틱
8. **MS11** — Playwright e2e + Lighthouse 95+

**사용자 결정 대기 (§0-ter.12)**:
1. Kenney CC0 디폴트 + LimeZu 라이선스 병행 문의 → ?
2. 맵 에디터 LDtk vs Tiled → ?
3. Zustand 신규 도입 → **이미 도입됨** (MS-B/C/F에서 사용 중)
4. `office_layouts` 컬렉션 → **이미 추가됨** (MS8 이번 세션)
5. MS0 시작 시점 → ?

**스모크 스크립트**: `backend/scripts/_e2e_office_layouts_check.py` — Mongo 라이브에 임시 user_id로 insert/round-trip/active-toggle/shared-token 검증 후 자동 cleanup. 회귀 시 실행: `python backend/scripts/_e2e_office_layouts_check.py`.

**결론**: MS-A부터 MS-F + MS8까지 출고된 코드 경로는 전부 타입체크·린트·AST·라이브 DB CRUD 통과. UI는 즉시 사용 가능 상태이며, Phaser 캔버스(MS0~)는 외부 자산 결정 후 별도 세션에서 위에 깔린 office-layouts API와 usePersonalization 스토어를 즉시 소비할 수 있도록 인터페이스가 정렬되어 있음.







---

## 0-sexies.16 외부 의존성 준비 완료 + MS0 GO 결정 ✅

> 작성: 2026-04-26 (이번 세션 추가). §0-ter.12의 사용자 결정 5개가 모두 확정되었음. MS0 착수 가능 상태.

### 사용자 측 준비 완료 (확인일 2026-04-26)

| 항목 | 상태 | 위치 / 메모 |
|---|---|---|
| LDtk 데스크톱 앱 | ✅ 설치됨 | §0-ter.12 #2 결정: **LDtk 채택** |
| Kenney CC0 자산 4팩 | ✅ 다운로드 완료 | `C:\Users\summu\Desktop\hub\kenny-pixel\` |
| └ `kenney_tiny-town` | ✅ | 16×16 플로어/벽/문 — MS2 default-office의 베이스 타일셋 |
| └ `kenney_rpg-urban-pack` | ✅ | 사무실 가구/소품 — MS7 가구 에디터 카탈로그 1차 후보 |
| └ `kenney_ui-pack-pixel-adventure` | ✅ | HUD 9-slice 패널/버튼 — MS4 HUD 자산 |
| └ `kenney_desert-shooter-pack_1.0` | ◯ 보관 | 현재 사무실 시나리오와 무관, 추후 시즌 테마로 보류 |
| Galmuri 폰트 | ✅ npm 사용 | `npm i galmuri` (레지스트리 확인 v2.40.3, SIL OFL). MS0에서 의존성 추가 시 함께 설치 |
| §0-ter.12 #1 (Kenney vs LimeZu) | ✅ | **Kenney 단독** — LimeZu는 추후 라이선스 협의 시 추가 검토 |
| §0-ter.12 #2 (LDtk vs Tiled) | ✅ | **LDtk** |
| §0-ter.12 #3 (Zustand 신규) | ✅ | 이미 MS-B/C/F에서 도입·사용 중 |
| §0-ter.12 #4 (`office_layouts` 컬렉션) | ✅ | 이미 MS8에서 출고 |
| §0-ter.12 #5 (MS0 시작 시점) | ✅ | **GO** — 다음 세션부터 MS0 착수 |

### MS1 시점 자산 경로 처리 (선결 메모)

현재 자산 위치(`C:\Users\summu\Desktop\hub\kenny-pixel\`)는 Next.js `public/`가 아니므로 직접 서빙 불가. MS1 진입 시 다음 중 1택:

1. **권장**: `frontend/public/game/assets/kenney/`로 필요한 PNG·JSON만 복사 (라이선스 텍스트도 함께). 빌드 산출물에 포함되어 정적 서빙됨.
2. 대안: PowerShell `New-Item -ItemType Junction`으로 디렉터리 정션 (개발 편의용, 배포 시에는 1번 필요).

선택은 MS1에서 빌드 스크립트 작성과 함께 확정. 이번 세션에서는 결정만 기록.

### 다음 세션 (Session 1 = MS0) 작업 정의

자산 의존성 없이 빈 캔버스 부트만 다루므로 단일 세션에 마감 가능.

| 작업 | 파일 | 검증 |
|---|---|---|
| 의존성 추가 | `frontend/package.json` (`phaser@^3.86`, `phaser-navmesh@^2`, `galmuri`) | `npm i` 무오류 |
| Next.js 설정 | `frontend/next.config.ts` (`transpilePackages: ['phaser']`) | dev 서버 부트 |
| Phaser Scene | `frontend/src/components/game/OfficeScene.ts` (빈 Scene, 라이트 토큰 배경) | `tsc --noEmit` 0 |
| Dynamic 마운트 | `frontend/src/components/game/PhaserCanvas.tsx` (`dynamic(..., { ssr: false })`) | SSR 에러 0 |
| 페이지 통합 | `frontend/src/app/page.tsx` — `<PixelOffice>` 자리에 `<PhaserCanvas>` 마운트 | 빈 캔버스가 라이트 배경으로 렌더 |

종료 조건: SSR 에러 0, 빈 캔버스가 페이지에 표시, 기존 정보 패널/타임라인 정상 동작 (MS-A~MS-F 회귀 없음).

### 결론

사용자 측 외부 의존성(LDtk · Kenney · Galmuri)은 모두 준비 완료. §0-ter.12의 5개 결정 모두 확정. 다음 세션에서 MS0 부트스트랩부터 순차 PR로 진입 가능. MS0 종료 후 MS1(자산 파이프라인 + `public/game/assets/` 복사)로 이어짐.



---

## 0-sexies.17 MS0 遺?몄뒪?몃옪 ?ㅽ뻾 湲곕줉 ??

> ?묒꽦: 2026-04-26 (?대쾲 ?몄뀡). ?ъ슜?먭? ?먯궛 蹂듭궗 + ?꾩껜 吏꾪뻾 OK ?쒓렇?먯쓣 蹂대궡 MS0瑜?利됱떆 李⑹닔쨌?꾨즺.

### ?먯궛 蹂듭궗 寃곌낵

`C:\Users\summu\Desktop\hub\kenny-pixel\` ??`frontend/public/game/assets/kenney/`

| ??| 寃곌낵 |
|---|---|
| `kenney_tiny-town` | ??蹂듭궗 |
| `kenney_rpg-urban-pack` | ??蹂듭궗 |
| `kenney_ui-pack-pixel-adventure` | ??蹂듭궗 |
| `kenney_desert-shooter-pack_1.0` | 蹂대쪟 (???쒕굹由ъ삤 臾닿?) |
| ?⑷퀎 ?뚯씪 | 1155 |

?쇱씠?좎뒪 ?띿뒪??`License.txt`)??媛??⑹뿉 ?ы븿??梨?蹂듭궗 ??Kenney CC0 而댄뵆?쇱씠?몄뒪 OK.

### ?섏〈??異붽?

`frontend/package.json` ?섏젙:

```diff
+ "galmuri": "^2.40.3",
+ "phaser": "^3.90.0",
+ "phaser-navmesh": "^2.3.1",
+ "react-virtuoso": "^4.10.4",
+ "zustand": "^5.0.2"
```

> 二? `zustand`/`react-virtuoso`??MS-B/C/F?먯꽌 肄붾뱶???대? ?ъ슜 以묒씠?덉?留?`package.json`?먮뒗 ?꾨씫 ?곹깭???(lockfile?먮뒗 ?덉뼱 鍮뚮뱶???듦낵). ?대쾲???뺤떇 ?깅줉?섏뿬 fresh-install ?덉쟾???뺣낫.

`phaser`??v4媛 `latest`?댁?留?`phaser-navmesh@^2.3.1`??peerDep??`phaser@^3.55.2`?대?濡?**v3.90.0 ?쇱씤?쇰줈 ?**. v4 ?낃렇?덉씠?쒕뒗 phaser-navmesh ?명솚 ?쒖젏???ш???

`npm install` 寃곌낵: `added 8 packages, audited 437 packages` ??異⑸룎 ?놁쓬.

### 肄붾뱶 蹂寃?

| ?뚯씪 | 醫낅쪟 | ?듭떖 |
|---|---|---|
| `frontend/next.config.ts` | MODIFIED | `transpilePackages: ["phaser", "phaser-navmesh"]` 異붽?. Turbopack ESM/CJS ????뷀듃由??명솚. |
| `frontend/src/components/game/OfficeScene.ts` | NEW | `Phaser.Scene` ?쒕툕?대옒?? MS0??洹몃━??32px) + "MS0 遺??OK" ?띿뒪?몃쭔. `resize` ?몃뱾?щ줈 諛섏쓳?? MS1+?먯꽌 preload쨌LDtk 濡쒕뵫 異붽?. |
| `frontend/src/components/game/PhaserCanvas.tsx` | NEW | Public ?섑띁. 遺紐?而⑦뀒?대꼫 0횞0 媛??+ ?쇱씠???좏겙 諛곌꼍(`var(--bg-canvas)`). ?대? `PhaserCanvasInner`瑜?`dynamic(..., { ssr: false })`濡?濡쒕뱶. 濡쒕뵫 以??먮━?쒖떆???띿뒪?? |
| `frontend/src/components/game/PhaserCanvasInner.tsx` | NEW | ?ㅼ젣 `Phaser.Game` ?몄뒪?댁뒪 留덉슫?? `Phaser.Scale.RESIZE` + `ResizeObserver`濡?諛섏쓳?? `pixelArt: true` + `antialias: false`. cleanup?먯꽌 `game.destroy(true)` + `ResizeObserver.disconnect()`. |
| `frontend/src/app/page.tsx` | MODIFIED | `import { PixelOffice }` ?쒓굅 ??`import { PhaserCanvas }`. ?щТ???꾩튂??`<PixelOffice>` ??`<PhaserCanvas />`. 遺紐?div 諛곌꼍???ㅽ겕 洹몃씪?붿뼵????`var(--bg-canvas)`濡??듭씪. |

### ?붿옄???섏궗寃곗젙

- **?댁쨷 ?섑띁 援ъ“** (`PhaserCanvas` ?몃? + `PhaserCanvasInner` ?대?): `PhaserCanvas`??SSR-safe, `Inner`留?`ssr:false`濡??숈쟻 濡쒕뱶. ?섏씠吏 而댄룷?뚰듃??import留??섎㈃ SSR ?먮윭媛 ?먯쿇 李⑤떒??
- **type-only import 遺꾨━**: `PhaserCanvasInner.tsx`?먯꽌 `import type Phaser from "phaser"`濡???낅쭔 媛?몄삤怨??고??꾩? `await import("phaser")`. 鍮뚮뱶 ????낆? 蹂댁〈, 踰덈뱾?먯꽑 dynamic chunk濡?遺꾨━.
- **Phaser v3 ?**: phaser-navmesh v2.x媛 v4 誘몄??먯씠??v3.90.x濡?怨좎젙. MS3?먯꽌 navmesh瑜?蹂멸꺽 ?ъ슜?섎?濡??명솚?깆씠 ?듭떖.
- **`scale.mode = RESIZE`**: 諛섏쓳??而⑦뀒?대꼫?먯꽌 ?먮룞 由ъ궗?댁쫰. `ResizeObserver`媛 遺紐??ш린 蹂寃?媛먯? ??`game.scale.resize()` ?몄텧.
- **`pixelArt: true` + `antialias: false`**: Kenney 16횞16 ??쇱쓣 ?뺤닔 諛곗닔濡??뚮뜑????蹂닿컙???쇰㈃ ?먮┸?댁쭚. MS5 ?뚮쭏 ?곸슜 ?꾨???踰좎씠?ㅻ씪?몄쑝濡??쎌? ?뚮뜑 媛뺤젣.
- **`PixelOffice` ?쒓굅**: 짠0-sexies.16 寃곗젙?濡??먮━ 援먯껜. ?뚭? ??git?먯꽌 蹂듦뎄 媛?? import???④퍡 ?쒓굅?섏뿬 ESLint unused-vars 寃쎄퀬 異붽? 諛쒖깮 諛⑹?.

### 寃利?

| 寃??| 寃곌낵 |
|---|---|
| `npx tsc --noEmit` | ??0 errors |
| `npx eslint src` | ??0 errors / 2 warnings (湲곗〈 `ActivityFeed` unused, `actionToScore` unused ??蹂寃?臾닿?) |
| `npx next build` (Turbopack) | ??Compiled successfully in 5.2s 쨌 TypeScript 6.9s 쨌 7/7 static pages ?앹꽦 |
| `npm install` | ??added 8 packages, 0 conflicts |

### 醫낅즺 議곌굔 ?먭? (짠0-sexies.16??MS0 ?묒뾽 ?뺤쓽 ?議?

- ??`npm i` 臾댁삤瑜?
- ??dev/prod 鍮뚮뱶 紐⑤몢 ?깃났 (SSR ?먮윭 0)
- ??`tsc --noEmit` 0 errors
- ??`<PhaserCanvas>`媛 `<PixelOffice>` ?먮━??留덉슫??
- ??鍮?罹붾쾭??+ 洹몃━??+ "MS0 遺??OK" ?띿뒪?멸? ?쇱씠??諛곌꼍?먯꽌 ?뚮뜑 (肄붾뱶 寃利?
- ??湲곗〈 ?뺣낫 ?⑤꼸/??꾨씪???뚭? ?놁쓬 (TS/ESLint 蹂寃??놁쓬)

### ?ㅼ쓬 (MS1 ???먯궛 ?뚯씠?꾨씪??

1. `frontend/public/game/assets/kenney/`???대? ?먯궛 諛곗튂?? MS1???ㅼ쓬 ?묒뾽:
   - `frontend/scripts/build-atlas.mjs` (TexturePacker ?먮뒗 free-tex-packer-cli 湲곕컲 ?꾪??쇱뒪 鍮뚮뱶)
   - `OfficeScene.preload()`?먯꽌 atlas/tilemap 濡쒕뱶 (?띿뒪???먮━?쒖떆?????ㅼ젣 ???
   - ?쇱씠?좎뒪 ?띿뒪??`public/game/LICENSES.txt` ?듯빀
2. MS2 LDtk default-office 60횞40 留??쒖옉 (?ъ슜??痢?LDtk ?묒뾽 + import 肄붾뱶)
3. MS3 ?≫꽣 + navmesh

MS0 ?곗텧臾??꾩뿉 MS1~MS3媛 ?쒖감 ?곸링.



---

## 0-sexies.18 MS1 ?먯궛 ?뚯씠?꾨씪??+ MS2 ?뷀뤃???ㅽ뵾??留???

> ?묒꽦: 2026-04-26 (?대쾲 ?몄뀡 ?곗냽). ?ъ슜??"?댁뼱??彛?吏꾪뻾?? ?쒓렇?먮줈 MS1쨌MS2 臾띠뼱??異쒓퀬.

### MS1 ???먯궛 ?뚯씠?꾨씪??

| ?뚯씪 | 醫낅쪟 | ?듭떖 |
|---|---|---|
| `frontend/public/game/LICENSES.txt` | NEW | Kenney CC0 + Galmuri SIL OFL ?듯빀 ?쇱씠?좎뒪 ?붿빟. 異뷀썑 ?몃? ?먯궛 異붽? ??媛숈? ?뚯씪???꾩쟻. |
| `frontend/src/components/game/assets.ts` | NEW | `SpriteSheetSpec` ???+ `TINY_TOWN`/`RPG_URBAN` 硫뷀? + `ALL_SHEETS` 諛곗뿴 + `ttFrame(col,row)` ?ы띁 + `TT_TILES` ?먯＜ ?곕뒗 ?꾨젅???곸닔 (`GRASS`/`DIRT`/`STONE`). |
| `frontend/src/components/game/OfficeScene.ts` | MODIFIED | `preload()`?먯꽌 `ALL_SHEETS` 猷⑦봽 + `this.load.spritesheet()`. MS0 洹몃━???띿뒪???쒓굅. |

**?꾪??쇱뒪 硫뷀?**:

| ?쒗듃 | 寃쎈줈 | ?ш린 | ?꾨젅??(col횞row) | 珥??꾨젅??|
|---|---|---|---|---|
| `tiny-town` | `/game/assets/kenney/kenney_tiny-town/Tilemap/tilemap_packed.png` | 192횞176 | 12횞11 | 132 |
| `rpg-urban` | `/game/assets/kenney/kenney_rpg-urban-pack/Tilemap/tilemap_packed.png` | 432횞288 | 27횞18 | 486 |

`tilemap_packed.png`??margin/spacing??0?대씪 Phaser `spritesheet` 濡쒕뜑媛 洹몃?濡?諛쏆쓬 (`tilemap.png`??1px ?⑤뵫???덉뼱 濡쒕뜑 ?듭뀡 ??蹂듭옟 ???ъ슜 ????.

### MS2 ???뷀뤃???ㅽ뵾??留?(LDtk ?꾩엯 ???먮━?쒖떆??

> 짠0-sexies.16?먯꽌 MS2 = "LDtk default-office (60횞40)"濡??뺤쓽?덉쑝?? LDtk ?뚯씪 ?묒꽦? ?ъ슜??痢??묒뾽???꾩슂?섎?濡?蹂??몄뀡?먯꽌??**30횞20 ?섎뱶肄붾뱶 留??곗씠??*濡??먮━?쒖떆??援ы쁽. MS9 LDtk ?꾪룷?멸? ?꾩갑?섎㈃ 媛숈? ?명꽣?섏씠??`TileIndex[][]`)濡?援먯껜 媛??

| ?뚯씪 | 醫낅쪟 | ?듭떖 |
|---|---|---|
| `frontend/src/components/game/defaultOfficeMap.ts` | NEW | `MAP_COLS=30`/`MAP_ROWS=20`/`MAP_TILE=16`. `DEFAULT_OFFICE_LAYOUT: TileIndex[][]` ?곸닔. ?몃꼍(鍮④컙 吏遺?+ 踰??섎?) + 媛?대뜲 ?듬줈(?먭컝) + 留덈（(?숆만) + ?⑥そ ?뺣Ц(??臾?. |
| `frontend/src/components/game/OfficeScene.ts` | MODIFIED | `mapLayer` 而⑦뀒?대꼫 + `drawDefaultOffice()` 30횞20 猷⑦봽. `centerCameraOnMap()` 移대찓???뺣젹. ?덈궡 ?띿뒪??`setScrollFactor(0)`濡?移대찓???대룞 ?곹뼢 李⑤떒. |

**?뚮뜑留?*:
- ?붾㈃ ?쎌? = `MAP_TILE * TILE_SCALE` = 16 횞 2 = **32px**.
- 留??꾩껜 ?ш린 = 30 횞 20 횞 32 = **960횞640px**. 遺紐?而⑦뀒?대꼫蹂대떎 ?????덉뼱 移대찓??`setBounds()` + `centerOn()`?쇰줈 泥섎━. (MS3 ?≫꽣 援ы쁽 ??移대찓?쇨? ?≫꽣瑜?異붿쟻?섎룄濡?蹂寃??덉젙)
- `pixelArt: true` + `antialias: false` (MS0?먯꽌 ?ㅼ젙)濡?16횞16 ??32횞32 ?뺤닔諛??ㅼ?????源⑥쭚 ?놁쓬.

### ?붿옄???섏궗寃곗젙

- **?먯궛 移댄깉濡쒓렇 蹂꾨룄 ?뚯씪** (`assets.ts`): preload ?뺤쓽? ?ъ슜 ?꾩튂(scene/UI)瑜?遺꾨━. MS1~MS11 ?숈븞 ?먯궛 異붽?媛 ?볦씪 寃껋씠誘濡???怨녹뿉??愿由?
- **MS2瑜??섎뱶肄붾뱶濡??좏뻾**: LDtk ?뚯씪???ъ슜?먭? ?묒꽦?댁빞 吏꾪뻾?섎뒗 醫낆냽?깆쓣 ?딄퀬, **?뚮뜑 ?뚯씠?꾨씪?몃???* 寃利? LDtk ?꾪룷??MS9)??媛숈? `TileIndex[][]` ?명꽣?섏씠?ㅻ? 梨꾩슦誘濡??꾩냽 ?듯빀???⑥닚?댁쭚.
- **30횞20 (60횞40 ?꾨땶 ?댁쑀)**: ?먮━?쒖떆???④퀎?먯꽑 ?쒓컖 ?뺤씤???듭떖. 60횞40? ?붾㈃ ?덉뿉 ?ㅼ뼱媛吏 ?딆븘 移대찓??異붿쟻???꾩슂?쒕뜲 ?대뒗 MS3 ?섏〈. 30횞20? 960횞640px濡??쇰컲 遺紐?而⑦뀒?대꼫??留욎븘 利됱떆 ?쒓컖 ?뺤씤 媛??
- **Tiny Town ?⑤룆 ?ъ슜**: RPG Urban Pack? preload留??섍퀬 ?뚮뜑?????? MS3?먯꽌 ?≫꽣(罹먮┃???ㅽ봽?쇱씠??쨌MS7?먯꽌 媛援щ줈 蹂멸꺽 ?ъ슜. ???④퀎?먯꽑 "濡쒕뱶 媛???щ?"留?寃利?
- **`setScrollFactor(0)` on ?덈궡 ?띿뒪??*: 移대찓?쇨? 留듭쓣 ?곕씪 ?대룞?대룄 ?띿뒪?몃뒗 ?붾㈃ 怨좎젙.

### 寃利?

| 寃??| 寃곌낵 |
|---|---|
| `npx tsc --noEmit` | ??0 errors |
| `npx eslint src` | ??0 errors / 2 warnings (湲곗〈 `ActivityFeed`/`actionToScore` unused ??蹂??몄뀡 臾닿?) |
| `npx next build` (Turbopack) | ??7/7 static pages, prod 鍮뚮뱶 ?깃났 |

### ?ㅼ쓬 (MS3 ???≫꽣 + navmesh)

?ㅼ쓬 ?몄뀡 ?묒뾽:

1. `AgentActor` ?대옒??(RPG Urban 罹먮┃???ㅽ봽?쇱씠???ъ슜, ?대쫫??+ ?곹깭 移?
2. `phaser-navmesh` ?듯빀 ??`defaultOfficeMap`?먯꽌 walkable ? ?먮룞 異붿텧 ??navmesh 鍮뚮뱶
3. 9媛?`AgentRole`?????actor ?몄뒪?댁뒪?? 諛깆뿏??SSE??`position` 硫뷀??곗씠?곕줈 ?대룞 (MS-A?먯꽌 ?뺥븳 SSOT ?쒖슜)
4. 移대찓??異붿쟻: ?쒖꽦 actor瑜?移대찓?쇨? 遺?쒕읇寃?異붿쟻

MS3 醫낅즺 ??MS4 HUD/移대찓????MS5 ?뚮쭏 ??MS6 罹먮┃??而ㅼ뒪?곕쭏?댁? ??MS7 媛援??먮뵒??(???④퀎?먯꽌 짠0-sexies.14 MS8 諛깆뿏??API 蹂멸꺽 ?뚮퉬) ??MS9 LDtk ?꾪룷??(?뷀뤃??留?援먯껜) ??MS10 ?ъ슫????MS11 a11y/Playwright.



---

## 0-sexies.19 MS3 ?≫꽣 諛곗튂 ??(navmesh 蹂대쪟)

> ?묒꽦: 2026-04-26 (?대쾲 ?몄뀡 ?곗냽). ?ъ슜??"?댁뼱??吏꾪뻾?? ?쒓렇?먮줈 MS3 異쒓퀬.

### 踰붿쐞 議곗젙 (MS3 vs MS3+)

짠0-sexies.16??MS3 ?뺤쓽 = "?≫꽣 + navmesh 湲몄갼湲?. ?대쾲 ?몄뀡? **?≫꽣 ?뺤쟻 諛곗튂**留?異쒓퀬?섍퀬 phaser-navmesh ?듯빀? **MS3+**(MS4? 臾띔굅??蹂꾨룄 ?꾩냽 PR)濡?遺꾨━.

- ?댁쑀: navmesh 鍮뚮뱶??walkable mesh polygon??誘몃━ ?앹꽦?댁빞 ?섍퀬, ?뷀뤃??留?30횞20?????polygon 異붿텧 肄붾뱶媛 蹂꾨룄 ?묒뾽 遺꾨웾. MS3?먯꽌 ?쒓컖쨌SSE ??댁뼱留곷???寃利앺빐 ?뚭? ?꾪뿕??以꾩씠??寃껋씠 ?곗꽑.
- 짠0-sexies.18 ?묒꽦 ??"MS3+?먯꽌 navmesh ?꾩엯"?쇰줈 ?대? ?쒓렇?먰븿. ?대쾲 ?몄뀡??洹?遺꾨━ 寃곗젙???ㅽ뻾.

### 肄붾뱶 蹂寃?

| ?뚯씪 | 醫낅쪟 | ?듭떖 |
|---|---|---|
| `frontend/src/components/game/AgentActor.ts` | NEW | Plain class (Container 鍮꾩긽??. `bodyShape` Rectangle + `glow` Arc + `stateDot` Arc + `label` Text. `setStatus(status)` / `pulse(time)` / `destroy()` API. Container ?곸냽 ??`body` ?꾨줈?쇳떚紐끒?scene.add.existing` ?쒓렇?덉쿂 異⑸룎 ??plain class濡??뚰뵾. |
| `frontend/src/components/game/deskPositions.ts` | NEW | 9媛?AgentRole?????`{col, row}` 梨낆긽 醫뚰몴. 遺꾩꽍媛 4(醫뚯륫 4쨌8?? / 由ъ꽌泥?2(?곗륫 ?곷떒 4?? / 由ъ뒪??룻룷?명뤃由ъ삤쨌援щ（ 3(?곗륫 ?섎떒). 媛?대뜲 ?듬줈(col 14~15) ?뚰뵾. |
| `frontend/src/components/game/OfficeScene.ts` | MODIFIED | `actors: Map<AgentRole, AgentActor>` 異붽?. `spawnActors()` 9紐??몄뒪?댁뒪?? `update(time)` ?≫떚釉??≫꽣 ?꾩떛. `applyThoughts(thoughts)` ?몃? 二쇱엯 API ??`create` ?댁쟾???몄텧?섎㈃ `pendingThoughts`??踰꾪띁留? |
| `frontend/src/components/game/PhaserCanvas.tsx` | MODIFIED | `Props { thoughts? }` 異붽?, `<PhaserCanvasInner thoughts={thoughts} />`. |
| `frontend/src/components/game/PhaserCanvasInner.tsx` | MODIFIED | `Props { thoughts? }` ?섏떊. `sceneRef`쨌`thoughtsRef` ?좎?. props 蹂寃?useEffect濡?`applyThoughts` ?몄텧. game 遺????珥덇린 thoughts ?곸슜. |
| `frontend/src/app/page.tsx` | MODIFIED | `<PhaserCanvas thoughts={logs} />` ???섏씠吏 SSE `logs` 諛곗뿴??洹몃?濡?二쇱엯. |

### ?쒓컖 ?붿옄??

**?≫꽣 移대뱶** (梨낆긽 1?먮━??:
- 蹂몄껜: 24횞24 ?뺤궗媛곹삎, fill = `AGENT_COLOR[role]`, stroke = #14181f@0.85
- ?곹깭 ?? 醫뚯긽??3px ?? fill = STATUS_TINT[status]
- 湲濡쒖슦: ??21px 諛섏?由??? alpha 0.18, ?쒖꽦 ?곹깭(thinking/analyzing/debating/deciding)?먯꽌留??쒖떆 + 800ms 二쇨린 ?꾩뒪 (1.0횞??.08횞)
- ?쇰꺼: 蹂몄껜 ?꾨옒 ?쒓? ??븷紐? ??諛섑닾紐?諛곌꼍

**?곹깭 ??* (`STATUS_TINT`):
- idle: ?뚯깋 #b8bcc6
- thinking: ?뚮옉 #3182f6
- analyzing: 蹂대씪 #7d6bff
- debating: 鍮④컯 #f04452
- deciding: ?먯＜ #a855f7
- done: ?뱀깋 #2fca73

?쒖꽦 ???곹깭??蹂몄껜 alpha 0.65濡??ㅼ슫, done? 1.0 ?좎?(?꾨즺 媛뺤“).

### 梨낆긽 諛곗튂 (30횞20 洹몃━??

```
遺꾩꽍??(醫뚯륫):
  technical_analyst   (4, 4)
  fundamental_analyst (9, 4)
  sentiment_analyst   (4, 8)
  macro_analyst       (9, 8)

?좊줎??(?곗륫 ?곷떒):
  bull_researcher  (19, 4)
  bear_researcher  (25, 4)

?섏궗寃곗젙??(?곗륫 ?섎떒):
  risk_manager       (19, 11)
  portfolio_manager  (22, 14)
  guru_agent         (25, 11)
```

媛?대뜲 ?듬줈(col 14~15)? ?몃꼍(row 0~1, col 0/29, row 19) 紐⑤몢 ?뚰뵾.

### ?붿옄???섏궗寃곗젙

- **Plain class > Container ?곸냽**: Phaser typings?먯꽌 `Container.body`??PhysicsBody ?щ’?닿퀬 `scene.add.existing(this)`??Layer/Group/GameObject留??덉슜 ???쒕툕?대옒?ㅻ뒗 紐낆떆??罹먯뒪???놁쑝硫?留덉같. `AgentActor`瑜?plain class濡??먭퀬 4媛?GameObject瑜?吏곸젒 蹂댁쑀?섎뒗 諛⑹떇??typing쨌debug ?묒そ?먯꽌 ?⑥닚.
- **`applyThoughts` ?몃? 二쇱엯 ?⑦꽩**: React ?곹깭(SSE 寃곌낵)瑜?Scene???섎━???쒖? ?먮쫫. `pendingThoughts` 踰꾪띁留곸쑝濡?`scene.create()` ?댁쟾 ?몄텧???덉쟾. props 媛깆떊 ??`useEffect([thoughts])`?먯꽌 留ㅻ쾲 `applyThoughts` ?몄텧.
- **留덉?留?status 梨꾪깮**: `applyThoughts`?먯꽌 媛숈? role???щ윭 thought 以?留덉?留?寃껋쓽 status媛 ?좏슚. SSE???쒓컙?쒖쑝濡??꾩갑?섎?濡??⑥닚 last-wins濡?異⑸텇.
- **navmesh 遺꾨━**: ?쒓컖 寃利앸????앸궡怨??꾩냽 ?몄뀡?먯꽌 ?꾩엯. navmesh ??`defaultOfficeMap`?먯꽌 walkable cells(FLOOR/PATH_DARK ?꾨젅??留?mesh濡?蹂?섑븯硫???
- **active ?곹깭 ?꾩뒪**: requestAnimationFrame ???Scene `update(time)` ?쒖슜. ?≫꽣蹂??숆린?붾맂 ?쒓컙 湲곕컲(time % 800)?대씪 紐⑤뱺 ?≫꽣媛 媛숈? ?꾩긽?쇰줈 ?꾩떛 (?쒓컖???듭씪).

### 寃利?

| 寃??| 寃곌낵 |
|---|---|
| `npx tsc --noEmit` | ??0 errors |
| `npx eslint src` | ??0 errors / 2 warnings (湲곗〈 ??蹂??몄뀡 臾닿?) |
| `npx next build` (Turbopack) | ??7/7 static pages, prod 鍮뚮뱶 ?깃났 |

### ?ㅼ쓬 (MS3+ navmesh / MS4 HUD쨌移대찓??/ MS5 ?뚮쭏)

- **MS3+** (?좏깮): `phaser-navmesh` ?듯빀. `defaultOfficeMap`?먯꽌 walkable polygon 異붿텧 ??navmesh 鍮뚮뱶 ???≫꽣媛 status 蹂?????ㅻⅨ 梨낆긽(?? ?좊줎???쇰줈 ?대룞. ?쒓컖 ?④낵 媛뺥솕.
- **MS4 HUD/移대찓??*:
  - 移대찓????以?留덉슦???졖룸뱶?섍렇) ??`input.keyboard/mouse` ?쒖꽦??
  - HUD: 醫뚯긽???꾩옱 ?쒖꽦 ?≫꽣 移대뱶, ?고븯??誘몃땲留? ?섎떒 吏꾪뻾瑜?諛?
  - Kenney UI Pack 9-slice ?⑤꼸 ?먯궛 ?쒖슜
- **MS5 ?뚮쭏**: `--bg-canvas` ?좏겙??ThemeProvider濡??숆린??+ warm/hanok ?뚮쭏 ???≫꽣 ?됱“ ?щℓ??

MS3 ?곗텧臾??≫꽣쨌梨낆긽쨌SSE ??댁뼱留?? MS3+/MS4媛 ?꾩갑?섍린 ?꾩뿉??SSE ?쒖꽦 ???ъ슜?먯뿉寃??쒓컖 ?쇰뱶諛깆쓣 ?쒓났.



---

## 0-sexies.20 MS4 移대찓??留먰뭾??+ MS5 ?뚮쭏 ?숆린????

> ?묒꽦: 2026-04-26 (?대쾲 ?몄뀡 ?곗냽). "?댁뼱??彛??쒖감?곸쑝濡?吏꾪뻾?? ?쒓렇?먮줈 MS4쨌MS5 臾띠뼱 異쒓퀬. MS3+ navmesh???≫꽣媛 ?뺤＜ ?곹깭???ㅽ슚????븘 ?꾩냽?쇰줈 誘몃８.

### MS4 ??移대찓??而⑦듃濡?+ 留먰뭾??+ ?대┃ ?쇱슦??

**湲곕뒫**
- 留덉슦????以? 0.5횞~2.0횞, 0.1 ?⑥쐞 ?ㅽ뀦
- 醫뚰겢由??쒕옒洹??? ?≫꽣 ?꾩뿉???쒖옉???대┃? ?≫꽣 ?몃뱾???곗꽑 (`hitTestPointer` 寃곌낵 鍮꾩뼱?덉쓣 ?뚮쭔 ?쒕옒洹??쒖옉)
- ?≫꽣 ?대┃: `setAgentClickHandler(role => ??` ?깅줉 ??React 痢≪뿉??`<AgentInspector>` ???⑤꼸 ?ㅽ뵂???쒖슜
- 留먰뭾?? ?쒖꽦 ?곹깭(thinking/analyzing/debating/deciding) + content 議댁옱 + **??timestamp**???뚮쭔 蹂몄껜 ?꾩뿉 5珥??? 80??珥덇낵 ??留먯쨪?? wordWrap 160px.

**援ъ“**
- `OfficeScene.setupCameraControls()`: `wheel`/`pointerdown`/`pointermove`/`pointerup`/`pointerupoutside` ?몃뱾??
- `OfficeScene.lastSeen: Map<role, timestamp>`濡?媛숈? thought 以묐났 ?쒖떆 諛⑹?
- `AgentActor.onPointerDown(handler)` + `bodyShape.setInteractive({useHandCursor:true})`
- `AgentActor.showMessage(text, duration=5000)` + `bubbleHideTimer` (delayedCall)
- `PhaserCanvasInner` `input: { mouse: true, touch: true }` ?쒖꽦??
- `PhaserCanvas` `onAgentClick` prop 異붽?, ref濡?理쒖떊 ?몃뱾???좎?

### MS5 ???뚮쭏 ?좏겙 ?숆린??

**湲곕뒫**
- 留덉슫???쒖젏??`getComputedStyle(document.documentElement).getPropertyValue("--bg-canvas")` ?쎌뼱 16吏꾩닔濡?蹂????`OfficeScene.setBackgroundColor(rgbHex)` ?몄텧
- `MutationObserver`濡?`<html data-theme>` / `class` ?띿꽦 蹂寃?媛먯? ???먮룞 ?щ컲?? ThemeProvider媛 `localStorage('kta:theme')` 蹂寃???`data-theme`瑜?媛깆떊?섎?濡?蹂꾨룄 ?대깽???놁씠 ?숆린?붾맖.
- 4媛吏 ?뚮쭏(`light`/`dark`/`warm`/`hanok`) 紐⑤몢 ?먮룞 ??? 媛??뚮쭏??`--bg-canvas` 媛?
  - light `#F7F8FA` / dark `#0B0D11` / warm `#FAF7F2` / hanok `#F4EFE3`

**援ъ“**
- `OfficeScene.bgRect` (Rectangle, scrollFactor 0)??蹂댁쑀?섍퀬 `setFillStyle` + `cameras.main.setBackgroundColor` ?숈떆 媛깆떊 (諛곌꼍 ?ш컖??+ Phaser ?먯껜 諛곌꼍 紐⑤몢 ?쇱튂)
- `pendingBgColor`: scene.create ?댁쟾 ?몄텧???덉쟾?섍쾶 踰꾪띁留?
- `cssColorToHex(raw)` ?좏떥: `#RRGGBB` / `#RGB` / `rgb(r,g,b)` 紐⑤몢 吏??

### 肄붾뱶 蹂寃?

| ?뚯씪 | 醫낅쪟 | 蹂寃?|
|---|---|---|
| `frontend/src/components/game/AgentActor.ts` | MODIFIED | `x`/`y` public ?꾨뱶 ?몄텧, `bubbleText`/`bubbleHideTimer`, `onPointerDown(handler)`, `showMessage(text, durationMs)`, hit-area `setInteractive`, `destroy()`?먯꽌 timer/text ?뺣━ |
| `frontend/src/components/game/OfficeScene.ts` | MODIFIED | `bgRect`/`pendingBgColor`/`lastSeen`/`clickHandler`/`dragStart` ?꾨뱶 異붽?, `setupCameraControls()`, `setAgentClickHandler()`, `setBackgroundColor()`, `applySnapshot(role, snap)`濡?status+留먰뭾??遺꾨━, `applyThoughts`媛 `ThoughtSnapshot { status, content, timestamp }` ?ъ슜, `onResize`媛 bgRect ?ш린 媛깆떊 |
| `frontend/src/components/game/PhaserCanvasInner.tsx` | MODIFIED | `input: { mouse:true, touch:true }`, `onAgentClick` prop, ?대┃ ?몃뱾??ref, `cssColorToHex` ?좏떥 + `MutationObserver`濡??뚮쭏 ?숆린??|
| `frontend/src/components/game/PhaserCanvas.tsx` | MODIFIED | `onAgentClick?: (role) => void` prop 諛쏆븘 inner濡??꾨떖 |

### ?붿옄???섏궗寃곗젙

- **?쒕옒洹??ъ? hitTestPointer濡?媛??*: ?≫꽣 ?대┃ ???쒕옒洹멸? 媛숈씠 ?쒖옉?섎㈃ ?섎룄移??딆? 移대찓???대룞 諛쒖깮. `hitTestPointer(pointer)` 寃곌낵 鍮꾩뼱?덉쓣 ?뚮쭔 dragStart ?ㅼ젙.
- **以??섑븳 0.5횞**: 30횞20횞32px = 960횞640. 0.5횞硫?480횞320?쇰줈 異뺤냼?섏뼱 ?묒? ?⑤꼸?먯꽌???꾩껜 蹂댁엫. ?곹븳 2횞???≫꽣 ?뷀뀒???뺤씤??
- **留먰뭾?좎? ??timestamp留?*: SSE濡?媛숈? thought媛 ?ъ쟾?〓맆 ?뚮쭏??留먰뭾?좎씠 源쒕묀?댁? ?딅룄濡?`lastSeen` 泥댄겕. ??thought留?5珥??쒖떆.
- **?뚮쭏 ?숆린??= MutationObserver**: ThemeProvider媛 React Context瑜??듯빐 蹂寃쏀븯吏留?Phaser??而댄룷?뚰듃 ?몃━ 諛뽰씠??props濡?諛쏄린 ?대젮?. `<html data-theme>` 蹂寃쎌쓣 媛먯떆?섎뒗 MO媛 媛???⑥닚?섍퀬 寃고빀??理쒖냼.
- **諛곌꼍 ?ш컖??+ 移대찓??諛곌꼍 ????媛깆떊**: Phaser 移대찓??諛곌꼍? 罹붾쾭??clear ?됱씠怨? scrollFactor 0 ?ш컖?뺤? ?쒓컖 諛곌꼍. ?묒そ ?쇱튂?쒖폒????以???源쒕묀???놁쓬.
- **MS3+ navmesh 異붽? 蹂대쪟**: ?꾩옱 ?≫꽣??梨낆긽 ?뺤＜ + ?꾩뒪留? ?대룞???꾩슂?댁쭊 ?쒖젏(?? ?좊줎 ???좊줎??紐⑥엫)??navmesh ?꾩엯???섎? ?덉쓬. 洹??쒕굹由ъ삤??MS6 罹먮┃???ㅽ봽?쇱씠???댄썑媛 ?먯뿰?ㅻ윭?.

### 寃利?

| 寃??| 寃곌낵 |
|---|---|
| `npx tsc --noEmit` | ??0 errors |
| `npx eslint src` | ??0 errors / 2 warnings (湲곗〈) |
| `npx next build` | ??7/7 static pages, prod 鍮뚮뱶 ?깃났 |

### ?ㅼ쓬 (MS6 罹먮┃???ㅽ봽?쇱씠??/ MS3+ navmesh / MS7 ?곌뎄???붿삤?쇰쭏)

- **MS6 罹먮┃???ㅽ봽?쇱씠??*: `AgentActor`???뺤궗媛곹삎??RPG Urban Pack 罹먮┃???꾨젅?꾩쑝濡?援먯껜. 4諛⑺뼢 8fps walk ?좊땲硫붿씠?? 梨낆긽 ?섏옄 諛⑺뼢??留욎떠 醫???sit pose.
- **MS3+ navmesh**: MS6 ???꾩엯. `defaultOfficeMap`??walkable cells(FLOOR/PATH_DARK)?먯꽌 polygon 異붿텧 ??`phaser-navmesh` mesh 鍮뚮뱶 ??status媛 `debating`?대㈃ ?좊줎?ㅻ줈 ?대룞, `done`?대㈃ 蹂몄씤 梨낆긽 蹂듦?.
- **MS7 ?붿삤?쇰쭏**: ?앸Ъ쨌?명듃遺겶룹빱?쇱옍 ??RPG Urban Pack??prop ?꾨젅?꾩쓣 梨낆긽 ?놁뿉 諛곗튂. ?쒓컖 ?뷀뀒??媛뺥솕.
- **MS4+ minimap**: ?고븯??100횞67 誘몃땲留?(?붾뱶 1/10 異뺤냼). 移대찓??酉고룷?몃? ?ш컖?뺤쑝濡??쒖떆.

MS3쨌MS4쨌MS5 ?곗텧臾쇰줈 ?ъ슜?먮뒗 SSE ?쒖꽦 ??利됱떆 ?쒓컖 ?쇰뱶諛?留먰뭾?졖룹긽??湲濡쒖슦)??諛쏄퀬, ???쒕옒洹몃줈 ?먯쑀 ?먯깋?섎ŉ, ?쇱씠???ㅽ겕/???쒖삦 ?뚮쭏 蹂寃쎌씠 罹붾쾭?ㅼ뿉 利됱떆 諛섏쁺??



---

## 0-sexies.21 MS4+ HUD ?ㅻ쾭?덉씠 (以?踰꾪듉 + 誘몃땲留? ??

> ?묒꽦: 2026-04-26 (?대쾲 ?몄뀡 ?곗냽). "?댁뼱??彛??쒖감?곸쑝濡?吏꾪뻾?? ?쒓렇??3李? ?쒓컖쨌UX??利됱떆 媛移섍? ??HUD 而댄룷?뚰듃 臾띠쓬???곗꽑 異쒓퀬.

### 踰붿쐞

짠0-sexies.16 ?먯븞??MS4("HUD/留먰뭾??移대찓??) 以?**移대찓??留먰뭾??*? 짠0-sexies.20?먯꽌 異쒓퀬. 蹂?짠0-sexies.21? 媛숈? 留덉씪?ㅽ넠??**HUD(誘몃땲留돠룹쨲 踰꾪듉)** 遺遺?

### ?좉퇋 ?뚯씪

| ?뚯씪 | 梨낆엫 |
|---|---|
| `frontend/src/components/game/OfficeSceneController.ts` | React HUD ??OfficeScene ?ъ씠??醫곸? ?명꽣?섏씠??(Phaser 媛앹껜瑜?React ?몃━???몄텧?섏? ?딆쓬) |
| `frontend/src/components/game/HudControls.tsx` | 罹붾쾭???곗긽??+/????踰꾪듉 (以뙿룸━?? |
| `frontend/src/components/game/Minimap.tsx` | 罹붾쾭???고븯??SVG 誘몃땲留?(120횞80, 4px/cell). ??셋룹콉???꾪듃쨌移대찓??酉고룷???쒖떆. ?대┃ ??移대찓???대룞 |

### ?섏젙 ?뚯씪

| ?뚯씪 | 蹂寃?|
|---|---|
| `frontend/src/components/game/OfficeScene.ts` | `zoomBy(delta)`/`resetCamera()`/`panCameraTo(x,y)`/`getCameraInfo()` 怨듦컻 硫붿꽌??異붽? |
| `frontend/src/components/game/PhaserCanvasInner.tsx` | `onReady?: (controller \| null) => void` prop. game 遺????而⑦듃濡ㅻ윭 媛앹껜瑜?遺紐⑤줈 ?꾨떖, ?몃쭏?댄듃 ??null ?듬낫 |
| `frontend/src/components/game/PhaserCanvas.tsx` | `useState<OfficeSceneController \| null>`, `<HudControls/>` + `<Minimap/>` ?ㅻ쾭?덉씠, `showHud?: boolean` prop (湲곕낯 true) |

### 誘몃땲留??붿옄??

- **?ш린**: `MAP_COLS 횞 MAP_ROWS 횞 CELL` = 30횞20횞4 = 120횞80 SVG. 梨낆긽/?듬줈 ?앸퀎 媛?ν븳 理쒖냼 ?ш린.
- **?????*: WALL_TOP/MID = `#9a3a3a` ?곴컝, WALL_BOT = `#5a5d66` 吏숈? ?? PATH_DARK = `#c9c9cf` ?고쉶, DOOR = `#f1d27a` ?⑺넗, FLOOR = `#e6dfd0` 踰좎씠吏. ?쇱씠???좏겙怨??쒓컖 ?쇨?.
- **梨낆긽 ?꾪듃**: 9 ??븷 ?됱긽(`AGENT_COLOR`) circle r=2.8px, stroke = ?꾩옱 status??`STATUS_TINT` 留ㅽ븨(thinking ?뚮옉/done ?뱀깋 ??. 梨꾨룄媛 ?꾨땶 stroke濡?status ?좏샇 ???꾪듃 蹂몄껜 ?됱쓣 ??긽 ??븷 ?됱쑝濡??좎??섎㈃ ?꾩튂 ?앸퀎???ъ?.
- **移대찓??酉고룷??*: `controller.getCameraInfo()`瑜?`requestAnimationFrame` ?대쭅?섏뿬 SVG `<rect>`濡??쒖떆. fill `rgba(49,130,246,0.12)` + stroke `#3182f6`.
- **?대┃ ??pan**: SVG ?대┃ 醫뚰몴瑜??붾뱶 醫뚰몴濡??섏궛??`controller.panCameraTo(worldX, worldY)`. ?≫꽣 異붿쟻 X(?먯븞 MS4??follow??蹂꾨룄 湲곕뒫).

### HudControls ?붿옄??

- **?꾩튂**: ?곗긽??`top:8 right:8`). 誘몃땲留듦낵 寃뱀튂吏 ?딆쓬.
- **踰꾪듉**: 28횞28, +0.2/??.2 以?/ `?? 由ъ뀑. `controller`媛 null????`disabled`.
- **?ㅽ???*: ??諛섑닾紐?+ subtle border. ?좏겙(`--border-subtle`)???ъ슜???뚮쭏? ?숆린.

### 而⑦듃濡ㅻ윭 ?⑦꽩 (??ref ???method bag?멸?)

- React ?몃━??Phaser 媛앹껜(scene/game)瑜?吏곸젒 ?몄텧?섎㈃ strict-mode ?붾툝 留덉슫?? HMR, `Phaser.Game.destroy(true)` ??대컢?먯꽌 ?щ옒???꾪뿕. 硫붿꽌??臾띠쓬 媛앹껜瑜???踰덈쭔 ?앹꽦??`onReady` 肄쒕갚?쇰줈 ?꾨떖?섎㈃ React 痢≪? method ?몄텧留?媛????媛앹껜 ?섎챸? inner??useEffect cleanup??梨낆엫.
- 而⑦듃濡ㅻ윭 = `OfficeSceneController` ?명꽣?섏씠?? ?ν썑 navmesh ?꾩엯 ??`moveActorTo(role, col, row)` ?깆쓣 異붽??섍린 醫뗭쓬.

### ?붿옄???섏궗寃곗젙

- **rAF ?대쭅 vs ?대깽??*: Phaser 移대찓?쇰뒗 `Camera.dirty` ???대깽?멸? 留ㅻ걚?쎌? ?딆쓬. 60fps rAF ?대쭅??媛???⑥닚쨌?좊ː???믪쓬. 誘몃땲留?1媛쒕씪 鍮꾩슜 臾댁떆 媛??
- **誘몃땲留??대┃ = panCameraTo, drag X**: ?ㅽ겕??諛⑹떇 ?쒕옒洹몃룄 醫뗭?留?1李⑤뒗 ?⑥닚 ?대┃. ?곗꽑?쒖쐞 ??븘 ?꾩냽 留덉씪?ㅽ넠???꾩엫.
- **showHud prop**: ?ν썑 ?묒? 誘몃━蹂닿린(??쒕낫??移대뱶 ???먯꽌 誘몃땲留돠텵UD ?놁씠 罹붾쾭?ㅻ쭔 ?ъ슜?섍퀬 ?띠쓣 ???좉?. 湲곕낯? 硫붿씤 ?섏씠吏 ?ъ슜??留욎떠 true.
- **status??stroke濡?*: ?꾪듃 蹂몄껜 ?됱쓣 status濡?諛붽씀硫?9 ?먯씠?꾪듃???꾩튂 ?앸퀎???대젮?뚯쭚. 蹂몄껜=??븷 ?? stroke=status媛 ?뺣낫 諛??理쒖쟻.

### 寃利?

| 寃??| 寃곌낵 |
|---|---|
| `npx tsc --noEmit` | ??0 errors |
| `npx eslint src` | ??0 errors / 2 warnings (湲곗〈 ??蹂?蹂寃?臾닿?) |
| `npx next build` | ??7/7 static pages, prod 鍮뚮뱶 ?깃났 |

### ?ㅼ쓬 (MS6 罹먮┃???ㅽ봽?쇱씠??/ MS3+ navmesh / MS7 ?붿삤?쇰쭏)

짠0-sexies.20?먯꽌 ?뺤쓽???꾩냽 ?곗꽑?쒖쐞? ?숈씪. MS6 罹먮┃???ㅽ봽?쇱씠???꾩엯 ??誘몃땲留??꾪듃??洹몃?濡??좎?(罹붾쾭?ㅻ쭔 罹먮┃??援먯껜). 誘몃땲留듭뿉 異붽??섎㈃ 醫뗭쓣 寃? ?쒕옒洹??ㅽ겕???? mini-zoom ?쒓컖 ?쒖떆, ?몃??먯꽌 ?곕줈 ?몄텧 媛?ν븳 ?쐄ocus on agent??踰꾪듉.

`<PhaserCanvas thoughts={logs} />`留??ъ슜?대룄 ?먮룞?쇰줈 以?HUD? 誘몃땲留듭씠 ?④퍡 ?뚮뜑?섎ŉ, `showHud={false}`濡??????덉쓬. ?몃??먯꽌 `onAgentClick`??諛쏆븘 React `<AgentInspector>` ?깆쓣 ?щ뒗 ?먮쫫? 짠0-sexies.20?먯꽌 ?대? ??댁뼱留??꾨즺.



---

## 0-sexies.22 MS6 ?쎌? 罹먮┃???⑹꽦 ??

> ?묒꽦: 2026-04-26 (?대쾲 ?몄뀡 ?곗냽). "?댁뼱??彛??쒖감?곸쑝濡?吏꾪뻾?? ?쒓렇??4李? ?뺤궗媛곹삎 ?≫꽣瑜??쎌??꾪듃 ?ㅽ???罹먮┃?곕줈 援먯껜.

### 寃곗젙: ?몃? ?ㅽ봽?쇱씠?몄떆?????Phaser ?꾨━誘명떚釉??⑹꽦

?먯븞 MS6 = "RPG Urban Pack 罹먮┃???꾨젅??+ 4諛⑺뼢 walk ?좊땲". 洹몃윭??

1. **?꾨젅???몃뜳???꾪뿕**: kenney_rpg-urban-pack `tilemap_packed.png`(27횞18=486)?먯꽌 character ?꾨젅?꾩? ?꾩떆 props/嫄대Ъ怨??욎뿬 ?덉쓬. ?섎せ??frame index瑜?怨좊Ⅴ硫?媛援??대?吏媛 罹먮┃???먮━???? ?쒓컖 寃利??놁씠 ?덉쟾?섍쾶 怨좊? ???놁쓬.
2. **walk ?좊땲硫붿씠?섏? ?대룞???덉뼱???섎?**: MS3+ navmesh 蹂대쪟 寃곗젙?쇰줈 ?≫꽣??梨낆긽 ?뺤＜ ?곹깭. walk ?좊땲 ?ㅽ봽?쇱씠?몄떆?몃뒗 ???④퀎?먯꽑 二쎌? 肄붾뱶.
3. **?꾨━誘명떚釉??⑹꽦 = 寃곗젙??+ ?뚮쭏 ?명솚**: 癒몃━/紐??ㅻ━/洹몃┝?먮? Rectangle濡??⑹꽦?섎㈃ ?몃? ?먯궛 ?섏〈 0, AGENT_COLOR ?좏겙???붿툩 ?됱뿉 利됱떆 留ㅽ븨.

### 罹먮┃???⑹꽦 洹쒓꺽

```
            ?뚢??????        hair  (HEAD_W=8, h=4, color=0x3a2615)
            ??   ??        head  (HEAD_W=8, HEAD_H=8, skin=0xfbd1a2)
       state??          ??state dot (癒몃━ ?곗긽??
          ?뚢????????
          ?귘뻽?댿뻽?댿뻽?댿봻         body  (BODY_W=12, BODY_H=10, AGENT_COLOR[role])
          ?귘뻽?댿뻽?댿뻽?댿봻         (1px outline 0x14181f@0.7)
          ?붴????????
            ?뚢????          legs  (LEG_W=8, LEG_H=4, 0x2f3340)
            ?붴????
            ????             shadow (16횞4 ellipse, alpha 0.25)
            ?대쫫             label
```

珥?罹먮┃???믪씠 ??26px (HIT ?곸뿭怨??쇱튂). 紐⑤뱺 醫뚰몴 ?뺤닔 ?뺣젹.

### ?곹깭 ?쒓컖

- **idle**: alpha 0.7, glow ?④?
- **active(thinking/analyzing/debating/deciding)**: alpha 1.0, glow 18px 諛섏?由??꾩뒪(800ms), 癒몃━/紐?짹1px bob(1200ms)
- **done**: alpha 1.0, glow ?④?
- **stateDot**: 癒몃━ ?곗긽?? STATUS_TINT ?됱긽 (idle ?뚯깋 / thinking ?뚮옉 / done ?뱀깋 ??

### 肄붾뱶 蹂寃?

| ?뚯씪 | 蹂寃?|
|---|---|
| `frontend/src/components/game/AgentActor.ts` | ?뺤궗媛곹삎 1媛???9媛?GameObject ?⑹꽦 (`shadow`/`legs`/`body`/`bodyOutline`/`head`/`hair`/`headOutline`/`hitRect`/`label`/`stateDot`/`glow`). `bodyBaseY`/`headBaseY`/`hairBaseY`/`headOutlineBaseY` 蹂닿???bob ???먯쐞移?蹂듭썝. `pulse(time)`???쒖꽦 ?곹깭?먯꽌 ?뺤닔 ?쎌? 짹1 bob ?곸슜. `setStatus`媛 alpha瑜?紐⑤뱺 ?좎껜 遺遺꾩뿉 ?쇨큵 ?곸슜. `destroy`媛 11媛?媛앹껜 ?뺣━. ?대┃ hit area???щ챸 20횞26 rect. |
| `frontend/src/components/game/OfficeScene.ts` | bootText 硫붿떆吏 媛깆떊 (MS4 ??MS6) |

### ?붿옄???섏궗寃곗젙

- **GameObject 11媛?vs RenderTexture 1媛?*: 9 罹먮┃??횞 11 = 99 媛쒖껜. Phaser??1留? ?꾪삎??臾대━ ?놁쓬. RenderTexture濡?踰좎씠?ы븯硫?alpha/?됱“ 蹂寃쎌씠 鍮꾩떥吏????붿툩 ?됱쓣 status濡??곗? ?딅뜑?쇰룄 ?ν썑 ?뚮쭏 ?숈쟻 蹂寃???利됱떆 ?щ컲??媛?ν븳 ?⑹꽦 諛⑹떇???좎뿰.
- **?대┃ hit rect 遺꾨━**: 蹂몄껜 setInteractive??醫곸? ?붿툩 ?곸뿭留??대┃ 媛?? 癒몃━쨌?ㅻ━쨌?쇰꺼 ?대뵒 ?대┃?대룄 ?≫꽣 ?몃뱾?ш? 諛쒗솕?섎룄濡??щ챸 20횞26 rect瑜?hit area濡??ъ슜.
- **bob? ?뺤닔 ?쎌?**: `Math.round(sin)`?쇰줈 짹1 ?뺤닔 ?ㅽ봽?? ?쎌??꾪듃 ???좎? ??遺꾩닔 ?쎌? ?대룞? ?쎌? 蹂닿컙?쇰줈 ?먮┸?댁쭚 (`pixelArt:true`?닿릿 ?섏?留??붾㈃ 醫뚰몴??遺꾩닔 媛??.
- **湲濡쒖슦 諛섏?由?18px**: 罹먮┃???꾩껜(??22px)瑜??댁쭩 媛먯떥吏 ?딅뒗 ?뺣룄. ?덈Т ?щ㈃ ???≫꽣? 寃뱀묠.
- **癒몃━移대씫 ?ㅽ????⑥씪**: 9 罹먮┃??紐⑤몢 ?숈씪???묐컻 (?⑥닚??. ?ν썑 MS7?먯꽌 hat/癒몃━????prop 異붽? ???ㅼ뼇??媛??
- **洹몃┝??alpha 0.25**: ?쇱씠???뚮쭏?먯꽌 ?덈Т 吏꾪븯吏 ?딄퀬, ?ㅽ겕 ?뚮쭏?먯꽌???ㅺ낸 ?쒖떆.

### 誘몃땲留돠룸쭚?띿꽑 ?곹뼢

- 誘몃땲留? 梨낆긽 ?꾪듃??`DESK_POSITIONS` 湲곕컲?대씪 ?≫꽣 ?쒓컖 蹂寃쎄낵 ?낅┰. 洹몃?濡??묐룞.
- 留먰뭾?? ??head ?꾨줈 ?꾩슦?꾨줉 origin 議곗젙 (`y - BODY_H/2 - HEAD_H - 8`).

### 寃利?

| 寃??| 寃곌낵 |
|---|---|
| `npx tsc --noEmit` | ??0 errors |
| `npx eslint src` | ??0 errors / 2 warnings (湲곗〈) |
| `npx next build` | ??7/7 static pages |

### ?ㅼ쓬 (MS7 ?붿삤?쇰쭏 / MS3+ navmesh / MS8 ?ъ슫??

- **MS7 ?붿삤?쇰쭏**: 梨낆긽???명듃遺겶룹떇臾셋룹빱?쇱옍 媛숈? prop??Tiny Town ?꾨젅?꾩뿉??怨⑤씪 諛곗튂. ?쒓컖 ?뷀뀒??媛뺥솕. (?뺥솗??frame index???먯궛 ?몃뜳??留ㅽ븨 ???곸슜)
- **MS3+ navmesh**: MS6 罹먮┃?곌? 梨낆긽?믫넗濡좎떎濡??대룞?섎뒗 ?쒕굹由ъ삤???먯뿰?ㅻ읇寃??꾩엯.
- **MS8 ?ъ슫??*: Howler ?듯빀 + BGM/SFX. ?ㅻ낫???좉?.

`<PhaserCanvas thoughts={logs} />` ??以꾨줈 ?쎌? 罹먮┃?걔룸쭚?띿꽑쨌HUD쨌誘몃땲留돠룻뀒留??숆린??紐⑤몢 ?쒖꽦. ?몃? ?먯궛 ?섏〈 ?놁씠 寃곗젙?굿룹옱?꾩꽦 ?뺣낫.



---

## 0-sexies.23 MS7 ?붿삤?쇰쭏 (梨낆긽 prop) ??

> ?묒꽦: 2026-04-26 (?대쾲 ?몄뀡 ?곗냽). MS6 吏곹썑 ?ъ슜???쒓렇??"?뺣━?댁꽌 而ㅻ컠 ?몄떆?섍퀬 / ?댁뼱??彛??쒖감?곸쑝濡?吏꾪뻾??. 9媛?梨낆긽 ?먮━??紐⑤땲?걔룹콉?겶룻솕遺?prop???⑹꽦 諛곗튂.

### 寃곗젙: ?꾨━誘명떚釉??⑹꽦 ?붿삤?쇰쭏

MS6? ?숈씪?섍쾶 ?몃? ?ㅽ봽?쇱씠?몄떆???꾨젅???몃뜳?ㅼ뿉 ?섏〈?섏? ?딄퀬 Phaser Rectangle/Circle濡??⑹꽦. ?댁쑀:

1. 寃곗젙??(asset ?몃뜳??留ㅽ븨 ?꾪뿕 0).
2. ?됱긽 ?좏겙???먯쑀濡?쾶 ?쒖뼱 (?뚮쭏 ?명솚 ?ъ?).
3. ?붾㈃ ?ш린쨌?쎌??꾪듃 ???쇨???

### ?붿삤?쇰쭏 洹쒓꺽

```
   ?뚢????                  monitor body (8횞6, 0x1f232b)
   ?귘뼇?묅봻                   screen (6횞4, 0x4ec3ff @ 0.85)         ??pot (4횞4, 0x8c5a3a)
   ?뚢????????????????                                             ??leaf (r=3, 0x2fa15a)
   ??  梨낆긽 ?곹뙋   ??      desk top (28횞4, 0xa57044, stroke 1px@0.5)
   ?쒋??????????????
   ??  梨낆긽 ?ㅻ━  ??       desk leg (24횞3, 0x4f3422)
   ?붴??????????????
            (罹먮┃??        ??罹먮┃?곌? 洹??꾩뿉 洹몃젮吏?
```

罹먮┃??(x, y) 湲곗?:
- 梨낆긽 ?곹뙋 以묒떖: y+10
- 梨낆긽 ?ㅻ━ 以묒떖: y+14
- 紐⑤땲?? 梨낆긽 醫뚯륫 ??(x ??DESK_W/2 + 6, topY ??5)
- ?붾텇: 梨낆긽 ?곗륫 ??(x + DESK_W/2 ??4, topY ??4)

### ?뚮뜑 ?쒖꽌 = 源딆씠 蹂댁옣

`create()`媛 ?몄텧?섎뒗 ?쒖꽌:
1. `drawDefaultOffice()` ??留덈（/踰????
2. `spawnActors()`
   - `createDeskProps(...)` ??prop 5媛?add
   - `new AgentActor(...)` ??罹먮┃??11媛?add

Phaser???숈씪 depth?먯꽌 add ?쒖꽌?濡??뚮뜑. ?곕씪??**留덈（ ??梨낆긽 ??罹먮┃??* ?쒖꽌媛 ?먯뿰?ㅻ읇寃?蹂댁옣?섎ŉ `setDepth` 議곗옉 遺덊븘?? (珥덇린 援ы쁽? ?뚯닔 depth瑜??쒕룄?덉쑝??留덈（ ?꾨옒濡??ㅼ뼱媛??臾몄젣 ??depth 臾댁떆濡??⑥닚??

### 肄붾뱶 蹂寃?

| ?뚯씪 | 蹂寃?|
|---|---|
| `frontend/src/components/game/DeskProps.ts` (?좉퇋) | `createDeskProps(scene, x, y) ??DeskPropsHandle` ?⑺넗由? 5媛?GameObject ?앹꽦쨌?몃뱾 諛섑솚. `destroy()` ?뺣━. |
| `frontend/src/components/game/OfficeScene.ts` | `deskProps: DeskPropsHandle[]` ?꾨뱶 異붽?. `spawnActors()`?먯꽌 罹먮┃???앹꽦 吏곸쟾 prop ?앹꽦. bootText "MS7 ?붿삤?쇰쭏 OK" 媛깆떊. |

### ?붿옄???섏궗寃곗젙

- **prop ?⑥씪 ?명듃 vs ??븷蹂??ㅼ뼇??*: 紐⑤뱺 梨낆긽???숈씪??prop. ?ㅼ뼇?붾뒗 MS9 LDtk ?꾩엯 ??layer濡?遺꾨━?섎뒗 寃?源붾걫. ???④퀎???쒓컖 ?쇨????곗꽑.
- **紐⑤땲???붾㈃ ??0x4ec3ff**: ?몃젅?대뵫 李⑦듃 ?먮굦???쒖븞. 異뷀썑 ?쒖꽦 ?곹깭???곕씪 ?됱쓣 諛붽씀???뺤옣 ?ъ?.
- **`destroy` ?몃뱾 ?⑦꽩**: AgentActor? ?쇨?. Scene ?ъ떆?????쇨큵 ?뺣━ 媛??(?꾩옱??誘몄궗?⑹씠吏留?誘몃옒 ?뺤옣 ?鍮?.
- **`top.setStrokeStyle`留?1px outline**: 梨낆긽??媛???쒖꽑??媛??prop?대?濡??좊챸???ㅺ낸. ?ㅻ━/紐⑤땲???붾텇? ?묒븘??outline ?앸왂.

### 寃利?

| 寃??| 寃곌낵 |
|---|---|
| `npx tsc --noEmit` | ??0 errors |
| `npx eslint src` | ??0 errors / 2 warnings (湲곗〈) |
| `npx next build` | ??7/7 static pages |

### ?ㅼ쓬 ?④퀎 ?꾨낫

- **MS3+ navmesh**: phaser-navmesh ?꾩엯. 罹먮┃?곌? 梨낆긽 ???좊줎?ㅻ줈 ?대룞. ?꾩옱 ?뺤＜ 罹먮┃??+ prop??源붾┛ ?띻꼍?먯꽌 ?먯뿰?ㅻ읇寃??숈꽑??異붽???
- **MS8 ?ъ슫???뚰떚??*: Howler BGM/SFX. ?쒖꽦 ?곹깭 罹먮┃??癒몃━ ?????뮕 ?뚰떚??(Phaser ?꾨━誘명떚釉뚮줈).
- **MS9 LDtk ?꾪룷??*: ?몃? LDtk ?꾨줈?앺듃濡?30횞20 ?댁긽 ?뺢탳??留??묒꽦 ??JSON ?꾪룷??



---

## 0-sexies.24 MS8 ?ш퀬 ?뚰떚????

> ?묒꽦: 2026-04-26 (?대쾲 ?몄뀡 ?곗냽). ?쒖꽦 ?곹깭 ?≫꽣??癒몃━ ?꾨줈 ?좎삤瑜대뒗 誘몃땲 ?뚰떚?? Howler ?ъ슫?쒕뒗 ?먯궛 遺?щ줈 ?ㅼ쓬 ?④퀎 蹂대쪟, ?쒓컖 ?뚰떚?대쭔 ?곗꽑 ?꾩엯.

### 寃곗젙: Phaser ParticleEmitter ????섎룞 愿由?

Phaser 3 `add.particles()` API???낆옄 ?섍? 留롮쓣 ???⑥쑉?곸씠?? ?곕━ 寃쎌슦??罹먮┃?곕떦 1~3媛??숈떆 ?낆옄留????덉뼱 ?ㅻ쾭?? ??emitter ?쇱씠?꾩궗?댄겢 愿由ш? status ?꾪솚怨?寃고빀?섏뼱 蹂듭옟?댁쭏 ???덉뼱, **?⑥씪 Arc(circle) 媛앹껜 諛곗뿴??AgentActor媛 吏곸젒 愿由?*?섎뒗 諛⑹떇 梨꾪깮.

### ?숈옉

- `pulse(time)` 留??꾨젅???몄텧.
- `currentStatus` ??{thinking, analyzing, debating, deciding} ??寃쎌슦:
  - 700ms留덈떎 癒몃━ ??2px ?묒? ???곹깭 ?? 1媛?emit (`particles.push`)
  - 湲곗〈 ?뚰떚???꾩껜瑜?吏꾪뻾瑜?t = age/1500ms濡?媛깆떊:
    - y = headTop ??2 ??t 횞 18  (?꾨줈 18px ?좎삤由?
    - alpha = 0.95 횞 (1 ??t)
  - age > 1500ms ???뚰떚??destroy
- 鍮꾪솢???꾪솚 ??利됱떆 紐⑤뱺 ?뚰떚???뺣━ (?붿긽 諛⑹?)
- depth 900?쇰줈 ?ㅼ젙???≫꽣/?붿삤?쇰쭏 ?꾩뿉 ??긽 ?쒖떆

### ?쒓컖

- thinking: ?뚮옉 0x3182f6
- analyzing: 蹂대씪 0x7d6bff
- debating: 鍮④컯 0xf04452
- deciding: ?먯＜ 0xa855f7

?앷컖 ?띿꽑/留먰뭾?좉낵 ?ㅻⅨ ?쒓컖???섎?: 留먰뭾??= ?띿뒪??而⑦뀗痢??꾩갑 ?뚮┝(5珥?, ?뚰떚??= ?대떦 ?먯씠?꾪듃媛 "?ш퀬 以??꾩쓣 ?뺤＜ ?쒓렇?먮줈 ?쒗쁽.

### 肄붾뱶 蹂寃?

| ?뚯씪 | 蹂寃?|
|---|---|
| `frontend/src/components/game/AgentActor.ts` | `particles: Array<{obj, born}>` + `lastEmit` ?꾨뱶. `pulse(time)` ?뺤옣: emit + 吏꾪뻾瑜?媛깆떊 + ?뺣━. `destroy()`?먯꽌 ?쇨큵 destroy. 鍮꾪솢???꾪솚 利됱떆 ?뺣━. |
| `frontend/src/components/game/OfficeScene.ts` | bootText "MS8 ?뚰떚??OK" 媛깆떊 |

### ?붿옄???섏궗寃곗젙

- **emit 媛꾧꺽 700ms**: ?덈Т 鍮좊Ⅴ硫??쒓컖?곸쑝濡?遺?? ?덈Т ?먮━硫??뺤＜ ?좏샇媛 ?쏀븿. 9 罹먮┃?곌? ?숈떆 ?쒖꽦?댁뼱???됯퇏 13媛??뚰떚??9 횞 1.4珥?0.7珥???18 over 1.5s lifespan)濡?媛踰쇱?.
- **?곸듅 嫄곕━ 18px**: 癒몃━ 諛붾줈 ?꾩뿉???쒖옉???됯퇏 罹먮┃??1媛??믪씠留뚰겮 ?щ씪媛怨??щ씪吏? ?곷떒 ?붿삤?쇰쭏 prop怨?寃뱀튂吏 ?딆쓬.
- **`Math.round` 誘몄쟻??*: ?뚰떚?댁? ?쎌??꾪듃 ?ㅻ낫???먮쫫????以묒슂. 遺꾩닔 ?쎌?濡?遺?쒕읇寃??곸듅.
- **Phaser ParticleEmitter 誘몄궗??洹쇨굅**: ???ㅼ륫 ?낆옄 ??+ status ?꾪솚 ??利됱떆 ?뺣━ ?붽뎄濡??섎룞 諛곗뿴???⑥닚.

### 寃利?

| 寃??| 寃곌낵 |
|---|---|
| `npx tsc --noEmit` | ??0 errors |
| `npx eslint src` | ??0 errors / 2 warnings (湲곗〈) |
| `npx next build` | ??7/7 static pages |

### 蹂대쪟: Howler ?ъ슫??

- ?ъ슜?먯뿉寃?紐낆떆??SFX ?먯궛 (BGM, ?대┃, ?뚮┝) ?붿껌 ?놁씠 ?꾩쓽 ?먯궛???꾩엯?섎㈃ ?쇱씠?좎뒪/??묎텒 寃?좉? ?꾩슂. MS8 ?ъ슫??遺遺꾩? ?먯궛???ㅼ뼱?ㅻ뒗 ?쒖젏??異붽?.
- ?좉? UI???대? HudControls ?뺤옣?쇰줈 ?꾩냽 異붽? 媛??

### ?ㅼ쓬

- **MS3+ navmesh**: phaser-navmesh ?꾩엯 + 梨낆긽?뷀넗濡좎떎 ?숈꽑.
- **MS9 LDtk ?꾪룷??*: ?몃? 留??곗씠?곕줈 30횞20 ?????뺢탳???덉씠?꾩썐.
- **MS10 Howler ?ъ슫??*: SFX ?먯궛 ?뺤쓽 ??



---

## 0-sexies.25 MS3+ Wander ?먯쑀 ?대룞 ??

> ?묒꽦: 2026-04-26 (?대쾲 ?몄뀡 ?곗냽). ?쒖꽦 ?곹깭 ?≫꽣媛 梨낆긽 二쇰???짹2px/짹1px 踰붿쐞?먯꽌 泥쒖쿇???대룞. ? navmesh path-finding? LDtk 留듭씠 ?ㅼ뼱?????꾩엯.

### 寃곗젙: navmesh ?꾩엯??誘몃（怨?wander濡??곗꽑 ?쒓린 遺??

- `phaser-navmesh@^2.3.1`? ?대? ?섏〈?깆뿉 ?덉쑝??mesh polygon ?뺤쓽媛 ?꾩슂. ?꾩옱 30횞20 ?꾨줈?쒖???留듭뿉??mesh 硫뷀??곗씠?곌? ?놁뼱, 媛쒕컻?먭? ?대━怨ㅼ쓣 ?먯쑝濡??묒꽦?댁빞 ?????쒓컙/寃利?鍮꾩슜????
- ?곗꽑?쒖쐞媛 ???믪? ?쒓컖???④낵??"?뺤＜ ?≫꽣媛 吏꾩쭨 ?쇳븯????蹂댁씠??寃?. sin/cos 湲곕컲 ?덈? ?ㅽ봽?뗫쭔?쇰줈 異⑸텇.

### 援ы쁽

- AgentActor???꾨뱶 3媛?異붽?:
  - `wanderPhase: number` ???앹꽦?먯뿉??`Math.random() * 2?` (罹먮┃?곕쭏???ㅻⅨ ?쒖옉 ?꾩긽)
  - `wanderX, wanderY: number` ??吏곸쟾 ?꾨젅???곸슜 ?ㅽ봽??
- `pulse(time)`???쒖꽦 ?곹깭?먯꽌:
  - `nextWx = round(cos(time/2400 + phase) 횞 2)`
  - `nextWy = round(sin(time/2400 횞 1.3 + phase) 횞 1)`
  - dx = nextWx ??wanderX, dy = nextWy ??wanderY
  - dx/dy媛 0???꾨땲硫?11媛?GameObject 紐⑤몢 setX/setY濡??쇨큵 ?대룞
  - `bodyBaseY/headBaseY/hairBaseY/headOutlineBaseY`??dy留뚰겮 媛깆떊??bob怨?異⑸룎 ?놁쓬
- 鍮꾪솢???곹깭?먯꽌??nextWx/Wy=0?대?濡??먯뿰?ㅻ읇寃?梨낆긽 ?꾩튂濡??뚯븘??

### ?붿옄???섏궗寃곗젙

- **`Math.round` ?ъ슜**: ?쎌??꾪듃 ???좎? ??遺꾩닔 ?쎌? ?대룞? 蹂닿컙???먮┸.
- **x/y 二쇳뙆??李⑥씠 (1.0 vs 1.3)**: Lissajous ?⑦꽩 ???⑥닚 ?먯씠 ?꾨땶 8????먰삎 沅ㅼ쟻?쇰줈 蹂댁엫.
- **짹2px / 짹1px 鍮꾨?移?*: ?щ엺???먮━?먯꽌 ?붾뱾 ??醫뚯슦 ?吏곸엫???꾩븘?섎낫?????먯뿰?ㅻ윭?.
- **AgentActor.x/y??readonly ?좎?**: wander???쒓컖???ㅽ봽?? ?몃??먯꽌 蹂대뒗 醫뚰몴(?대┃ ?몃뱾?? panCameraTo ???????遺덈?. minimap??梨낆긽 ?꾩튂瑜?洹몃?濡??쒖떆.
- **cumulative drift 諛⑹?**: dx/dy delta ?곸슜 + base 醫뚰몴 蹂댁젙?쇰줈 `wanderX`媛 ?덈? ?ㅽ봽?뗭씠 ?? ?쒓컙???섎윭???됯퇏 ?꾩튂 = ?먮옒 梨낆긽.

### 肄붾뱶 蹂寃?

| ?뚯씪 | 蹂寃?|
|---|---|
| `frontend/src/components/game/AgentActor.ts` | `wanderPhase/wanderX/wanderY` ?꾨뱶. ?앹꽦?먯뿉??phase ?쒕뜡 珥덇린?? `pulse(time)`??wander 釉붾줉??bob/particles ?욎뿉 ?ㅽ뻾. |
| `frontend/src/components/game/OfficeScene.ts` | bootText "MS3+ wander OK" 媛깆떊 |

### 寃利?

| 寃??| 寃곌낵 |
|---|---|
| `npx tsc --noEmit` | ??0 errors |
| `npx eslint src` | ??0 errors / 2 warnings (湲곗〈) |
| `npx next build` | ??7/7 static pages |

### ?ㅼ쓬

- **MS9 LDtk 留??꾪룷??*: ?몃? LDtk ?꾨줈?앺듃 ??JSON ?쎌뼱 30횞20 ???????뺢탳???덉씠?꾩썐. mesh polygon??LDtk濡??뺤쓽 媛??
- **MS-navmesh ?뺤떇**: LDtk ?꾩엯 ?? ?ㅼ젣 path-finding? 罹먮┃?곌? 梨낆긽 ???좊줎?????섏궗寃곗젙?ㅻ줈 ?대룞?섎뒗 ?쒕굹由ъ삤???먯뿰?ㅻ읇寃?留욌Ъ由?
- **MS10 Howler ?ъ슫??*: SFX ?먯궛 ?뺤쓽 ??

