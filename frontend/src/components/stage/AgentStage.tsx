"use client";

/**
 * AgentStage — 통합 에이전트 무대.
 *
 * 하나의 surface 위에서:
 *  - PhaserCanvas (픽셀 오피스)
 *  - 우측 사이드바 (탑라인/진행률/최근발언)
 *  - 하단 회전 strip
 *  - 분석 종료 시 회의 종료 카드(MeetingMinutes)
 * 을 한 덩어리로 묶음.
 *
 * 2026-04-26: Live/Story/Report 3 모드 토글 제거.
 *   - 모드 전환 시 grid-template-columns 변동 → 캔버스 리사이즈 → 카메라 강제 중앙 → 시점 손실
 *   - autoMode가 분석 종료 6초 후 story로 강제 전환해 사용자 시점 파괴
 *   - 모드별 회의록 본문은 어차피 분석 탭(AnalysisResult)에 일원화돼 잉여 기능
 *   - 결과: 항상 "라이브" 레이아웃 + 결정 도착 시 닫는 카드만 표시
 */

import { useEffect, useRef, useState } from "react";
import type { AgentThought, AgentRole, TradeDecision } from "@/types";
import { PhaserCanvas } from "@/components/game/PhaserCanvas";
import { playSfx } from "@/components/game/sfx";
import { layerOfRole, AGENT_LABEL } from "@/lib/agentLabels";
import { StageProgress } from "./StageProgress";
import { MeetingMinutes } from "./MeetingMinutes";

interface AgentStageProps {
  thoughts: AgentThought[];
  /** 분석 완료 시점에 도착하는 결정 — 있으면 닫는 카드 노출. */
  decision?: TradeDecision | null;
  /** 무대에 보여줄 역할 목록 (예: GURU OFF 시 guru_agent 제외). */
  visibleRoles?: ReadonlyArray<AgentRole>;
  /** 전체 에이전트 수 표시용 분모. */
  totalAgents?: number;
  /** 모의투자 클릭 등의 외부 액션. */
  onTryPaper?: () => void;
}

export function AgentStage({ thoughts, decision, visibleRoles, totalAgents = 9, onTryPaper }: AgentStageProps) {
  const announcedRolesRef = useRef<Set<string>>(new Set());
  const decisionPlayedRef = useRef(false);
  const [liveMessage, setLiveMessage] = useState("");

  useEffect(() => {
    const last = thoughts[thoughts.length - 1];
    if (!last) {
      announcedRolesRef.current = new Set();
      return;
    }
    if (last.status !== "done") return;
    const key = last.role;
    if (announcedRolesRef.current.has(key)) return;
    announcedRolesRef.current.add(key);
    const layer = layerOfRole(last.role);
    playSfx(layer === 0 ? "select" : "done");
    const name = AGENT_LABEL[last.role] ?? last.role;
    setLiveMessage(`${name} 분석 완료`);
  }, [thoughts]);

  useEffect(() => {
    if (!decision) {
      decisionPlayedRef.current = false;
      return;
    }
    if (decisionPlayedRef.current) return;
    decisionPlayedRef.current = true;
    playSfx("fanfare");
    const labels: Record<string, string> = { BUY: "매수", SELL: "매도", HOLD: "관망" };
    const label = labels[decision.action] ?? decision.action;
    const score = Math.round(decision.confidence * 100);
    setLiveMessage(`최종 결정 ${label} ${score}점`);
  }, [decision]);

  return (
    <div
      className="agent-stage"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        gap: "var(--stage-grid)",
        background: "var(--bg-canvas)",
        padding: "var(--stage-grid)",
      }}
    >
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {liveMessage}
      </div>

      {/* 메인 캔버스 영역 전체 차지 + 잘 다음 진행률 오버레이. */}
      <div
        style={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          borderRadius: "var(--radius-xl, 16px)",
          overflow: "hidden",
          background: "var(--bg-canvas)",
          border: "1px solid var(--stage-border)",
        }}
      >
        <PhaserCanvas thoughts={thoughts} visibleRoles={visibleRoles} />
        {/* 내장 진행률 — v3 polish: 우측 하단으로 이동. */}
        <div
          style={{
            position: "absolute",
            right: 12,
            bottom: 12,
            background: "rgba(255,255,255,0.82)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(0,0,0,0.06)",
            borderRadius: 10,
            padding: "8px 12px",
            minWidth: 180,
            maxWidth: 240,
            pointerEvents: "auto",
            zIndex: 6,
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}
        >
          <StageProgress thoughts={thoughts} visibleRoles={visibleRoles} />
        </div>
      </div>

      {/* 회의 종료 카드 (결정 도착 시) */}
      {decision && (
        <MeetingMinutes
          decision={decision}
          totalAgents={totalAgents}
          onTryPaper={onTryPaper}
        />
      )}
    </div>
  );
}
