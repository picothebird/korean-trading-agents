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

import { useEffect, useRef, useState } from "react";
import type { AgentThought, TradeDecision } from "@/types";
import { PhaserCanvas } from "@/components/game/PhaserCanvas";
import { AgentTimeline } from "@/components/agent-timeline";
import { useAgentStage, type StageMode, MANUAL_OVERRIDE_MS } from "@/stores/useAgentStage";
import { playSfx } from "@/components/game/sfx";
import { layerOfRole, AGENT_LABEL } from "@/lib/agentLabels";
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

  // MS-S6: SFX 트리거 + aria-live 안내.
  // 단계별 첫 'done' 도착 → "select" / "done", 결정 도착 → "fanfare", 모드 변경 → "select".
  const announcedRolesRef = useRef<Set<string>>(new Set());
  const decisionPlayedRef = useRef(false);
  const [liveMessage, setLiveMessage] = useState("");

  useEffect(() => {
    // 마지막 thought만 검사 — 새 done 발생 시 한 번만 trigger.
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
    // L1(분석가) → select, L2(연구원/PM) → done, L3(리스크/실행) → done
    playSfx(layer === 0 ? "select" : "done");
    const name = AGENT_LABEL[last.role] ?? last.role;
    setLiveMessage(`${name} 분석 완료`);
  }, [thoughts]);

  // 결정 도착 시 팡파레 1회.
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

  // 모드 변경 시 짧은 select.
  const prevModeRef = useRef(mode);
  useEffect(() => {
    if (prevModeRef.current !== mode) {
      prevModeRef.current = mode;
      playSfx("select");
    }
  }, [mode]);

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
      {/* MS-S6: aria-live 무대 진행 알림 (스크린리더 전용) */}
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
