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
