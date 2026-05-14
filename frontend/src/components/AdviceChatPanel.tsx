"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TradeDecision } from "@/types";
import {
  createAdviceChat,
  getAdviceChat,
  listAdviceChats,
  sendAdviceChatMessage,
  type AdviceChat,
  type AdvicePosition,
} from "@/lib/api";
import { Icon, Loader } from "@/components/ui";

const STARTER_QUESTIONS = [
  "내 평단 기준으로 지금 가장 중요한 리스크는 뭐야?",
  "추가매수보다 기다리는 게 나은 조건은 뭐야?",
  "분할매도나 손절 기준을 어떻게 잡으면 좋을까?",
];

function toNumberOrNull(value: string): number | null {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatInputNumber(value: string): string {
  const n = toNumberOrNull(value);
  return n == null ? value : n.toLocaleString("ko-KR");
}

function actionColor(action?: string | null): string {
  if (action === "BUY") return "var(--bull)";
  if (action === "SELL") return "var(--bear)";
  return "var(--text-secondary)";
}

function MessageBubble({ role, content }: { role: string; content: string }) {
  const isUser = role === "user";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: "86%",
          borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          border: `1px solid ${isUser ? "var(--brand-border)" : "var(--border-subtle)"}`,
          background: isUser ? "var(--brand-subtle)" : "var(--bg-elevated)",
          color: "var(--text-primary)",
          padding: "10px 12px",
          fontSize: 13,
          lineHeight: 1.65,
          whiteSpace: "pre-line",
          wordBreak: "keep-all",
        }}
      >
        {content}
      </div>
    </div>
  );
}

