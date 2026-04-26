"use client";

/**
 * 차트 지표 해석 가이드 (통합).
 *
 * 간단·상세 모드, 일봉·분봉 모두 동일한 컴포넌트가 필요한 항목만 보여 줍니다.
 *
 * 톤 가이드 (서비스 공통):
 *  - 공식 보고서 톤. "~입니다 / ~합니다" 종결.
 *  - 정의 → 계산식 → 해석 3단. 비유·과장·메타 코멘트 금지.
 *  - 강조 색은 차트 팔레트와 동일하게 사용 (상승=빨강 #e02a2a, 하락=파랑 #2563eb).
 */

import { Icon } from "@/components/ui";
import type { CSSProperties, ReactNode } from "react";

const C = {
  up: "#e02a2a",
  down: "#2563eb",
  ma5: "#f59e0b",
  ma20: "#0ea5e9",
  ma60: "#16a34a",
  ma120: "#a855f7",
  bb: "#6366f1",
  vwap: "#ef4444",
  rsi: "#7c3aed",
  macd: "#0ea5e9",
  macdSignal: "#f59e0b",
  text: "var(--text-primary)",
  sub: "var(--text-secondary)",
  tert: "var(--text-tertiary)",
} as const;

type SwatchKind = "line" | "dashed" | "dot" | "fill" | "candle";

interface GuideItem {
  color: string;
  kind: SwatchKind;
  label: string;
  /** 정의 — 무엇인가 (한 줄) */
  what: string;
  /** 계산식 / 산출 방법 */
  how: ReactNode;
  /** 해석 가이드 (수치 구간이 있을 때 색상 강조 사용) */
  read: ReactNode;
  key: string;
}

function Swatch({ color, kind }: { color: string; kind: SwatchKind }) {
  const base: CSSProperties = { flexShrink: 0, display: "inline-block" };
  if (kind === "dot") {
    return <span aria-hidden style={{ ...base, width: 10, height: 10, borderRadius: 999, background: color }} />;
  }
  if (kind === "fill") {
    return (
      <span
        aria-hidden
        style={{
          ...base,
          width: 22,
          height: 10,
          borderRadius: 3,
          background: `${color}22`,
          border: `1px solid ${color}66`,
        }}
      />
    );
  }
  if (kind === "candle") {
    return (
      <span aria-hidden style={{ ...base, display: "inline-flex", gap: 2, alignItems: "center" }}>
        <span style={{ width: 4, height: 12, background: C.up, borderRadius: 1 }} />
        <span style={{ width: 4, height: 12, background: C.down, borderRadius: 1 }} />
      </span>
    );
  }
  return (
    <svg width={22} height={6} aria-hidden style={base as React.CSSProperties}>
      <line
        x1={1}
        y1={3}
        x2={21}
        y2={3}
        stroke={color}
        strokeWidth={kind === "dashed" ? 2 : 2.4}
        strokeDasharray={kind === "dashed" ? "3 3" : undefined}
        strokeLinecap="round"
      />
    </svg>
  );
}

function Row({ item }: { item: GuideItem }) {
  return (
    <li style={{ listStyle: "none", padding: "10px 0", borderTop: "1px dashed var(--border-subtle, rgba(15,23,42,0.06))" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Swatch color={item.color} kind={item.kind} />
        <b style={{ fontSize: 12, color: item.color, letterSpacing: "-0.01em" }}>{item.label}</b>
        <span style={{ fontSize: 12, color: C.text }}>— {item.what}</span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "44px 1fr",
          rowGap: 3,
          columnGap: 8,
          marginLeft: 30,
          fontSize: 11.5,
          lineHeight: 1.65,
        }}
      >
        <span style={{ color: C.tert, fontWeight: 600 }}>계산</span>
        <span style={{ color: C.sub }}>{item.how}</span>
        <span style={{ color: C.tert, fontWeight: 600 }}>해석</span>
        <span style={{ color: C.sub }}>{item.read}</span>
      </div>
    </li>
  );
}

interface IndicatorGuideProps {
  isIntraday: boolean;
  proMode: boolean;
  detailedMode?: boolean;
  showMarkers?: boolean;
  style?: CSSProperties;
  defaultOpen?: boolean;
}

