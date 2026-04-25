"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AgentThought, AgentRole, AgentStatus } from "@/types";
import { Icon, type IconName } from "@/components/ui";
import {
  AGENT_LABEL,
  AGENT_COLOR,
  STATUS_LABEL,
  LAYER_LABEL,
  LAYER_SHORT,
  LAYER_ROLES,
  layerOfRole,
  isActiveStatus,
  extractSignal,
  SIGNAL_LABEL,
} from "@/lib/agentLabels";
import { ConfidenceGauge, Sparkline, StrengthStars } from "@/components/viz/Primitives";
import { usePersonalization, applyRolePersonalization } from "@/stores/usePersonalization";

// 아이콘만 컴포넌트 로컬 (SSOT는 의도적으로 UI 아이콘과 분리)
const AGENT_ICON: Record<AgentRole, IconName> = {
  technical_analyst: "chart-bar",
  fundamental_analyst: "list",
  sentiment_analyst: "globe",
  macro_analyst: "globe",
  bull_researcher: "trend-up",
  bear_researcher: "trend-down",
  risk_manager: "shield",
  portfolio_manager: "briefcase",
  guru_agent: "sparkles",
};

interface AgentCardProps {
  role: AgentRole;
  thought?: AgentThought;
  /** MS-D: 이 역할의 thought 히스토리 (오래된 → 최신). 신뢰도 추세 스파크라인용. */
  history?: AgentThought[];
  isActive: boolean;
  index?: number;
}

const SPRING = { ease: [0.16, 1, 0.3, 1] as const, duration: 0.4 };

export function AgentCard({ role, thought, history, isActive, index = 0 }: AgentCardProps) {
  const name = AGENT_LABEL[role];
  const dotColor = AGENT_COLOR[role];
  const iconName = AGENT_ICON[role];
  const layerIdx = layerOfRole(role);
  const layerName = LAYER_SHORT[layerIdx]; // "1단계" / "2단계" / "3단계"
  const status: AgentStatus = thought?.status ?? "idle";
  const isPulse = isActiveStatus(status);
  const isIdle = !thought || status === "idle";
  const isDone = status === "done";

  // MS-D D1: 신뢰도 / 신호 강도 / 데이터 칩 / 스파크라인
  const md = (thought?.metadata ?? {}) as Record<string, unknown>;
  const confidence = typeof md.confidence === "number" ? (md.confidence as number) : null;
  const strengthRaw = typeof md.strength === "number" ? (md.strength as number) : null;
  const signal = thought ? extractSignal(thought.metadata) : null;
  const dataSources = Array.isArray(md.data_sources) ? (md.data_sources as unknown[]).map(String) : [];
  // 신호 강도가 없으면 confidence를 0~3 별점으로 환산 (≥0.85→3, ≥0.6→2, ≥0.35→1, else 0)
  const strength =
    strengthRaw !== null
      ? strengthRaw
      : confidence !== null
        ? confidence >= 0.85
          ? 3
          : confidence >= 0.6
            ? 2
            : confidence >= 0.35
              ? 1
              : 0
        : null;
  // 스파크라인: history에서 confidence 시계열 (최근 12개)
  const sparkData = (history ?? [])
    .map((t) => (typeof t.metadata?.confidence === "number" ? (t.metadata.confidence as number) : null))
    .filter((v): v is number => v !== null)
    .slice(-12);

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
          background: `radial-gradient(ellipse at top left, ${dotColor}18, transparent 60%)`,
          pointerEvents: "none",
        }} />
      )}

      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, position: "relative" }}>
        {/* avatar */}
        <motion.div
          style={{
            width: 40, height: 40, borderRadius: "var(--radius-lg)",
            background: "var(--bg-overlay)", display: "flex", alignItems: "center",
            justifyContent: "center", flexShrink: 0, position: "relative",
            color: dotColor,
          }}
          animate={isPulse ? { scale: [1, 1.06, 1] } : { scale: 1 }}
          transition={{ duration: 1.8, repeat: isPulse ? Infinity : 0 }}
        >
          <Icon name={iconName} size={20} decorative />
          {/* live dot */}
          <span style={{
            position: "absolute", top: -3, right: -3, width: 9, height: 9,
            borderRadius: "50%", background: dotColor,
            border: "2px solid var(--bg-surface)",
          }}>
            {isPulse && (
              <motion.span style={{
                position: "absolute", inset: -2, borderRadius: "50%",
                background: dotColor, opacity: 0.4,
              }}
                animate={{ scale: [1, 2.2], opacity: [0.4, 0] }}
                transition={{ duration: 1.4, repeat: Infinity }}
              />
            )}
          </span>
        </motion.div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{name}</span>
            <span style={{
              fontSize: 10, fontWeight: 500, padding: "1px 6px", borderRadius: 99,
              background: isPulse ? `${dotColor}22` : "var(--bg-elevated)",
              color: isPulse ? dotColor : "var(--text-secondary)",
            }}>
              {STATUS_LABEL[status]}
            </span>
          </div>
          <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }}>{layerName}</p>
        </div>
      </div>

      {/* MS-D D1: 정보 밀도 행 — 신뢰도 게이지 / 신호 강도 / 스파크라인 */}
      {(confidence !== null || strength !== null || sparkData.length > 1 || dataSources.length > 0) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginTop: 10,
            paddingTop: 10,
            borderTop: "1px dashed var(--border-subtle)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {confidence !== null && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <ConfidenceGauge value={confidence} color={dotColor} size={44} thickness={5} />
                <span style={{ fontSize: 8, color: "var(--text-tertiary)", fontWeight: 600 }}>신뢰도</span>
              </div>
            )}
            {strength !== null && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                <span style={{ fontSize: 8, color: "var(--text-tertiary)", fontWeight: 600 }}>
                  신호 강도{signal ? ` · ${SIGNAL_LABEL[signal]}` : ""}
                </span>
                <StrengthStars value={strength} max={3} color={dotColor} />
              </div>
            )}
          </div>
          {sparkData.length > 1 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
              <Sparkline data={sparkData} width={64} height={20} color={dotColor} />
              <span style={{ fontSize: 8, color: "var(--text-tertiary)" }}>최근 신뢰도 추세</span>
            </div>
          )}
        </div>
      )}

      {/* MS-D D1: 데이터 출처 칩 */}
      {dataSources.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
          {dataSources.slice(0, 4).map((src, i) => (
            <span
              key={i}
              style={{
                fontSize: 9,
                fontWeight: 600,
                padding: "2px 6px",
                borderRadius: 4,
                background: "var(--bg-elevated)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border-subtle)",
              }}
              title={src}
            >
              {src.length > 18 ? `${src.slice(0, 16)}…` : src}
            </span>
          ))}
          {dataSources.length > 4 && (
            <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>+{dataSources.length - 4}</span>
          )}
        </div>
      )}

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
            <ThoughtBubble thought={thought} dotColor={dotColor} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Thought bubble (클릭 확장 + +N 더 칩) ─────────────────────────────
