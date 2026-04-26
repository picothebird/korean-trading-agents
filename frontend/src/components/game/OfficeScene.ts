/**
 * OfficeScene — MS1 자산 + MS2 디폴트 맵 + MS3 액터 + MS4 카메라/말풍선
 *
 * - preload(): Kenney Tiny Town + RPG Urban Pack 스프라이트시트 로드
 * - create(): 배경 + 30×20 디폴트 오피스 + 표시 대상 AgentActor + 카메라 컨트롤
 * - update(time): 활성 액터 글로우 펄싱
 * - applyThoughts(): SSE 결과 주입 → 액터 상태 + 말풍선 갱신
 * - 카메라: 마우스 휠 줌 (0.5×~2×), 드래그 팬 (left mouse)
 * - 클릭: setAgentClickHandler로 React 측 콜백 연결
 *
 * MS3+에서 phaser-navmesh 도입 예정. MS9에서 LDtk 임포트로 디폴트 맵 교체.
 */

import Phaser from "phaser";
import type { AgentRole, AgentStatus, AgentThought } from "@/types";
import { ALL_AGENT_ROLES } from "@/lib/agentLabels";
import { layerOfRole } from "@/lib/agentLabels";
import { ALL_SHEETS, TINY_TOWN } from "./assets";
import {
  DEFAULT_OFFICE_LAYOUT,
  MAP_COLS,
  MAP_ROWS,
  MAP_TILE,
} from "./defaultOfficeMap";
import { AgentActor } from "./AgentActor";
import type { IAgentActor } from "./actors/IAgentActor";
import { SpriteAgentActor } from "./actors/SpriteAgentActor";
import { DESK_POSITIONS } from "./deskPositions";
import { createDeskProps, type DeskPropsHandle } from "./DeskProps";
import { createRoomLabels, type RoomLabelsHandle } from "./RoomLabels";
import { validateOfficeMap, type OfficeMapData } from "./mapLoader";
import { playSfx } from "./sfx";
import { getWorldMetrics, type WorldMetrics } from "./systems/WorldMetrics";
import { CameraSystem, type CameraMode } from "./systems/CameraSystem";
import { diffFocusTarget } from "./systems/FocusSystem";
import { CHARACTER_SHEETS } from "./assets/assetCatalog";
import {
  FURNITURE_CATALOG,
  FLOOR_CATALOG,
  WALL_CATALOG,
} from "./assets/furnitureCatalog";
import {
  renderLayout,
  renderZoneOverlays,
  type LayoutRenderHandle,
} from "./systems/LayoutSystem";
import { AgentStateSystem } from "./systems/AgentStateSystem";
import { TRADING_OFFICE_LAYOUT } from "./layout/tradingOfficePreset";
import type {
  OfficeLayoutV2,
  LayoutSeat,
  LayoutZone,
} from "./layout/OfficeLayoutTypes";

export const OFFICE_SCENE_KEY = "OfficeScene";

const TILE_SCALE = 4; // 16px → 64px on screen (장면 확대 + 제일 넓은 가독성)
const SCREEN_TILE = MAP_TILE * TILE_SCALE;

const CAMERA_ZOOM_MIN = 0.5;
const CAMERA_ZOOM_MAX = 2.0;
const CAMERA_ZOOM_STEP = 0.1;

// Phase 1 토글 — 문제 발생 시 v1 동작으로 즉시 롤백 (v2 plan §C / E-3).
const USE_FIT_ZOOM = true;
const USE_FOCUS_SYSTEM = true;
// Phase 4 토글 — Pixel Agents 가구/바닥/벽으로 layout v2 렌더. 끄면 v1 grid 폴백.
const USE_LAYOUT_V2 = true;
// Phase 3 토글 — SpriteAgentActor로 교체할 role 집합. 비워두면 전 role이 도형 AgentActor.
const USE_SPRITE_ROLES: ReadonlySet<AgentRole> = new Set<AgentRole>([
  "technical_analyst",
  "fundamental_analyst",
  "sentiment_analyst",
  "macro_analyst",
  "bull_researcher",
  "bear_researcher",
  "risk_manager",
  "portfolio_manager",
  "guru_agent",
]);

