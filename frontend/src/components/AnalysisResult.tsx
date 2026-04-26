"use client";

/**
 * AnalysisResult — 분석 탭 본문의 단일 결과 패널.
 *
 * 기존 DecisionCard + AnalysisReport + MeetingMinutes(회의실 내부) 3곳에
 * 흩어져 같은 정보를 2~3번 반복하던 구조를, 사용자의 정보 인지 흐름
 * (결론 → 왜 → 얼마/언제 → 합의도/반대 → 상세 회의록)에 맞춰 하나의 카드로
 * 통합한다. 캐릭터식 이름(윤차트 등) 대신 `AGENT_LABEL`을 단일 출처로 사용.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { TradeDecision } from "@/types";
import { Tooltip, Icon } from "@/components/ui";
import { AgreementDonut, ConfidenceGauge } from "@/components/viz/Primitives";

const ACTION_CFG = {
  BUY: { label: "매수", color: "var(--bull)", bg: "var(--bull-subtle)", border: "var(--bull-border)", hex: "#F04452" },
  SELL: { label: "매도", color: "var(--bear)", bg: "var(--bear-subtle)", border: "var(--bear-border)", hex: "#2B7EF5" },
  HOLD: { label: "관망", color: "var(--hold)", bg: "var(--hold-subtle)", border: "var(--border-default)", hex: "#8B95A1" },
} as const;

// 4 분석가 한글명 — agentLabels.AGENT_LABEL 과 동일한 표기로 통일.
// (회의실/리포트 어디서도 동일 라벨 사용)
const ANALYST_LABEL: Record<string, { ko: string; what: string }> = {
  technical: {
    ko: "기술적 분석",
    what: "차트와 지표(이동평균선, RSI, MACD 등)로 가격 흐름의 방향과 모멘텀을 읽는 분석.",
  },
  fundamental: {
    ko: "펀더멘털 분석",
    what: "기업의 매출·이익·자본 같은 펀더멘털 지표로 회사의 실제 가치와 현재 가격이 적정한지 판단.",
  },
  sentiment: {
    ko: "감성 분석",
    what: "최근 뉴스·공시·시장 분위기를 읽어 단기 투자 심리가 우호적인지 부정적인지 판단.",
  },
  macro: {
    ko: "거시 분석",
    what: "금리·환율·코스피 흐름·업종 순환 등 시장 전체 환경이 이 종목에 우호적인지 점검.",
  },
};

const SPRING = { ease: [0.16, 1, 0.3, 1] as const, duration: 0.5 };
const INITIAL_CAPITAL = 10_000_000; // 1,000만원 가정 (예시 표시용)

interface AnalysisResultProps {
  decision: TradeDecision;
  onHumanApproval?: () => void;
  onOpenSettings?: () => void;
  onGoTrading?: () => void;
  onGoBacktest?: () => void;
  onGoAutoLoop?: () => void;
}

function SignalBadge({ signal }: { signal: string }) {
  const cfg = ACTION_CFG[signal as keyof typeof ACTION_CFG] ?? ACTION_CFG.HOLD;
  return (
    <span
      style={{
        display: "inline-block",
        background: cfg.bg,
        color: cfg.color,
        fontSize: 12,
        fontWeight: 800,
        padding: "3px 9px",
        borderRadius: 99,
        whiteSpace: "nowrap",
      }}
    >
      {cfg.label}
    </span>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--text-secondary)", fontSize: 13 }}>
      <span style={{ width: 9, height: 9, borderRadius: 2, background: color }} />
      {label}
    </span>
  );
}

function Card({
  children,
  index = 0,
  emphasis = false,
}: {
  children: React.ReactNode;
  index?: number;
  emphasis?: boolean;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
      style={{
        background: "var(--bg-surface)",
        border: emphasis ? "1px solid var(--brand-border)" : "1px solid var(--border-default)",
        borderRadius: "var(--radius-xl)",
        padding: "16px 18px",
      }}
    >
      {children}
    </motion.section>
  );
}

function CardTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <h3
      style={{
        fontSize: 13,
        fontWeight: 800,
        color: "var(--text-primary)",
        margin: "0 0 10px 0",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {children}
      {hint && (
        <Tooltip content={hint} maxWidth={300}>
          <span style={{ display: "inline-flex", color: "var(--text-tertiary)", cursor: "help" }}>
            <Icon name="info" size={12} decorative />
          </span>
        </Tooltip>
      )}
    </h3>
  );
}

export function AnalysisResult({
  decision,
  onHumanApproval,
  onOpenSettings,
  onGoTrading,
  onGoBacktest,
  onGoAutoLoop,
}: AnalysisResultProps) {
  const s = decision.agents_summary;
  const cfg = ACTION_CFG[decision.action as keyof typeof ACTION_CFG] ?? ACTION_CFG.HOLD;
  const confidencePct = Math.round(decision.confidence * 100);
  const kelly = s.kelly_position_pct ?? s.position_size_pct ?? 0;
  const positionWon = Math.round((INITIAL_CAPITAL * kelly) / 100);
  const stopLossPct = s.stop_loss_pct ?? s.risk?.stop_loss_pct ?? null;
  const riskLevel = s.risk?.risk_level ?? s.risk_level;
  const needsApproval = s.requires_human_approval;
  const guru = s.guru;
  const guruEnabled = Boolean(guru?.enabled);
  const debate = s.debate;
  const details = s.analyst_details ?? {};
  const signals = s.analyst_signals;

  // GURU 30일 누적 통계
  const [guruStats, setGuruStats] = useState<{ total: number; changed: number; defensive: number }>({
    total: 0,
    changed: 0,
    defensive: 0,
  });
  useEffect(() => {
    if (!guruEnabled || !guru) return;
    try {
      const KEY = "kta_guru_history_v1";
      const now = Date.now();
      const cutoff = now - 30 * 86_400_000;
      const raw = window.localStorage.getItem(KEY);
      const arr: Array<{ t: number; ch: boolean; lc: number; ac: number }> = raw ? JSON.parse(raw) : [];
      const last = arr[arr.length - 1];
      const newItem = { t: now, ch: !!guru.action_changed, lc: guru.llm_confidence, ac: decision.confidence };
      if (!last || now - last.t > 1000) arr.push(newItem);
      const filtered = arr.filter((x) => x.t > cutoff).slice(-200);
      window.localStorage.setItem(KEY, JSON.stringify(filtered));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGuruStats({
        total: filtered.length,
        changed: filtered.filter((x) => x.ch).length,
        defensive: filtered.filter((x) => x.ch && x.lc > x.ac).length,
      });
    } catch {
      /* ignore */
    }
  }, [guru, guruEnabled, decision.confidence]);

  // 합의도/반대 의견 집계
  const analystKeys = Object.keys(ANALYST_LABEL);
  let agree = 0;
  let disagree = 0;
  let neutral = 0;
  let missing = 0;
  const dissent: { key: string; ko: string; signal: string; conf: number; summary?: string }[] = [];
  for (const k of analystKeys) {
    const d = details[k];
    const sig = String(d?.signal ?? "").toUpperCase();
    if (!d || !sig) {
      missing++;
      continue;
    }
    if (sig === decision.action) agree++;
    else if (sig === "HOLD") neutral++;
    else {
      disagree++;
      dissent.push({
        key: k,
        ko: ANALYST_LABEL[k]?.ko ?? k,
        signal: sig,
        conf: Math.round((d?.confidence ?? 0) * 100),
        summary: d?.summary,
      });
    }
  }
  const reported = agree + disagree + neutral;
  const expectedTotal = analystKeys.length;
  const agreePctOfReported = reported > 0 ? Math.round((agree / reported) * 100) : 0;

  // 핵심 근거 한 줄들 (L1/L2/L3)
  const l1Line = reported > 0
    ? `분석가 ${reported}명: 같은 방향 ${agree}명${disagree > 0 ? ` · 반대 ${disagree}명` : ""}${neutral > 0 ? ` · 중립 ${neutral}명` : ""}`
    : "분석가 보고 대기";
  const l2Line = debate
    ? (() => {
        const bp = debate.bull_key_points?.length ?? 0;
        const xp = debate.bear_key_points?.length ?? 0;
        return `토론 ${debate.rounds || 0}라운드: 강세 ${bp}점 vs 약세 ${xp}점`;
      })()
    : "토론 단계 스킵 (의견 일치도 높음)";
  const l3Line = `위험 ${riskLevel ?? "—"} · Kelly ${kelly.toFixed(1)}%${stopLossPct != null ? ` · 손절 −${Math.abs(stopLossPct).toFixed(1)}%` : ""}`;

  return (
    <AnimatePresence>
      <motion.div
        key={decision.timestamp}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={SPRING}
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        {/* ──────────────────────────── [1] 결론 헤더 ──────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, scale: 0.97, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={SPRING}
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-2xl)",
            boxShadow: "var(--shadow-lg)",
            overflow: "hidden",
          }}
        >
          <div style={{ height: 6, background: cfg.color }} />
          <div style={{ padding: 22 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                  최종 매매 결정
                </p>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <motion.span
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    transition={{ ...SPRING, delay: 0.1 }}
                    style={{ fontSize: 56, fontWeight: 800, color: cfg.color, lineHeight: 1, letterSpacing: "-0.02em" }}
                  >
                    {cfg.label}
                  </motion.span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>{decision.ticker}</span>
                </div>
                <p style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 10, lineHeight: 1.65 }}>
                  자산의 <b style={{ color: cfg.color }}>{kelly.toFixed(1)}%</b> {decision.action === "BUY" ? "매수" : decision.action === "SELL" ? "매도" : "보류"} 권장
                  {kelly > 0 && (
                    <>
                      <br />
                      <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>1,000만원 기준 ≈ {positionWon.toLocaleString("ko-KR")}원</span>
                    </>
                  )}
                </p>
              </div>

              {/* 신뢰도 도넛 */}
              <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                <ConfidenceGauge value={decision.confidence} size={76} thickness={7} />
                <Tooltip
                  content="9개 AI 에이전트의 의견 일치도와 데이터의 명확함을 종합해 0~100%로 환산한 값. 70% 이상이면 의견이 비교적 일치, 50% 미만이면 의견이 크게 갈렸다는 뜻. AI 판단이 맞는다는 보장은 아닙니다."
                  maxWidth={300}
                >
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)", borderBottom: "1px dotted var(--text-tertiary)", cursor: "help", display: "inline-flex", alignItems: "center", gap: 3 }}>
                    <Icon name="info" size={11} decorative /> 신뢰도 (9명 종합)
                  </span>
                </Tooltip>
              </div>
            </div>

            {/* 승인 필요 배너 */}
            {needsApproval && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                style={{
                  background: "var(--warning-subtle)",
                  border: "1px solid var(--warning-border)",
                  borderRadius: "var(--radius-lg)",
                  padding: "10px 14px",
                  marginBottom: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--warning)", display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <Icon name="warning" size={14} decorative />
                    승인이 필요해요
                  </p>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3, lineHeight: 1.55 }}>
                    신뢰도가 높거나 한 번에 들어가는 자금이 커서, 직접 확인한 뒤 실행할 수 있어요.
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  {onOpenSettings && (
                    <button
                      onClick={onOpenSettings}
                      style={{
                        background: "var(--bg-surface)",
                        color: "var(--text-secondary)",
                        fontSize: 12,
                        fontWeight: 700,
                        padding: "7px 12px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border-default)",
                        cursor: "pointer",
                      }}
                    >
                      승인 정책
                    </button>
                  )}
                  {onHumanApproval && (
                    <button
                      onClick={onHumanApproval}
                      style={{
                        background: "var(--warning)",
                        color: "var(--text-inverse)",
                        fontSize: 13,
                        fontWeight: 700,
                        padding: "8px 16px",
                        borderRadius: "var(--radius-md)",
                        border: "none",
                        cursor: "pointer",
                        boxShadow: "var(--shadow-sm)",
                      }}
                    >
                      검토하기
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {/* GURU 정책 한 줄 요약 (자세한 통계는 [5] 상세 회의록) */}
            {guruEnabled && guru && (
              <div
                style={{
                  background: guru.action_changed ? "var(--warning-subtle)" : "var(--brand-subtle)",
                  border: `1px solid ${guru.action_changed ? "var(--warning-border)" : "var(--brand-border)"}`,
                  borderRadius: "var(--radius-lg)",
                  padding: "10px 14px",
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  lineHeight: 1.55,
                }}
              >
                <b style={{ color: guru.action_changed ? "var(--warning)" : "var(--brand-active)" }}>
                  GURU 정책 ({guru.risk_profile})
                </b>{" "}
                · AI 합의 {guru.llm_action} {Math.round(guru.llm_confidence * 100)}% <Icon name="arrow-right" size={11} decorative style={{ verticalAlign: "middle" }} /> 최종 {guru.final_action}
                {guru.action_changed && " · 정책에 의해 보정됨"}
              </div>
            )}
          </div>
        </motion.section>

        {/* ─────────────────────────── [2] 핵심 근거 ─────────────────────────── */}
        <Card index={1}>
          <CardTitle>핵심 근거</CardTitle>
          <p style={{ fontSize: 14, color: "var(--text-primary)", lineHeight: 1.7, marginBottom: 12 }}>
            {decision.reasoning}
          </p>
          <ul style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.75, paddingLeft: 18, margin: 0 }}>
            <li><b>L1 분석</b> — {l1Line}</li>
            <li><b>L2 토론</b> — {l2Line}</li>
            <li><b>L3 리스크</b> — {l3Line}</li>
          </ul>
          <details style={{ marginTop: 10 }}>
            <summary style={{ fontSize: 12, color: "var(--text-tertiary)", cursor: "pointer", padding: "5px 0", listStyle: "none", display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Icon name="calculator" size={13} decorative /> 신뢰도 {confidencePct}%는 어떻게 계산됐나요?
            </summary>
            <div style={{ marginTop: 6, padding: "12px 14px", background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7 }}>
              <p style={{ marginBottom: 6 }}>
                <b>신뢰도 = 합의 정도 × 데이터 명확함</b>
              </p>
              <ol style={{ paddingLeft: 18, margin: 0 }}>
                <li><b>합의 정도</b>: 9개 에이전트의 BUY/SELL/HOLD 표가 한쪽으로 얼마나 쏠렸는지</li>
                <li><b>데이터 명확함</b>: 각 에이전트의 자체 신뢰도(데이터 충분성·노이즈)의 평균</li>
                <li>토론(Bull vs Bear) 단계 점수가 가산</li>
                <li>리스크 매니저의 위험 등급에 따라 감산</li>
              </ol>
              <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-tertiary)" }}>
                ※ 신뢰도가 높아도 "수익 보장"은 아닙니다. AI 합의 + 데이터 품질의 척도예요.
              </p>
            </div>
          </details>
        </Card>

        {/* ─────────────────────────── [3] 액션 플랜 ─────────────────────────── */}
        <Card index={2} emphasis>
          <CardTitle hint="실제 매매에 옮길 때 참고할 진입/청산 전략과 안전 한도. 최종 실행 여부는 사용자가 결정합니다.">
            액션 플랜
          </CardTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 12 }}>
            {kelly > 0 && (
              <div style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-lg)", padding: "12px 14px" }}>
                <Tooltip
                  content={`켈리 공식 f* = (b·p − q) ÷ b 의 절반(Half-Kelly). p=평균 신뢰도(${s.risk?.avg_confidence_pct ?? Math.round(decision.confidence * 100)}%), b=평균 기대수익/손실비, q=1−p. “자본의 ${kelly.toFixed(1)}%만 투자”의 의미.`}
                  maxWidth={340}
                >
                  <p style={{ fontSize: 12, color: "var(--text-tertiary)", borderBottom: "1px dotted var(--text-tertiary)", display: "inline-flex", alignItems: "center", gap: 3, cursor: "help" }}>
                    <Icon name="info" size={11} decorative /> Kelly 권장
                  </p>
                </Tooltip>
                <p style={{ fontSize: 22, fontWeight: 800, color: cfg.color, marginTop: 4, letterSpacing: "-0.02em" }}>{kelly.toFixed(1)}%</p>
                <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 3 }}>
                  1,000만원 기준 ≈ {positionWon.toLocaleString("ko-KR")}원
                </p>
              </div>
            )}
            {riskLevel && (
              <div style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-lg)", padding: "12px 14px" }}>
                <Tooltip
                  content="LOW(낮음) · MEDIUM(보통) · HIGH(높음) · CRITICAL(매우 위험)의 4단계. 변동성·거시 환경·종목 고유 위험을 종합해 산출."
                  maxWidth={300}
                >
                  <p style={{ fontSize: 12, color: "var(--text-tertiary)", borderBottom: "1px dotted var(--text-tertiary)", display: "inline-flex", alignItems: "center", gap: 3, cursor: "help" }}>
                    <Icon name="info" size={11} decorative /> 위험 등급
                  </p>
                </Tooltip>
                <p style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", marginTop: 4 }}>{riskLevel}</p>
              </div>
            )}
            {stopLossPct != null && (
              <div style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-lg)", padding: "12px 14px" }}>
                <Tooltip
                  content="매수 후 가격이 이 비율 이상 떨어지면 자동으로 손실을 확정하고 빠져나오는 방어선."
                  maxWidth={300}
                >
                  <p style={{ fontSize: 12, color: "var(--text-tertiary)", borderBottom: "1px dotted var(--text-tertiary)", display: "inline-flex", alignItems: "center", gap: 3, cursor: "help" }}>
                    <Icon name="info" size={11} decorative /> 손절 라인
                  </p>
                </Tooltip>
                <p style={{ fontSize: 22, fontWeight: 800, color: "var(--bear)", marginTop: 4, letterSpacing: "-0.02em" }}>−{Math.abs(stopLossPct).toFixed(1)}%</p>
              </div>
            )}
          </div>

          {(s.entry_strategy || s.exit_strategy) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {s.entry_strategy && (
                <div style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", padding: "10px 14px" }}>
                  <p style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>진입 전략</p>
                  <p style={{ fontSize: 14, color: "var(--text-primary)", lineHeight: 1.65 }}>{s.entry_strategy}</p>
                </div>
              )}
              {s.exit_strategy && (
                <div style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", padding: "10px 14px" }}>
                  <p style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>청산 전략</p>
                  <p style={{ fontSize: 14, color: "var(--text-primary)", lineHeight: 1.65 }}>{s.exit_strategy}</p>
                </div>
              )}
            </div>
          )}

          {/* CTA */}
          {(onGoTrading || onGoBacktest || onGoAutoLoop) && (
            <div style={{ paddingTop: 10, borderTop: "1px dashed var(--border-subtle)" }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-tertiary)", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 10 }}>
                이제 무엇을 할까요?
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10 }}>
                {onGoTrading && (
                  <button
                    onClick={onGoTrading}
                    style={{
                      padding: "12px 10px",
                      borderRadius: "var(--radius-lg)",
                      border: `1px solid ${cfg.hex}55`,
                      background: cfg.bg,
                      color: cfg.color,
                      fontSize: 13,
                      fontWeight: 800,
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                      lineHeight: 1.3,
                    }}
                  >
                    <Icon name="wallet" size={18} decorative />
                    매매 탭에서 주문
                  </button>
                )}
                {onGoBacktest && (
                  <button
                    onClick={onGoBacktest}
                    style={{
                      padding: "12px 10px",
                      borderRadius: "var(--radius-lg)",
                      border: "1px solid var(--border-default)",
                      background: "var(--bg-elevated)",
                      color: "var(--text-primary)",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                      lineHeight: 1.3,
                    }}
                  >
                    <Icon name="chart-bar" size={18} decorative />
                    백테스트로 검증
                  </button>
                )}
                {onGoAutoLoop && (
                  <button
                    onClick={onGoAutoLoop}
                    style={{
                      padding: "12px 10px",
                      borderRadius: "var(--radius-lg)",
                      border: "1px solid var(--border-default)",
                      background: "var(--bg-elevated)",
                      color: "var(--text-primary)",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                      lineHeight: 1.3,
                    }}
                  >
                    <Icon name="robot" size={18} decorative />
                    자동매매 설정
                  </button>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* ─────────────────────────── [4] 합의도 & 반대 의견 ─────────────────────────── */}
        {(reported > 0 || missing > 0) && (
          <Card index={3}>
            <CardTitle hint="기술·펀더멘털·감성·거시 4명의 분석가 중 최종 결정과 같은 방향으로 신호를 낸 비율. 보고가 누락된 분석가가 있으면 함께 표시돼요.">
              분석가 합의도 (보고 {reported} / {expectedTotal}명)
            </CardTitle>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <AgreementDonut agree={agree} disagree={disagree} neutral={neutral} missing={missing} size={72} thickness={9} />
              <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <Legend color="var(--bull)" label={`찬성 ${agree}명`} />
                  <Legend color="var(--bear)" label={`반대 ${disagree}명`} />
                  <Legend color="var(--text-tertiary)" label={`중립 ${neutral}명`} />
                  {missing > 0 && <Legend color="var(--border-default)" label={`보고 누락 ${missing}명`} />}
                </div>
                <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0, lineHeight: 1.55 }}>
                  {reported === 0
                    ? "분석가 보고가 아직 도착하지 않았습니다."
                    : `보고 기준 합의율 ${agreePctOfReported}% · 결정과 같은 방향 ${agree} / ${reported}명`}
                </p>
              </div>
            </div>
            {dissent.length > 0 && (
              <div
                style={{
                  marginTop: 14,
                  padding: "12px 14px",
                  background: "var(--bear-subtle)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--bear-border)",
                }}
              >
                <p style={{ fontSize: 14, fontWeight: 800, color: "var(--bear)", margin: 0, display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Icon name="warning" size={14} decorative />
                  반대 의견 ({dissent.length}명) — 결정 전 반드시 확인하세요
                </p>
                <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 13, color: "var(--text-primary)", lineHeight: 1.7 }}>
                  {dissent.map((x) => (
                    <li key={x.key} style={{ marginBottom: 6 }}>
                      <strong>{x.ko}</strong> — <SignalBadge signal={x.signal} /> 확신 {x.conf}%
                      {x.summary && (
                        <span style={{ color: "var(--text-secondary)", display: "block", fontSize: 12, marginTop: 3, lineHeight: 1.6 }}>
                          {x.summary}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        )}

        {/* ─────────────────────────── [5] 상세 회의록 (접힘) ─────────────────────────── */}
        <Card index={4}>
          <details>
            <summary
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: "var(--text-primary)",
                cursor: "pointer",
                listStyle: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                <Icon name="document" size={16} decorative />
                상세 회의록 (분석가 4명 · 토론 · 리스크)
              </span>
              <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 3 }}>
                펼치기 <Icon name="chevron-down" size={12} decorative />
              </span>
            </summary>

            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
              {/* 5-A. 분석가 4명 */}
              <div>
                <p style={{ fontSize: 13, fontWeight: 800, color: "var(--text-secondary)", marginBottom: 10 }}>
                  분석가 4명이 본 시장 (L1)
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {Object.entries(ANALYST_LABEL).map(([key, meta]) => {
                    const d = details[key];
                    if (!d) {
                      return (
                        <div
                          key={key}
                          style={{
                            background: "var(--bg-elevated)",
                            borderRadius: "var(--radius-md)",
                            padding: "12px 14px",
                            opacity: 0.55,
                          }}
                        >
                          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-tertiary)" }}>
                            {meta.ko}
                          </span>
                          <span style={{ fontSize: 12, color: "var(--text-tertiary)", marginLeft: 10 }}>
                            보고 누락
                          </span>
                        </div>
                      );
                    }
                    const conf = Math.round((d.confidence ?? 0) * 100);
                    const dissenting = d.signal !== decision.action && d.signal !== "HOLD";
                    return (
                      <div
                        key={key}
                        style={{
                          background: "var(--bg-elevated)",
                          borderRadius: "var(--radius-md)",
                          padding: "12px 14px",
                          borderLeft: `3px solid ${(ACTION_CFG[d.signal as keyof typeof ACTION_CFG] ?? ACTION_CFG.HOLD).hex}`,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                          <Tooltip content={meta.what} maxWidth={300}>
                            <span
                              style={{
                                fontSize: 13,
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
                          {dissenting && (
                            <span
                              style={{
                                fontSize: 11,
                                color: "var(--warning)",
                                fontWeight: 800,
                                padding: "2px 7px",
                                background: "var(--warning-subtle)",
                                borderRadius: 99,
                              }}
                            >
                              반대
                            </span>
                          )}
                          <span
                            style={{
                              marginLeft: "auto",
                              fontSize: 12,
                              color: "var(--text-tertiary)",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            확신 {conf}%
                          </span>
                        </div>
                        {d.summary && (
                          <p style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.65, margin: 0 }}>
                            {d.summary}
                          </p>
                        )}
                        {d.key_signals && d.key_signals.length > 0 && (
                          <ul style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 7, marginBottom: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                            {d.key_signals.slice(0, 3).map((sig, i) => (
                              <li key={i}>{sig}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 5-B. 토론 */}
              {debate && (debate.bull_stance || debate.bear_stance) && (
                <div>
                  <p style={{ fontSize: 13, fontWeight: 800, color: "var(--text-secondary)", marginBottom: 10 }}>
                    강세 vs 약세 토론 (L2 · {debate.rounds || 0}라운드)
                  </p>
                  {debate.judge_score && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto 1fr",
                        gap: 10,
                        alignItems: "center",
                        padding: "10px 12px",
                        background: "var(--bg-elevated)",
                        borderRadius: "var(--radius-md)",
                        marginBottom: 10,
                      }}
                    >
                      <div style={{ textAlign: "left" }}>
                        <span style={{ fontSize: 11, color: "var(--bull)", fontWeight: 700 }}>강세</span>
                        <div style={{ fontSize: 18, fontWeight: 800, color: debate.judge_score.winner === "BULL" ? "var(--bull)" : "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                          {debate.judge_score.bull_score}점
                        </div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-secondary)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {debate.judge_score.winner === "BULL" ? <><Icon name="chevron-right" size={12} decorative /> 강세 우세</> : debate.judge_score.winner === "BEAR" ? <>약세 우세 <Icon name="chevron-left" size={12} decorative /></> : "무승부"}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontSize: 11, color: "var(--bear)", fontWeight: 700 }}>약세</span>
                        <div style={{ fontSize: 18, fontWeight: 800, color: debate.judge_score.winner === "BEAR" ? "var(--bear)" : "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                          {debate.judge_score.bear_score}점
                        </div>
                      </div>
                      {debate.judge_score.reasoning && (
                        <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.6, marginTop: 5 }}>
                          {debate.judge_score.reasoning}
                        </div>
                      )}
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div style={{ background: "var(--bull-subtle)", border: "1px solid var(--bull-border)", borderRadius: "var(--radius-md)", padding: "12px 14px" }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: "var(--bull)", marginBottom: 7, display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <Icon name="bull" size={14} decorative /> 강세 (매수)
                      </p>
                      <p style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.65 }}>{debate.bull_stance}</p>
                      {debate.bull_key_points?.length > 0 && (
                        <ul style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 7, paddingLeft: 18, lineHeight: 1.6 }}>
                          {debate.bull_key_points.slice(0, 3).map((p, i) => <li key={i}>{p}</li>)}
                        </ul>
                      )}
                    </div>
                    <div style={{ background: "var(--bear-subtle)", border: "1px solid var(--bear-border)", borderRadius: "var(--radius-md)", padding: "12px 14px" }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: "var(--bear)", marginBottom: 7, display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <Icon name="bear" size={14} decorative /> 약세 (매도/관망)
                      </p>
                      <p style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.65 }}>{debate.bear_stance}</p>
                      {debate.bear_key_points?.length > 0 && (
                        <ul style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 7, paddingLeft: 18, lineHeight: 1.6 }}>
                          {debate.bear_key_points.slice(0, 3).map((p, i) => <li key={i}>{p}</li>)}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 5-C. 리스크 매니저 보고 */}
              {s.risk && (
                <div>
                  <p style={{ fontSize: 13, fontWeight: 800, color: "var(--text-secondary)", marginBottom: 10 }}>
                    리스크 매니저 보고 (L3)
                  </p>
                  {s.risk.key_risks && s.risk.key_risks.length > 0 && (
                    <ul style={{ fontSize: 13, color: "var(--text-primary)", margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                      {s.risk.key_risks.slice(0, 5).map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  )}
                  {s.risk.summary && (
                    <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 8, lineHeight: 1.65, fontStyle: "italic" }}>
                      요약: {s.risk.summary}
                    </p>
                  )}
                </div>
              )}

              {/* 5-D. GURU 정책 누적 */}
              {guruEnabled && guru && (
                <div>
                  <p style={{ fontSize: 13, fontWeight: 800, color: "var(--text-secondary)", marginBottom: 10 }}>
                    GURU 정책 적용 ({guru.risk_profile})
                  </p>
                  <div style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", padding: "12px 14px", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.65 }}>
                    <p>
                      성향: <b>{guru.risk_profile}</b> · 최소신뢰도 {Math.round(guru.min_confidence_to_act * 100)}% · 최대리스크 {guru.max_risk_level} · 포지션상한 {guru.max_position_pct}%
                    </p>
                    {guru.rules_applied?.length > 0 && (
                      <p style={{ marginTop: 5, fontSize: 12 }}>
                        룰 적용: {guru.rules_applied.slice(0, 3).join(" | ")}
                      </p>
                    )}
                    {guruStats.total > 0 && (
                      <p style={{ marginTop: 7, fontSize: 12, color: "var(--text-tertiary)", display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <Icon name="chart-bar" size={12} decorative />
                        최근 30일: 총 {guruStats.total}건 중 GURU가 {guruStats.changed}건 보정
                        {guruStats.defensive > 0 && ` (방어적 보정 ${guruStats.defensive}건)`}
                        {guruStats.changed === 0 && " — AI 합의를 그대로 따름"}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* 5-E. PDF 저장 */}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{
                    padding: "9px 16px",
                    background: "var(--bg-elevated)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-md)",
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  PDF로 저장
                </button>
              </div>
            </div>
          </details>
        </Card>

        {/* 면책 한 줄 */}
        <p className="t-critical" style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "0 4px", color: "var(--text-secondary)" }}>
          <Icon name="warning" size={16} decorative style={{ flexShrink: 0, marginTop: 2, color: "var(--warning)" }} />
          <span>
            본 분석은 AI 의견이며 투자 권유가 아닙니다. 실제 투자 손실에 대한 책임은 사용자에게 있어요.
            소액부터 시작하고, 한 종목에 자본의 25% 이상을 절대 넣지 마세요.
          </span>
        </p>
      </motion.div>
    </AnimatePresence>
  );
}
