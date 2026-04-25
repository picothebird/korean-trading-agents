"use client";

/**
 * AgentInspector — 에이전트 클릭 시 우측 슬라이드 패널.
 *
 * 탭:
 *  - 개요: 역할 설명, 현재 상태, 마지막 신호, 누적 발화 수
 *  - 활동: 해당 에이전트의 모든 thought (시간 역순)
 *  - 추적: 인스펙터 오픈 시 thought가 지정되었으면 그 thought 상세 (입력/메타/raw)
 *
 * docs/AGENT_OFFICE_GATHER_LEVEL_UP.md §0-sexies.1 (MS-C: C-1, C-2)
 */

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AgentRole, AgentThought } from "@/types";
import {
  AGENT_LABEL,
  AGENT_COLOR,
  STATUS_LABEL,
  layerOfRole,
  LAYER_LABEL,
  extractSignal,
  SIGNAL_LABEL,
} from "@/lib/agentLabels";
import { useAgentOffice, thoughtId } from "@/stores/useAgentOffice";
import { Icon } from "@/components/ui";
import { formatRelativeTime, formatAbsoluteTime, formatDuration } from "@/components/agent-timeline/formatTime";

const ROLE_DESCRIPTION: Record<AgentRole, string> = {
  technical_analyst: "차트 패턴·이동평균·모멘텀 등 기술적 지표 기반의 단기 신호 도출.",
  fundamental_analyst: "재무제표·실적·밸류에이션 분석을 통한 장기 본질가치 평가.",
  sentiment_analyst: "뉴스·SNS·공시 등 비정형 데이터에서 시장 심리 추출.",
  macro_analyst: "금리·환율·원자재 등 거시 변수의 종목/섹터 영향 평가.",
  bull_researcher: "분석가 결과를 종합해 매수 측 논거를 강화·반론 대응.",
  bear_researcher: "분석가 결과를 종합해 매도 측 논거를 강화·반론 대응.",
  risk_manager: "포지션 사이즈·손실 한도·시나리오 리스크 검증.",
  portfolio_manager: "토론과 리스크 평가를 종합해 최종 매수/매도/관망 결정.",
  guru_agent: "전체 분석 흐름을 감독하고 사용자에게 의사결정 요약 보고.",
};

interface AgentInspectorProps {
  /** 부모로부터 받은 모든 thoughts (필터링 전 원본). */
  thoughts: AgentThought[];
}

type Tab = "overview" | "activity" | "trace";