function ThoughtBubble({ thought, dotColor }: { thought: AgentThought; dotColor: string }) {
  const [expanded, setExpanded] = useState(false);
  const keyPoints = Array.isArray(thought.metadata?.key_points)
    ? (thought.metadata!.key_points as string[])
    : [];
  const visiblePoints = expanded ? keyPoints : keyPoints.slice(0, 3);
  const hiddenCount = keyPoints.length - visiblePoints.length;
  const expandable = thought.content.length > 140 || keyPoints.length > 3;

  return (
    <div
      style={{
        background: "var(--bg-overlay)", borderRadius: "var(--radius-md)",
        padding: "8px 10px", borderLeft: `2px solid ${dotColor}`,
        cursor: expandable ? "pointer" : "default",
      }}
      onClick={() => expandable && setExpanded((v) => !v)}
      role={expandable ? "button" : undefined}
      tabIndex={expandable ? 0 : undefined}
    >
      <p
        style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}
        className={expanded ? "" : "line-clamp-4"}
      >
        {thought.content}
      </p>
      {keyPoints.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
          {visiblePoints.map((pt, i) => (
            <span key={i} style={{
              fontSize: 9, padding: "2px 6px", borderRadius: 99,
              background: `${dotColor}18`, color: dotColor, fontWeight: 600,
            }}>
              {pt}
            </span>
          ))}
          {hiddenCount > 0 && !expanded && (
            <span
              style={{
                fontSize: 9, padding: "2px 6px", borderRadius: 99,
                background: "var(--bg-elevated)", color: "var(--text-tertiary)",
                fontWeight: 600, border: "1px dashed var(--border-subtle)",
              }}
            >
              +{hiddenCount} 더
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Activity Feed (Linear-style) ────────────────────────────────────
interface ActivityFeedProps {
  logs: AgentThought[];
  logEndRef: React.RefObject<HTMLDivElement | null>;
}

export function ActivityFeed({ logs, logEndRef }: ActivityFeedProps) {
  const recent = logs.slice(-40);
  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "2px 0" }}>
      {recent.length === 0 ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "var(--text-tertiary)",
            fontSize: 12,
            border: "1px dashed var(--border-subtle)",
            borderRadius: "var(--radius-md)",
          }}
        >
          에이전트 활동 대기 중
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
              background: "linear-gradient(180deg, var(--brand) 0%, var(--brand-active) 100%)",
              opacity: 0.35,
            }}
          />
          {recent.map((log, i) => {
            const dotColor = AGENT_COLOR[log.role as AgentRole];
            const name = AGENT_LABEL[log.role as AgentRole] ?? log.role;
            const layerIdx = layerOfRole(log.role as AgentRole);
            const laneLabel = LAYER_SHORT[layerIdx];
            const signal = extractSignal(log.metadata);
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
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  padding: "6px 8px",
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
                    background: dotColor ?? "var(--text-tertiary)",
                    border: "1px solid var(--bg-canvas)",
                    flexShrink: 0,
                  }}
                />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 2 }}>
                    <span style={{ fontSize: 9, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                      {new Date(log.timestamp).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: dotColor ?? "var(--text-secondary)" }}>
                      {name}
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        color: "var(--text-secondary)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: 99,
                        padding: "1px 6px",
                      }}
                    >
                      {laneLabel}
                    </span>
                    {signal && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 99,
                        background: `${SIGNAL_LABEL[signal].cssVar}1F`,
                        color: SIGNAL_LABEL[signal].cssVar,
                      }}>{SIGNAL_LABEL[signal].ko}</span>
                    )}
                  </div>
                  <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5, marginTop: 0, marginBottom: 0 }} className="line-clamp-4">
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
  /** MS-D: 전체 thought 로그 (역할별 sparkline 계산용). 미제공 시 sparkline 생략. */
  allThoughts?: AgentThought[];
}

