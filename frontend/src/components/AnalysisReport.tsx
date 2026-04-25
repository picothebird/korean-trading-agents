"use client";

/**
 * AnalysisReport — 분석 완료 후 보여주는 "투자 회의록"
 * 활동 로그는 실시간 보조 표시이고, 이 리포트가 결정 근거의 정식 기록.
 * 주식 비전문가도 이해할 수 있도록 모든 수치/지표에 친절한 설명을 붙임.
 */

import { motion } from "framer-motion";
import type { TradeDecision } from "@/types";
import { Tooltip, Icon } from "@/components/ui";
import { AgreementDonut, ConfidenceGauge } from "@/components/viz/Primitives";

const ANALYST_LABEL: Record<string, { ko: string; what: string }> = {
  technical: {
    ko: "기술적 분석",
    what: "차트와 지표(이동평균선, RSI, MACD 등)로 가격 흐름의 방향과 모멘텀을 읽는 분석.",
  },
  fundamental: {
    ko: "기본적 분석",
    what: "기업의 매출·이익·자본 같은 펀더멘털 지표로 회사의 실제 가치와 현재 가격이 적정한지 판단.",
  },
  sentiment: {
    ko: "심리(뉴스) 분석",
    what: "최근 뉴스·공시·시장 분위기를 읽어 단기 투자 심리가 우호적인지 부정적인지 판단.",
  },
  macro: {
    ko: "거시(매크로) 분석",
    what: "금리·환율·코스피 흐름·업종 순환 등 시장 전체 환경이 이 종목에 우호적인지 점검.",
  },
};

const SIGNAL_CFG: Record<string, { color: string; bg: string; label: string }> = {
  BUY: { color: "var(--bull)", bg: "var(--bull-subtle)", label: "매수" },
  SELL: { color: "var(--bear)", bg: "var(--bear-subtle)", label: "매도" },
  HOLD: { color: "var(--hold)", bg: "var(--hold-subtle)", label: "관망" },
};

function Section({
  title,
  hint,
  children,
  index = 0,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  index?: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-xl)",
        padding: "16px 18px",
      }}
    >
      <header style={{ marginBottom: 10 }}>
        <h3
          style={{
            fontSize: 13,
            fontWeight: 800,
            color: "var(--text-primary)",
            margin: 0,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {title}
          {hint && (
            <Tooltip content={hint} maxWidth={300}>
              <span
                style={{
                  display: "inline-flex",
                  color: "var(--text-tertiary)",
                  cursor: "help",
                }}
              >
                <Icon name="info" size={12} decorative />
              </span>
            </Tooltip>
          )}
        </h3>
      </header>
      {children}
    </motion.section>
  );
}

function SignalBadge({ signal }: { signal: string }) {
  const cfg = SIGNAL_CFG[signal] ?? SIGNAL_CFG.HOLD;
  return (
    <span
      style={{
        display: "inline-block",
        background: cfg.bg,
        color: cfg.color,
        fontSize: 10,
        fontWeight: 800,
        padding: "2px 8px",
        borderRadius: 99,
        whiteSpace: "nowrap",
      }}
    >
      {cfg.label}
    </span>
  );
}

interface AnalysisReportProps {
  decision: TradeDecision;
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-secondary)" }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
      {label}
    </span>
  );
}

