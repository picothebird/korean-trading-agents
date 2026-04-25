/**
 * MS-E E10 — 한국 시장 세션 계산기 (Korean market calendar)
 *
 * KRX(KOSPI/KOSDAQ) 정규 거래시간:
 *   - 정규장: 09:00 ~ 15:30 KST (월~금)
 *   - 동시호가: 08:30~09:00 (개장), 15:20~15:30 (마감)
 *   - 시간외: 16:00~18:00
 *
 * 휴장일은 KRX 공식 캘린더 기반 — 본 모듈은 메인 공휴일/주말만 처리.
 * 정확한 임시 휴장(예: 임시 공휴일)은 백엔드 보강 권장.
 *
 * @see docs/AGENT_OFFICE_GATHER_LEVEL_UP.md §0-sexies.3 (E10)
 */

export type MarketStatus =
  | "pre-open" // 개장 전 (~08:30)
  | "pre-auction" // 개장 동시호가 (08:30~09:00)
  | "regular" // 정규장 (09:00~15:20)
  | "closing-auction" // 마감 동시호가 (15:20~15:30)
  | "after-hours" // 시간외 (16:00~18:00)
  | "closed" // 장 종료
  | "holiday"; // 휴장일

export type MarketSession = {
  status: MarketStatus;
  label: string; // 한국어 라벨
  isOpen: boolean; // 정규장/동시호가 여부
  nowKst: Date; // 한국 표준시 기준 현재
  nextOpen: Date | null; // 다음 개장 시각 (휴장/closed인 경우)
};

// ── 2026 KRX 휴장일 (메인) ──────────────────────────────
// KRX 공식 캘린더 기반. 임시 휴장은 백엔드에서 override 권장.
const HOLIDAYS_2026: ReadonlySet<string> = new Set([
  "2026-01-01", // 신정
  "2026-02-16", // 설날 연휴
  "2026-02-17", // 설날
  "2026-02-18", // 설날 연휴
  "2026-03-01", // 삼일절 (일)
  "2026-03-02", // 삼일절 대체휴일
  "2026-05-05", // 어린이날
  "2026-05-25", // 부처님오신날
  "2026-06-03", // 지방선거
  "2026-06-06", // 현충일 (토)
  "2026-08-15", // 광복절 (토)
  "2026-09-24", // 추석 연휴
  "2026-09-25", // 추석
  "2026-09-26", // 추석 연휴 (토)
  "2026-10-03", // 개천절 (토)
  "2026-10-09", // 한글날 (금)
  "2026-12-25", // 성탄절
  "2026-12-31", // 연말 휴장
]);

const HOLIDAYS_2027: ReadonlySet<string> = new Set([
  "2027-01-01",
  "2027-02-06", // 설날 연휴 (토)
  "2027-02-07",
  "2027-02-08",
  "2027-02-09",
  "2027-03-01",
  "2027-05-05",
  "2027-05-13", // 부처님오신날
  "2027-06-06",
  "2027-08-15",
  "2027-09-15", // 추석 연휴
  "2027-09-16",
  "2027-09-17",
  "2027-10-03",
  "2027-10-09",
  "2027-12-25",
  "2027-12-31",
]);

function isKrHoliday(date: Date): boolean {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const key = `${y}-${m}-${d}`;
  if (y === 2026) return HOLIDAYS_2026.has(key);
  if (y === 2027) return HOLIDAYS_2027.has(key);
  return false;
}

/**
 * 임의 시각(또는 now)을 한국 표준시(KST, UTC+9) 기준 Date로 변환.
 * Date 객체 자체는 epoch 기반이므로 getHours/getDate는 KST 가정으로 재계산한다.
 */
function toKst(d: Date = new Date()): Date {
  // UTC + 9 (한국은 DST 없음)
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  return new Date(utc + 9 * 60 * 60 * 1000);
}

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function nextWeekdayOpen(from: Date): Date {
  const next = new Date(from);
  next.setDate(next.getDate() + 1);
  next.setHours(9, 0, 0, 0);
  for (let guard = 0; guard < 14; guard++) {
    const day = next.getDay();
    if (day !== 0 && day !== 6 && !isKrHoliday(next)) return next;
    next.setDate(next.getDate() + 1);
  }
  return next;
}

/** 현재 KR 시장 세션을 계산. 시계열 의존이므로 호출 측에서 useState/useEffect로 갱신. */
export function getMarketSession(at: Date = new Date()): MarketSession {
  const kst = toKst(at);
  const dow = kst.getDay(); // 0=Sun, 6=Sat
  const isWeekend = dow === 0 || dow === 6;

  if (isWeekend || isKrHoliday(kst)) {
    return {
      status: "holiday",
      label: isWeekend ? "주말 휴장" : "휴장일",
      isOpen: false,
      nowKst: kst,
      nextOpen: nextWeekdayOpen(kst),
    };
  }

  const m = minutesOfDay(kst);
  // 09:00 = 540, 15:20 = 920, 15:30 = 930, 16:00 = 960, 18:00 = 1080
  if (m < 510) {
    // < 08:30
    const todayOpen = new Date(kst);
    todayOpen.setHours(9, 0, 0, 0);
    return { status: "pre-open", label: "개장 대기", isOpen: false, nowKst: kst, nextOpen: todayOpen };
  }
  if (m < 540) return { status: "pre-auction", label: "개장 동시호가", isOpen: true, nowKst: kst, nextOpen: null };
  if (m < 920) return { status: "regular", label: "정규장", isOpen: true, nowKst: kst, nextOpen: null };
  if (m < 930) return { status: "closing-auction", label: "마감 동시호가", isOpen: true, nowKst: kst, nextOpen: null };
  if (m < 960) return { status: "closed", label: "장 마감", isOpen: false, nowKst: kst, nextOpen: nextWeekdayOpen(kst) };
  if (m < 1080) return { status: "after-hours", label: "시간외 거래", isOpen: false, nowKst: kst, nextOpen: nextWeekdayOpen(kst) };
  return { status: "closed", label: "장 마감", isOpen: false, nowKst: kst, nextOpen: nextWeekdayOpen(kst) };
}

/** KST 시간대 → 시간대 톤 (테마 자동 모드용) */
export type KstTimeBand = "morning" | "day" | "evening" | "night";
export function kstTimeBand(at: Date = new Date()): KstTimeBand {
  const m = minutesOfDay(toKst(at));
  if (m >= 360 && m < 660) return "morning"; // 06:00~11:00
  if (m >= 660 && m < 1080) return "day"; // 11:00~18:00
  if (m >= 1080 && m < 1320) return "evening"; // 18:00~22:00
  return "night";
}
