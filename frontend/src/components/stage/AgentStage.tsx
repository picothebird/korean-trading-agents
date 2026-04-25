"use client";

/**
 * AgentStage — 통합 에이전트 무대 (MS-S1 골격).
 *
 * 하나의 surface 위에서:
 *  - PhaserCanvas (픽셀 오피스)
 *  - 우측 사이드바 (탑라인/진행률/최근발언)
 *  - 하단 회전 strip
 *  - Story/Report 모드에서 펼쳐지는 회의록
 * 을 한 덩어리로 묶음.
 *
 * docs/AGENT_STAGE_REDESIGN_PROPOSAL.md §3, §4
 */

import { useEffect } from "react";
import type { AgentThought, TradeDecision } from "@/types";
import { PhaserCanvas } from "@/components/game/PhaserCanvas";
import { AgentTimeline } from "@/components/agent-timeline";
import { useAgentStage, type StageMode, MANUAL_OVERRIDE_MS } from "@/stores/useAgentStage";
import { StageTopLine } from "./StageTopLine";
import { StageProgress } from "./StageProgress";
import { StageRecentStrip } from "./StageRecentStrip";
import { StageModeToggle } from "./StageModeToggle";
import { MeetingMinutes } from "./MeetingMinutes";

interface AgentStageProps {
  thoughts: AgentThought[];
  /** 분석 완료 시점에 도착하는 결정 — 있으면 즉시 Story로 전환 가능. */
  decision?: TradeDecision | null;
  /** 모의투자 클릭 등의 외부 액션. */
  onTryPaper?: () => void;
}

export function AgentStage({ thoughts, decision, onTryPaper }: AgentStageProps) {
  const mode = useAgentStage((s) => s.mode);
  const autoMode = useAgentStage((s) => s.autoMode);
  const manualOverrideAt = useAgentStage((s) => s.manualOverrideAt);
  const setMode = useAgentStage((s) => s.setMode);

  // MS-S5: 자동 전환 — decision 도착 시 6초 후 story 자동 전환
  // (autoMode ON이고, 사용자가 최근 30초 안에 수동 전환하지 않았을 때만)
  useEffect(() => {
    if (!autoMode) return;
    if (!decision) return;
    if (mode !== "live") return;
    if (manualOverrideAt && Date.now() - manualOverrideAt < MANUAL_OVERRIDE_MS) return;
    const id = setTimeout(() => {
      setMode("story", false);
    }, 6000);
    return () => clearTimeout(id);
  }, [autoMode, decision, mode, manualOverrideAt, setMode]);

  // 새 분석 시작 감지: thoughts가 0으로 리셋되면 모드 초기화
  const reset = useAgentStage((s) => s.resetForNewAnalysis);
  useEffect(() => {
    if (thoughts.length === 0 && mode !== "live") {
      reset();
    }
    // mode를 dep에 넣지 않음 — thoughts 리셋만이 트리거
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thoughts.length === 0]);

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
      data-stage-mode={mode}
    >
      {/* 상단: 캔버스 + 사이드바 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            mode === "report" ? "200px 1fr" : "1fr 340px",
          gap: "var(--stage-grid)",
          flex: 1,
          minHeight: 0,
          transition: "grid-template-columns var(--stage-dur-base) var(--stage-ease)",
        }}
      >
        {/* 좌: 캔버스 */}
        <div
          className="stage-card"
          style={{
            minHeight: 0,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <PhaserCanvas thoughts={thoughts} />
          {/* 우상단 모드 토글 */}
          <div style={{ position: "absolute", top: 8, right: 8, zIndex: 5 }}>
            <StageModeToggle />
          </div>
        </div>

        {/* 우: 사이드바 */}
        <aside
          className="stage-card"
          style={{
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            padding: 12,
            gap: 12,
            overflow: "hidden",
          }}
          aria-label="에이전트 무대 사이드바"
        >
          <StageTopLine
            thoughts={thoughts}
            decision={decision ?? null}
            onClickHeadline={() => useAgentStage.getState().setMode("story", true)}
          />
          <div style={{ borderTop: "1px solid var(--stage-border)" }} />
          <StageProgress thoughts={thoughts} />
          <div style={{ borderTop: "1px solid var(--stage-border)" }} />
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <p className="stage-label" style={{ margin: "0 0 6px 0" }}>
              최근 활동
            </p>
            <div style={{ flex: 1, minHeight: 0 }}>
              <AgentTimeline thoughts={thoughts} variant="strip" />
            </div>
          </div>
        </aside>
      </div>

      {/* 하단: 회전 스트립 (Live 모드에서만) */}
      {mode === "live" && <StageRecentStrip thoughts={thoughts} />}

      {/* 회의록 (Story / Report) */}
      {(mode === "story" || mode === "report") && decision && (
        <MeetingMinutes
          decision={decision}
          mode={mode as Exclude<StageMode, "live">}
          onTryPaper={onTryPaper}
        />
      )}
    </div>
  );
}
