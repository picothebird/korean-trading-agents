"use client";

/**
 * ShortcutsOverlay — `?` 키로 열리는 단축키 도움말.
 *
 * docs/AGENT_OFFICE_GATHER_LEVEL_UP.md §0-sexies.1 (MS-C: C-13)
 */

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAgentOffice } from "@/stores/useAgentOffice";
import { Icon } from "@/components/ui";

interface Shortcut {
  keys: string[];
  desc: string;
}

const GROUPS: { title: string; items: Shortcut[] }[] = [
  {
    title: "전역",
    items: [
      { keys: ["?"], desc: "단축키 도움말 열기" },
      { keys: ["Ctrl/⌘", "J"], desc: "명령 팔레트 열기/닫기" },
      { keys: ["Ctrl/⌘", "K"], desc: "타임라인 검색 포커스" },
      { keys: ["Esc"], desc: "열린 모달/패널 닫기 · 펼침 닫기" },
    ],
  },
  {
    title: "타임라인",
    items: [
      { keys: ["↵", "Space"], desc: "선택된 발화 펼침/접힘" },
    ],
  },
  {
    title: "에이전트",
    items: [
      { keys: ["클릭"], desc: "픽셀 캐릭터 / 발화 카드 → 인스펙터 열기" },
      { keys: ["💬"], desc: "인스펙터 또는 팔레트에서 후속 질문" },
      { keys: ["★"], desc: "발화 북마크 (로컬 저장)" },
    ],
  },
];

export function ShortcutsOverlay() {
  const open = useAgentOffice((s) => s.shortcutsOpen);
  const setOpen = useAgentOffice((s) => s.setShortcutsOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 입력 중에는 무시
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || (e.target as HTMLElement | null)?.isContentEditable) {
        return;
      }
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setOpen(!useAgentOffice.getState().shortcutsOpen);
      } else if (open && e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="sc-bd"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,17,25,0.45)",
            zIndex: 95,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <motion.div
            key="sc-panel"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="단축키 도움말"
            aria-modal="true"
            style={{
              width: "min(540px, 100%)",
              background: "var(--bg-canvas)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-lg, 12px)",
              boxShadow: "var(--shadow-lg, 0 20px 60px rgba(15,17,25,0.3))",
              overflow: "hidden",
            }}
          >
            <header
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 14px",
                borderBottom: "1px solid var(--border-subtle)",
                background: "var(--bg-surface)",
              }}
            >
              <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                ⌨️ 단축키 도움말
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="닫기"
                style={{
                  marginLeft: "auto",
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

            <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
              {GROUPS.map((g) => (
                <section key={g.title}>
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
                    {g.title}
                  </h3>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                    {g.items.map((s, i) => (
                      <li
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "6px 10px",
                          background: "var(--bg-surface)",
                          border: "1px solid var(--border-subtle)",
                          borderRadius: "var(--radius-md)",
                          fontSize: 12,
                          color: "var(--text-secondary)",
                        }}
                      >
                        <span>{s.desc}</span>
                        <span style={{ display: "inline-flex", gap: 4 }}>
                          {s.keys.map((k, j) => (
                            <kbd
                              key={j}
                              style={{
                                padding: "1px 7px",
                                background: "var(--bg-elevated)",
                                border: "1px solid var(--border-subtle)",
                                borderRadius: 4,
                                fontSize: 10,
                                fontFamily: "ui-monospace, monospace",
                                color: "var(--text-primary)",
                                fontWeight: 600,
                              }}
                            >
                              {k}
                            </kbd>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
