"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { TradeDecision } from "@/types";
import { Tooltip } from "@/components/ui";

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
  onOpenSettings?: () => void;
  onGoTrading?: () => void;
  onGoBacktest?: () => void;
  onGoAutoLoop?: () => void;
}

export function DecisionCard({ decision, onHumanApproval, onOpenSettings, onGoTrading, onGoBacktest, onGoAutoLoop }: DecisionCardProps) {
  // GURU 30일 누적 통계 (P4.23)
  const [guruStats, setGuruStats] = useState<{ total: number; changed: number; defensive: number }>({ total: 0, changed: 0, defensive: 0 });
  useEffect(() => {
    if (!decision?.agents_summary?.guru?.enabled) return;
    try {
      const KEY = "kta_guru_history_v1";
      const now = Date.now();
      const cutoff = now - 30 * 86_400_000;
      const raw = window.localStorage.getItem(KEY);
      const arr: Array<{ t: number; ch: boolean; lc: number; ac: number }> = raw ? JSON.parse(raw) : [];
      const last = arr[arr.length - 1];
      const guru = decision.agents_summary.guru;
      if (!guru) return;
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
    } catch { /* ignore */ }
  }, [decision]);

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
          border: `1px solid var(--border-default)`,
          borderRadius: "var(--radius-2xl)",
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
        }}
      >
        {/* top color bar — slightly thicker for the new light surface */}
        <div style={{ height: 6, background: cfg.color }} />

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
                <Tooltip
                  content="9개 AI 에이전트의 의견 일치도와 데이터의 명확함을 종합해 0–100%로 환산한 값. 70% 이상이면 의견이 비교적 일치함, 50% 미만이면 크게 갈렸다는 뜻. AI 판단 자체가 맞는다는 보장은 아닙니다."
                  maxWidth={300}
                >
                  <span style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 1, borderBottom: "1px dotted var(--text-tertiary)", cursor: "help" }}>ℹ 신뢰도</span>
                </Tooltip>
              </div>
            </div>
          </div>

          {/* Human approval gate */}
          {needsApproval && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              style={{
                background: "var(--warning-subtle)", border: "1px solid var(--warning-border)",
                borderRadius: "var(--radius-lg)", padding: "10px 14px", marginBottom: 12,
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
              }}
            >
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: "var(--warning)" }}>승인이 필요해요</p>
                <p style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 2, lineHeight: 1.5 }}>
                  신뢰도가 높거나 한 번에 들어가는 자금이 커서, 직접 확인한 뒤 실행할 수 있어요.
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                {onOpenSettings && (
                  <button
                    onClick={onOpenSettings}
                    style={{
                      background: "var(--bg-surface)", color: "var(--text-secondary)", fontSize: 10, fontWeight: 700,
                      padding: "6px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)",
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
                      background: "var(--warning)", color: "var(--text-inverse)", fontSize: 11, fontWeight: 700,
                      padding: "7px 14px", borderRadius: "var(--radius-md)", border: "none",
                      cursor: "pointer", flexShrink: 0, boxShadow: "var(--shadow-sm)",
                    }}
                  >
                    검토하기
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {guruEnabled && (
            <div
              style={{
                background: "var(--brand-subtle)",
                border: "1px solid var(--brand-border)",
                borderRadius: "var(--radius-lg)",
                padding: "10px 12px",
                marginBottom: 12,
              }}
            >
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--brand-active)", marginBottom: 4 }}>
                GURU 정책이 함께 검토했어요
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
              {onOpenSettings && (
                <button
                  onClick={onOpenSettings}
                  style={{
                    marginTop: 8,
                    padding: "5px 10px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--brand-border)",
                    background: "var(--bg-surface)",
                    color: "var(--brand-active)",
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  GURU 설정 열기
                </button>
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

          {/* 신뢰도 산식 공개 (D1) */}
          <details style={{ marginBottom: 10 }}>
            <summary style={{ fontSize: 10, color: "var(--text-tertiary)", cursor: "pointer", padding: "4px 0", listStyle: "none" }}>
              📐 신뢰도 {confidencePct}%는 어떻게 계산됐나요?
            </summary>
            <div style={{ marginTop: 6, padding: "10px 12px", background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.65 }}>
              <p style={{ marginBottom: 6 }}>
                <b>신뢰도 = 합의 정도 × 데이터 명확함</b>
              </p>
              <ol style={{ paddingLeft: 16, margin: 0 }}>
                <li><b>합의 정도</b>: 9개 에이전트(기술/기본/심리/매크로/리스크 등)의 BUY/SELL/HOLD 표가 한쪽으로 얼마나 쏠렸는지</li>
                <li><b>데이터 명확함</b>: 각 에이전트의 자체 신뢰도(데이터 충분성·노이즈)의 평균</li>
                <li>토론(Bull vs Bear) 단계 점수가 가산</li>
                <li>리스크 매니저의 위험 등급에 따라 감산</li>
              </ol>
              <p style={{ marginTop: 6, fontSize: 10, color: "var(--text-tertiary)" }}>
                ※ 신뢰도가 높다고 “수익이 보장”되는 것은 아닙니다. AI 합의 + 데이터 품질의 척도입니다.
              </p>
            </div>
          </details>

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

          {/* 결정 추적 익스플로러 (P4.22) */}
          {(() => {
            const details = decision.agents_summary?.analyst_details;
            const guru = decision.agents_summary?.guru;
            if (!details || Object.keys(details).length === 0) return null;
            return (
              <details style={{
                background: "var(--bg-elevated)", borderRadius: "var(--radius-lg)",
                padding: "10px 14px", marginBottom: 12,
                border: "1px solid var(--border-subtle)",
              }}>
                <summary style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 700, cursor: "pointer", listStyle: "none" }}>
                  🔬 결정 추적 — 어떤 에이전트가 어떻게 표를 던졌나
                </summary>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                  {Object.entries(details).map(([agent, d]) => {
                    const c = ACTION_CFG[d.signal as keyof typeof ACTION_CFG] ?? ACTION_CFG.HOLD;
                    return (
                      <div key={agent} style={{
                        display: "grid", gridTemplateColumns: "100px 50px 1fr",
                        gap: 8, alignItems: "center",
                        padding: "5px 8px", background: "var(--bg-surface)",
                        borderRadius: "var(--radius-sm)",
                        borderLeft: `3px solid ${c.hex}`,
                      }}>
                        <span style={{ fontSize: 10, color: "var(--text-secondary)", fontWeight: 600 }}>{agent}</span>
                        <span style={{ fontSize: 10, color: c.color, fontWeight: 700 }}>
                          {c.label} {Math.round(d.confidence * 100)}%
                        </span>
                        <span style={{ fontSize: 9, color: "var(--text-tertiary)", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.summary}>
                          {d.summary}
                        </span>
                      </div>
                    );
                  })}
                  {/* GURU 영향 표기 */}
                  {guru?.enabled && (
                    <div style={{
                      marginTop: 6, padding: "6px 10px",
                      background: guru.action_changed ? "var(--warning-subtle)" : "var(--bg-surface)",
                      border: `1px solid ${guru.action_changed ? "var(--warning-border)" : "var(--border-subtle)"}`,
                      borderRadius: "var(--radius-sm)",
                    }}>
                      <p style={{ fontSize: 9, color: "var(--text-tertiary)", fontWeight: 700, marginBottom: 2 }}>
                        🎓 GURU 정책 ({guru.risk_profile})
                      </p>
                      <p style={{ fontSize: 9, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                        AI 합의 <b>{guru.llm_action} {Math.round(guru.llm_confidence * 100)}%</b>
                        {" → "}
                        최종 <b style={{ color: guru.action_changed ? "var(--warning)" : "var(--text-primary)" }}>{guru.final_action}</b>
                        {guru.action_changed && " · 정책에 의해 변경됨"}
                      </p>
                      {/* 30일 누적 통계 (P4.23) */}
                      {guruStats.total > 0 && (
                        <p style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 4, lineHeight: 1.45 }}>
                          📊 최근 30일: 총 {guruStats.total}건 중 GURU가 {guruStats.changed}건 보정
                          {guruStats.defensive > 0 && ` (방어적 보정 ${guruStats.defensive}건)`}
                          {guruStats.changed === 0 && " — AI 합의를 그대로 따름"}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </details>
            );
          })()}

          {/* Strategy + Position */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {kelly > 0 && (
              <div style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-lg)", padding: "10px 12px" }}>
                <Tooltip
                  content="켈리 공식(Kelly Criterion)으로 계산한 자본 대비 권장 투자 비율. 한 번에 자본의 이 비율만 투자하면 장기 기대수익이 최대화되고 파산 확률은 최소화됩니다. 안전을 위해 공식 결과의 절반(Half-Kelly)만 적용합니다."
                  maxWidth={320}
                >
                  <p style={{ fontSize: 10, color: "var(--text-tertiary)", borderBottom: "1px dotted var(--text-tertiary)", display: "inline-block", cursor: "help" }}>ℹ Kelly 포지션</p>
                </Tooltip>
                <p style={{ fontSize: 16, fontWeight: 700, color: cfg.color }}>{kelly}%</p>
                {/* Kelly 산식 공개 (D3) */}
                <details style={{ marginTop: 4 }}>
                  <summary style={{ fontSize: 9, color: "var(--text-tertiary)", cursor: "pointer", listStyle: "none" }}>
                    📐 산식
                  </summary>
                  <p style={{ fontSize: 9, color: "var(--text-secondary)", marginTop: 3, lineHeight: 1.5 }}>
                    f* = (p × b − q) / b 에서 p=승률, q=1−p, b=손익비.
                    안전을 위해 결과의 50% (Half-Kelly)와 GURU 정책 상한이 추가 적용됩니다.
                  </p>
                </details>
              </div>
            )}
            {decision.agents_summary?.risk_level && (
              <div style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-lg)", padding: "10px 12px" }}>
                <Tooltip
                  content="LOW(낮음) · MEDIUM(보통) · HIGH(높음) · CRITICAL(매우 위험)의 4단계. 변동성, 거시 환경, 종목 고유 위험을 종합해 산출됩니다."
                  maxWidth={300}
                >
                  <p style={{ fontSize: 10, color: "var(--text-tertiary)", borderBottom: "1px dotted var(--text-tertiary)", display: "inline-block", cursor: "help" }}>ℹ 리스크 등급</p>
                </Tooltip>
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{decision.agents_summary.risk_level}</p>
              </div>
            )}
            {typeof stopLossPct === "number" && (
              <div style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-lg)", padding: "10px 12px" }}>
                <Tooltip
                  content="매수 후 가격이 이 비율 이상 떨어지면 자동으로 손실을 확정하고 빠져나오는 방어선. 하락을 온전히 수용하지 않고 다음 기회를 위해 자본을 지키는 장치입니다."
                  maxWidth={300}
                >
                  <p style={{ fontSize: 10, color: "var(--text-tertiary)", borderBottom: "1px dotted var(--text-tertiary)", display: "inline-block", cursor: "help" }}>ℹ 손절 라인</p>
                </Tooltip>
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

          {/* 다음 행동 CTA — 분석→행동 연결 (D5 + P3) */}
          {(onGoTrading || onGoBacktest || onGoAutoLoop) && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed var(--border-subtle)" }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 8 }}>
                이제 무엇을 할까요?
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8 }}>
                {onGoTrading && (
                  <button
                    onClick={onGoTrading}
                    style={{
                      padding: "10px 8px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)",
                      background: "var(--bg-elevated)", color: "var(--text-primary)", fontSize: 11, fontWeight: 700, cursor: "pointer",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 3, lineHeight: 1.3,
                    }}
                  >
                    <span style={{ fontSize: 16 }}>📝</span>
                    <span>모의로 1주 시도</span>
                    <span style={{ fontSize: 9, fontWeight: 500, color: "var(--text-tertiary)" }}>실제 돈 X</span>
                  </button>
                )}
                {onGoBacktest && (
                  <button
                    onClick={onGoBacktest}
                    style={{
                      padding: "10px 8px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)",
                      background: "var(--bg-elevated)", color: "var(--text-primary)", fontSize: 11, fontWeight: 700, cursor: "pointer",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 3, lineHeight: 1.3,
                    }}
                  >
                    <span style={{ fontSize: 16 }}>📊</span>
                    <span>백테스트로 검증</span>
                    <span style={{ fontSize: 9, fontWeight: 500, color: "var(--text-tertiary)" }}>과거 성과 확인</span>
                  </button>
                )}
                {onGoAutoLoop && (
                  <button
                    onClick={onGoAutoLoop}
                    style={{
                      padding: "10px 8px", borderRadius: "var(--radius-lg)", border: `1px solid ${cfg.color}`,
                      background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 700, cursor: "pointer",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 3, lineHeight: 1.3,
                    }}
                  >
                    <span style={{ fontSize: 16 }}>🤖</span>
                    <span>자동매매 설정</span>
                    <span style={{ fontSize: 9, fontWeight: 500, opacity: 0.8 }}>루프에 접속</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

