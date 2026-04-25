"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { AgentThought, AgentRole, AgentStatus } from "@/types";

const AGENT_META: Record<
  AgentRole,
  { name: string; icon: string; layer: string; dotColor: string }
> = {
  technical_analyst:   { name: "기술적 분석가",     icon: "📊", layer: "Layer 1 · 데이터",   dotColor: "#3182F6" },
  fundamental_analyst: { name: "펀더멘털 분석가",   icon: "📋", layer: "Layer 1 · 데이터",   dotColor: "#A855F7" },
  sentiment_analyst:   { name: "감성 분석가",       icon: "🌐", layer: "Layer 1 · 데이터",   dotColor: "#F5A623" },
  macro_analyst:       { name: "매크로 분석가",     icon: "🌍", layer: "Layer 1 · 데이터",   dotColor: "#2FCA73" },
  bull_researcher:     { name: "강세 연구원",       icon: "🐂", layer: "Layer 2 · 토론",     dotColor: "#F04452" },
  bear_researcher:     { name: "약세 연구원",       icon: "🐻", layer: "Layer 2 · 토론",     dotColor: "#2B7EF5" },
  risk_manager:        { name: "리스크 매니저",     icon: "🛡️", layer: "Layer 3 · 결정",     dotColor: "#F5A623" },
  portfolio_manager:   { name: "포트폴리오 매니저", icon: "👔", layer: "Layer 3 · 결정",     dotColor: "#3182F6" },
  guru_agent:          { name: "GURU",              icon: "🧙", layer: "Layer 3 · 결정",     dotColor: "#7D6BFF" },
};

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: "대기", thinking: "분석 중", analyzing: "분석 중",
  debating: "토론 중", deciding: "결정 중", done: "완료",
};

const STATUS_DOT: Record<AgentStatus, string> = {
  idle:      "bg-[var(--text-tertiary)]",
  thinking:  "bg-[var(--brand)]",
  analyzing: "bg-[var(--warning)]",
  debating:  "bg-purple-500",
  deciding:  "bg-[var(--warning)]",
  done:      "bg-[var(--success)]",
};

const LAYER_DATA_ROLES: AgentRole[] = [
  "technical_analyst",
  "fundamental_analyst",
  "sentiment_analyst",
  "macro_analyst",
];

const LAYER_DEBATE_ROLES: AgentRole[] = ["bull_researcher", "bear_researcher"];
const LAYER_DECISION_ROLES: AgentRole[] = ["risk_manager", "portfolio_manager", "guru_agent"];

function layerOfRole(role: AgentRole): "DATA" | "DEBATE" | "DECISION" {
  if (LAYER_DATA_ROLES.includes(role)) return "DATA";
  if (LAYER_DEBATE_ROLES.includes(role)) return "DEBATE";
  return "DECISION";
}

interface AgentCardProps {
  role: AgentRole;
  thought?: AgentThought;
  isActive: boolean;
  index?: number;
}

const SPRING = { ease: [0.16, 1, 0.3, 1] as const, duration: 0.4 };

