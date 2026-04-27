/**
 * Trading office preset — v3.2: 벽 없는 오픈 오피스 레이아웃.
 *
 * 디자인 원칙 (사용자 피드백 반영):
 *   - 벽/기둥/내벽 전부 제거 → walls = [] 빈 배열
 *   - 룸 구분은 **zone color로 칠한 바닥 톤** 차이로만 표현
 *   - 책상/의자는 정확히 정렬 (책상 footprintW=3, PC와 의자는 책상 중앙 col)
 *   - 4개 영역, 24×14 grid
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

const FURNITURE: LayoutFurniture[] = [
  // ─────────── 분석가실 (col 0-11, row 0-6) ───────────
  // 4 책상 일렬, col 0/3/6/9 (footprintW=3, 정확히 12col에 fit)
  { type: "DESK_FRONT", col: 0, row: 4 },
  { type: "PC_FRONT_ON_2", col: 1, row: 3 },
  { type: "WOODEN_CHAIR_BACK", col: 1, row: 6 },

  { type: "DESK_FRONT", col: 3, row: 4 },
  { type: "PC_FRONT_ON_1", col: 4, row: 3 },
  { type: "WOODEN_CHAIR_BACK", col: 4, row: 6 },

  { type: "DESK_FRONT", col: 6, row: 4 },
  { type: "PC_FRONT_ON_3", col: 7, row: 3 },
  { type: "WOODEN_CHAIR_BACK", col: 7, row: 6 },

  { type: "DESK_FRONT", col: 9, row: 4 },
  { type: "PC_FRONT_OFF", col: 10, row: 3 },
  { type: "WOODEN_CHAIR_BACK", col: 10, row: 6 },

  // 분석가실 데코 — 위쪽 책장+화분 라인 (가벽 역할)
  { type: "BOOKSHELF", col: 0, row: 1 },
  { type: "BOOKSHELF", col: 3, row: 1 },
  { type: "BOOKSHELF", col: 6, row: 1 },
  { type: "BOOKSHELF", col: 9, row: 1 },
  { type: "PLANT", col: 2, row: 1 },
  { type: "PLANT", col: 8, row: 1 },
  { type: "CLOCK", col: 5, row: 0 },

  // ─────────── 토론장 (col 12-23, row 0-6) ───────────
  // 화이트보드 가운데 위 (col 16-17)
  { type: "WHITEBOARD", col: 16, row: 1 },

  // 강세 책상 (좌측, col 13-15)
  { type: "DESK_FRONT", col: 13, row: 4 },
  { type: "PC_FRONT_ON_2", col: 14, row: 3 },
  { type: "WOODEN_CHAIR_BACK", col: 14, row: 6 },

  // 약세 책상 (우측, col 19-21)
  { type: "DESK_FRONT", col: 19, row: 4 },
  { type: "PC_FRONT_ON_1", col: 20, row: 3 },
  { type: "WOODEN_CHAIR_BACK", col: 20, row: 6 },

  // 토론장 데코
  { type: "BOOKSHELF", col: 13, row: 1 },
  { type: "BOOKSHELF", col: 21, row: 1 },
  { type: "PLANT", col: 12, row: 1 },
  { type: "PLANT", col: 22, row: 1 },
  { type: "HANGING_PLANT", col: 15, row: 0 },
  { type: "HANGING_PLANT", col: 19, row: 0 },

  // ─────────── 결정실 (col 0-11, row 7-13) ───────────
  // 회의 테이블 col 4-5 row 10-11
  { type: "COFFEE_TABLE", col: 4, row: 10 },

  // 리스크 (좌, 테이블 향함)
  { type: "WOODEN_CHAIR_SIDE", col: 3, row: 10 },
  // 포트폴리오 (우, flipX)
  { type: "WOODEN_CHAIR_SIDE", col: 6, row: 10, flipX: true },

  // 결정실 데코
  { type: "DOUBLE_BOOKSHELF", col: 0, row: 8 },
  { type: "BOOKSHELF", col: 8, row: 8 },
  { type: "LARGE_PLANT", col: 9, row: 11 },
  { type: "PLANT", col: 3, row: 8 },
  { type: "HANGING_PLANT", col: 11, row: 7 },
  { type: "BIN", col: 11, row: 13 },

  // ─────────── 회장실 (col 12-23, row 7-13) ───────────
  // 임원 책상 (우측)
  { type: "DESK_FRONT", col: 19, row: 10 },
  { type: "PC_FRONT_ON_2", col: 20, row: 9 },
  { type: "WOODEN_CHAIR_BACK", col: 20, row: 12 },

  // 손님 소파 (좌측 안쪽)
  { type: "SOFA_FRONT", col: 13, row: 11 },
  { type: "COFFEE_TABLE", col: 13, row: 12 },

  // 회장실 데코
  { type: "DOUBLE_BOOKSHELF", col: 16, row: 8 },
  { type: "HANGING_PLANT", col: 19, row: 7 },
  { type: "LARGE_PLANT", col: 22, row: 9 },
  { type: "CLOCK", col: 14, row: 8 },
  { type: "PLANT", col: 12, row: 8 },
  { type: "CACTUS", col: 22, row: 13 },
];

const SEATS: Record<AgentRole, LayoutSeat> = {
  technical_analyst:   { col: 1,  row: 6,  label: "기술적 분석" },
  fundamental_analyst: { col: 4,  row: 6,  label: "펀더멘털 분석" },
  sentiment_analyst:   { col: 7,  row: 6,  label: "감성 분석" },
  macro_analyst:       { col: 10, row: 6,  label: "거시경제 분석" },
  bull_researcher:     { col: 14, row: 6,  label: "강세 리서처" },
  bear_researcher:     { col: 20, row: 6,  label: "약세 리서처" },
  risk_manager:        { col: 3,  row: 10, label: "리스크 매니저" },
  portfolio_manager:   { col: 6,  row: 10, label: "포트폴리오 매니저" },
  guru_agent:          { col: 20, row: 12, label: "구루 에이전트" },
};

// 바닥 zone color — 룸 구분을 바닥 톤만으로 (벽 없음).
// rug: 각 zone 가운데에 area rug (16x16 텍스처를 N×M tile만큼 반복).
const ZONES: LayoutZone[] = [
  {
    name: "분석가실", color: 0xe8d9b8, col0: 0, row0: 0, col1: 11, row1: 6, // warm wood
    // 의자 라인 아래쪽 통로에 긴 러너 카펫
    rug: { texture: "rug_warm", col: 1, row: 5, cols: 10, rows: 2 },
  },
  {
    name: "토론장", color: 0xdce4ec, col0: 12, row0: 0, col1: 23, row1: 6, // cool tile
    // 강세/약세 책상 사이 회의 영역
    rug: { texture: "rug_cool", col: 16, row: 5, cols: 4, rows: 2 },
  },
  {
    name: "결정실", color: 0xd6e6dc, col0: 0, row0: 7, col1: 11, row1: 13, // mint carpet
    // 회의 테이블 + 양옆 의자 둘러싸는 라운지 러그
    rug: { texture: "rug_mint", col: 2, row: 9, cols: 6, rows: 4 },
  },
  {
    name: "회장실", color: 0xdadfee, col0: 12, row0: 7, col1: 23, row1: 13, // royal
    // 임원 책상 + 손님 소파를 잇는 럭셔리 러그
    rug: { texture: "rug_royal", col: 13, row: 10, cols: 9, rows: 3 },
  },
];

export const TRADING_OFFICE_LAYOUT: OfficeLayoutV2 = {
  schema: OFFICE_LAYOUT_VERSION,
  cols: COLS,
  rows: ROWS,
  floors: buildFloors(),
  walls: new Array(COLS * ROWS).fill(false),
  furniture: FURNITURE,
  seats: SEATS,
  zones: ZONES,
};