export function AnalysisReport({ decision }: AnalysisReportProps) {
  const s = decision.agents_summary;
  const details = s.analyst_details ?? {};
  const debate = s.debate;
  const risk = s.risk;
  const confidencePct = Math.round(decision.confidence * 100);
  const kelly = s.kelly_position_pct ?? s.position_size_pct ?? 0;
  const initialCapital = 10_000_000; // 1,000만원 가정 (UI 표시용)
  const positionWon = Math.round((initialCapital * kelly) / 100);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 헤더 — 회의록 안내 */}
      <div
        style={{
          padding: "10px 14px",
          background: "var(--brand-subtle)",
          border: "1px solid var(--brand-border)",
          borderRadius: "var(--radius-lg)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Icon name="list" size={16} decorative />
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: "var(--text-primary)" }}>
            AI 투자 회의록
          </p>
          <p style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 2, lineHeight: 1.5 }}>
            아래는 9개 AI 에이전트가 어떤 데이터를 어떻게 해석해 이 결정을 내렸는지에 대한
            정식 기록이에요. 화면 오른쪽의 실시간 활동 로그는 진행 상황 보조 표시일 뿐,
            결정 근거는 이 회의록을 보세요.
          </p>
        </div>
      </div>

      {/* Executive Summary — 30초 요약 (R1) */}
      <div style={{
        padding: "14px 16px",
        background: "var(--bg-elevated)",
        border: `2px solid ${SIGNAL_CFG[decision.action]?.color ?? "var(--border-default)"}`,
        borderRadius: "var(--radius-xl)",
      }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 8 }}>
          ⚡ 30초 요약
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 10, marginBottom: 10 }}>
          <div>
            <p style={{ fontSize: 9, color: "var(--text-tertiary)" }}>판단</p>
            <p style={{ fontSize: 16, fontWeight: 800, color: SIGNAL_CFG[decision.action]?.color }}>
              {SIGNAL_CFG[decision.action]?.label ?? decision.action}
            </p>
          </div>
          <div>
            <p style={{ fontSize: 9, color: "var(--text-tertiary)" }}>신뢰도</p>
            <p style={{ fontSize: 16, fontWeight: 800, color: confidencePct >= 70 ? "var(--success)" : confidencePct >= 50 ? "var(--warning)" : "var(--text-secondary)" }}>
              {confidencePct}%
            </p>
          </div>
          <div>
            <p style={{ fontSize: 9, color: "var(--text-tertiary)" }}>권장 비중</p>
            <p style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>
              {kelly.toFixed(1)}%
            </p>
          </div>
          <div>
            <p style={{ fontSize: 9, color: "var(--text-tertiary)" }}>예시 투입금</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
              {positionWon.toLocaleString("ko-KR")}원
            </p>
          </div>
        </div>
        <ul style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.7, paddingLeft: 16, margin: 0 }}>
          <li>
            <b>무엇을?</b> {decision.ticker} {SIGNAL_CFG[decision.action]?.label ?? decision.action}
            {decision.action === "BUY" ? ` · 자산의 ${kelly.toFixed(1)}% 비중 권장` : decision.action === "SELL" ? " · 보유분 일부/전부 정리 권장" : " · 추가 매수/매도 보류 권장"}
          </li>
          <li>
            <b>왜?</b> 9개 AI 에이전트 합의 신뢰도 {confidencePct}%
            {confidencePct >= 70 ? " — 의견 비교적 일치" : confidencePct >= 50 ? " — 의견 부분 합의" : " — 의견 분산"}
            {risk?.guru_action_changed ? " · GURU 정책으로 결정 보정됨" : ""}
          </li>
          <li>
            <b>다음 행동?</b>{" "}
            {decision.action === "HOLD"
              ? "관망. 백테스트로 다른 기간에서 어땠는지 확인해보세요."
              : `먼저 모의로 1주 시도 → 만족 시 실거래 ${kelly.toFixed(0)}%까지 단계적 진입 권장.`}
          </li>
        </ul>
      </div>

      {/* 분석 파이프라인 시각화 (P3.R2) */}
      <details style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
        padding: "10px 14px",
      }}>
        <summary style={{ fontSize: 11, color: "var(--text-secondary)", cursor: "pointer", fontWeight: 700, listStyle: "none" }}>
          🔀 9개 에이전트는 어떤 순서로 결정에 이르렀나요?
        </summary>
        <div style={{ marginTop: 10 }}>
          {/* 4단계 파이프라인 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 10 }}>
            {[
              { step: "L1", title: "분석", emoji: "🔍", body: "9명이 각자 데이터를 봅니다", color: "var(--brand-active)" },
              { step: "L2", title: "토론", emoji: "⚔️", body: `강세 vs 약세 ${debate?.rounds ?? 0}라운드`, color: "var(--warning)" },
              { step: "L3", title: "리스크", emoji: "🛡️", body: "위험·Kelly 산정", color: "var(--bear)" },
              { step: "L4", title: "결정", emoji: "🎯", body: `${SIGNAL_CFG[decision.action]?.label ?? decision.action} ${confidencePct}%`, color: SIGNAL_CFG[decision.action]?.color ?? "var(--text-primary)" },
            ].map((s, i) => (
              <div key={s.step} style={{ position: "relative" }}>
                <div style={{
                  background: "var(--bg-surface)",
                  border: `1px solid ${s.color}33`,
                  borderRadius: "var(--radius-md)",
                  padding: "8px 6px",
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: 16 }}>{s.emoji}</div>
                  <p style={{ fontSize: 9, color: s.color, fontWeight: 800, marginTop: 2 }}>{s.step} · {s.title}</p>
                  <p style={{ fontSize: 8, color: "var(--text-tertiary)", marginTop: 2, lineHeight: 1.3 }}>{s.body}</p>
                </div>
                {i < 3 && (
                  <span style={{
                    position: "absolute", right: -6, top: "50%", transform: "translateY(-50%)",
                    fontSize: 10, color: "var(--text-quaternary)", zIndex: 1,
                  }}>
                    →
                  </span>
                )}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 9, color: "var(--text-tertiary)", lineHeight: 1.55 }}>
            각 단계의 산출물이 다음 단계의 입력으로 전달됩니다. 토론 라운드가 길수록 신뢰도가 보정되고, 리스크 매니저가 Kelly 비중을 깎거나 GURU 정책이 결과를 강제로 바꿀 수도 있습니다.
          </p>
        </div>
      </details>

      {/* 1. 한 줄 요약 (사람의 말) */}
      <Section title="1. 한 줄 요약" index={0}>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7 }}>
          <strong style={{ color: "var(--text-primary)" }}>
            {decision.ticker}
          </strong>
          에 대해 AI는{" "}
          <SignalBadge signal={decision.action} />{" "}
          판단을 내렸어요.{" "}
          <Tooltip
            content="9개 AI 에이전트의 의견 일치 정도와 데이터의 명확함을 종합해 0~100%로 환산한 값입니다. 70% 이상이면 의견이 비교적 일치한 상태이고, 50% 미만이면 의견이 크게 갈렸다는 뜻이에요."
            maxWidth={320}
          >
            <span style={{ borderBottom: "1px dotted var(--text-tertiary)", cursor: "help" }}>
              신뢰도 {confidencePct}%
            </span>
          </Tooltip>
          {" "}로,{" "}
          {confidencePct >= 75
            ? "에이전트들의 의견이 상당히 일치합니다."
            : confidencePct >= 55
            ? "에이전트들의 의견이 어느 정도 모였습니다."
            : "에이전트들의 의견이 갈려 신중한 판단이 필요해요."}
        </p>
      </Section>

      {/* MS-D D2: 합의도 도넛 + 반대 의견 강조 */}
      {(() => {
        const finalAction = decision.action;
        const dEntries = Object.entries(details);
        let agree = 0;
        let disagree = 0;
        let neutral = 0;
        const dissent: { key: string; ko: string; signal: string; conf: number }[] = [];
        for (const [k, d] of dEntries) {
          const sig = String(d?.signal ?? "").toUpperCase();
          if (sig === finalAction) agree++;
          else if (sig === "HOLD" || !sig) neutral++;
          else {
            disagree++;
            dissent.push({
              key: k,
              ko: ANALYST_LABEL[k]?.ko ?? k,
              signal: sig,
              conf: Math.round((d?.confidence ?? 0) * 100),
            });
          }
        }
        if (agree + disagree + neutral === 0) return null;
        return (
          <Section
            title="1-bis. 9 에이전트 합의도"
            hint="9명의 AI 에이전트(분석가 4 + 연구원 2 + 리스크/포트폴리오/구루 3)가 최종 결정과 같은 방향이었는지 한눈에 확인."
            index={0}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <AgreementDonut agree={agree} disagree={disagree} neutral={neutral} size={72} thickness={9} />
              <div style={{ flex: 1, minWidth: 180, display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", gap: 12, fontSize: 11, flexWrap: "wrap" }}>
                  <Legend color="var(--bull)" label={`찬성 ${agree}명`} />
                  <Legend color="var(--bear)" label={`반대 ${disagree}명`} />
                  <Legend color="var(--text-tertiary)" label={`중립 ${neutral}명`} />
                </div>
                <div style={{ marginTop: 4 }}>
                  <ConfidenceGauge value={decision.confidence} size={50} thickness={6} />
                </div>
              </div>
            </div>
            {dissent.length > 0 && (
              <div
                style={{
                  marginTop: 12,
                  padding: "10px 12px",
                  background: "var(--bear-subtle)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--bear-border)",
                }}
              >
                <p style={{ fontSize: 11, fontWeight: 800, color: "var(--bear)", margin: 0 }}>
                  ⚠ 반대 의견 ({dissent.length}명)
                </p>
                <p style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.6 }}>
                  최종 결정과 다른 신호를 낸 에이전트가 있습니다. 결정 전 이 의견을 반드시 검토하세요.
                </p>
                <ul style={{ marginTop: 8, paddingLeft: 16, fontSize: 11, color: "var(--text-primary)" }}>
                  {dissent.map((x) => (
                    <li key={x.key} style={{ marginBottom: 2 }}>
                      <strong>{x.ko}</strong> — <SignalBadge signal={x.signal} /> (신뢰도 {x.conf}%)
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>
        );
      })()}

      {/* 2. L1 — 4명의 분석가가 본 시장 */}
      <Section
        title="2. 분석가 4명이 본 시장 (L1)"
        hint="기술·기본·심리·매크로 4가지 관점을 가진 AI 분석가가 동시에 같은 종목을 평가하고, 각자 매수/매도/관망 신호를 냅니다."
        index={1}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Object.entries(ANALYST_LABEL).map(([key, meta]) => {
            const d = details[key];
            if (!d) return null;
            const conf = Math.round((d.confidence ?? 0) * 100);
            return (
              <div
                key={key}
                style={{
                  background: "var(--bg-elevated)",
                  borderRadius: "var(--radius-md)",
                  padding: "10px 12px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <Tooltip content={meta.what} maxWidth={300}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--text-primary)",
                        borderBottom: "1px dotted var(--text-tertiary)",
                        cursor: "help",
                      }}
                    >
                      {meta.ko}
                    </span>
                  </Tooltip>
                  <SignalBadge signal={d.signal} />
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 10,
                      color: "var(--text-tertiary)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    확신도 {conf}%
                  </span>
                </div>
                {d.summary && (
                  <p
                    style={{
                      fontSize: 11,
                      color: "var(--text-secondary)",
                      lineHeight: 1.6,
                      margin: 0,
                    }}
                  >
                    {d.summary}
                  </p>
                )}
                {d.key_signals && d.key_signals.length > 0 && (
                  <ul
                    style={{
                      fontSize: 10,
                      color: "var(--text-tertiary)",
                      marginTop: 6,
                      marginBottom: 0,
                      paddingLeft: 16,
                      lineHeight: 1.55,
                    }}
                  >
                    {d.key_signals.slice(0, 3).map((sig, i) => (
                      <li key={i}>{sig}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* 3. L2 — 강세 vs 약세 토론 */}
      {debate && (debate.bull_stance || debate.bear_stance) && (
        <Section
          title={`3. 강세 vs 약세 토론 (L2 · ${debate.rounds || 0}라운드)`}
          hint="L1 분석을 바탕으로 강세론(매수해야 한다) AI와 약세론(사지 말고 기다려야 한다) AI가 서로 반박하며 논의합니다. 라운드가 진행될수록 상대 주장에 대한 반박이 쌓여요."
          index={2}
        >
          {/* 토론 스코어 공개 (P3.R3) */}
          {(() => {
            const bullPts = debate.bull_key_points?.length ?? 0;
            const bearPts = debate.bear_key_points?.length ?? 0;
            const bullRounds = debate.bull_rounds?.length ?? 0;
            const bearRounds = debate.bear_rounds?.length ?? 0;
            const action = decision.action;
            const winner = action === "BUY" ? "bull" : action === "SELL" ? "bear" : "draw";
            const total = Math.max(1, bullPts + bearPts);
            const bullPct = (bullPts / total) * 100;
            return (
              <div style={{ marginBottom: 10, padding: "10px 12px", background: "var(--bg-elevated)", borderRadius: "var(--radius-md)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: "var(--bull)", fontWeight: 700 }}>
                    🐂 강세 {bullPts}점 / {bullRounds}라운드 {winner === "bull" && "🏆"}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>토론 결과</span>
                  <span style={{ fontSize: 10, color: "var(--bear)", fontWeight: 700 }}>
                    {winner === "bear" && "🏆 "}🐻 약세 {bearPts}점 / {bearRounds}라운드
                  </span>
                </div>
                <div style={{ display: "flex", height: 5, borderRadius: 99, overflow: "hidden", background: "var(--border-subtle)" }}>
                  <div style={{ width: `${bullPct}%`, background: "var(--bull)" }} />
                  <div style={{ width: `${100 - bullPct}%`, background: "var(--bear)" }} />
                </div>
                <p style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 6, lineHeight: 1.5 }}>
                  최종 결정 <b style={{ color: winner === "bull" ? "var(--bull)" : winner === "bear" ? "var(--bear)" : "var(--text-secondary)" }}>{action}</b>은
                  {winner === "draw" ? " 양쪽 의견이 팽팽해 보류로 결론났습니다." : ` ${winner === "bull" ? "강세론" : "약세론"} 측의 논리가 더 설득력 있다고 평가받았습니다.`}
                </p>
              </div>
            );
          })()}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div
              style={{
                background: "var(--bull-subtle)",
                border: "1px solid var(--bull-border)",
                borderRadius: "var(--radius-md)",
                padding: "10px 12px",
              }}
            >
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "var(--bull)",
                  marginBottom: 6,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Icon name="trend-up" size={12} decorative /> 강세론 (매수)
              </p>
              <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                {debate.bull_stance}
              </p>
              {debate.bull_key_points?.length > 0 && (
                <ul
                  style={{
                    fontSize: 10,
                    color: "var(--text-tertiary)",
                    marginTop: 6,
                    paddingLeft: 16,
                    lineHeight: 1.55,
                  }}
                >
                  {debate.bull_key_points.slice(0, 3).map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
            <div
              style={{
                background: "var(--bear-subtle)",
                border: "1px solid var(--bear-border)",
                borderRadius: "var(--radius-md)",
                padding: "10px 12px",
              }}
            >
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "var(--bear)",
                  marginBottom: 6,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Icon name="trend-down" size={12} decorative /> 약세론 (매도/관망)
              </p>
              <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                {debate.bear_stance}
              </p>
              {debate.bear_key_points?.length > 0 && (
                <ul
                  style={{
                    fontSize: 10,
                    color: "var(--text-tertiary)",
                    marginTop: 6,
                    paddingLeft: 16,
                    lineHeight: 1.55,
                  }}
                >
                  {debate.bear_key_points.slice(0, 3).map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Section>
      )}

      {/* 4. L3 — 리스크 평가 + Kelly 포지션 */}
      {risk && (
        <Section
          title="4. 리스크 평가와 적정 투자금 (L3)"
          hint="토론 결과를 바탕으로 리스크 매니저 AI가 위험도를 평가하고, Kelly Criterion(켈리 공식)으로 자본 대비 몇 %를 투자해야 장기 기대수익이 최대가 되는지 계산해요."
          index={3}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 10 }}>
            <div
              style={{
                background: "var(--bg-elevated)",
                borderRadius: "var(--radius-md)",
                padding: "10px 12px",
              }}
            >
              <p style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 3 }}>
                <Tooltip
                  content="LOW(낮음) · MEDIUM(보통) · HIGH(높음) · CRITICAL(매우 위험)의 4단계. 변동성, 거시 환경, 종목 고유 위험을 종합해 산출됩니다."
                  maxWidth={300}
                >
                  <span style={{ borderBottom: "1px dotted var(--text-tertiary)", cursor: "help" }}>
                    위험도
                  </span>
                </Tooltip>
              </p>
              <p style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>
                {risk.risk_level ?? "—"}
              </p>
            </div>
            <div
              style={{
                background: "var(--bg-elevated)",
                borderRadius: "var(--radius-md)",
                padding: "10px 12px",
              }}
            >
              <p style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 3 }}>
                <Tooltip
                  content={`켈리 공식 f* = (b·p − q) ÷ b 의 절반(Half-Kelly) 값을 사용해요. 여기서 p는 평균 신뢰도(${risk.avg_confidence_pct ?? "—"}%), b는 평균 기대수익/평균 손실 비율, q는 1−p. 즉 “자본의 ${kelly}%만 투자하라”는 권고예요. 이렇게 하면 한 번 크게 잃어도 다음에 회복 가능합니다.`}
                  maxWidth={340}
                >
                  <span style={{ borderBottom: "1px dotted var(--text-tertiary)", cursor: "help" }}>
                    Kelly 권장 포지션
                  </span>
                </Tooltip>
              </p>
              <p style={{ fontSize: 14, fontWeight: 800, color: "var(--brand)" }}>{kelly}%</p>
              <p style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 2 }}>
                자본 1,000만원 기준 ≈ {positionWon.toLocaleString("ko-KR")}원
              </p>
            </div>
            <div
              style={{
                background: "var(--bg-elevated)",
                borderRadius: "var(--radius-md)",
                padding: "10px 12px",
              }}
            >
              <p style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 3 }}>
                <Tooltip
                  content="매수 후 가격이 이 비율 이상 떨어지면 자동으로 손실을 확정하고 빠져나오는 방어선입니다. 한국 시장 평균 변동성과 위험도를 함께 고려해 정해져요."
                  maxWidth={300}
                >
                  <span style={{ borderBottom: "1px dotted var(--text-tertiary)", cursor: "help" }}>
                    손절 라인
                  </span>
                </Tooltip>
              </p>
              <p style={{ fontSize: 14, fontWeight: 800, color: "var(--bear)" }}>
                −{risk.stop_loss_pct ?? "—"}%
              </p>
            </div>
          </div>

          {risk.key_risks && risk.key_risks.length > 0 && (
            <div>
              <p style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 700, marginBottom: 4 }}>
                지금 가장 큰 위험 요인
              </p>
              <ul
                style={{
                  fontSize: 11,
                  color: "var(--text-secondary)",
                  margin: 0,
                  paddingLeft: 18,
                  lineHeight: 1.65,
                }}
              >
                {risk.key_risks.slice(0, 3).map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          {risk.summary && (
            <p
              style={{
                fontSize: 11,
                color: "var(--text-tertiary)",
                marginTop: 8,
                lineHeight: 1.6,
                fontStyle: "italic",
              }}
            >
              요약: {risk.summary}
            </p>
          )}
        </Section>
      )}

      {/* 5. 액션 플랜 */}
      <Section
        title="5. 다음에 무엇을 하면 되는지 (액션 플랜)"
        hint="실제 매매에 옮길 때 참고할 진입/청산 전략이에요. 여기 적힌 비율과 가격대는 권고이며, 최종 실행 여부는 사용자가 결정합니다."
        index={4}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {s.entry_strategy && (
            <div
              style={{
                background: "var(--bg-elevated)",
                borderRadius: "var(--radius-md)",
                padding: "10px 12px",
              }}
            >
              <p style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 700, marginBottom: 3 }}>
                진입 전략
              </p>
              <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                {s.entry_strategy}
              </p>
            </div>
          )}
          {s.exit_strategy && (
            <div
              style={{
                background: "var(--bg-elevated)",
                borderRadius: "var(--radius-md)",
                padding: "10px 12px",
              }}
            >
              <p style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 700, marginBottom: 3 }}>
                청산 전략
              </p>
              <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                {s.exit_strategy}
              </p>
            </div>
          )}
          <div
            style={{
              background: "var(--warning-subtle)",
              border: "1px solid var(--warning-border)",
              borderRadius: "var(--radius-md)",
              padding: "8px 12px",
              fontSize: 10,
              color: "var(--text-secondary)",
              lineHeight: 1.6,
            }}
          >
            ⚠️ 본 회의록은 AI 의견이며 투자 권유가 아닙니다. 실제 투자 손실에 대한 책임은 사용자에게 있어요.
            소액부터 시작하고, 한 종목에 자본의 25% 이상을 절대 넣지 마세요.
          </div>
        </div>
      </Section>
    </div>
  );
}