export function AgentCard({ role, thought, isActive, index = 0 }: AgentCardProps) {
  const meta = AGENT_META[role];
  const status: AgentStatus = thought?.status ?? "idle";
  const isPulse = ["thinking", "analyzing", "debating", "deciding"].includes(status);
  const isIdle = !thought || status === "idle";
  const isDone = status === "done";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{
        opacity: isActive ? 1 : isDone ? 0.88 : isIdle ? 0.48 : 1,
        y: 0,
        scale: isActive ? 1 : 1,
      }}
      transition={{ ...SPRING, delay: index * 0.055 }}
      style={{
        background: isActive ? "var(--bg-surface)" : isDone ? "var(--bg-surface)" : "var(--bg-overlay)",
        border: `1px solid ${isActive ? "var(--brand-border)" : isDone ? "var(--success-border)" : "var(--border-subtle)"}`,
        boxShadow: isActive ? "0 0 0 2px var(--brand-border), var(--shadow-md)" : isDone ? "var(--shadow-sm)" : "none",
        borderRadius: "var(--radius-xl)",
        padding: isIdle ? "10px" : "12px",
        position: "relative",
        overflow: "hidden",
        transition: "all 250ms var(--ease-out-expo)",
      }}
    >
      {/* glow when active */}
      {isActive && (
        <div style={{
          position: "absolute", inset: 0, borderRadius: "inherit",
          background: `radial-gradient(ellipse at top left, ${meta.dotColor}18, transparent 60%)`,
          pointerEvents: "none",
        }} />
      )}

      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, position: "relative" }}>
        {/* avatar */}
        <motion.div
          style={{
            width: 40, height: 40, borderRadius: "var(--radius-lg)",
            background: "var(--bg-overlay)", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 18, flexShrink: 0, position: "relative",
          }}
          animate={isPulse ? { scale: [1, 1.06, 1] } : { scale: 1 }}
          transition={{ duration: 1.8, repeat: isPulse ? Infinity : 0 }}
        >
          {meta.icon}
          {/* live dot */}
          <span style={{
            position: "absolute", top: -3, right: -3, width: 9, height: 9,
            borderRadius: "50%", background: meta.dotColor,
            border: "2px solid var(--bg-surface)",
          }}>
            {isPulse && (
              <motion.span style={{
                position: "absolute", inset: -2, borderRadius: "50%",
                background: meta.dotColor, opacity: 0.4,
              }}
                animate={{ scale: [1, 2.2], opacity: [0.4, 0] }}
                transition={{ duration: 1.4, repeat: Infinity }}
              />
            )}
          </span>
        </motion.div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{meta.name}</span>
            <span style={{
              fontSize: 10, fontWeight: 500, padding: "1px 6px", borderRadius: 99,
              background: isPulse ? `${meta.dotColor}22` : "var(--bg-elevated)",
              color: isPulse ? meta.dotColor : "var(--text-secondary)",
            }}>
              {STATUS_LABEL[status]}
            </span>
          </div>
          <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }}>{meta.layer}</p>
        </div>
      </div>

      {/* thought bubble */}
      <AnimatePresence mode="wait">
        {thought?.content && (
          <motion.div
            key={thought.timestamp}
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 10 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={SPRING}
          >
            <div style={{
              background: "var(--bg-overlay)", borderRadius: "var(--radius-md)",
              padding: "8px 10px", borderLeft: `2px solid ${meta.dotColor}`,
            }}>
              <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6 }}
                className={status === "debating" ? "line-clamp-6" : "line-clamp-3"}>
                {thought.content}
              </p>
              {/* key_points 배지 (토론/분석 결과) */}
              {Array.isArray(thought.metadata?.key_points) && (thought.metadata.key_points as string[]).length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                  {(thought.metadata.key_points as string[]).slice(0, 3).map((pt, i) => (
                    <span key={i} style={{
                      fontSize: 9, padding: "2px 6px", borderRadius: 99,
                      background: `${meta.dotColor}18`, color: meta.dotColor,
                      fontWeight: 600,
                    }}>
                      {pt}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Semantic badge detector ──────────────────────────────────────────
function getSemanticBadge(content: string): { label: string; color: string } | null {
  const lc = content.toLowerCase();
  if (/매수|bull|강세|상승 신호|buy/.test(lc)) return { label: "BULL", color: "var(--bull)" };
  if (/매도|bear|약세|하락 신호|sell/.test(lc)) return { label: "BEAR", color: "var(--bear)" };
  if (/리스크|위험|경고|risk|주의|drawdown/.test(lc)) return { label: "RISK", color: "var(--warning)" };
  if (/합의|결론|결정|최종|완료|done|complete/.test(lc)) return { label: "완료", color: "var(--success)" };
  return null;
}

// ── Activity Feed (Linear-style) ────────────────────────────────────
interface ActivityFeedProps {
  logs: AgentThought[];
  logEndRef: React.RefObject<HTMLDivElement | null>;
}

export function ActivityFeed({ logs, logEndRef }: ActivityFeedProps) {
  const recent = logs.slice(-40);
  const latestByRole = new Map<AgentRole, AgentThought>();
  for (const log of logs) {
    latestByRole.set(log.role, log);
  }

  const dataDone = LAYER_DATA_ROLES.filter((r) => latestByRole.get(r)?.status === "done").length;
  const debateDone = LAYER_DEBATE_ROLES.filter((r) => latestByRole.get(r)?.status === "done").length;
  const decisionDone = LAYER_DECISION_ROLES.filter((r) => latestByRole.get(r)?.status === "done").length;
  const exchangeDone = ["risk_manager", "portfolio_manager", "guru_agent"].filter(
    (r) => latestByRole.get(r as AgentRole)?.status === "done"
  ).length;

  const flowCards = [
    { key: "DATA", label: "DATA", done: dataDone, total: LAYER_DATA_ROLES.length, color: "#58A6FF" },
    { key: "DEBATE", label: "DEBATE", done: debateDone, total: LAYER_DEBATE_ROLES.length, color: "#BC8CFF" },
    { key: "DECISION", label: "DECISION", done: decisionDone, total: LAYER_DECISION_ROLES.length, color: "#E3B341" },
    { key: "EXCHANGE", label: "EXCHANGE", done: exchangeDone, total: 3, color: "#97F2C1" },
  ];

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "2px 0", fontFamily: "var(--font-mono)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6, marginBottom: 8 }}>
        {flowCards.map((card) => {
          const pct = Math.round((card.done / card.total) * 100);
          return (
            <div
              key={card.key}
              style={{
                background: "rgba(13,15,24,0.9)",
                border: `1px solid ${card.color}66`,
                borderRadius: 2,
                padding: "4px 6px",
              }}
            >
              <p style={{ margin: 0, fontSize: 9, color: card.color, letterSpacing: "0.08em" }}>{card.label}</p>
              <p style={{ margin: 0, marginTop: 1, fontSize: 10, color: "rgba(234,237,242,0.9)" }}>
                {card.done}/{card.total} ({pct}%)
              </p>
            </div>
          );
        })}
      </div>

      {recent.length === 0 ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "calc(100% - 36px)",
            color: "rgba(177,189,216,0.8)",
            fontSize: 12,
            border: "1px dashed rgba(134,147,178,0.35)",
            borderRadius: 2,
          }}
        >
          로그 스트림 대기 중
        </div>
      ) : (
        <div style={{ position: "relative", paddingLeft: 10 }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 2,
              background: "linear-gradient(180deg, #58A6FF 0%, #BC8CFF 48%, #E3B341 100%)",
              opacity: 0.55,
            }}
          />
          {recent.map((log, i) => {
            const meta = AGENT_META[log.role as AgentRole];
            const lane = layerOfRole(log.role as AgentRole);
            return (
              <motion.div
                key={`${log.timestamp}-${i}`}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: 0 }}
                style={{
                  display: "flex",
                  gap: 10,
                  marginBottom: 6,
                  position: "relative",
                  background: "rgba(12,14,22,0.72)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 2,
                  padding: "5px 7px",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: -13,
                    top: 10,
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: meta?.dotColor ?? "var(--text-tertiary)",
                    border: "1px solid rgba(9,10,14,0.9)",
                    flexShrink: 0,
                  }}
                />

                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 2 }}>
                    <span style={{ fontSize: 9, color: "rgba(163,171,188,0.86)", fontVariantNumeric: "tabular-nums" }}>
                      {new Date(log.timestamp).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: meta?.dotColor ?? "var(--text-secondary)" }}>
                      {meta?.name ?? log.role}
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: "rgba(230,236,255,0.9)",
                        border: "1px solid rgba(122,131,156,0.45)",
                        borderRadius: 2,
                        padding: "1px 4px",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {lane}
                    </span>
                    {(() => {
                      const badge = getSemanticBadge(log.content);
                      return badge ? (
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 2,
                          background: `${badge.color}22`, color: badge.color, letterSpacing: "0.05em",
                        }}>{badge.label}</span>
                      ) : null;
                    })()}
                  </div>
                  <p style={{ fontSize: 11, color: "rgba(224,229,243,0.86)", lineHeight: 1.4, marginTop: 0 }} className="line-clamp-3">
                    {log.content}
                  </p>
                </div>
              </motion.div>
            );
          })}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  );
}

