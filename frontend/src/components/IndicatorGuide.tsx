"use client";

/**
 * 차트 지표 해석 가이드 (통합).
 *
 * 같은 컴포넌트가 간단/상세 모드, 일봉/분봉 모두에서 일관된 톤·디자인으로
 * 필요한 항목만 노출한다. 각 항목은 `무엇 / 계산 / 해석` 3단으로 친절하게 설명.
 *
 * 톤 가이드 (서비스 공통):
 *  - 존댓말 종결, "~예요/이에요" 위주의 부드러운 톤
 *  - 단정적 표현 지양 ("매수 신호" → "매수 후보로 자주 해석돼요")
 *  - 숫자/구간은 강조용 색상(상승=빨강, 하락=파랑)을 본문 강조에 재사용
 */

import { Icon } from "@/components/ui";
import type { CSSProperties, ReactNode } from "react";

// 차트와 동일한 팔레트 (StockChartPro 와 일치시킬 것)
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
  /** 색상 스와치 색상 (선/도트/면 모두 이 색을 사용) */
  color: string;
  /** 스와치 모양 */
  kind: SwatchKind;
  /** 라벨 (지표명) */
  label: string;
  /** 한 줄 정의 — 무엇인가 */
  what: string;
  /** 어떻게 계산되는가 */
  how: ReactNode;
  /** 어떻게 읽으면 되는가 */
  read: ReactNode;
  /** 표시 키. 같은 키는 한 번만 노출 */
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
      <div style={{ display: "grid", gridTemplateColumns: "44px 1fr", rowGap: 3, columnGap: 8, marginLeft: 30, fontSize: 11.5, lineHeight: 1.65 }}>
        <span style={{ color: C.tert, fontWeight: 600 }}>계산</span>
        <span style={{ color: C.sub }}>{item.how}</span>
        <span style={{ color: C.tert, fontWeight: 600 }}>해석</span>
        <span style={{ color: C.sub }}>{item.read}</span>
      </div>
    </li>
  );
}

interface IndicatorGuideProps {
  /** 분봉 모드 여부 (1d/5d 등) — VWAP 노출, 라벨 변경 */
  isIntraday: boolean;
  /** 상세(프로) 모드 여부 — RSI/MACD/볼밴/MA60·120 노출 */
  proMode: boolean;
  /** 간단 모드에서 "상세 모드" 스위치를 켰는지 — MA60 노출 */
  detailedMode?: boolean;
  /** 마커 (예측·체결) 표시 여부 */
  showMarkers?: boolean;
  /** 외곽 컨테이너 스타일 보조 */
  style?: CSSProperties;
  /** open by default */
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

  // 1) 캔들 (Pro 모드 전용 — 간단 모드는 라인 차트라 캔들 없음)
  if (proMode) {
    items.push({
      key: "candle",
      color: C.up,
      kind: "candle",
      label: "캔들",
      what: "한 봉의 시가·고가·저가·종가를 한 번에 보여줘요",
      how: "몸통은 시가↔종가 구간, 위아래 꼬리는 고가·저가까지의 폭이에요. 한국식 표기라 종가가 시가보다 높으면 빨간 양봉, 낮으면 파란 음봉이에요.",
      read: (
        <>
          긴 몸통은 그날의 방향성이 강했다는 뜻이에요. 위·아래 꼬리가 길면 장중 변동이 컸음을 의미하고, 꼬리만 길고 몸통이 짧으면
          매수·매도 압력이 팽팽했다는 신호로 자주 해석돼요.
        </>
      ),
    });
  }

