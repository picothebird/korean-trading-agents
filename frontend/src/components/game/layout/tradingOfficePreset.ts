/**
 * Trading office preset — 24×14 컴팩트 4룸 레이아웃 (v3 polish).
 *
 * 시나리오:
 *   1. 분석가실 (좌상)  — 4명
 *   2. 토론장 (우상)    — 강세/약세 마주봄
 *   3. 결정실 (좌하)    — 리스크 + 포트폴리오
 *   4. 회장실 (우하)    — 구루
 *
 * 출입구 4 곳: col 12 row 4 / row 10 ↔ row 7 col 5 / col 18.
 */

import type { AgentRole } from "@/types";
import {
  OFFICE_LAYOUT_VERSION,
  type OfficeLayoutV2,
  type LayoutFurniture,
  type LayoutSeat,
  type LayoutZone,
} from "./OfficeLayoutTypes";

const COLS = 24;
const ROWS = 14;

function buildFloors(): number[] {
  return new Array(COLS * ROWS).fill(0);
}

function buildWalls(): boolean[] {
  const arr: boolean[] = new Array(COLS * ROWS).fill(false);
  const set = (c: number, r: number) => {
    if (c >= 0 && c < COLS && r >= 0 && r < ROWS) arr[r * COLS + c] = true;
  };

  // 외곽
  for (let c = 0; c < COLS; c++) {
    set(c, 0);
    set(c, ROWS - 1);
  }
  for (let r = 0; r < ROWS; r++) {
    set(0, r);
    set(COLS - 1, r);
  }

  // 수직 내벽 col 12 — 출입구 row 3, row 10
  for (let r = 1; r < ROWS - 1; r++) {
    if (r === 3 || r === 10) continue;
    set(12, r);
  }

  // 수평 내벽 row 7 — 출입구 col 5, col 18
  for (let c = 1; c < COLS - 1; c++) {
    if (c === 5 || c === 18) continue;
    set(c, 7);
  }

  return arr;
}

