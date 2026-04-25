"use client";

/**
 * MeetingMinutes — 회의록 격상 (MS-S4).
 *
 * 5 섹션:
 *  1. Headline — 결정 헤드라인 + AgreementDonut + ConfidenceGauge
 *  2. Analysts — 4 분석가 카드
 *  3. Debate — 강세⇄약세 좌우 대칭
 *  4. Risk — Kelly + 손절/목표가 + 자연어
 *  5. Actions — 모의 1주 / PDF / 공유
 *
 * AnalysisReport와 다른 점: 픽셀 무대 안에 통합되는 톤. 큰 헤드라인 + 좌석 토론 시각화.
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import type { TradeDecision } from "@/types";
import { AgreementDonut, ConfidenceGauge } from "@/components/viz/Primitives";
import { useAgentStage, type StageMode } from "@/stores/useAgentStage";

interface MeetingMinutesProps {
  decision: TradeDecision;
  mode: Exclude<StageMode, "live">;
  onTryPaper?: () => void;
}

const SIGNAL_CFG: Record<string, { color: string; bg: string; label: string }> = {
  BUY: { color: "var(--bull)", bg: "var(--bull-subtle)", label: "매수" },
  SELL: { color: "var(--bear)", bg: "var(--bear-subtle)", label: "매도" },
  HOLD: { color: "var(--hold)", bg: "var(--hold-subtle)", label: "관망" },
};

const ANALYST_KO: Record<string, string> = {
  technical: "윤 차트 (기술적 분석)",
  fundamental: "박 펀더 (펀더멘털 분석)",
  sentiment: "한 심리 (뉴스·심리 분석)",
  macro: "류 매크로 (거시 분석)",
};

const SECTION_DELAY_MS = 80;

function Section({
  index,
  title,
  hint,
  children,
}: {
  index: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.42,
        delay: (index * SECTION_DELAY_MS) / 1000,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="stage-card-soft"
      style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}
    >
      <header
        style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 800,
            color: "var(--text-primary)",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h3>
        {hint && (
          <span className="stage-label" style={{ color: "var(--text-tertiary)" }}>
            {hint}
          </span>
        )}
      </header>
      {children}
    </motion.section>
  );
}

function MinutesHeadline({ decision }: { decision: TradeDecision }) {
  const sigKey =
    decision.action === "BUY" || decision.action === "SELL" ? decision.action : "HOLD";
  const cfg = SIGNAL_CFG[sigKey];
  const score = Math.round(decision.confidence * 100);
  const signals = decision.agents_summary.analyst_signals;
  const debate = decision.agents_summary.debate;
  const debateText = debate
    ? `토론 ${debate.rounds}라운드 진행`
    : "토론 미진행";
  const consensusText = useMemo(() => {
    const total = signals.BUY + signals.SELL + signals.HOLD;
    if (total === 0) return "분석가 의견 수집 중";
    const max = Math.max(signals.BUY, signals.SELL, signals.HOLD);
    const winner =
      signals.BUY === max ? "매수" : signals.SELL === max ? "매도" : "관망";
    return `4명 분석가 중 ${max}명이 ${winner} 의견`;
  }, [signals]);

  return (
    <Section index={0} title="AI 9명의 결정">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 12,
                height: 12,
                background: cfg.color,
                borderRadius: "var(--stage-radius-sharp)",
              }}
            />
            <span
              className="stage-headline"
              style={{ fontSize: 28, color: cfg.color }}
            >
              {cfg.label}
            </span>
            <span
              className="stage-headline"
              style={{
                fontSize: 18,
                color: "var(--text-secondary)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              신뢰도 {score}%
            </span>
          </div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            {consensusText} · {debateText}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
            {decision.reasoning}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <AgreementDonut agree={signals.BUY} disagree={signals.SELL} neutral={signals.HOLD} size={64} />
          <ConfidenceGauge value={decision.confidence} size={64} />
        </div>
      </div>
    </Section>
  );
}

function MinutesAnalysts({ decision }: { decision: TradeDecision }) {
  const details = decision.agents_summary.analyst_details ?? {};
  const winner = decision.action;
  return (
    <Section index={1} title="분석가 4명 의견">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 10,
        }}
      >
        {Object.entries(details).map(([key, d]) => {
          const sigKey = d.signal === "BUY" || d.signal === "SELL" ? d.signal : "HOLD";
          const cfg = SIGNAL_CFG[sigKey];
          const dissenting = d.signal !== winner && d.signal !== "HOLD";
          return (
            <article
              key={key}
              style={{
                border: `1px solid ${dissenting ? "var(--warning)" : "var(--stage-border)"}`,
                borderLeft: `4px solid ${cfg.color}`,
                background: "var(--bg-surface)",
                borderRadius: "var(--stage-radius)",
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <header
                style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}
              >
                <span
                  style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}
                >
                  {ANALYST_KO[key] ?? key}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: cfg.color,
                    fontFamily: "var(--stage-font-label)",
                  }}
                >
                  {cfg.label} · {Math.round(d.confidence * 100)}%
                </span>
              </header>
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  lineHeight: 1.5,
                }}
              >
                {d.summary}
              </p>
              {d.key_signals && d.key_signals.length > 0 && (
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 16,
                    fontSize: 11,
                    color: "var(--text-tertiary)",
                    lineHeight: 1.5,
                  }}
                >
                  {d.key_signals.slice(0, 3).map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              )}
              {dissenting && (
                <span
                  className="stage-label"
                  style={{ color: "var(--warning)", marginTop: 2 }}
                >
                  반대 의견
                </span>
              )}
            </article>
          );
        })}
      </div>
    </Section>
  );
}

function MinutesDebate({ decision }: { decision: TradeDecision }) {
  const debate = decision.agents_summary.debate;
  if (!debate) {
    return (
      <Section index={2} title="강세 vs 약세 토론">
        <div className="stage-label" style={{ color: "var(--text-tertiary)" }}>
          토론 데이터 없음 — 분석가 의견 일치도가 높아 토론 단계 스킵.
        </div>
      </Section>
    );
  }
  const bullRounds = debate.bull_rounds ?? [];
  const bearRounds = debate.bear_rounds ?? [];
  const rounds = Math.max(bullRounds.length, bearRounds.length, debate.rounds);
  const judge = debate.judge_score;

  return (
    <Section index={2} title="강세 vs 약세 토론" hint={`${rounds}라운드`}>
      {judge && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            gap: 8,
            alignItems: "center",
            padding: "8px 10px",
            background: "var(--bg-overlay)",
            border: "1px solid var(--stage-border)",
            borderRadius: "var(--stage-radius)",
            marginBottom: 8,
          }}
        >
          <div style={{ textAlign: "left" }}>
            <span className="stage-label" style={{ color: "var(--bull)" }}>
              강세
            </span>
            <div
              className="stage-headline"
              style={{
                fontSize: 18,
                color: judge.winner === "BULL" ? "var(--bull)" : "var(--text-secondary)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {judge.bull_score}점
            </div>
          </div>
          <div
            className="stage-label"
            style={{
              color:
                judge.winner === "BULL"
                  ? "var(--bull)"
                  : judge.winner === "BEAR"
                  ? "var(--bear)"
                  : "var(--text-tertiary)",
              fontWeight: 800,
            }}
          >
            {judge.winner === "BULL" ? "▶ 강세" : judge.winner === "BEAR" ? "약세 ◀" : "무승부"}
          </div>
          <div style={{ textAlign: "right" }}>
            <span className="stage-label" style={{ color: "var(--bear)" }}>
              약세
            </span>
            <div
              className="stage-headline"
              style={{
                fontSize: 18,
                color: judge.winner === "BEAR" ? "var(--bear)" : "var(--text-secondary)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {judge.bear_score}점
            </div>
          </div>
          <div
            style={{
              gridColumn: "1 / -1",
              fontSize: 11,
              color: "var(--text-tertiary)",
              lineHeight: 1.5,
              marginTop: 4,
            }}
          >
            {judge.reasoning}
          </div>
        </div>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            className="stage-label"
            style={{ color: "var(--bull)", fontWeight: 800 }}
          >
            ▲ 강세 (불 연구원)
          </div>
          {bullRounds.map((r) => (
            <div
              key={`b-${r.round}`}
              style={{
                background: "var(--bull-subtle)",
                border: "1px solid var(--bull-border)",
                borderRadius: "var(--stage-radius)",
                padding: "8px 10px",
                fontSize: 12,
                color: "var(--text-primary)",
                lineHeight: 1.5,
              }}
            >
              <span className="stage-label" style={{ color: "var(--bull)" }}>
                R{r.round}
              </span>
              <p style={{ margin: "4px 0 0 0" }}>{r.argument}</p>
            </div>
          ))}
          {bullRounds.length === 0 && (
            <div className="stage-label" style={{ color: "var(--text-tertiary)" }}>
              {debate.bull_stance}
            </div>
          )}
        </div>
        <div
          aria-hidden
          style={{
            width: 1,
            background: "var(--stage-border)",
            margin: "0 4px",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            className="stage-label"
            style={{ color: "var(--bear)", fontWeight: 800, textAlign: "right" }}
          >
            약세 (베어 연구원) ▼
          </div>
          {bearRounds.map((r) => (
            <div
              key={`x-${r.round}`}
              style={{
                background: "var(--bear-subtle)",
                border: "1px solid var(--bear-border)",
                borderRadius: "var(--stage-radius)",
                padding: "8px 10px",
                fontSize: 12,
                color: "var(--text-primary)",
                lineHeight: 1.5,
                textAlign: "right",
              }}
            >
              <span className="stage-label" style={{ color: "var(--bear)" }}>
                R{r.round}
              </span>
              <p style={{ margin: "4px 0 0 0" }}>{r.argument}</p>
            </div>
          ))}
          {bearRounds.length === 0 && (
            <div
              className="stage-label"
              style={{ color: "var(--text-tertiary)", textAlign: "right" }}
            >
              {debate.bear_stance}
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

function MinutesRisk({ decision }: { decision: TradeDecision }) {
  const s = decision.agents_summary;
  const kelly = s.kelly_position_pct ?? s.risk?.kelly_position_pct ?? 0;
  const applied = s.position_size_pct ?? 0;
  const stop = s.stop_loss_pct ?? s.risk?.stop_loss_pct ?? null;
  const wonPer1m = Math.round((1_000_000 * applied) / 100);
  return (
    <Section index={3} title="리스크 매니저(권 리스크) 권고">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
          }}
        >
          <div className="stage-card" style={{ padding: 10 }}>
            <div className="stage-label">Kelly 권장</div>
            <div
              className="stage-headline"
              style={{ fontSize: 18, fontVariantNumeric: "tabular-nums" }}
            >
              {kelly.toFixed(1)}%
            </div>
          </div>
          <div className="stage-card" style={{ padding: 10 }}>
            <div className="stage-label">실제 적용</div>
            <div
              className="stage-headline"
              style={{ fontSize: 18, color: "var(--brand)", fontVariantNumeric: "tabular-nums" }}
            >
              {applied.toFixed(1)}%
            </div>
          </div>
        </div>
        <div
          style={{
            background: "var(--bg-overlay)",
            border: "1px solid var(--stage-border)",
            borderRadius: "var(--stage-radius)",
            padding: 10,
            fontSize: 12,
            color: "var(--text-secondary)",
            lineHeight: 1.6,
          }}
        >
          쉽게 말하면, 100만원이 있으면{" "}
          <strong style={{ color: "var(--text-primary)" }}>
            {(wonPer1m / 10_000).toFixed(0)}만원
          </strong>
          만 이 종목에 쓰고
          {stop != null && (
            <>
              ,{" "}
              <strong style={{ color: "var(--bear)" }}>
                {Math.abs(stop).toFixed(1)}% 떨어지면 칼같이 끊으라는 권고
              </strong>
            </>
          )}
          .
        </div>
        {s.risk?.key_risks && s.risk.key_risks.length > 0 && (
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 12,
              color: "var(--text-secondary)",
              lineHeight: 1.6,
            }}
          >
            {s.risk.key_risks.slice(0, 3).map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

function MinutesActions({
  decision,
  onTryPaper,
}: {
  decision: TradeDecision;
  onTryPaper?: () => void;
}) {
  const goBack = () => useAgentStage.getState().setMode("live", true);
  return (
    <Section index={4} title="실행">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button
          type="button"
          onClick={onTryPaper}
          disabled={!onTryPaper}
          style={{
            padding: "10px 16px",
            background: "var(--brand)",
            color: "var(--text-inverse)",
            border: "1px solid var(--brand)",
            borderRadius: "var(--stage-radius)",
            fontWeight: 700,
            fontSize: 13,
            cursor: onTryPaper ? "pointer" : "not-allowed",
            boxShadow: "0 1px 0 0 var(--brand-active)",
          }}
        >
          📝 모의 1주 시도
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          style={{
            padding: "10px 16px",
            background: "var(--bg-surface)",
            color: "var(--text-primary)",
            border: "1px solid var(--stage-border-strong)",
            borderRadius: "var(--stage-radius)",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          PDF로 저장
        </button>
        <button
          type="button"
          onClick={goBack}
          style={{
            padding: "10px 16px",
            background: "transparent",
            color: "var(--text-secondary)",
            border: "1px solid var(--stage-border)",
            borderRadius: "var(--stage-radius)",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
            marginLeft: "auto",
          }}
        >
          라이브로 돌아가기
        </button>
      </div>
      <div className="stage-label" style={{ color: "var(--text-quaternary)", marginTop: 4 }}>
        {decision.ticker} · {new Date(decision.timestamp).toLocaleString("ko-KR")}
      </div>
    </Section>
  );
}

export function MeetingMinutes({ decision, mode, onTryPaper }: MeetingMinutesProps) {
  return (
    <div
      role="region"
      aria-label="투자 회의록"
      style={{
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        gap: "var(--stage-grid)",
        maxHeight: mode === "report" ? "none" : "55vh",
        overflowY: "auto",
        padding: "var(--stage-grid)",
        background: "var(--bg-overlay)",
        border: "1px solid var(--stage-border)",
        borderRadius: "var(--stage-radius-soft)",
      }}
    >
      <MinutesHeadline decision={decision} />
      <MinutesAnalysts decision={decision} />
      <MinutesDebate decision={decision} />
      <MinutesRisk decision={decision} />
      <MinutesActions decision={decision} onTryPaper={onTryPaper} />
    </div>
  );
}