const ACTIVE_STATUSES_FOR_BUBBLE = new Set<AgentStatus>([
  "thinking",
  "analyzing",
  "debating",
  "deciding",
]);

interface ThoughtSnapshot {
  status: AgentStatus;
  content: string;
  timestamp: string;
}

export class OfficeScene extends Phaser.Scene {
  private visibleRoles: AgentRole[];
  private mapLayer?: Phaser.GameObjects.Container;
  private bgRect?: Phaser.GameObjects.Rectangle;
  private actors: Map<AgentRole, IAgentActor> = new Map();
  private deskProps: DeskPropsHandle[] = [];
  private roomLabels: RoomLabelsHandle | null = null;
  /** MS9 외부 로드된 맵 데이터 (null = 폴백 필요) */
  private externalMap: OfficeMapData | null = null;
  private mapDataSource: "external" | "fallback" = "fallback";
  private pendingSnapshots: Map<AgentRole, ThoughtSnapshot> | null = null;
  private lastSeen: Map<AgentRole, string> = new Map(); // role → 마지막 적용 timestamp
  private clickHandler: ((role: AgentRole) => void) | null = null;
  private dragStart: { x: number; y: number; scrollX: number; scrollY: number } | null = null;
  private pendingBgColor: number | null = null;
  // Phase 1 systems
  private cameraSystem: CameraSystem | null = null;
  private lastThoughts: ReadonlyArray<AgentThought> = [];
  /** v3.3: 자동 stage 카메라 추적용. 마지막으로 fit한 stage(0/1/2 또는 -1=미설정). */
  private lastFocusedStage: number = -1;
  /** v3.4: stage 2 sub-zone 추적 ("decision"=결정실, "guru"=회장실, null=stage 2 아님). */
  private lastSubZone: "decision" | "guru" | null = null;
  // Phase 4: layout v2 핸들 + 활성 layout 참조.
  private layoutHandle: LayoutRenderHandle | null = null;
  private zoneOverlayHandle: LayoutRenderHandle | null = null;
  private activeLayout: OfficeLayoutV2 | null = null;
  private stateSystem: AgentStateSystem | null = null;

  constructor(visibleRoles: ReadonlyArray<AgentRole> = ALL_AGENT_ROLES) {
    super({ key: OFFICE_SCENE_KEY });
    this.visibleRoles = [...visibleRoles];
  }

  preload(): void {
    for (const sheet of ALL_SHEETS) {
      this.load.spritesheet(sheet.key, sheet.url, {
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight,
        margin: sheet.margin,
        spacing: sheet.spacing,
      });
    }
    // MS9 외부 맵 JSON. 실패 시 Phaser가 'loaderror'를 발사하며 cache에 없으므로 create()에서 폴백됨.
    this.load.json("office-map", "/game/maps/office.json");

    // Phase 2: Pixel Agents 캐릭터 시트 (112×96 = 7 frames × 16w, 3 rows × 32h).
    for (const sheet of CHARACTER_SHEETS) {
      this.load.spritesheet(sheet.key, sheet.url, {
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight,
      });
    }
    // Phase 4: floor/wall/furniture sprite 로드.
    if (USE_LAYOUT_V2) {
      for (const f of FLOOR_CATALOG) this.load.image(f.id, f.url);
      for (const w of WALL_CATALOG) this.load.image(w.id, w.url);
      for (const item of FURNITURE_CATALOG) this.load.image(item.id, item.url);
    }
  }