export function IndicatorGuide({
  isIntraday,
  proMode,
  detailedMode = false,
  showMarkers = true,
  style,
  defaultOpen = false,
}: IndicatorGuideProps) {
  const items: GuideItem[] = [];

  if (proMode) {
    items.push({
      key: "candle",
      color: C.up,
      kind: "candle",
      label: "캔들",
      what: "한 봉의 시가·고가·저가·종가를 한 번에 표시합니다.",
      how: "몸통은 시가에서 종가까지의 구간, 위·아래 꼬리는 고가·저가까지의 폭. 한국식 표기로 종가가 시가보다 높으면 빨간 양봉, 낮으면 파란 음봉.",
      read: "긴 몸통은 강한 방향성, 긴 꼬리는 큰 장중 변동성을 의미합니다.",
    });
  }

  if (!proMode) {
    items.push({
      key: "close",
      color: "var(--text-primary)",
      kind: "line",
      label: isIntraday ? "가격" : "종가",
      what: isIntraday ? "각 분봉의 종가를 이은 추세선입니다." : "일별 정규장 종가를 이은 추세선입니다.",
      how: isIntraday
        ? "선택된 봉 단위(5/15/30분, 1시간) 마감가를 그대로 연결."
        : "한국 정규장 종가(15:30) 기준의 일별 가격을 연결.",
      read: "기본 추세선입니다. 다른 지표는 이 선을 보조하여 해석합니다.",
    });
  }

  if (proMode) {
    items.push({
      key: "ma5",
      color: C.ma5,
      kind: "line",
      label: "MA5",
      what: "최근 5봉 종가의 단순이동평균입니다.",
      how: "SMA(5) = 최근 5개 봉 종가의 산술평균.",
      read: "현재가가 MA5 위면 직전 5봉 평균보다 높은 가격, 아래면 평균 미만에서 거래되고 있음을 의미합니다.",
    });
  }
  items.push({
    key: "ma20",
    color: C.ma20,
    kind: "line",
    label: proMode ? "MA20" : isIntraday ? "MA20 (20봉 평균)" : "20일 평균",
    what: "최근 20봉 종가의 단순이동평균입니다. 단기 추세선으로 가장 널리 사용됩니다.",
    how: "SMA(20) = 최근 20개 봉 종가의 산술평균. 일봉 기준 약 1개월에 해당합니다.",
    read: (
      <>
        가격이 MA20 위면 단기 강세, 아래면 단기 약세로 해석합니다.{" "}
        <b style={{ color: C.up }}>MA5 가 MA20 을 상향 돌파</b>하면 골든크로스,{" "}
        <b style={{ color: C.down }}>하향 돌파</b>하면 데드크로스로 정의합니다.
      </>
    ),
  });
  if (proMode || detailedMode) {
    items.push({
      key: "ma60",
      color: C.ma60,
      kind: proMode ? "line" : "dashed",
      label: proMode ? "MA60" : isIntraday ? "MA60 (60봉 평균)" : "60일 평균",
      what: "최근 60봉 종가의 단순이동평균입니다. 중기 추세선입니다.",
      how: "SMA(60) = 최근 60개 봉 종가의 산술평균. 일봉 기준 약 3개월(1분기).",
      read: "MA20 이 MA60 을 상향 돌파하면서 우상향이면 중기 추세 전환으로 해석합니다.",
    });
  }
  if (proMode) {
    items.push({
      key: "ma120",
      color: C.ma120,
      kind: "line",
      label: "MA120",
      what: "최근 120봉 종가의 단순이동평균입니다. 장기 추세선입니다.",
      how: "SMA(120) = 최근 120개 봉 종가의 산술평균. 일봉 기준 약 6개월.",
      read: "가격이 MA120 위에서 횡보하면 장기 우상향 구간으로 해석합니다.",
    });

    items.push({
      key: "bb",
      color: C.bb,
      kind: "fill",
      label: "볼린저 밴드 (20, 2σ)",
      what: "MA20 을 중심으로 상·하 표준편차 2배 폭의 변동성 채널입니다.",
      how: "중심선 = MA20, 상단 = MA20 + 2σ, 하단 = MA20 − 2σ (σ는 최근 20봉 종가 표준편차). 정규분포 기준 약 95% 가격이 채널 안에 분포합니다.",
      read: (
        <>
          밴드 폭이 좁아지는 구간(스퀴즈)은 변동성 축적을 의미합니다.{" "}
          <b style={{ color: C.up }}>상단 터치는 단기 과열</b>,{" "}
          <b style={{ color: C.down }}>하단 터치는 단기 과매도</b> 영역으로 해석합니다. 단, 강한 추세장에서는 가격이 밴드를 따라 추세 방향으로 이어 갈 수 있습니다.
        </>
      ),
    });

    if (isIntraday) {
      items.push({
        key: "vwap",
        color: C.vwap,
        kind: "dashed",
        label: "VWAP",
        what: "거래량 가중 평균가격입니다. 기관 매매의 평균 체결 단가 기준선으로 사용됩니다.",
        how: "VWAP = Σ(대표가 × 거래량) ÷ Σ(거래량). 대표가는 (고 + 저 + 종) ÷ 3. 장 시작 시점부터 누적 계산합니다.",
        read: "VWAP 위에서 매수하면 평균 체결 단가보다 비싸게 매수한 것입니다. VWAP 부근의 지지·저항이 자주 관찰됩니다.",
      });
    }

    items.push({
      key: "rsi",
      color: C.rsi,
      kind: "line",
      label: "RSI(14)",
      what: "최근 14봉의 상승·하락 강도 비율입니다. 0~100 범위.",
      how: "RSI = 100 − 100 ÷ (1 + RS), RS = 14봉 평균 상승폭 ÷ 14봉 평균 하락폭. 평균은 Wilder의 지수이동평균을 사용합니다.",
      read: (
        <>
          <b style={{ color: C.up }}>70 이상 과매수</b>,{" "}
          <b style={{ color: C.down }}>30 이하 과매도</b> 영역으로 해석합니다. 가격이 신고가인데 RSI 가 직전 고점을 갱신하지 못하면 하락 다이버전스(추세 약화)로 봅니다.
        </>
      ),
    });

    items.push({
      key: "macd",
      color: C.macd,
      kind: "line",
      label: "MACD (12, 26, 9)",
      what: "단·장기 이동평균의 격차를 추적하는 추세 전환 지표입니다.",
      how: (
        <>
          MACD = EMA(12) − EMA(26), Signal = EMA(MACD, 9), Histogram = MACD − Signal. 막대(Hist)는 두 선의 거리를 시각화한 값입니다.
        </>
      ),
      read: "MACD 가 Signal 을 상향 돌파하면 매수, 하향 돌파하면 매도 신호로 해석합니다. Histogram 의 부호 전환이 가장 빠르며, 0 선 돌파는 더 묵직한 추세 전환을 의미합니다.",
    });
  }

  if (showMarkers) {
    items.push({
      key: "marker",
      color: C.up,
      kind: "dot",
      label: "예측 · 체결 마커",
      what: "AI 분석의 추천 시점, 또는 실제 매수·매도 체결 지점을 표시합니다.",
      how: "분석 결과의 추천 시점과 주문 체결 기록을 차트의 (날짜, 가격) 좌표에 점으로 표시합니다.",
      read: "분석 시점과 실제 체결 시점의 차이를 시각적으로 비교할 수 있습니다.",
    });
  }

  return (
    <details
      style={{
        marginTop: 10,
        paddingTop: 8,
        borderTop: "1px solid var(--border-subtle, rgba(15,23,42,0.06))",
        ...style,
      }}
      open={defaultOpen}
    >
      <summary
        style={{
          fontSize: 12,
          color: "var(--text-secondary)",
          cursor: "pointer",
          listStyle: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontWeight: 600,
        }}
      >
        <Icon name="info" size={12} decorative />
        지표 해석 가이드
        <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", fontWeight: 500 }}>
          · 선·점·색의 의미와 계산식
        </span>
      </summary>
      <ul style={{ margin: "8px 0 0", padding: 0 }}>
        {items.map((it) => (
          <Row key={it.key} item={it} />
        ))}
      </ul>
      <p style={{ marginTop: 8, fontSize: 10.5, color: "var(--text-tertiary)", lineHeight: 1.55 }}>
        본 지표는 과거 데이터를 가공한 보조 자료입니다. 단일 지표만으로 매매를 결정하지 않도록 권장합니다.
      </p>
    </details>
  );
}