const FURNITURE: LayoutFurniture[] = [
  // === 분석가실 (col 1-11, row 1-6) — 4 책상 ===
  { type: "WHITEBOARD", col: 3, row: 1 },
  { type: "DOUBLE_BOOKSHELF", col: 7, row: 1 },
  { type: "CLOCK", col: 10, row: 1 },
  // 책상 4개 — col 1,4,7,10 (간격 3)에 배치, row 4 (책상 자체 height=2 → row 4-5)
  { type: "DESK_FRONT", col: 1, row: 4 },
  { type: "PC_FRONT_OFF", col: 2, row: 3 },
  { type: "WOODEN_CHAIR_BACK", col: 2, row: 6 },

  { type: "DESK_FRONT", col: 4, row: 4 },
  { type: "PC_FRONT_ON_2", col: 5, row: 3 },
  // 출입구 위치: col 5 row 7. 의자는 그 윗칸 row 6.
  { type: "WOODEN_CHAIR_BACK", col: 5, row: 6 },

  { type: "DESK_FRONT", col: 7, row: 4 },
  { type: "PC_FRONT_ON_1", col: 8, row: 3 },
  { type: "WOODEN_CHAIR_BACK", col: 8, row: 6 },

  // 4번째 책상 — col 9 row 4. PC col 10 row 3, 의자 col 10 row 6.
  // (DESK_FRONT는 footprintW=3 → col 9-11)
  // 충돌 회피: 위 CLOCK col 10 row 1과 안 겹침.
  { type: "DESK_FRONT", col: 9, row: 4 },
  { type: "PC_FRONT_ON_3", col: 10, row: 3 },
  { type: "WOODEN_CHAIR_BACK", col: 10, row: 6 },

  // 분석가실 데코
  { type: "PLANT", col: 1, row: 1 },
  { type: "BIN", col: 11, row: 5 },
  { type: "HANGING_PLANT", col: 6, row: 1 },

  // === 토론장 (col 13-22, row 1-6) ===
  { type: "WHITEBOARD", col: 17, row: 1 },
  { type: "BOOKSHELF", col: 14, row: 1 },
  { type: "BOOKSHELF", col: 20, row: 1 },
  { type: "HANGING_PLANT", col: 16, row: 1 },
  { type: "HANGING_PLANT", col: 19, row: 1 },

  // 강세론 (좌측, side view, 우측 향함)
  { type: "DESK_FRONT", col: 14, row: 4 },
  { type: "PC_SIDE", col: 15, row: 3 },
  { type: "WOODEN_CHAIR_SIDE", col: 15, row: 6 },

  // 약세론 (우측, flipX)
  { type: "DESK_FRONT", col: 19, row: 4 },
  { type: "PC_SIDE", col: 20, row: 3, flipX: true },
  { type: "WOODEN_CHAIR_SIDE", col: 20, row: 6, flipX: true },

  { type: "PLANT", col: 17, row: 5 },
  { type: "CACTUS", col: 22, row: 5 },
  { type: "PLANT", col: 13, row: 5 },

  // === 결정실 (col 1-11, row 8-12) ===
  { type: "WHITEBOARD", col: 3, row: 8 },
  { type: "BOOKSHELF", col: 7, row: 8 },
  { type: "HANGING_PLANT", col: 10, row: 8 },

  // 회의 책상: COFFEE_TABLE 가운데, 양쪽 의자
  { type: "COFFEE_TABLE", col: 5, row: 11 },
  { type: "WOODEN_CHAIR_FRONT", col: 4, row: 11 },
  { type: "WOODEN_CHAIR_FRONT", col: 7, row: 11, flipX: true },

  // 좌측 보조 책상 (리스크용)
  { type: "DESK_FRONT", col: 1, row: 11 },
  { type: "PC_FRONT_OFF", col: 2, row: 10 },

  { type: "LARGE_PLANT", col: 9, row: 10 },
  { type: "BIN", col: 11, row: 12 },

  // === 회장실 (col 13-22, row 8-12) ===
  { type: "WHITEBOARD", col: 17, row: 8 },
  { type: "DOUBLE_BOOKSHELF", col: 20, row: 8 },
  { type: "CLOCK", col: 14, row: 8 },
  { type: "HANGING_PLANT", col: 22, row: 8 },

  // 사장 책상
  { type: "DESK_FRONT", col: 17, row: 11 },
  { type: "PC_FRONT_OFF", col: 18, row: 10 },
  { type: "WOODEN_CHAIR_BACK", col: 18, row: 12 },

  // 손님 소파 + 테이블
  { type: "SOFA_FRONT", col: 14, row: 11 },
  { type: "COFFEE_TABLE", col: 14, row: 12 },
  { type: "PLANT", col: 22, row: 12 },
  { type: "CACTUS", col: 13, row: 12 },
];

const SEATS: Record<AgentRole, LayoutSeat> = {
  technical_analyst:   { col: 2,  row: 6,  label: "기술적 분석" },
  fundamental_analyst: { col: 5,  row: 6,  label: "기본적 분석" },
  sentiment_analyst:   { col: 8,  row: 6,  label: "심리/뉴스" },
  macro_analyst:       { col: 10, row: 6,  label: "거시" },
  bull_researcher:     { col: 15, row: 6,  label: "강세론" },
  bear_researcher:     { col: 20, row: 6,  label: "약세론" },
  risk_manager:        { col: 4,  row: 11, label: "리스크" },
  portfolio_manager:   { col: 7,  row: 11, label: "포트폴리오" },
  guru_agent:          { col: 18, row: 12, label: "구루" },
};

const ZONES: LayoutZone[] = [
  { name: "분석가실",  color: 0x3182f6, col0: 1,  row0: 1,  col1: 11, row1: 6  },
  { name: "토론장",    color: 0xa855f7, col0: 13, row0: 1,  col1: 22, row1: 6  },
  { name: "결정실",    color: 0x2fca73, col0: 1,  row0: 8,  col1: 11, row1: 12 },
  { name: "회장실",    color: 0xf59e0b, col0: 13, row0: 8,  col1: 22, row1: 12 },
];

export const TRADING_OFFICE_LAYOUT: OfficeLayoutV2 = {
  schema: OFFICE_LAYOUT_VERSION,
  cols: COLS,
  rows: ROWS,
  floors: buildFloors(),
  walls: buildWalls(),
  furniture: FURNITURE,
  seats: SEATS,
  zones: ZONES,
};
