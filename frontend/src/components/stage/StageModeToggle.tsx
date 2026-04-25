"use client";

/**
 * StageModeToggle — Live / Story / Report 3-way 토글 (MS-S2).
 */

import { useAgentStage, type StageMode } from "@/stores/useAgentStage";

const MODES: { value: StageMode; label: string; aria: string }[] = [
  { value: "live", label: "라이브", aria: "라이브 모드" },
  { value: "story", label: "스토리", aria: "스토리 모드" },
  { value: "report", label: "리포트", aria: "리포트 모드" },
];

export function StageModeToggle() {
  const mode = useAgentStage((s) => s.mode);
  const setMode = useAgentStage((s) => s.setMode);
  const autoMode = useAgentStage((s) => s.autoMode);
  const setAutoMode = useAgentStage((s) => s.setAutoMode);

  return (
    <div
      role="group"
      aria-label="무대 모드"
      style={{
        display: "inline-flex",
        gap: 4,
        padding: 3,
        background: "var(--bg-overlay)",
        border: "1px solid var(--stage-border)",
        borderRadius: "var(--stage-radius)",
        backdropFilter: "blur(8px)",
      }}
    >
      {MODES.map((m) => {
        const active = mode === m.value;
        return (
          <button
            key={m.value}
            type="button"
            aria-label={m.aria}
            aria-pressed={active}
            onClick={() => setMode(m.value, true)}
            className="stage-label"
            style={{
              padding: "4px 10px",
              fontSize: 10,
              fontWeight: 700,
              border: "none",
              background: active ? "var(--brand)" : "transparent",
              color: active ? "var(--text-inverse)" : "var(--text-secondary)",
              borderRadius: "var(--stage-radius)",
              cursor: "pointer",
              fontFamily: "var(--stage-font-label)",
              transition: "all var(--stage-dur-fast) var(--stage-ease)",
            }}
          >
            {m.label}
          </button>
        );
      })}
      <button
        type="button"
        aria-label={autoMode ? "자동 전환 끄기" : "자동 전환 켜기"}
        aria-pressed={autoMode}
        onClick={() => setAutoMode(!autoMode)}
        className="stage-label"
        title={autoMode ? "자동 전환 켜짐 (분석 완료 시 스토리 자동)" : "자동 전환 꺼짐"}
        style={{
          padding: "4px 8px",
          fontSize: 10,
          fontWeight: 700,
          border: "none",
          background: autoMode ? "var(--success-subtle)" : "transparent",
          color: autoMode ? "var(--success)" : "var(--text-tertiary)",
          borderRadius: "var(--stage-radius)",
          cursor: "pointer",
          fontFamily: "var(--stage-font-label)",
          marginLeft: 4,
        }}
      >
        AUTO
      </button>
    </div>
  );
}