// ── Agent Office Grid ──────────────────────────────────────────────
interface AgentOfficeProps {
  thoughts: Map<AgentRole, AgentThought>;
  activeAgents: Set<AgentRole>;
}

const LAYERS: { label: string; roles: AgentRole[] }[] = [
  { label: "Layer 1 · 데이터 수집", roles: ["technical_analyst", "fundamental_analyst", "sentiment_analyst", "macro_analyst"] },
  { label: "Layer 2 · 강세 vs 약세 토론", roles: ["bull_researcher", "bear_researcher"] },
  { label: "Layer 3 · 리스크 & 최종 결정", roles: ["risk_manager", "portfolio_manager", "guru_agent"] },
];

export function AgentOffice({ thoughts, activeAgents }: AgentOfficeProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {LAYERS.map((layer) => {
        const doneCount = layer.roles.filter(r => thoughts.get(r)?.status === "done").length;
        const allDone = doneCount === layer.roles.length;
        const hasStarted = thoughts.size > 0;
        return (
          <div key={layer.label}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <p style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {layer.label}
              </p>
              {hasStarted && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  style={{
                    fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                    background: allDone ? "var(--success-subtle)" : "var(--bg-overlay)",
                    color: allDone ? "var(--success)" : "var(--text-tertiary)",
                    border: allDone ? "1px solid var(--success-border)" : "1px solid var(--border-subtle)",
                  }}
                >
                  {allDone ? "✓ 완료" : `${doneCount} / ${layer.roles.length}`}
                </motion.span>
              )}
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: `repeat(${layer.roles.length}, 1fr)`,
              gap: 8,
            }}>
              {layer.roles.map((role, i) => (
                <AgentCard
                  key={role}
                  role={role}
                  thought={thoughts.get(role)}
                  isActive={activeAgents.has(role)}
                  index={i}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
