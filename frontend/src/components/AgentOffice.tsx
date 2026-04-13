"use client";

import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import type { AgentThought, AgentRole, AgentStatus } from "@/types";

const AGENT_META: Record<
  AgentRole,
  { name: string; emoji: string; color: string; desk: string }
> = {
  technical_analyst: {
    name: "기술적 분석가",
    emoji: "📊",
    color: "blue",
    desk: "차트 분석",
  },
  fundamental_analyst: {
    name: "펀더멘털 분석가",
    emoji: "📋",
    color: "purple",
    desk: "재무 분석",
  },
  sentiment_analyst: {
    name: "감성 분석가",
    emoji: "🌐",
    color: "orange",
    desk: "뉴스/여론",
  },
  macro_analyst: {
    name: "매크로 분석가",
    emoji: "🌍",
    color: "green",
    desk: "시장 환경",
  },
  bull_researcher: {
    name: "강세 연구원",
    emoji: "🐂",
    color: "red",
    desk: "매수 논거",
  },
  bear_researcher: {
    name: "약세 연구원",
    emoji: "🐻",
    color: "teal",
    desk: "매도 논거",
  },
  risk_manager: {
    name: "리스크 매니저",
    emoji: "🛡️",
    color: "yellow",
    desk: "위험 관리",
  },
  portfolio_manager: {
    name: "포트폴리오 매니저",
    emoji: "👔",
    color: "indigo",
    desk: "최종 결정",
  },
};

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: "대기",
  thinking: "분석 중",
  analyzing: "분석 중",
  debating: "토론 중",
  deciding: "결정 중",
  done: "완료",
};

const STATUS_COLOR: Record<AgentStatus, string> = {
  idle: "bg-gray-100 text-gray-500",
  thinking: "bg-blue-100 text-blue-700",
  analyzing: "bg-orange-100 text-orange-700",
  debating: "bg-purple-100 text-purple-700",
  deciding: "bg-yellow-100 text-yellow-700",
  done: "bg-green-100 text-green-700",
};

interface AgentCardProps {
  role: AgentRole;
  thought?: AgentThought;
  isActive: boolean;
}

export function AgentCard({ role, thought, isActive }: AgentCardProps) {
  const meta = AGENT_META[role];
  const status: AgentStatus = thought?.status ?? "idle";
  const isPulse = ["thinking", "analyzing", "debating", "deciding"].includes(status);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx(
        "relative rounded-2xl border p-4 transition-all duration-300",
        isActive
          ? "border-blue-300 bg-white shadow-lg ring-2 ring-blue-100"
          : "border-gray-100 bg-white/60 shadow-sm"
      )}
    >
      {/* 펄스 효과 */}
      {isPulse && (
        <motion.div
          className="absolute inset-0 rounded-2xl bg-blue-400/10"
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}

      <div className="flex items-start gap-3">
        {/* 에이전트 아바타 */}
        <motion.div
          className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-2xl"
          animate={isPulse ? { scale: [1, 1.08, 1] } : {}}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          {meta.emoji}
          {isActive && (
            <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-green-400 ring-2 ring-white" />
          )}
        </motion.div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-900">{meta.name}</p>
            <span
              className={clsx(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                STATUS_COLOR[status]
              )}
            >
              {STATUS_LABEL[status]}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-gray-400">{meta.desk}</p>
        </div>
      </div>

      {/* 사고 내용 */}
      <AnimatePresence mode="wait">
        {thought?.content && (
          <motion.div
            key={thought.timestamp}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3"
          >
            <div className="rounded-xl bg-gray-50 px-3 py-2">
              <p className="text-xs leading-relaxed text-gray-600">
                {thought.content}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface AgentOfficeProps {
  thoughts: Map<AgentRole, AgentThought>;
  activeAgents: Set<AgentRole>;
}

const OFFICE_LAYOUT: AgentRole[][] = [
  ["technical_analyst", "sentiment_analyst", "macro_analyst"],
  ["bull_researcher", "bear_researcher"],
  ["risk_manager", "portfolio_manager"],
];

export function AgentOffice({ thoughts, activeAgents }: AgentOfficeProps) {
  return (
    <div className="space-y-4">
      {OFFICE_LAYOUT.map((row, rowIdx) => (
        <div
          key={rowIdx}
          className={clsx(
            "grid gap-3",
            row.length === 3 && "grid-cols-3",
            row.length === 2 && "grid-cols-2",
            row.length === 1 && "grid-cols-1"
          )}
        >
          {row.map((role) => (
            <AgentCard
              key={role}
              role={role}
              thought={thoughts.get(role)}
              isActive={activeAgents.has(role)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
