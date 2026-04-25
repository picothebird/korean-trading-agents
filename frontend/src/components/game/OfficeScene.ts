/**
 * OfficeScene — MS1 자산 + MS2 디폴트 맵 + MS3 액터 + MS4 카메라/말풍선
 *
 * - preload(): Kenney Tiny Town + RPG Urban Pack 스프라이트시트 로드
 * - create(): 배경 + 30×20 디폴트 오피스 + 9개 AgentActor + 카메라 컨트롤
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
import { ALL_SHEETS, TINY_TOWN } from "./assets";
import {
  DEFAULT_OFFICE_LAYOUT,
  MAP_COLS,
  MAP_ROWS,
  MAP_TILE,
} from "./defaultOfficeMap";
import { AgentActor } from "./AgentActor";
import { DESK_POSITIONS } from "./deskPositions";
import { createDeskProps, type DeskPropsHandle } from "./DeskProps";

export const OFFICE_SCENE_KEY = "OfficeScene";

const TILE_SCALE = 2; // 16px → 32px on screen
const SCREEN_TILE = MAP_TILE * TILE_SCALE;

const CAMERA_ZOOM_MIN = 0.5;
const CAMERA_ZOOM_MAX = 2.0;
const CAMERA_ZOOM_STEP = 0.1;

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
  private bootText?: Phaser.GameObjects.Text;
  private mapLayer?: Phaser.GameObjects.Container;
  private bgRect?: Phaser.GameObjects.Rectangle;
  private actors: Map<AgentRole, AgentActor> = new Map();
  private deskProps: DeskPropsHandle[] = [];
  private pendingSnapshots: Map<AgentRole, ThoughtSnapshot> | null = null;
  private lastSeen: Map<AgentRole, string> = new Map(); // role → 마지막 적용 timestamp
  private clickHandler: ((role: AgentRole) => void) | null = null;
  private dragStart: { x: number; y: number; scrollX: number; scrollY: number } | null = null;
  private pendingBgColor: number | null = null;

  constructor() {
    super({ key: OFFICE_SCENE_KEY });
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
    this.drawDefaultOffice();
    this.spawnActors();
    this.centerCameraOnMap();
    this.setupCameraControls();

    if (this.pendingSnapshots) {
      for (const [role, snap] of this.pendingSnapshots) {
        this.applySnapshot(role, snap);
      }
      this.pendingSnapshots = null;
    }

    this.bootText = this.add.text(
      width / 2,
      height - 24,
      `MS8 파티클 OK · 활성 액터 머리 위 사고 입자 · 휠 줌 / 드래그 팬`,
      {
        fontFamily: "Pretendard, system-ui, sans-serif",
        fontSize: "12px",
        color: "#5a5d66",
      },
    );
    this.bootText.setOrigin(0.5);
    this.bootText.setScrollFactor(0);

    this.scale.on("resize", this.onResize, this);
  }

  update(time: number): void {
    for (const actor of this.actors.values()) {
      actor.pulse(time);
    }
  }

  /** 30×20 디폴트 오피스를 좌상단 (0,0) 기준 절대 좌표로 그림. */
  private drawDefaultOffice(): void {
    if (!this.mapLayer) return;
    this.mapLayer.removeAll(true);

    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        const frame = DEFAULT_OFFICE_LAYOUT[r][c];
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

  /** 9개 AgentRole에 대해 책상 위치에 AgentActor 인스턴스화 + 클릭 핸들러. */
  private spawnActors(): void {
    for (const role of ALL_AGENT_ROLES) {
      const desk = DESK_POSITIONS[role];
      const x = desk.col * SCREEN_TILE + SCREEN_TILE / 2;
      const y = desk.row * SCREEN_TILE + SCREEN_TILE / 2;
      // MS7 디오라마 — 책상/모니터/화분 prop을 캐릭터보다 먼저 배치 (depth -1/-2)
      this.deskProps.push(createDeskProps(this, x, y));
      const actor = new AgentActor(this, x, y, role);
      actor.onPointerDown(() => {
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
    const cam = this.cameras.main;
    cam.setZoom(1);
    this.centerCameraOnMap();
  }

  /** 미니맵에서 클릭 시 카메라를 월드 좌표로 이동 (액터 추적 X). */
  panCameraTo(worldX: number, worldY: number): void {
    this.cameras.main.centerOn(worldX, worldY);
  }

  getCameraInfo(): {
    scrollX: number;
    scrollY: number;
    zoom: number;
    viewWidth: number;
    viewHeight: number;
    worldWidth: number;
    worldHeight: number;
  } {
    const cam = this.cameras.main;
    return {
      scrollX: cam.scrollX,
      scrollY: cam.scrollY,
      zoom: cam.zoom,
      viewWidth: cam.width / cam.zoom,
      viewHeight: cam.height / cam.zoom,
      worldWidth: MAP_COLS * SCREEN_TILE,
      worldHeight: MAP_ROWS * SCREEN_TILE,
    };
  }

  /** SSE 결과 주입 (create 이전에도 호출 안전). */
  applyThoughts(thoughts: ReadonlyArray<AgentThought>): void {
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
      return;
    }
    for (const [role, snap] of latest) {
      this.applySnapshot(role, snap);
    }
  }

  private applySnapshot(role: AgentRole, snap: ThoughtSnapshot): void {
    const actor = this.actors.get(role);
    if (!actor) return;
    actor.setStatus(snap.status);

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

  /** 맵 중앙이 화면 중앙에 오도록 카메라 정렬. */
  private centerCameraOnMap(): void {
    const cam = this.cameras.main;
    const mapW = MAP_COLS * SCREEN_TILE;
    const mapH = MAP_ROWS * SCREEN_TILE;
    cam.setBounds(0, 0, mapW, mapH);
    cam.centerOn(mapW / 2, mapH / 2);
  }

  /** MS4 카메라 컨트롤: 마우스 휠 줌 + 드래그 팬. */
  private setupCameraControls(): void {
    const cam = this.cameras.main;

    // 휠 줌
    this.input.on(
      "wheel",
      (
        _pointer: Phaser.Input.Pointer,
        _objects: unknown,
        _dx: number,
        dy: number,
      ) => {
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
    });
    const endDrag = () => {
      this.dragStart = null;
    };
    this.input.on("pointerup", endDrag);
    this.input.on("pointerupoutside", endDrag);
  }

  private onResize(gameSize: Phaser.Structs.Size): void {
    const { width, height } = gameSize;
    if (this.bootText) {
      this.bootText.setPosition(width / 2, height - 24);
    }
    if (this.bgRect) {
      this.bgRect.setPosition(width / 2, height / 2);
      this.bgRect.setSize(width, height);
    }
    this.centerCameraOnMap();
  }

  shutdown(): void {
    this.scale.off("resize", this.onResize, this);
  }
}