  create(): void {
    const { width, height } = this.scale;

    this.bgRect = this.add
      .rectangle(width / 2, height / 2, width, height, 0xf6f7f9)
      .setOrigin(0.5)
      .setScrollFactor(0); // 카메라 이동/줌과 무관

    if (this.pendingBgColor !== null) {
      this.bgRect.setFillStyle(this.pendingBgColor);
      this.cameras.main.setBackgroundColor(this.pendingBgColor);
      this.pendingBgColor = null;
    }

    this.mapLayer = this.add.container(0, 0);
    // MS9 Phaser cache에서 JSON 읽어 externalMap 설정 (loadOfficeMap은 스탠들어론 외 폴백 경로)
    if (this.cache.json.has("office-map")) {
      const raw: unknown = this.cache.json.get("office-map");
      const map = validateOfficeMap(raw);
      if (map) {
        this.externalMap = map;
        this.mapDataSource = "external";
      }
    }
    this.drawDefaultOffice();
    // v3: 색박스 룸 라벨 제거 (LayoutSystem nameplate가 대체).
    // this.roomLabels = createRoomLabels(this);
    this.spawnActors();
    this.stateSystem = new AgentStateSystem(this);

    // Phase 1: WorldMetrics + CameraSystem 일원화. fit zoom으로 첫 진입.
    this.cameraSystem = new CameraSystem(this, () => this.getMetrics());
    if (USE_FIT_ZOOM) {
      this.cameraSystem.applyFit();
    } else {
      this.centerCameraOnMap();
    }
    this.setupCameraControls();

    if (this.pendingSnapshots) {
      for (const [role, snap] of this.pendingSnapshots) {
        this.applySnapshot(role, snap);
      }
      this.pendingSnapshots = null;
    }

    this.scale.on("resize", this.onResize, this);
  }

  update(time: number): void {
    for (const actor of this.actors.values()) {
      actor.pulse(time);
    }
    this.cameraSystem?.update();
    this.stateSystem?.sync(this.actors);
  }

