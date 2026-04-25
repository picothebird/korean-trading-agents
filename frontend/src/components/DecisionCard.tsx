"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { TradeDecision } from "@/types";

// Korean market: RED = UP/BUY, BLUE = DOWN/SELL
const ACTION_CFG = {
  BUY:  { label: "매수",   color: "var(--bull)",   bg: "var(--bull-subtle)",   glow: "var(--bull-glow)",   hex: "#F04452" },
  SELL: { label: "매도",   color: "var(--bear)",   bg: "var(--bear-subtle)",   glow: "var(--bear-glow)",   hex: "#2B7EF5" },
  HOLD: { label: "관망",   color: "var(--hold)",   bg: "var(--hold-subtle)",   glow: "rgba(139,149,161,0.15)", hex: "#8B95A1" },
} as const;

const SPRING = { ease: [0.16, 1, 0.3, 1] as const, duration: 0.5 };

interface DecisionCardProps {
  decision: TradeDecision | null;
  onHumanApproval?: () => void;
}

export function DecisionCard({ decision, onHumanApproval }: DecisionCardProps) {
  if (!decision) return null;

  const cfg = ACTION_CFG[decision.action as keyof typeof ACTION_CFG] ?? ACTION_CFG.HOLD;
  const confidencePct = Math.round(decision.confidence * 100);
  const circumference = 2 * Math.PI * 30;
  const kelly = decision.agents_summary?.kelly_position_pct ?? decision.agents_summary?.position_size_pct ?? 0;
  const stopLossPct = decision.agents_summary?.stop_loss_pct;
  const needsApproval = decision.agents_summary?.requires_human_approval;
  const guru = decision.agents_summary?.guru;
  const guruRules = guru?.rules_applied ?? [];
  const guruEnabled = Boolean(guru?.enabled);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={SPRING}
        style={{
          background: "var(--bg-surface)",
          border: `1px solid ${cfg.hex}44`,
          borderRadius: "var(--radius-2xl)",
          boxShadow: `0 0 32px ${cfg.glow}, var(--shadow-lg)`,
          overflow: "hidden",
        }}
      >
        {/* top color bar */}
        <div style={{ height: 3, background: cfg.color, opacity: 0.9 }} />

        <div style={{ padding: 20 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <p style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                최종 매매 결정
              </p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <motion.span
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{ ...SPRING, delay: 0.1 }}
                  style={{ fontSize: 52, fontWeight: 800, color: cfg.color, lineHeight: 1 }}
                >
                  {cfg.label}
                </motion.span>
                <span style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>
                  {decision.ticker}
                </span>
              </div>
            </div>

            {/* Confidence gauge */}
            <div style={{ position: "relative", width: 72, height: 72 }}>
              <svg width="72" height="72" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="36" cy="36" r="30" fill="none" stroke="var(--bg-elevated)" strokeWidth="6" />
                <motion.circle
                  cx="36" cy="36" r="30" fill="none"
                  stroke={cfg.hex} strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={circumference}
                  initial={{ strokeDashoffset: circumference }}
                  animate={{ strokeDashoffset: circumference * (1 - decision.confidence) }}
                  transition={{ duration: 1.2, ease: "easeOut" }}
                />
              </svg>
              <div style={{
                position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: cfg.color, lineHeight: 1 }}>{confidencePct}%</span>
                <span style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 1 }}>신뢰도</span>
              </div>
            </div>
          </div>

          {/* Human approval gate */}
          {needsApproval && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              style={{
                background: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.3)",
                borderRadius: "var(--radius-lg)", padding: "10px 14px", marginBottom: 12,
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}
            >
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: "var(--warning)" }}>⚠ 인간 승인 필요</p>
                <p style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 2 }}>
                  고신뢰도 또는 대규모 포지션 — 최종 확인 필요
                </p>
              </div>
              {onHumanApproval && (
                <button
                  onClick={onHumanApproval}
                  style={{
                    background: "var(--warning)", color: "#000", fontSize: 11, fontWeight: 700,
                    padding: "6px 12px", borderRadius: "var(--radius-md)", border: "none",
                    cursor: "pointer", flexShrink: 0,
                  }}
                >
                  검토하기
                </button>
              )}
            </motion.div>
          )}

          {guruEnabled && (
            <div
              style={{
                background: "rgba(49,130,246,0.10)",
                border: "1px solid rgba(49,130,246,0.28)",
                borderRadius: "var(--radius-lg)",
                padding: "10px 12px",
                marginBottom: 12,
              }}
            >
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--brand)", marginBottom: 4 }}>
                🧙 GURU 정책 레이어 적용
              </p>
              <p style={{ fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                성향: {guru?.risk_profile} · 최소신뢰도: {Math.round((guru?.min_confidence_to_act ?? 0) * 100)}% ·
                최대리스크: {guru?.max_risk_level} · 포지션상한: {guru?.max_position_pct}%
              </p>
              {guru?.action_changed && (
                <p style={{ fontSize: 10, color: "var(--warning)", marginTop: 5 }}>
                  GURU가 액션을 조정했습니다: {guru?.llm_action} → {guru?.final_action}
                </p>
              )}
              {guruRules.length > 0 && (
                <p style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 5 }}>
                  룰 적용: {guruRules.slice(0, 2).join(" | ")}
                </p>
              )}
            </div>
          )}

          {/* Agent vote consensus bar */}
          {decision.agents_summary?.analyst_signals && (() => {
            const signals = decision.agents_summary.analyst_signals;
            const total = (signals.BUY ?? 0) + (signals.SELL ?? 0) + (signals.HOLD ?? 0);
            if (total === 0) return null;
            return (
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 600 }}>에이전트 투표</span>
                  <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>{total}개 기준</span>
                </div>
                {/* Segmented bar */}
                <div style={{ display: "flex", height: 5, borderRadius: 99, overflow: "hidden", gap: 1, marginBottom: 8 }}>
                  {(signals.BUY ?? 0) > 0 && (
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${((signals.BUY ?? 0) / total) * 100}%` }}
                      transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
                      style={{ background: "var(--bull)", borderRadius: "99px 0 0 99px" }}
                    />
                  )}
                  {(signals.HOLD ?? 0) > 0 && (
                    <div style={{ width: `${((signals.HOLD ?? 0) / total) * 100}%`, background: "var(--hold)" }} />
                  )}
                  {(signals.SELL ?? 0) > 0 && (
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${((signals.SELL ?? 0) / total) * 100}%` }}
                      transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
                      style={{ background: "var(--bear)", borderRadius: "0 99px 99px 0" }}
                    />
                  )}
                </div>
                {/* Count chips */}
                <div style={{ display: "flex", gap: 6 }}>
                  {Object.entries(signals).map(([action, count]) => {
                    const c = ACTION_CFG[action as keyof typeof ACTION_CFG] ?? ACTION_CFG.HOLD;
                    if (!count) return null;
                    return (
                      <div key={action} style={{
                        flex: 1, borderRadius: "var(--radius-md)", padding: "7px 6px",
                        background: c.bg, border: `1px solid ${c.hex}22`, textAlign: "center",
                      }}>
                        <p style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>{c.label}</p>
                        <p style={{ fontSize: 18, fontWeight: 800, color: c.color, lineHeight: 1 }}>{String(count)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Reasoning */}
          <div style={{
            background: "var(--bg-elevated)", borderRadius: "var(--radius-lg)",
            padding: "12px 14px", marginBottom: 12,
          }}>
            <p style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 600, marginBottom: 4 }}>결정 근거</p>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7 }}>
              {decision.reasoning}
            </p>
          </div>

          {/* Strategy + Position */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {kelly > 0 && (
              <div style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-lg)", padding: "10px 12px" }}>
                <p style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Kelly 포지션</p>
                <p style={{ fontSize: 16, fontWeight: 700, color: cfg.color }}>{kelly}%</p>
              </div>
            )}
            {decision.agents_summary?.risk_level && (
              <div style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-lg)", padding: "10px 12px" }}>
                <p style={{ fontSize: 10, color: "var(--text-tertiary)" }}>리스크 등급</p>
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{decision.agents_summary.risk_level}</p>
              </div>
            )}
            {typeof stopLossPct === "number" && (
              <div style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-lg)", padding: "10px 12px" }}>
                <p style={{ fontSize: 10, color: "var(--text-tertiary)" }}>손절 라인</p>
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{stopLossPct}%</p>
              </div>
            )}
            {decision.agents_summary?.entry_strategy && (
              <div style={{ gridColumn: "1 / -1", background: "var(--bg-elevated)", borderRadius: "var(--radius-lg)", padding: "10px 12px" }}>
                <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 3 }}>진입 전략</p>
                <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>{decision.agents_summary.entry_strategy}</p>
              </div>
            )}
            {decision.agents_summary?.exit_strategy && (
              <div style={{ gridColumn: "1 / -1", background: "var(--bg-elevated)", borderRadius: "var(--radius-lg)", padding: "10px 12px" }}>
                <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 3 }}>청산 전략</p>
                <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>{decision.agents_summary.exit_strategy}</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

