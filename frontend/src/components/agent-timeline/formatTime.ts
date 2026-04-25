/**
 * formatRelativeTime — "지금 막", "12초 전", "3분 전", "어제 14:30" 등 한글 상대 시간.
 *
 * Intl.RelativeTimeFormat 기반 + 도메인 미세조정.
 */

const rtf = new Intl.RelativeTimeFormat("ko", { numeric: "auto" });

export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diffMs = t - now; // 과거면 음수
  const absSec = Math.round(Math.abs(diffMs) / 1000);

  if (absSec < 5) return "지금 막";
  if (absSec < 60) return rtf.format(Math.round(diffMs / 1000), "second");
  if (absSec < 3600) return rtf.format(Math.round(diffMs / 60000), "minute");
  if (absSec < 86400) return rtf.format(Math.round(diffMs / 3600000), "hour");

  // 24시간 이상 전이면 시각 표기
  const d = new Date(t);
  return d.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatAbsoluteTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** 백엔드 metadata.duration_ms를 "0.4초", "1.2초", "2분 13초"로. */
export function formatDuration(ms: number | undefined | null): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return null;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}초`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return sec > 0 ? `${min}분 ${sec}초` : `${min}분`;
}