export function AdviceChatPanel({
  ticker,
  tickerName,
  analysisSessionId,
  decision,
  compact = false,
}: {
  ticker: string;
  tickerName?: string | null;
  analysisSessionId?: string | null;
  decision?: TradeDecision | null;
  compact?: boolean;
}) {
  const [chat, setChat] = useState<AdviceChat | null>(null);
  const [avgPrice, setAvgPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const position = useMemo<AdvicePosition>(() => ({
    avg_price: toNumberOrNull(avgPrice),
    quantity: toNumberOrNull(quantity),
  }), [avgPrice, quantity]);

  useEffect(() => {
    let cancelled = false;
    setChat(null);
    setError(null);
    setAvgPrice("");
    setQuantity("");
    if (!ticker) return;
    setLoading(true);
    void listAdviceChats({ ticker, limit: 8 })
      .then(async (items) => {
        if (cancelled) return;
        const matched = analysisSessionId
          ? items.find((item) => item.analysis_session_id === analysisSessionId)
          : items[0];
        if (!matched?.chat_id) return;
        const detail = await getAdviceChat(matched.chat_id);
        if (cancelled) return;
        if (detail) {
          setChat(detail);
          if (detail.position?.avg_price) setAvgPrice(String(detail.position.avg_price));
          if (detail.position?.quantity) setQuantity(String(detail.position.quantity));
        }
      })
      .catch(() => {
        if (!cancelled) setError("이전 상담 기록을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker, analysisSessionId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat?.messages.length, sending]);

  const ensureChat = useCallback(async (): Promise<AdviceChat> => {
    if (chat) return chat;
    const created = await createAdviceChat({
      ticker,
      ticker_name: tickerName,
      analysis_session_id: analysisSessionId,
      position,
    });
    setChat(created);
    return created;
  }, [analysisSessionId, chat, position, ticker, tickerName]);

  const submit = useCallback(async (text?: string) => {
    const question = (text ?? message).trim();
    if (!question || sending) return;
    setSending(true);
    setError(null);
    try {
      const base = await ensureChat();
      setMessage("");
      const next = await sendAdviceChatMessage(base.chat_id, { message: question, position });
      setChat(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "상담 답변 생성에 실패했습니다.");
    } finally {
      setSending(false);
    }
  }, [ensureChat, message, position, sending]);

  const confidence = typeof decision?.confidence === "number" ? Math.round(decision.confidence * 100) : null;
  const title = tickerName ? `${tickerName} (${ticker})` : ticker;

  return (
    <section
      style={{
        border: "1px solid var(--brand-border)",
        borderRadius: compact ? 16 : "var(--radius-xl)",
        background: "linear-gradient(180deg, color-mix(in srgb, var(--brand-subtle) 55%, var(--bg-surface)), var(--bg-surface))",
        padding: compact ? 12 : "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ display: "inline-flex", alignItems: "center", gap: 6, margin: 0, fontSize: 12, fontWeight: 900, color: "var(--brand)", letterSpacing: "0.04em" }}>
            <Icon name="comment" size={14} decorative /> AI 상담
          </p>
          <h3 style={{ margin: "5px 0 0", fontSize: compact ? 17 : 18, lineHeight: 1.25, fontWeight: 900, color: "var(--text-primary)" }}>
            분석을 이어받아 내 상황으로 물어보기
          </h3>
          <p style={{ margin: "6px 0 0", fontSize: 12, lineHeight: 1.6, color: "var(--text-tertiary)" }}>
            {title} 분석 결과와 보유 정보를 함께 참고합니다. 실제 투자는 본인 책임입니다.
          </p>
        </div>
        {decision?.action && (
          <div style={{ flexShrink: 0, textAlign: "right" }}>
            <p style={{ margin: 0, fontSize: 10, color: "var(--text-tertiary)", fontWeight: 800 }}>현재 판단</p>
            <p style={{ margin: "3px 0 0", fontSize: 16, fontWeight: 950, color: actionColor(decision.action) }}>{decision.action}</p>
            {confidence != null && <p style={{ margin: 0, fontSize: 11, color: "var(--text-tertiary)" }}>{confidence}%</p>}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11, color: "var(--text-tertiary)", fontWeight: 800 }}>
          내 평단 입력(선택)
          <input
            value={avgPrice}
            onChange={(e) => setAvgPrice(e.target.value)}
            onBlur={() => setAvgPrice((v) => formatInputNumber(v))}
            inputMode="numeric"
            placeholder="예: 72,000"
            style={{
              height: 40,
              borderRadius: 12,
              border: "1px solid var(--border-default)",
              background: "var(--bg-elevated)",
              color: "var(--text-primary)",
              padding: "0 12px",
              fontSize: 14,
              fontWeight: 800,
            }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11, color: "var(--text-tertiary)", fontWeight: 800 }}>
          보유 주식 수(선택)
          <input
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            onBlur={() => setQuantity((v) => formatInputNumber(v))}
            inputMode="numeric"
            placeholder="예: 10"
            style={{
              height: 40,
              borderRadius: 12,
              border: "1px solid var(--border-default)",
              background: "var(--bg-elevated)",
              color: "var(--text-primary)",
              padding: "0 12px",
              fontSize: 14,
              fontWeight: 800,
            }}
          />
        </label>
      </div>

      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
        {STARTER_QUESTIONS.map((question) => (
          <button
            key={question}
            type="button"
            onClick={() => void submit(question)}
            disabled={sending || loading}
            style={{
              flex: "0 0 auto",
              minHeight: 34,
              borderRadius: 99,
              border: "1px solid var(--border-default)",
              background: "var(--bg-surface)",
              color: "var(--text-secondary)",
              padding: "0 11px",
              fontSize: 12,
              fontWeight: 800,
              cursor: sending ? "wait" : "pointer",
            }}
          >
            {question}
          </button>
        ))}
      </div>

      <div
        style={{
          minHeight: 180,
          maxHeight: compact ? 360 : 440,
          overflowY: "auto",
          borderRadius: 14,
          border: "1px solid var(--border-subtle)",
          background: "color-mix(in srgb, var(--bg-canvas) 72%, var(--bg-surface))",
          padding: 10,
          display: "flex",
          flexDirection: "column",
          gap: 9,
        }}
      >
        {loading && (
          <div style={{ minHeight: 120, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--text-tertiary)", fontSize: 12 }}>
            <Loader size={16} /> 상담 기록 확인 중
          </div>
        )}
        {!loading && (chat?.messages ?? []).map((item) => (
          <MessageBubble key={item.id} role={item.role} content={item.content} />
        ))}
        {!loading && !chat && (
          <div style={{ minHeight: 120, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: "var(--text-tertiary)", fontSize: 12, lineHeight: 1.7 }}>
            아직 상담이 시작되지 않았습니다. 아래에 궁금한 점을 입력하면 분석 결과를 이어받아 답합니다.
          </div>
        )}
        {sending && <MessageBubble role="assistant" content="질문을 분석 결과와 보유 상황에 맞춰 정리하고 있습니다…" />}
        <div ref={scrollRef} />
      </div>

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--bear)", fontSize: 12, lineHeight: 1.5 }}>
          <Icon name="warning" size={14} decorative /> {error}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "end" }}
      >
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="예: 제 평단 기준으로 지금은 버티는 게 나을까요, 줄이는 게 나을까요?"
          rows={compact ? 2 : 3}
          style={{
            resize: "vertical",
            minHeight: compact ? 52 : 70,
            borderRadius: 14,
            border: "1px solid var(--border-default)",
            background: "var(--bg-elevated)",
            color: "var(--text-primary)",
            padding: "10px 12px",
            fontSize: 13,
            lineHeight: 1.5,
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={sending || !message.trim()}
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            border: "1px solid var(--brand-border)",
            background: message.trim() ? "var(--brand)" : "var(--bg-muted)",
            color: message.trim() ? "white" : "var(--text-quaternary)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: sending ? "wait" : message.trim() ? "pointer" : "not-allowed",
          }}
          aria-label="상담 질문 보내기"
        >
          {sending ? <Loader size={17} /> : <Icon name="arrow-right" size={18} decorative />}
        </button>
      </form>
    </section>
  );
}