  // 2) 종가 라인 (간단 모드 전용)
  if (!proMode) {
    items.push({
      key: "close",
      color: "var(--text-primary)",
      kind: "line",
      label: isIntraday ? "가격" : "종가",
      what: isIntraday ? "각 분봉의 종가를 이은 추세선이에요" : "매일 장 마감 시점의 가격을 이은 선이에요",
      how: isIntraday
        ? "5/15/30분/1시간 단위로 마감된 가격을 그대로 이어 그린 거예요."
        : "한국 정규장 종가(15:30) 기준으로 일별 가격을 이어요.",
      read: "가장 기본이 되는 추세선이에요. 다른 지표는 모두 이 선을 보조해서 읽기 위한 도구예요.",
    });
  }

  // 3) 이동평균선
  // 간단 모드: MA20 + (detailedMode ? MA60 : -)
  // 프로 모드: MA5/20/60/120 모두
  if (proMode) {
    items.push({
      key: "ma5",
      color: C.ma5,
      kind: "line",
      label: "MA5",
      what: "최근 5봉의 평균 — 가장 빠르게 반응하는 단기선이에요",
      how: "최근 5개 봉의 종가를 산술평균해 매 봉마다 다시 계산해요(SMA).",
      read: "현재가가 MA5 위면 직전 5봉 동안 평균보다 비싸게 거래되고 있다는 뜻이에요. 단기 모멘텀 가늠용으로 자주 써요.",
    });
  }
  items.push({
    key: "ma20",
    color: C.ma20,
    kind: "line",
    label: proMode ? "MA20" : isIntraday ? "MA20 (20봉 평균)" : "20일 평균",
    what: proMode
      ? "최근 20봉의 평균 — 단기 추세를 가장 많이 참고하는 기준선이에요"
      : isIntraday
        ? "최근 20개 봉 평균. 단기 모멘텀 가늠선이에요"
        : "약 한 달의 평균 주가 — 단기 추세선이에요",
    how: "최근 20개 봉의 종가를 산술평균해요(SMA). 일봉이면 약 1개월, 시간봉이면 약 2~3거래일에 해당해요.",
    read: (
      <>
        가격이 MA20 위면 단기 강세, 아래면 단기 약세로 자주 해석돼요. <b style={{ color: C.up }}>MA5가 MA20을 위로 뚫으면 골든크로스</b>,{" "}
        <b style={{ color: C.down }}>아래로 깨면 데드크로스</b>로 모멘텀 변화를 가늠해요.
      </>
    ),
  });
  if (proMode || detailedMode) {
    items.push({
      key: "ma60",
      color: C.ma60,
      kind: proMode ? "line" : "dashed",
      label: proMode ? "MA60" : isIntraday ? "MA60 (60봉 평균)" : "60일 평균",
      what: "약 분기 단위의 평균 — 중기 추세선이에요",
      how: "최근 60개 봉의 종가를 산술평균해요. 일봉이면 약 3개월(1분기) 흐름이에요.",
      read: "MA20이 MA60을 위로 돌파해 우상향이면 중기 추세 전환 신호로 자주 봐요. MA60 자체의 기울기도 중기 흐름의 방향을 보여줘요.",
    });
  }
  if (proMode) {
    items.push({
      key: "ma120",
      color: C.ma120,
      kind: "line",
      label: "MA120",
      what: "약 반년 평균 — 장기 추세선이에요",
      how: "최근 120개 봉의 종가를 산술평균해요. 일봉이면 약 6개월에 해당해요.",
      read: "장기 매수·매도세의 평균선으로, 가격이 MA120 위에서 횡보하면 장기 우상향 구간으로 자주 해석돼요. 큰 추세를 잃지 않으려는 기관 투자자가 참고해요.",
    });

    items.push({
      key: "bb",
      color: C.bb,
      kind: "fill",
      label: "볼린저 밴드 (20, 2σ)",
      what: "MA20 위·아래로 표준편차 2배만큼 펼쳐진 변동성 채널이에요",
      how: "중심선은 MA20, 상·하단은 ±2σ(최근 20봉 종가의 표준편차 2배). 가격이 통계적으로 95% 구간 안에 들어오는 띠예요.",
      read: (
        <>
          밴드 폭이 좁아지면(스퀴즈) 변동성 축적 → 큰 움직임 임박 신호로 자주 봐요.{" "}
          <b style={{ color: C.up }}>상단 터치는 단기 과열</b>,{" "}
          <b style={{ color: C.down }}>하단 터치는 단기 과매도</b> 영역으로 해석되지만, 강한 추세장에서는 밴드를 따라 계속 걷는 점도 함께 봐요.
        </>
      ),
    });

    if (isIntraday) {
      items.push({
        key: "vwap",
        color: C.vwap,
        kind: "dashed",
        label: "VWAP",
        what: "거래량 가중 평균가격 — 기관·알고리즘이 기준선으로 삼는 값이에요",
        how: "장 시작부터 누적된 (대표가격 × 거래량) 합계를 누적 거래량으로 나눠요. 대표가격은 보통 (고+저+종)/3을 써요.",
        read: "VWAP보다 비싸게 사면 평균보다 비싸게 매수한 셈이에요. 기관 매수세는 대체로 VWAP 아래에서 분할 매수하므로, VWAP 부근의 지지·저항을 자주 활용해요.",
      });
    }

    items.push({
      key: "rsi",
      color: C.rsi,
      kind: "line",
      label: "RSI(14)",
      what: "최근 14봉 동안의 상승·하락 강도 비율이에요 (0~100)",
      how: "14봉 동안의 평균 상승폭 ÷ (평균 상승폭 + 평균 하락폭) × 100. Wilder의 지수이동평균 방식을 써요.",
      read: (
        <>
          <b style={{ color: C.up }}>70 이상은 과매수</b>,{" "}
          <b style={{ color: C.down }}>30 이하는 과매도</b> 영역으로 통상 해석해요. 가격은 신고가인데 RSI는 직전 고점을 못 넘기면
          하락 다이버전스(추세 약화)로 자주 봐요.
        </>
      ),
    });

    items.push({
      key: "macd",
      color: C.macd,
      kind: "line",
      label: "MACD (12, 26, 9)",
      what: "단·장기 평균의 격차로 추세 전환을 잡는 지표예요",
      how: (
        <>
          MACD = EMA(12) − EMA(26), Signal = MACD의 EMA(9), Hist = MACD − Signal. 막대(Hist)는 두 선 사이 거리를 시각화한 거예요.
        </>
      ),
      read: (
        <>
          <b style={{ color: C.macd }}>MACD가 Signal을 위로 돌파</b>하면 매수, 아래로 깨면 매도 후보로 자주 봐요. Hist의 부호 전환이
          가장 빠른 신호이고, 기준선(0) 돌파는 좀 더 묵직한 추세 전환을 의미해요.
        </>
      ),
    });
  }

  // 마커
  if (showMarkers) {
    items.push({
      key: "marker",
      color: C.up,
      kind: "dot",
      label: "예측 · 체결 마커",
      what: "AI가 예측한 시점이나 실제 매수·매도가 일어난 지점을 표시해요",
      how: "분석 결과의 추천 시점(예측)과 주문 체결 기록을 좌표(날짜·가격) 위에 점으로 찍어요.",
      read: "분석 → 실행 사이의 흐름을 한 눈에 비교할 수 있어요. 점을 클릭하면 해당 시점의 상세 내역으로 이동해요.",
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
          · 선과 점, 색의 의미를 한 곳에 모았어요
        </span>
      </summary>
      <ul style={{ margin: "8px 0 0", padding: 0 }}>
        {items.map((it) => (
          <Row key={it.key} item={it} />
        ))}
      </ul>
      <p style={{ marginTop: 8, fontSize: 10.5, color: "var(--text-tertiary)", lineHeight: 1.55 }}>
        모든 지표는 과거 데이터를 가공한 보조 도구예요. 단일 지표만으로 매매를 결정하기보다, 여러 지표와 시장 상황을 함께
        살펴보세요.
      </p>
    </details>
  );
}
