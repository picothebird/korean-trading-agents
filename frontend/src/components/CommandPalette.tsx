"use client";

/**
 * CommandPalette — ⌘K / Ctrl+K로 열리는 글로벌 명령 팔레트.
 *
 * 액션 분류:
 *  - 에이전트 점프 (각 9 에이전트의 인스펙터 열기)
 *  - 에이전트에게 질문 (각 9)
 *  - 타임라인 줌/그룹/일시정지/CSV
 *  - 신호 필터 토글
 *  - 단축키 도움말 열기
 *
 * docs/AGENT_OFFICE_GATHER_LEVEL_UP.md §0-sexies.1 (MS-C: C-12)
 */

import { useEffect, useMemo } from "react";
import { Command } from "cmdk";
import { motion, AnimatePresence } from "framer-motion";
import { useAgentOffice } from "@/stores/useAgentOffice";
import { useTimelineStore } from "@/components/agent-timeline/useTimeline";
import { ALL_AGENT_ROLES, AGENT_LABEL, LAYER_LABEL, layerOfRole, AGENT_COLOR } from "@/lib/agentLabels";

export function CommandPalette() {
  const open = useAgentOffice((s) => s.paletteOpen);
  const setOpen = useAgentOffice((s) => s.setPaletteOpen);
  const openInspector = useAgentOffice((s) => s.openInspector);
  const openAsk = useAgentOffice((s) => s.openAsk);
  const setShortcutsOpen = useAgentOffice((s) => s.setShortcutsOpen);

  const setZoom = useTimelineStore((s) => s.setZoom);
  const setGroupMode = useTimelineStore((s) => s.setGroupMode);
  const togglePaused = useTimelineStore((s) => s.togglePaused);
  const toggleSignalOnly = useTimelineStore((s) => s.toggleSignalOnly);
  const resetFilters = useTimelineStore((s) => s.resetFilters);
  const toggleRole = useTimelineStore((s) => s.toggleRole);

  // ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        useAgentOffice.getState().togglePalette();
      }
      if (open && e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const exec = (fn: () => void) => {
    setOpen(false);
    requestAnimationFrame(fn);
  };

  // 그룹별 액션
  const agentItems = useMemo(
    () =>
      ALL_AGENT_ROLES.map((role) => ({
        role,
        label: AGENT_LABEL[role],
        layer: LAYER_LABEL[layerOfRole(role)],
        color: AGENT_COLOR[role],
      })),
    [],
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="palette-bd"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,17,25,0.45)",
            zIndex: 100,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "10vh 16px",
          }}
        >
          <motion.div
            key="palette-panel"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(640px, 100%)",
              background: "var(--bg-canvas)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-lg, 12px)",
              boxShadow: "var(--shadow-lg, 0 20px 60px rgba(15,17,25,0.3))",
              overflow: "hidden",
            }}
          >
            <Command label="명령 팔레트">
              <Command.Input
                autoFocus
                placeholder="명령을 검색하세요... (예: 기술적 분석가, 줌 상세, 일시정지)"
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  fontSize: 13,
                  background: "var(--bg-canvas)",
                  border: "none",
                  borderBottom: "1px solid var(--border-subtle)",
                  outline: "none",
                  color: "var(--text-primary)",
                }}
              />

              <Command.List
                style={{
                  maxHeight: "60vh",
                  overflow: "auto",
                  padding: 6,
                }}
              >
                <Command.Empty
                  style={{
                    padding: 20,
                    textAlign: "center",
                    fontSize: 12,
                    color: "var(--text-tertiary)",
                  }}
                >
                  일치하는 명령이 없습니다.
                </Command.Empty>

                <PaletteGroup heading="에이전트 인스펙터">
                  {agentItems.map((a) => (
                    <PaletteItem
                      key={`insp-${a.role}`}
                      value={`인스펙터 ${a.label} ${a.layer}`}
                      onSelect={() => exec(() => openInspector(a.role))}
                      icon={<Dot color={a.color} />}
                      label={a.label}
                      hint={a.layer}
                    />
                  ))}
                </PaletteGroup>

                <PaletteGroup heading="에이전트에게 질문">
                  {agentItems.map((a) => (
                    <PaletteItem
                      key={`ask-${a.role}`}
                      value={`질문 ${a.label}`}
                      onSelect={() => exec(() => openAsk(a.role))}
                      icon={<span aria-hidden>💬</span>}
                      label={`${a.label}에게 질문`}
                      hint={a.layer}
                    />
                  ))}
                </PaletteGroup>

                <PaletteGroup heading="타임라인 줌">
                  <PaletteItem
                    value="줌 촘촘"
                    onSelect={() => exec(() => setZoom("compact"))}
                    label="촘촘 보기"
                    hint="한 줄 요약"
                  />
                  <PaletteItem
                    value="줌 기본"
                    onSelect={() => exec(() => setZoom("comfortable"))}
                    label="기본 보기"
                    hint="4줄 요약"
                  />
                  <PaletteItem
                    value="줌 상세"
                    onSelect={() => exec(() => setZoom("verbose"))}
                    label="상세 보기"
                    hint="전문 + 메타"
                  />
                </PaletteGroup>

                <PaletteGroup heading="타임라인 그룹">
                  <PaletteItem
                    value="그룹 시간순"
                    onSelect={() => exec(() => setGroupMode("none"))}
                    label="시간순"
                  />
                  <PaletteItem
                    value="그룹 단계별"
                    onSelect={() => exec(() => setGroupMode("stage"))}
                    label="단계별"
                  />
                  <PaletteItem
                    value="그룹 에이전트별"
                    onSelect={() => exec(() => setGroupMode("agent"))}
                    label="에이전트별"
                  />
                </PaletteGroup>

                <PaletteGroup heading="필터">
                  <PaletteItem
                    value="신호만 토글"
                    onSelect={() => exec(toggleSignalOnly)}
                    label="신호만 토글"
                    hint="bull/bear/risk/done 만 표시"
                  />
                  <PaletteItem
                    value="필터 초기화"
                    onSelect={() => exec(resetFilters)}
                    label="필터 초기화"
                  />
                  {agentItems.map((a) => (
                    <PaletteItem
                      key={`filter-${a.role}`}
                      value={`필터 ${a.label}`}
                      onSelect={() => exec(() => toggleRole(a.role))}
                      icon={<Dot color={a.color} />}
                      label={`${a.label} 필터 토글`}
                    />
                  ))}
                </PaletteGroup>

                <PaletteGroup heading="기타">
                  <PaletteItem
                    value="일시정지 재개"
                    onSelect={() => exec(togglePaused)}
                    label="일시정지/재개"
                    hint="스트림"
                  />
                  <PaletteItem
                    value="단축키 도움말"
                    onSelect={() => exec(() => setShortcutsOpen(true))}
                    label="단축키 도움말"
                    hint="?"
                  />
                </PaletteGroup>
              </Command.List>
            </Command>

            <footer
              style={{
                padding: "6px 12px",
                fontSize: 9,
                color: "var(--text-tertiary)",
                borderTop: "1px solid var(--border-subtle)",
                background: "var(--bg-surface)",
                display: "flex",
                gap: 12,
              }}
            >
              <span>↑↓ 이동</span>
              <span>↵ 선택</span>
              <span>esc 닫기</span>
              <span style={{ marginLeft: "auto" }}>Ctrl/⌘ + J 토글</span>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
      }}
    />
  );
}

function PaletteGroup({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      style={{
        padding: "4px 4px 8px",
      }}
    >
      {children}
    </Command.Group>
  );
}

function PaletteItem({
  value,
  onSelect,
  icon,
  label,
  hint,
}: {
  value: string;
  onSelect: () => void;
  icon?: React.ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: "var(--radius-md)",
        cursor: "pointer",
        fontSize: 12,
        color: "var(--text-primary)",
      }}
    >
      {icon ?? <span style={{ width: 8 }} aria-hidden />}
      <span style={{ flex: 1 }}>{label}</span>
      {hint && (
        <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{hint}</span>
      )}
    </Command.Item>
  );
}