export function AgentInspector({ thoughts }: AgentInspectorProps) {
  const inspector = useAgentOffice((s) => s.inspector);
  const close = useAgentOffice((s) => s.closeInspector);
  const openAsk = useAgentOffice((s) => s.openAsk);
  const isBookmarked = useAgentOffice((s) => s.isBookmarked);
  const addBookmark = useAgentOffice((s) => s.addBookmark);
  const removeBookmark = useAgentOffice((s) => s.removeBookmark);

  const role = inspector.role;
  const targetThought = inspector.thought;

  // Esc로 닫기
  useEffect(() => {
    if (!role) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [role, close]);

  const roleThoughts = useMemo(
    () => (role ? thoughts.filter((t) => t.role === role).slice().reverse() : []),
    [thoughts, role],
  );

  const lastThought = roleThoughts[0] ?? null;
  const lastSignal = lastThought ? extractSignal(lastThought.metadata) : null;

  // 탭 상태는 (role, thought) 조합이 바뀌면 초깃값으로 리셋 (React 공식 "Storing information from previous renders" 패턴)
  const panelKey = `${role ?? ""}::${targetThought?.timestamp ?? ""}`;
  const initialTab: Tab = targetThought ? "trace" : "overview";
  const [tabState, setTabState] = useState<{ key: string; tab: Tab }>({ key: panelKey, tab: initialTab });
  if (tabState.key !== panelKey) {
    setTabState({ key: panelKey, tab: initialTab });
  }
  const tab = tabState.tab;
  const setTab = (t: Tab) => setTabState({ key: panelKey, tab: t });

  return (
    <AnimatePresence>
      {role && (
        <>
          {/* 백드롭 */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={close}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15, 17, 25, 0.32)",
              zIndex: 80,
            }}
          />
          {/* 패널 */}
          <motion.aside
            key="panel"
            role="dialog"
            aria-label={`${AGENT_LABEL[role]} 인스펙터`}
            aria-modal="true"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: "min(440px, 92vw)",
              background: "var(--bg-canvas)",
              borderLeft: "1px solid var(--border-subtle)",
              boxShadow: "var(--shadow-lg, -10px 0 30px rgba(15,17,25,0.16))",
              zIndex: 81,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* 헤더 */}
            <header
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 14px",
                borderBottom: "1px solid var(--border-subtle)",
                background: "var(--bg-surface)",
                flexShrink: 0,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: AGENT_COLOR[role],
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    margin: 0,
                  }}
                >
                  {AGENT_LABEL[role]}
                </h2>
                <p
                  style={{
                    fontSize: 10,
                    color: "var(--text-tertiary)",
                    margin: 0,
                    marginTop: 1,
                  }}
                >
                  {LAYER_LABEL[layerOfRole(role)]}
                </p>
              </div>

              <button
                type="button"
                onClick={() => openAsk(role, targetThought)}
                title="이 에이전트에게 후속 질문 (MS-C 미리보기)"
                style={{
                  padding: "4px 10px",
                  background: "var(--brand-subtle)",
                  color: "var(--brand-active)",
                  border: "1px solid var(--brand-border)",
                  borderRadius: "var(--radius-md)",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                💬 질문
              </button>

              <button
                type="button"
                onClick={close}
                aria-label="인스펙터 닫기"
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: 4,
                  color: "var(--text-secondary)",
                  display: "inline-flex",
                }}
              >
                <Icon name="x" size={14} decorative />
              </button>
            </header>

            {/* 탭 바 */}
            <div
              role="tablist"
              aria-label="인스펙터 탭"
              style={{
                display: "flex",
                gap: 2,
                padding: "6px 8px 0",
                borderBottom: "1px solid var(--border-subtle)",
                background: "var(--bg-surface)",
                flexShrink: 0,
              }}
            >
              {(
                [
                  ["overview", "개요"],
                  ["activity", `활동 (${roleThoughts.length})`],
                  ["trace", "추적", !targetThought],
                ] as const
              ).map(([k, label, disabled]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={tab === k}
                  disabled={disabled}
                  onClick={() => setTab(k)}
                  style={{
                    padding: "6px 12px",
                    background: tab === k ? "var(--bg-canvas)" : "transparent",
                    border: "1px solid transparent",
                    borderColor: tab === k ? "var(--border-subtle)" : "transparent",
                    borderBottom: tab === k ? "1px solid var(--bg-canvas)" : "none",
                    borderTopLeftRadius: 6,
                    borderTopRightRadius: 6,
                    color: tab === k ? "var(--text-primary)" : "var(--text-tertiary)",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: disabled ? "not-allowed" : "pointer",
                    opacity: disabled ? 0.4 : 1,
                    marginBottom: -1,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* 컨텐츠 */}
            <div style={{ flex: 1, overflow: "auto", padding: 14 }}>
              {tab === "overview" && (
                <OverviewTab
                  role={role}
                  description={ROLE_DESCRIPTION[role]}
                  total={roleThoughts.length}
                  lastThought={lastThought}
                  lastSignal={lastSignal}
                />
              )}
              {tab === "activity" && (
                <ActivityTab
                  thoughts={roleThoughts}
                  isBookmarked={isBookmarked}
                  addBookmark={addBookmark}
                  removeBookmark={removeBookmark}
                />
              )}
              {tab === "trace" && targetThought && (
                <TraceTab thought={targetThought} />
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

// ── 개요 ─────────────────────────────────────────────────────────
function OverviewTab({
  role,
  description,
  total,
  lastThought,
  lastSignal,
}: {
  role: AgentRole;
  description: string;
  total: number;
  lastThought: AgentThought | null;
  lastSignal: ReturnType<typeof extractSignal>;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Section title="역할">
        <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
          {description}
        </p>
      </Section>

      <Section title="현재 상태">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Stat label="누적 발화" value={`${total}건`} />
          <Stat
            label="최신 상태"
            value={lastThought ? STATUS_LABEL[lastThought.status] : "대기"}
          />
          {lastSignal && (
            <Stat
              label="최신 신호"
              value={SIGNAL_LABEL[lastSignal].ko}
              color={SIGNAL_LABEL[lastSignal].cssVar}
            />
          )}
        </div>
      </Section>

      {lastThought && (
        <Section title="가장 최근 발화">
          <div
            style={{
              padding: 10,
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              borderLeft: `3px solid ${AGENT_COLOR[role]}`,
            }}
          >
            <p
              style={{
                fontSize: 9,
                color: "var(--text-tertiary)",
                margin: 0,
                marginBottom: 4,
                fontVariantNumeric: "tabular-nums",
              }}
              title={formatAbsoluteTime(lastThought.timestamp)}
            >
              {formatRelativeTime(lastThought.timestamp)}
            </p>
            <p style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.6, margin: 0 }}>
              {lastThought.content}
            </p>
          </div>
        </Section>
      )}
    </div>
  );
}

// ── 활동 (해당 에이전트 thoughts) ───────────────────────────────
function ActivityTab({
  thoughts,
  isBookmarked,
  addBookmark,
  removeBookmark,
}: {
  thoughts: AgentThought[];
  isBookmarked: (id: string) => boolean;
  addBookmark: (rec: import("@/stores/useAgentOffice").BookmarkRecord) => void;
  removeBookmark: (id: string) => void;
}) {
  if (thoughts.length === 0) {
    return (
      <p style={{ fontSize: 12, color: "var(--text-tertiary)", textAlign: "center", padding: 20 }}>
        아직 발화가 없습니다.
      </p>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {thoughts.map((t) => {
        const id = thoughtId(t);
        const bookmarked = isBookmarked(id);
        const sig = extractSignal(t.metadata);
        return (
          <div
            key={id}
            style={{
              padding: "8px 10px",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2 }}>
                <span
                  style={{
                    fontSize: 9,
                    color: "var(--text-tertiary)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                  title={formatAbsoluteTime(t.timestamp)}
                >
                  {formatRelativeTime(t.timestamp)}
                </span>
                <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>
                  · {STATUS_LABEL[t.status]}
                </span>
                {sig && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: "1px 5px",
                      borderRadius: 99,
                      background: `${SIGNAL_LABEL[sig].cssVar}1F`,
                      color: SIGNAL_LABEL[sig].cssVar,
                    }}
                  >
                    {SIGNAL_LABEL[sig].ko}
                  </span>
                )}
              </div>
              <p
                style={{
                  fontSize: 11,
                  color: "var(--text-secondary)",
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                {t.content}
              </p>
            </div>
            <button
              type="button"
              aria-pressed={bookmarked}
              aria-label={bookmarked ? "북마크 해제" : "북마크"}
              onClick={() =>
                bookmarked
                  ? removeBookmark(id)
                  : addBookmark({
                      id,
                      role: t.role,
                      status: t.status,
                      content: t.content,
                      timestamp: t.timestamp,
                      signal: sig,
                      savedAt: new Date().toISOString(),
                    })
              }
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontSize: 14,
                lineHeight: 1,
                color: bookmarked ? "#F5A524" : "var(--text-tertiary)",
                padding: 0,
              }}
            >
              {bookmarked ? "★" : "☆"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── 추적 (특정 thought 상세) ─────────────────────────────────────
function TraceTab({ thought }: { thought: AgentThought }) {
  const md = (thought.metadata ?? {}) as Record<string, unknown>;
  const sig = extractSignal(thought.metadata);
  const duration = typeof md.duration_ms === "number" ? md.duration_ms : null;
  const confidence = typeof md.confidence === "number" ? md.confidence : null;
  const keyPoints = Array.isArray(md.key_points) ? (md.key_points as string[]) : [];
  const sources = Array.isArray(md.sources) ? (md.sources as unknown[]) : [];
  const prompt = typeof md.prompt === "string" ? (md.prompt as string) : null;
  const raw = typeof md.raw === "string" ? (md.raw as string) : null;

  // 추적 가능한 표준 필드를 제외한 나머지 메타 (디버그용)
  const STANDARD = new Set([
    "signal",
    "duration_ms",
    "confidence",
    "key_points",
    "sources",
    "prompt",
    "raw",
    "signal_raw",
    "trade_signal",
  ]);
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(md)) {
    if (!STANDARD.has(k)) extra[k] = v;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Section title="기본 정보">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Stat label="시각" value={formatAbsoluteTime(thought.timestamp)} />
          <Stat label="상태" value={STATUS_LABEL[thought.status]} />
          {sig && (
            <Stat
              label="신호"
              value={SIGNAL_LABEL[sig].ko}
              color={SIGNAL_LABEL[sig].cssVar}
            />
          )}
          {duration !== null && <Stat label="처리 시간" value={formatDuration(duration) ?? "-"} />}
          {confidence !== null && (
            <Stat label="자신감" value={`${Math.round(confidence * 100)}%`} />
          )}
        </div>
      </Section>

      <Section title="발화 내용">
        <p
          style={{
            fontSize: 12,
            color: "var(--text-primary)",
            lineHeight: 1.6,
            margin: 0,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            padding: 10,
            whiteSpace: "pre-wrap",
          }}
        >
          {thought.content}
        </p>
      </Section>

      {keyPoints.length > 0 && (
        <Section title="핵심 포인트">
          <ul style={{ paddingLeft: 18, margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
            {keyPoints.map((p, i) => (
              <li key={i} style={{ lineHeight: 1.6 }}>
                {p}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {sources.length > 0 && (
        <Section title="참조 소스">
          <ul
            style={{
              paddingLeft: 18,
              margin: 0,
              fontSize: 11,
              color: "var(--text-tertiary)",
            }}
          >
            {sources.map((s, i) => (
              <li key={i} style={{ lineHeight: 1.6 }}>
                {typeof s === "string" ? s : JSON.stringify(s)}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {prompt && (
        <Section title="프롬프트 (LLM 입력)">
          <Pre>{prompt}</Pre>
        </Section>
      )}

      {raw && (
        <Section title="원본 응답 (LLM 출력)">
          <Pre>{raw}</Pre>
        </Section>
      )}

      {Object.keys(extra).length > 0 && (
        <Section title="추가 메타데이터">
          <Pre>{JSON.stringify(extra, null, 2)}</Pre>
        </Section>
      )}

      {!prompt && !raw && Object.keys(extra).length === 0 && keyPoints.length === 0 && (
        <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: 0 }}>
          이 발화에는 추가 메타데이터가 없습니다. (백엔드가 prompt/raw/sources를 채우면 여기에 표시됩니다.)
        </p>
      )}
    </div>
  );
}

// ── 작은 빌딩 블록 ───────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "var(--text-tertiary)",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          margin: 0,
          marginBottom: 6,
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      style={{
        padding: "4px 10px",
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        minWidth: 70,
      }}
    >
      <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>{label}</div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: color ?? "var(--text-primary)",
          marginTop: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Pre({ children }: { children: string }) {
  return (
    <pre
      style={{
        fontSize: 11,
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        padding: 10,
        margin: 0,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        maxHeight: 240,
        overflow: "auto",
        color: "var(--text-secondary)",
        fontFamily:
          'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      }}
    >
      {children}
    </pre>
  );
}
