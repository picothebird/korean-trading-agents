// 한국 시간(KST, UTC+9) 기준 시각 포맷터 모음.
// 백엔드가 내려주는 created_at/updated_at 은 UTC ISO("...Z")이고,
// 사용자 브라우저의 로컬 타임존이 KST가 아닐 수 있으므로 timeZone을 강제 고정한다.

const KST = "Asia/Seoul";

function safeDate(input: string | number | Date | null | undefined): Date | null {
  if (input === null || input === undefined || input === "") return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "2025-04-26 17:30" 형태(KST). 분 단위. 실패 시 빈 문자열. */
export function formatKstDateTime(input: string | number | Date | null | undefined): string {
  const d = safeDate(input);
  if (!d) return "";
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

/** "17:30:05" (KST). 실패 시 빈 문자열. */
export function formatKstTime(
  input: string | number | Date | null | undefined,
  opts: { withSeconds?: boolean } = {},
): string {
  const d = safeDate(input);
  if (!d) return "";
  return d.toLocaleTimeString("ko-KR", {
    timeZone: KST,
    hour: "2-digit",
    minute: "2-digit",
    second: opts.withSeconds === false ? undefined : "2-digit",
    hour12: false,
  });
}

/** "2025-04-26" (KST). 실패 시 빈 문자열. */
export function formatKstDate(input: string | number | Date | null | undefined): string {
  const d = safeDate(input);
  if (!d) return "";
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
