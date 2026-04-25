"use client";

/**
 * MS-D 정보 밀도 — 소형 SVG 시각화 프리미티브 모음.
 *
 * 의도: Recharts 같은 큰 라이브러리 없이도, 카드/인라인 위치에서
 * "한눈에" 의미를 전달할 수 있는 마이크로 차트 모음.
 *
 * 모든 컴포넌트는:
 *  - 외부 의존성 없음(순수 SVG)
 *  - currentColor 또는 명시 color prop으로 테마 토큰과 호환
 *  - role="img" + aria-label 로 스크린리더 지원
 */

import React from "react";

// ── 1) 신뢰도 반원 게이지 (0~1) ─────────────────────────────────
export function ConfidenceGauge({
  value,
  size = 56,
  color = "var(--brand)",
  trackColor = "var(--border-subtle)",
  thickness = 6,
  showLabel = true,
}: {
  value: number; // 0~1
  size?: number;
  color?: string;
  trackColor?: string;
  thickness?: number;
  showLabel?: boolean;
}) {
  const v = Math.max(0, Math.min(1, value));
  const w = size;
  const h = size / 2 + thickness;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - thickness / 2;
  // 반원: π → 0
  const startAngle = Math.PI;
  const endAngle = Math.PI - Math.PI * v;
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const largeArc = v > 0.5 ? 1 : 0;
  const arcPath = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
  const trackPath = `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy}`;
  const pct = Math.round(v * 100);

  return (
    <span
      role="img"
      aria-label={`신뢰도 ${pct}%`}
      style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2 }}
    >
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        <path d={trackPath} fill="none" stroke={trackColor} strokeWidth={thickness} strokeLinecap="round" />
        {v > 0 && (
          <path d={arcPath} fill="none" stroke={color} strokeWidth={thickness} strokeLinecap="round" />
        )}
      </svg>
      {showLabel && (
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>
          {pct}%
        </span>
      )}
    </span>
  );
}

// ── 2) 스파크라인 (작은 추세선) ──────────────────────────────────
export function Sparkline({
  data,
  width = 80,
  height = 22,
  color = "var(--brand)",
  fill = true,
  strokeWidth = 1.4,
  ariaLabel,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  strokeWidth?: number;
  ariaLabel?: string;
}) {
  if (!data || data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = data.length > 1 ? width / (data.length - 1) : width;
  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return [x, y] as const;
  });
  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const areaPath = `${path} L ${width.toFixed(2)} ${height} L 0 ${height} Z`;
  const last = points[points.length - 1];
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel ?? `최근 ${data.length}개 추세`}
    >
      {fill && <path d={areaPath} fill={color} opacity={0.15} />}
      <path d={path} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={1.8} fill={color} />
    </svg>
  );
}

// ── 3) 합의도 도넛 ───────────────────────────────────────────────
// counts: { agree, disagree, neutral } — 합쳐서 100%로 표시
export function AgreementDonut({
  agree,
  disagree,
  neutral = 0,
  size = 64,
  thickness = 8,
}: {
  agree: number;
  disagree: number;
  neutral?: number;
  size?: number;
  thickness?: number;
}) {
  const total = agree + disagree + neutral;
  if (total === 0) return null;
  const r = size / 2 - thickness / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;

  // 비율 → arc 길이
  const a = (agree / total) * c;
  const d = (disagree / total) * c;
  const n = (neutral / total) * c;
  const agreePct = Math.round((agree / total) * 100);

  const seg = (offset: number, len: number, color: string, key: string) => (
    <circle
      key={key}
      cx={cx}
      cy={cy}
      r={r}
      fill="none"
      stroke={color}
      strokeWidth={thickness}
      strokeDasharray={`${len.toFixed(2)} ${(c - len).toFixed(2)}`}
      strokeDashoffset={(-offset).toFixed(2)}
      transform={`rotate(-90 ${cx} ${cy})`}
    />
  );

  return (
    <span
      role="img"
      aria-label={`합의도 ${agreePct}% (찬성 ${agree}, 반대 ${disagree}, 중립 ${neutral})`}
      style={{ position: "relative", display: "inline-block", width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border-subtle)" strokeWidth={thickness} />
        {seg(0, a, "var(--bull)", "agree")}
        {seg(a, d, "var(--bear)", "disagree")}
        {seg(a + d, n, "var(--text-tertiary)", "neutral")}
      </svg>
      <span
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 800,
          color: "var(--text-primary)",
          lineHeight: 1,
          gap: 1,
          pointerEvents: "none",
        }}
      >
        <span>{agreePct}%</span>
        <span style={{ fontSize: 8, fontWeight: 600, color: "var(--text-tertiary)" }}>합의</span>
      </span>
    </span>
  );
}

// ── 4) 신호 강도 별점 (0~3) ──────────────────────────────────────
export function StrengthStars({
  value,
  max = 3,
  color = "var(--brand)",
}: {
  value: number;
  max?: number;
  color?: string;
}) {
  const v = Math.max(0, Math.min(max, Math.round(value)));
  return (
    <span
      role="img"
      aria-label={`신호 강도 ${v} / ${max}`}
      style={{ display: "inline-flex", gap: 2, alignItems: "center" }}
    >
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: 2,
            background: i < v ? color : "var(--border-subtle)",
            transition: "background 200ms ease",
          }}
        />
      ))}
    </span>
  );
}

// ── 5) 에이전트 활동 진행률 미니 차트 (시간축 X / 활성 에이전트 수 Y) ─
// 입력: timestamps (정렬된 ISO 문자열 배열)
export function ActivityProgressChart({
  timestamps,
  width = 320,
  height = 36,
  bucketMs = 2000,
  color = "var(--brand)",
}: {
  timestamps: string[];
  width?: number;
  height?: number;
  bucketMs?: number;
  color?: string;
}) {
  if (!timestamps || timestamps.length === 0) return null;
  const ts = timestamps
    .map((s) => new Date(s).getTime())
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (ts.length === 0) return null;
  const t0 = ts[0];
  const t1 = ts[ts.length - 1] || t0 + bucketMs;
  const span = Math.max(t1 - t0, bucketMs);
  const buckets = Math.max(8, Math.ceil(span / bucketMs));
  const counts = new Array<number>(buckets).fill(0);
  for (const t of ts) {
    const i = Math.min(buckets - 1, Math.floor(((t - t0) / span) * buckets));
    counts[i] += 1;
  }
  const max = Math.max(...counts, 1);
  const colW = width / buckets;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`분석 진행률 (${ts.length}건)`}
    >
      {counts.map((c, i) => {
        const h = (c / max) * (height - 4);
        return (
          <rect
            key={i}
            x={i * colW + 0.5}
            y={height - h - 1}
            width={Math.max(1, colW - 1)}
            height={Math.max(0.5, h)}
            fill={color}
            opacity={c === 0 ? 0.1 : 0.7}
            rx={1}
          />
        );
      })}
    </svg>
  );
}