const LAYERS: { label: string; roles: AgentRole[] }[] = [
  { label: LAYER_LABEL[0], roles: LAYER_ROLES[0] },
  { label: LAYER_LABEL[1], roles: LAYER_ROLES[1] },
  { label: LAYER_LABEL[2], roles: LAYER_ROLES[2] },
];

export function AgentOffice({ thoughts, activeAgents, allThoughts }: AgentOfficeProps) {
  // MS-F F1: 역할 핀/순서/숨김 적용
  const pinnedRoles = usePersonalization((s) => s.pinnedRoles);
  const hiddenRoles = usePersonalization((s) => s.hiddenRoles);
  const roleOrder = usePersonalization((s) => s.roleOrder);

  // 역할별 히스토리 인덱스 (한 번만 계산)
  const historyByRole = new Map<AgentRole, AgentThought[]>();
  if (allThoughts) {
    for (const t of allThoughts) {
      const arr = historyByRole.get(t.role) ?? [];
      arr.push(t);
      historyByRole.set(t.role, arr);
    }
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {LAYERS.map((layer) => {
        // 개인화 — 숨김 제거 + 핀 우선 정렬
        const personalizedRoles = applyRolePersonalization(layer.roles, {
          pinnedRoles,
          hiddenRoles,
          roleOrder,
        });
        if (personalizedRoles.length === 0) return null;
        const doneCount = personalizedRoles.filter(r => thoughts.get(r)?.status === "done").length;
        const allDone = doneCount === personalizedRoles.length;
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
                  {allDone ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Icon name="check" size={11} strokeWidth={2.4} decorative />
                      완료
                    </span>
                  ) : (
                    `${doneCount} / ${personalizedRoles.length}`
                  )}
                </motion.span>
              )}
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: `repeat(${personalizedRoles.length}, 1fr)`,
              gap: 8,
            }}>
              {personalizedRoles.map((role, i) => (
                <AgentCard
                  key={role}
                  role={role}
                  thought={thoughts.get(role)}
                  history={historyByRole.get(role)}
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