  /** 오피스를 그린다. v2가 활성이면 LayoutSystem, 아니면 v1 grid 폴백. */
  private drawDefaultOffice(): void {
    if (!this.mapLayer) return;
    this.mapLayer.removeAll(true);
    this.layoutHandle?.destroy();
    this.layoutHandle = null;
    this.zoneOverlayHandle?.destroy();
    this.zoneOverlayHandle = null;

    if (USE_LAYOUT_V2 && this.textures.exists(FLOOR_CATALOG[0].id)) {
      this.activeLayout = TRADING_OFFICE_LAYOUT;
      // v3: zone overlay 제거 — nameplate로 대체.
      this.layoutHandle = renderLayout(this, TRADING_OFFICE_LAYOUT, {
        tileScale: TILE_SCALE,
        container: this.mapLayer,
      });
      this.mapDataSource = "external";
      return;
    }

    // v1 폴백 — 기존 Tiny Town grid.
    const grid: ReadonlyArray<ReadonlyArray<number>> =
      this.externalMap?.layers[0]?.data ?? DEFAULT_OFFICE_LAYOUT;
    const rows = this.externalMap?.rows ?? MAP_ROWS;
    const cols = this.externalMap?.cols ?? MAP_COLS;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const frame = grid[r][c];
        if (frame < 0) continue;
        const sprite = this.add.image(
          c * SCREEN_TILE + SCREEN_TILE / 2,
          r * SCREEN_TILE + SCREEN_TILE / 2,
          TINY_TOWN.key,
          frame,
        );
        sprite.setScale(TILE_SCALE);
        this.mapLayer.add(sprite);
      }
    }
  }

  /** 표시 대상 AgentRole에 대해 책상 위치에 AgentActor 인스턴스화 + 클릭 핸들러. */
  private spawnActors(): void {
    for (const role of this.visibleRoles) {
      // Phase 4: layout v2의 seats 우선 사용. 없으면 v1 DESK_POSITIONS.
      const seat: LayoutSeat = this.activeLayout?.seats[role] ?? DESK_POSITIONS[role];
      const x = seat.col * SCREEN_TILE + SCREEN_TILE / 2;
      const y = seat.row * SCREEN_TILE + SCREEN_TILE / 2;
      // v1 grid 모드에서만 도형 책상 prop을 그림. v2는 furniture 자체가 책상.
      if (!this.activeLayout) {
        this.deskProps.push(createDeskProps(this, x, y));
      }
      // Phase 3: USE_SPRITE_ROLES에 포함된 role은 SpriteAgentActor, 아닌 되면 도형 폴백.
      const useSprite =
        USE_SPRITE_ROLES.has(role) && this.textures.exists("pa-char-0");
      const actor: IAgentActor = useSprite
        ? new SpriteAgentActor(this, x, y, role)
        : new AgentActor(this, x, y, role);
      actor.onPointerDown(() => {
        playSfx("click");
        if (this.clickHandler) this.clickHandler(role);
      });
      this.actors.set(role, actor);
    }
  }

  /** React 측 클릭 핸들러 등록. */
  setAgentClickHandler(handler: ((role: AgentRole) => void) | null): void {
    this.clickHandler = handler;
  }

  /** MS5: 테마 토큰(--bg-canvas)에서 도출한 배경색을 반영. create 이전 호출 안전. */
  setBackgroundColor(rgbHex: number): void {
    if (this.bgRect) {
      this.bgRect.setFillStyle(rgbHex);
      this.cameras.main.setBackgroundColor(rgbHex);
    } else {
      this.pendingBgColor = rgbHex;
    }
  }

  // ─── MS4+ HUD 컨트롤 API (PhaserCanvas/HUD가 호출) ────────────────
  zoomBy(delta: number): void {
    const cam = this.cameras.main;
    const next = Math.min(
      CAMERA_ZOOM_MAX,
      Math.max(CAMERA_ZOOM_MIN, cam.zoom + delta),
    );
    cam.setZoom(Math.round(next * 10) / 10);
  }

  resetCamera(): void {
    if (this.cameraSystem) {
      this.cameraSystem.reset();
      return;
    }
    const cam = this.cameras.main;
    cam.setZoom(1);
    this.centerCameraOnMap();
  }

  /** 미니맵에서 클릭 시 카메라를 월드 좌표로 이동 (액터 추적 X). */
  panCameraTo(worldX: number, worldY: number): void {
    if (this.cameraSystem) {
      this.cameraSystem.panTo(worldX, worldY);
      return;
    }
    this.cameras.main.centerOn(worldX, worldY);
  }

  /** Phase 1: 월드 전체를 화면에 담는다. */
  fitToWorld(): void {
    this.cameraSystem?.applyFit();
  }

  /** Phase 1: 카메라 모드 전환. */
  setCameraMode(mode: CameraMode): void {
    this.cameraSystem?.setMode(mode);
  }

  getCameraMode(): CameraMode {
    return this.cameraSystem?.getMode() ?? "fit";
  }

  /** Phase 1: 특정 role의 책상으로 카메라 follow. */
  focusAgent(role: AgentRole, opts?: { instant?: boolean }): void {
    if (!this.cameraSystem) return;
    const actor = this.actors.get(role);
    if (!actor) return;
    this.cameraSystem.focus(actor.x, actor.y, opts);
  }

  focusZone(worldX: number, worldY: number, opts?: { instant?: boolean }): void {
    this.cameraSystem?.focus(worldX, worldY, opts);
  }

  /**
   * Stage(0=L1 분석가실, 1=L2 토론장, 2=L3 결정실 또는 회장실)에 카메라 fit.
   * stage 2는 union이 너무 넓어 줌이 너무 아웃되므로 roleHint로 단일 zone에 fit.
   *  - guru_agent          → zones[3] (회장실)
   *  - risk/portfolio       → zones[2] (결정실)
   */
  focusStage(
    stageIndex: 0 | 1 | 2,
    opts?: { instant?: boolean; roleHint?: AgentRole; force?: boolean },
  ): void {
    if (!this.cameraSystem) return;
    const zones = this.getZones();
    if (zones.length < 4) return;
    let rect: { x: number; y: number; w: number; h: number } | null = null;
    if (stageIndex === 0) {
      const z = zones[0]; rect = { x: z.x, y: z.y, w: z.w, h: z.h };
    } else if (stageIndex === 1) {
      const z = zones[1]; rect = { x: z.x, y: z.y, w: z.w, h: z.h };
    } else {
      const useRight = opts?.roleHint === "guru_agent";
      const z = useRight ? zones[3] : zones[2];
      rect = { x: z.x, y: z.y, w: z.w, h: z.h };
    }
    this.cameraSystem.focusRect(rect, {
      instant: opts?.instant,
      force: opts?.force,
    });
  }

  getCameraInfo(): {
    scrollX: number;
    scrollY: number;
    zoom: number;
    viewWidth: number;
    viewHeight: number;
    worldWidth: number;
    worldHeight: number;
  } | null {
    // scene 이 destroy 되었거나 create 이전이면 cameras.main 이 undefined
    const cam = this.cameras?.main;
    if (!cam) return null;
    const m = this.getMetrics();
    return {
      scrollX: cam.scrollX,
      scrollY: cam.scrollY,
      zoom: cam.zoom,
      viewWidth: cam.width / cam.zoom,
      viewHeight: cam.height / cam.zoom,
      worldWidth: m.worldWidth,
      worldHeight: m.worldHeight,
    };
  }

  /** Phase 1 SSOT: WorldMetrics 기반 월드 크기. v2 layout 우선. */
  private getMetrics(): WorldMetrics {
    if (this.activeLayout) {
      return getWorldMetrics({
        externalMap: { cols: this.activeLayout.cols, rows: this.activeLayout.rows },
        fallbackCols: MAP_COLS,
        fallbackRows: MAP_ROWS,
        tilePx: SCREEN_TILE,
      });
    }
    return getWorldMetrics({
      externalMap: this.externalMap
        ? { cols: this.externalMap.cols, rows: this.externalMap.rows }
        : null,
      fallbackCols: MAP_COLS,
      fallbackRows: MAP_ROWS,
      tilePx: SCREEN_TILE,
    });
  }

  /** Phase 4: 컨트롤러/미니맵용 좌석 정보 (월드 좌표). */
  getSeats(): Array<{ role: AgentRole; x: number; y: number; label?: string }> {
    if (!this.activeLayout) {
      return this.visibleRoles.map((role) => {
        const d = DESK_POSITIONS[role];
        return {
          role,
          x: d.col * SCREEN_TILE + SCREEN_TILE / 2,
          y: d.row * SCREEN_TILE + SCREEN_TILE / 2,
        };
      });
    }
    return this.visibleRoles.map((role) => {
      const s = this.activeLayout!.seats[role];
      return {
        role,
        x: s.col * SCREEN_TILE + SCREEN_TILE / 2,
        y: s.row * SCREEN_TILE + SCREEN_TILE / 2,
        label: s.label,
      };
    });
  }

  /** Phase 4: 룸 존 정보 (월드 좌표). */
  getZones(): Array<{ name: string; color: number; x: number; y: number; w: number; h: number }> {
    const zones: ReadonlyArray<LayoutZone> = this.activeLayout?.zones ?? [];
    return zones.map((z) => {
      const x = z.col0 * SCREEN_TILE;
      const y = z.row0 * SCREEN_TILE;
      return {
        name: z.name,
        color: z.color,
        x,
        y,
        w: (z.col1 - z.col0 + 1) * SCREEN_TILE,
        h: (z.row1 - z.row0 + 1) * SCREEN_TILE,
      };
    });
  }

  /** v3 DOM overlay: 카메라 변환 + 액터/존 라벨 anchor 스냅샷. */
  getOverlaySnapshot(): {
    cam: { scrollX: number; scrollY: number; zoom: number; viewW: number; viewH: number };
    agents: Array<{ role: AgentRole; nameX: number; nameY: number; bubbleX: number; bubbleY: number; bubbleText: string; bubbleVisible: boolean }>;
    zones: Array<{ name: string; x: number; y: number }>;
  } | null {
    const cam = this.cameras?.main;
    if (!cam) return null;
    const agents: Array<{ role: AgentRole; nameX: number; nameY: number; bubbleX: number; bubbleY: number; bubbleText: string; bubbleVisible: boolean }> = [];
    for (const actor of this.actors.values()) {
      try {
        const name = actor.getNameAnchor?.() ?? { x: actor.x, y: actor.y + 44 };
        const label = actor.getLabelAnchor?.() ?? { x: actor.x, y: actor.y - 50 };
        const bubble = actor.getBubble?.() ?? { text: "", visible: false };
        agents.push({
          role: actor.role,
          nameX: name.x,
          nameY: name.y,
          bubbleX: label.x,
          bubbleY: label.y,
          bubbleText: bubble.text,
          bubbleVisible: bubble.visible,
        });
      } catch {
        // actor may be mid-destroy; skip this frame for it.
      }
    }
    return {
      cam: { scrollX: cam.scrollX, scrollY: cam.scrollY, zoom: cam.zoom, viewW: cam.width, viewH: cam.height },
      agents,
      // v3.3: zone 라벨 표시 안 함 (사용자 요청).
      zones: [],
    };
  }

  /** SSE 결과 주입 (create 이전에도 호출 안전). */
  applyThoughts(thoughts: ReadonlyArray<AgentThought>): void {
    // 재시작 감지: 직전엔 thoughts가 있었는데 빈 배열로 리셋된 경우.
    if (thoughts.length === 0 && this.lastThoughts.length > 0) {
      this.lastFocusedStage = -1;
      this.lastSubZone = null;
    }
    // role별 마지막 thought를 채택
    const latest = new Map<AgentRole, ThoughtSnapshot>();
    for (const t of thoughts) {
      latest.set(t.role, {
        status: t.status,
        content: t.content,
        timestamp: t.timestamp,
      });
    }
    if (this.actors.size === 0) {
      this.pendingSnapshots = latest;
      this.lastThoughts = thoughts;
      return;
    }
    for (const [role, snap] of latest) {
      this.applySnapshot(role, snap);
    }

    // Phase 1 + v3.3 stage focus: 새 thought가 다른 layer로 넘어가면 해당 stage로 카메라 fit.
    // 같은 layer 내 변화는 무시 (stage 단위로만 카메라 이동).
    if (USE_FOCUS_SYSTEM && this.cameraSystem) {
      const target = diffFocusTarget(this.lastThoughts, thoughts);
      if (target) {
        const layer = layerOfRole(target.role);
        // stage 2에서는 같은 layer여도 결정실↔회장실 이동 시 재포커스 가능하도록 roleHint 전달.
        const isGuruShift = layer === 2 && target.role === "guru_agent";
        const isDecisionShift = layer === 2 && target.role !== "guru_agent";
        const stageChanged = layer !== this.lastFocusedStage;
        const subZoneChanged =
          layer === 2 && this.lastFocusedStage === 2 &&
          ((isGuruShift && this.lastSubZone !== "guru") ||
            (isDecisionShift && this.lastSubZone !== "decision"));
        if (stageChanged || subZoneChanged) {
          this.lastFocusedStage = layer;
          this.lastSubZone = layer === 2 ? (isGuruShift ? "guru" : "decision") : null;
          // stage 전환은 항상 포커스 (manual hold보다 우선) — user는 이후 다시 휠/드래그로 조정 가능.
          this.focusStage(layer as 0 | 1 | 2, { roleHint: target.role, force: true });
        }
      }
    }
    this.lastThoughts = thoughts;
  }

  private applySnapshot(role: AgentRole, snap: ThoughtSnapshot): void {
    const actor = this.actors.get(role);
    if (!actor) return;
    actor.setStatus(snap.status);
    this.stateSystem?.setStatus(role, snap.status);

    // 말풍선: 활성 상태 + content 존재 + 새 timestamp일 때만
    const seen = this.lastSeen.get(role);
    if (
      snap.content &&
      snap.timestamp !== seen &&
      ACTIVE_STATUSES_FOR_BUBBLE.has(snap.status)
    ) {
      actor.showMessage(snap.content);
    }
    this.lastSeen.set(role, snap.timestamp);
  }

  /** 맵 중앙이 화면 중앙에 오도록 카메라 정렬 (Phase 1 fallback / Phase 0 호환용). */
  private centerCameraOnMap(): void {
    const cam = this.cameras.main;
    const m = this.getMetrics();
    cam.setBounds(0, 0, m.worldWidth, m.worldHeight);
    cam.centerOn(m.centerX, m.centerY);
  }

  /** MS4 카메라 컨트롤: 마우스 휠 줌 + 드래그 팬. */
  private setupCameraControls(): void {
    const cam = this.cameras.main;

    // 휠 줌 — Phase 1: CameraSystem이 manual hold/fit 강등 처리.
    this.input.on(
      "wheel",
      (
        _pointer: Phaser.Input.Pointer,
        _objects: unknown,
        _dx: number,
        dy: number,
      ) => {
        if (this.cameraSystem) {
          this.cameraSystem.zoomBy(
            dy > 0 ? -CAMERA_ZOOM_STEP : CAMERA_ZOOM_STEP,
            CAMERA_ZOOM_MIN,
            CAMERA_ZOOM_MAX,
          );
          return;
        }
        const next =
          dy > 0
            ? Math.max(CAMERA_ZOOM_MIN, cam.zoom - CAMERA_ZOOM_STEP)
            : Math.min(CAMERA_ZOOM_MAX, cam.zoom + CAMERA_ZOOM_STEP);
        cam.setZoom(Math.round(next * 10) / 10);
      },
    );

    // 좌클릭 드래그 팬 (액터 위에서 시작한 클릭은 액터 핸들러 우선)
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) {
        // 액터 등 인터랙티브 객체 위에서는 드래그 시작 안 함
        const hit = this.input.hitTestPointer(pointer);
        if (hit.length > 0) return;
        this.dragStart = {
          x: pointer.x,
          y: pointer.y,
          scrollX: cam.scrollX,
          scrollY: cam.scrollY,
        };
      }
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.dragStart || !pointer.isDown) return;
      const dx = pointer.x - this.dragStart.x;
      const dy = pointer.y - this.dragStart.y;
      cam.setScroll(
        this.dragStart.scrollX - dx / cam.zoom,
        this.dragStart.scrollY - dy / cam.zoom,
      );
      // Phase 1: 사용자 드래그 시 자동 카메라 일시 정지.
      this.cameraSystem?.notifyManualInput();
    });
    const endDrag = () => {
      this.dragStart = null;
    };
    this.input.on("pointerup", endDrag);
    this.input.on("pointerupoutside", endDrag);
  }

  private onResize(gameSize: Phaser.Structs.Size): void {
    const { width, height } = gameSize;
    if (this.bgRect) {
      this.bgRect.setPosition(width / 2, height / 2);
      this.bgRect.setSize(width, height);
    }
    // Phase 1: fit 모드일 때만 카메라 재계산. free/follow에서는 사용자 시점 보존.
    // (v2 plan §I — Live/Story/Report 모드 토글이 만들던 카메라 튐 근본 차단.)
    if (this.cameraSystem) {
      this.cameraSystem.onResize();
    } else {
      this.centerCameraOnMap();
    }
  }

  shutdown(): void {
    this.scale.off("resize", this.onResize, this);
    this.layoutHandle?.destroy();
    this.zoneOverlayHandle?.destroy();
    this.stateSystem?.destroy();
    this.layoutHandle = null;
    this.zoneOverlayHandle = null;
    this.stateSystem = null;
    this.activeLayout = null;
  }
}
