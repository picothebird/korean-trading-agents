"use client";

/**
 * AskModal — 사용자가 특정 에이전트(또는 thought)에게 후속 질문.
 *
 * MS-C: 백엔드가 정식 `/api/analysis/{session}/ask` 엔드포인트를 갖추면 그쪽으로 POST.
 * 본 PR에서는 UI를 완성하고, 전송은 props.onSubmit으로 위임 (페이지가 sessionId를 안다).
 *
 * docs/AGENT_OFFICE_GATHER_LEVEL_UP.md §0-sexies.1 (MS-C: C-3, C-6)
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAgentOffice } from "@/stores/useAgentOffice";
import { AGENT_LABEL, AGENT_COLOR } from "@/lib/agentLabels";
import { Icon } from "@/components/ui";

interface AskModalProps {
  /**
   * 페이지가 sessionId + apiClient를 알고 있어 전송 책임을 가짐.
   * 미전달 또는 sessionId 없음 → 모달은 "기능 준비 중" 안내 표시.
   */
  onSubmit?: (args: {
    role: string;
    thoughtTimestamp: string | null;
    question: string;
  }) => Promise<void> | void;
  /** 분석 세션 ID. 없으면 비활성. */
  sessionId?: string | null;
}

export function AskModal({ onSubmit, sessionId }: AskModalProps) {
  const target = useAgentOffice((s) => s.askTarget);
  const close = useAgentOffice((s) => s.closeAsk);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (target) {
      setText("");
      setDone(false);
      setError(null);
      // autofocus
      requestAnimationFrame(() => taRef.current?.focus());
    }
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, close]);

  if (!target) return null;
  const { role, thought } = target;
  const trimmed = text.trim();
  const canSubmit = trimmed.length >= 4 && !!sessionId && !!onSubmit && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit!({
        role,
        thoughtTimestamp: thought?.timestamp ?? null,
        question: trimmed,
      });
      setDone(true);
      setTimeout(close, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청 실패");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        key="ask-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={close}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15,17,25,0.4)",
          zIndex: 90,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
      >
        <motion.div
          key="ask-panel"
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.96 }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label={`${AGENT_LABEL[role]}에게 질문`}
          aria-modal="true"
          style={{
            width: "min(560px, 100%)",
            background: "var(--bg-canvas)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-lg, 12px)",
            boxShadow: "var(--shadow-lg, 0 20px 60px rgba(15,17,25,0.25))",
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
            <span
              aria-hidden
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: AGENT_COLOR[role],
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                💬 {AGENT_LABEL[role]}에게 질문
              </h2>
              <p style={{ fontSize: 10, color: "var(--text-tertiary)", margin: 0, marginTop: 1 }}>
                {thought
                  ? "이 발화에 대한 후속 질문 — 같은 컨텍스트로 답변합니다."
                  : "현재 세션의 분석 컨텍스트로 답변합니다."}
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="닫기"
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

          {thought && (
            <div
              style={{
                padding: "8px 14px",
                background: "var(--bg-surface)",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <p
                style={{
                  fontSize: 9,
                  color: "var(--text-tertiary)",
                  margin: 0,
                  marginBottom: 2,
                }}
              >
                참조 발화
              </p>
              <p
                style={{
                  fontSize: 11,
                  color: "var(--text-secondary)",
                  margin: 0,
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {thought.content}
              </p>
            </div>
          )}

          <div style={{ padding: 14 }}>
            <textarea
              ref={taRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="예) 이 종목의 PER이 동종 대비 비싸 보이는데 어떻게 해석해야 하나요?"
              rows={5}
              maxLength={2000}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              style={{
                width: "100%",
                resize: "vertical",
                padding: 10,
                fontSize: 12,
                background: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                color: "var(--text-primary)",
                outline: "none",
                lineHeight: 1.5,
                fontFamily: "inherit",
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 8,
                fontSize: 9,
                color: "var(--text-tertiary)",
              }}
            >
              <span>{text.length} / 2000 · ⌘/Ctrl+Enter 전송</span>
              {!sessionId && (
                <span style={{ color: "var(--warning)" }}>활성 분석 세션이 없습니다</span>
              )}
            </div>

            {error && (
              <p style={{ fontSize: 11, color: "var(--danger, #DC3545)", margin: "8px 0 0" }}>
                {error}
              </p>
            )}
            {done && (
              <p style={{ fontSize: 11, color: "var(--success, #16A34A)", margin: "8px 0 0" }}>
                전송되었습니다. 잠시 후 타임라인에 답변이 추가됩니다.
              </p>
            )}

            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
                marginTop: 12,
              }}
            >
              <button
                type="button"
                onClick={close}
                style={{
                  padding: "6px 14px",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                취소
              </button>
              <button
                type="button"
                disabled={!canSubmit}
                onClick={handleSubmit}
                style={{
                  padding: "6px 14px",
                  background: canSubmit ? "var(--brand)" : "var(--bg-elevated)",
                  color: canSubmit ? "var(--text-inverse)" : "var(--text-tertiary)",
                  border: "1px solid transparent",
                  borderColor: canSubmit ? "var(--brand)" : "var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: canSubmit ? "pointer" : "not-allowed",
                }}
              >
                {submitting ? "전송 중..." : "질문 전송"}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
