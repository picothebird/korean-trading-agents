"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  getKisStatus,
  getKisBalance,
  getSettings,
  placeKisOrder,
  requestKisOrderApproval,
  getKisOrderApproval,
  approveKisOrderApproval,
  rejectKisOrderApproval,
} from "@/lib/api";
import type {
  KisStatus,
  KisBalance,
  KisHolding,
  KisOrderRequest,
  KisOrderApproval,
} from "@/types";

const SPRING = { type: "spring" as const, stiffness: 340, damping: 30 };

interface KisPanelProps {
  /** 분석 탭에서 넘어온 종목코드 (주문 폼 자동 채우기) */
  prefillTicker?: string;
  /** 설정 팝업 열기 (맥락 탭 지정) */
  onOpenSettings?: (tab: "kis" | "guru") => void;
}

// ── 내부 컴포넌트: 상태 배지 ────────────────────────────────────
function StatusBadge({ connected, isMock }: { connected: boolean; isMock: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: connected ? "var(--bull)" : "var(--bear)",
          boxShadow: connected ? "0 0 6px var(--bull)" : "0 0 6px var(--bear)",
          flexShrink: 0,
        }} />
        <span style={{ fontSize: 12, color: connected ? "var(--bull)" : "var(--bear)", fontWeight: 600 }}>
          {connected ? "연결됨" : "연결 안 됨"}
        </span>
      </span>
      <span style={{
        fontSize: 10, fontWeight: 700, padding: "2px 8px",
        borderRadius: 99,
        background: isMock ? "rgba(251,191,36,0.15)" : "rgba(34,197,94,0.15)",
        color: isMock ? "#fbbf24" : "#22c55e",
        border: `1px solid ${isMock ? "rgba(251,191,36,0.4)" : "rgba(34,197,94,0.4)"}`,
      }}>
        {isMock ? "모의투자" : "실전투자"}
      </span>
    </div>
  );
}

// ── 내부 컴포넌트: 보유종목 행 ──────────────────────────────────
function HoldingRow({ h }: { h: KisHolding }) {
  const isPos = h.profit_loss >= 0;
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 48px 72px 72px 80px",
      gap: 8, alignItems: "center",
      padding: "10px 14px",
      borderBottom: "1px solid var(--border-subtle)",
    }}>
      <div>
        <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{h.name || h.ticker}</p>
        <p style={{ fontSize: 10, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{h.ticker}</p>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {h.qty.toLocaleString("ko-KR")}주
      </p>
      <div style={{ textAlign: "right" }}>
        <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 1 }}>평균단가</p>
        <p style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" }}>
          {h.avg_price.toLocaleString("ko-KR")}
        </p>
      </div>
      <div style={{ textAlign: "right" }}>
        <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 1 }}>현재가</p>
        <p style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", color: "var(--text-primary)", fontWeight: 600 }}>
          {h.current_price.toLocaleString("ko-KR")}
        </p>
      </div>
      <div style={{ textAlign: "right" }}>
        <p style={{ fontSize: 12, color: isPos ? "var(--bull)" : "var(--bear)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
          {isPos ? "+" : ""}{h.profit_loss_pct.toFixed(2)}%
        </p>
        <p style={{ fontSize: 10, color: isPos ? "var(--bull)" : "var(--bear)", fontVariantNumeric: "tabular-nums", opacity: 0.85 }}>
          {isPos ? "+" : ""}{h.profit_loss.toLocaleString("ko-KR")}
        </p>
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────
export function KisPanel({ prefillTicker = "", onOpenSettings }: KisPanelProps) {
  const [status, setStatus] = useState<KisStatus | null>(null);
  const [balance, setBalance] = useState<KisBalance | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [guruRequireUserConfirmation, setGuruRequireUserConfirmation] = useState(false);

  // 주문 폼 상태
  const [orderTicker, setOrderTicker] = useState(prefillTicker);
  const [orderSide, setOrderSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"00" | "01">("01"); // 시장가 기본
  const [orderQty, setOrderQty] = useState("1");
  const [orderPrice, setOrderPrice] = useState("0");
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderResult, setOrderResult] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalRequest, setApprovalRequest] = useState<KisOrderApproval | null>(null);

  // prefillTicker 가 바뀌면 폼 동기화
  useEffect(() => {
    if (prefillTicker) setOrderTicker(prefillTicker);
  }, [prefillTicker]);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const s = await getKisStatus();
      setStatus(s);
    } catch {
      setStatus({ connected: false, is_mock: true, error: "서버 연결 실패" });
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadApprovalPolicy = useCallback(async () => {
    try {
      const s = await getSettings();
      setGuruRequireUserConfirmation(Boolean(s.guru_require_user_confirmation));
    } catch {
      // 설정 조회 실패 시 기존 값 유지
    }
  }, []);

  const loadBalance = useCallback(async () => {
    setBalanceLoading(true);
    setBalanceError(null);
    try {
      const b = await getKisBalance();
      setBalance(b);
    } catch (e: unknown) {
      setBalanceError(e instanceof Error ? e.message : "잔고 조회 실패");
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadApprovalPolicy();
  }, [loadStatus, loadApprovalPolicy]);

  const isMock = status?.is_mock ?? true;
  const hasPendingApproval = approvalRequest?.status === "pending";

  const buildOrderRequest = useCallback((): KisOrderRequest => {
    const qty = parseInt(orderQty, 10) || 1;
    const parsedPrice = parseInt(orderPrice, 10) || 0;
    return {
      ticker: orderTicker.trim(),
      side: orderSide,
      qty,
      price: orderType === "01" ? 0 : parsedPrice,
      order_type: orderType,
    };
  }, [orderTicker, orderSide, orderQty, orderPrice, orderType]);

  const handleRefreshApproval = useCallback(async () => {
    if (!approvalRequest) return;
    setApprovalLoading(true);
    setOrderError(null);
    try {
      const refreshed = await getKisOrderApproval(approvalRequest.approval_id);
      setApprovalRequest(refreshed);
    } catch (e: unknown) {
      setOrderError(e instanceof Error ? e.message : "승인 상태 조회 실패");
    } finally {
      setApprovalLoading(false);
    }
  }, [approvalRequest]);

  const handleApprove = useCallback(async () => {
    if (!approvalRequest || approvalRequest.status !== "pending") return;
    setApprovalLoading(true);
    setOrderError(null);
    setOrderResult(null);
    try {
      const res = await approveKisOrderApproval(approvalRequest.approval_id);
      setApprovalRequest((prev) =>
        prev
          ? {
              ...prev,
              status: res.status,
              resolved_at: res.resolved_at,
            }
          : prev
      );
      if (res.order_result) {
        setOrderResult(
          `승인 후 주문 완료${res.order_result.is_mock ? " (모의)" : ""} — 주문번호: ${res.order_result.order_no || "—"} · ${res.order_result.order_type_label} ${res.order_result.side === "buy" ? "매수" : "매도"} ${res.order_result.qty}주`
        );
      } else {
        setOrderResult("주문 승인 처리 완료");
      }
    } catch (e: unknown) {
      setOrderError(e instanceof Error ? e.message : "주문 승인 처리 실패");
      try {
        const refreshed = await getKisOrderApproval(approvalRequest.approval_id);
        setApprovalRequest(refreshed);
      } catch {
        // 상태 조회 실패는 기존 에러를 유지
      }
    } finally {
      setApprovalLoading(false);
    }
  }, [approvalRequest]);

  const handleReject = useCallback(async () => {
    if (!approvalRequest || approvalRequest.status !== "pending") return;
    setApprovalLoading(true);
    setOrderError(null);
    setOrderResult(null);
    try {
      const res = await rejectKisOrderApproval(approvalRequest.approval_id);
      setApprovalRequest((prev) =>
        prev
          ? {
              ...prev,
              status: res.status,
              resolved_at: res.resolved_at,
            }
          : prev
      );
      setOrderError("주문 승인 요청이 거절되었습니다. 주문은 실행되지 않았습니다.");
    } catch (e: unknown) {
      setOrderError(e instanceof Error ? e.message : "주문 거절 처리 실패");
      try {
        const refreshed = await getKisOrderApproval(approvalRequest.approval_id);
        setApprovalRequest(refreshed);
      } catch {
        // 상태 조회 실패는 기존 에러를 유지
      }
    } finally {
      setApprovalLoading(false);
    }
  }, [approvalRequest]);

  const handleOrder = async () => {
    if (hasPendingApproval) {
      setOrderError("이미 승인 대기 중인 주문이 있습니다. 승인/거절을 먼저 처리하세요.");
      return;
    }
    if (!showConfirm) { setShowConfirm(true); return; }
    setOrderLoading(true);
    setOrderResult(null);
    setOrderError(null);
    setShowConfirm(false);
    try {
      const req = buildOrderRequest();
      const settings = await getSettings().catch(() => null);
      const requiresApproval = Boolean(settings?.guru_require_user_confirmation);
      setGuruRequireUserConfirmation(requiresApproval);

      if (!isMock && requiresApproval) {
        const approval = await requestKisOrderApproval({
          ...req,
          context: "kis_panel_manual_order",
        });
        setApprovalRequest(approval);
        setOrderResult(`승인 요청 생성 완료 — 요청 ID: ${approval.approval_id}`);
        return;
      }

      setApprovalRequest(null);
      const res = await placeKisOrder(req);
      setOrderResult(
        `주문 완료${status?.is_mock ? " (모의)" : ""} — 주문번호: ${res.order_no || "—"} · ${res.order_type_label} ${res.side === "buy" ? "매수" : "매도"} ${res.qty}주`
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "주문 실패";
      if (!isMock && msg.includes("승인 강제")) {
        try {
          const req = buildOrderRequest();
          const approval = await requestKisOrderApproval({
            ...req,
            context: "kis_panel_manual_order_fallback",
          });
          setApprovalRequest(approval);
          setOrderResult(`승인 요청 생성 완료 — 요청 ID: ${approval.approval_id}`);
          return;
        } catch (approvalErr: unknown) {
          const approvalMsg = approvalErr instanceof Error ? approvalErr.message : "주문 승인 요청 생성 실패";
          setOrderError(approvalMsg);
          return;
        }
      }
      setOrderError(msg);
    } finally {
      setOrderLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── 연결 상태 카드 ─────────────────────────────────────── */}
      <div style={{
        background: "var(--bg-surface)", borderRadius: "var(--radius-xl)",
        border: "1px solid var(--border-default)", overflow: "hidden",
      }}>
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
              KIS OpenAPI 연결 상태
            </p>
            {status ? (
              <StatusBadge connected={status.connected} isMock={status.is_mock} />
            ) : (
              <p style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                {statusLoading ? "확인 중..." : "—"}
              </p>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {onOpenSettings && (
              <button
                onClick={() => onOpenSettings("kis")}
                style={{
                  padding: "7px 12px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)",
                  background: "var(--bg-elevated)", color: "var(--text-secondary)",
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                }}
              >
                ⚙ KIS 설정
              </button>
            )}
            <button
              onClick={loadStatus}
              disabled={statusLoading}
              style={{
                padding: "7px 14px", borderRadius: "var(--radius-lg)", border: "none",
                background: "var(--bg-elevated)", color: "var(--text-secondary)",
                fontSize: 12, fontWeight: 600, cursor: statusLoading ? "not-allowed" : "pointer",
                transition: "all 150ms",
              }}
            >
              {statusLoading ? "확인 중..." : "연결 테스트"}
            </button>
          </div>
        </div>
        {status?.error && (
          <div style={{ padding: "10px 20px", background: "rgba(239,68,68,0.08)" }}>
            <p style={{ fontSize: 11, color: "var(--bear)" }}>⚠ {status.error}</p>
            <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 4 }}>
              설정 패널에서 KIS API 키와 계좌번호를 입력해주세요.
            </p>
            {onOpenSettings && (
              <button
                onClick={() => onOpenSettings("kis")}
                style={{
                  marginTop: 8,
                  padding: "5px 10px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid rgba(239,68,68,0.35)",
                  background: "rgba(239,68,68,0.14)",
                  color: "var(--bear)",
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                KIS 설정 열기
              </button>
            )}
          </div>
        )}
        {!status?.error && status?.connected && (
          <div style={{ padding: "10px 20px", background: "rgba(34,197,94,0.06)" }}>
            <p style={{ fontSize: 11, color: "var(--bull)" }}>
              ✓ API 연결 정상 {status.token_preview ? `· 토큰: ${status.token_preview}` : ""}
            </p>
          </div>
        )}
      </div>

      {/* ── 잔고 조회 ───────────────────────────────────────────── */}
      <div style={{
        background: "var(--bg-surface)", borderRadius: "var(--radius-xl)",
        border: "1px solid var(--border-default)", overflow: "hidden",
      }}>
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>잔고 조회</p>
          <button
            onClick={loadBalance}
            disabled={balanceLoading}
            style={{
              padding: "7px 14px", borderRadius: "var(--radius-lg)", border: "none",
              background: "var(--bg-elevated)", color: "var(--text-secondary)",
              fontSize: 12, fontWeight: 600, cursor: balanceLoading ? "not-allowed" : "pointer",
            }}
          >
            {balanceLoading ? "조회 중..." : "잔고 새로고침"}
          </button>
        </div>

        {balanceError && (
          <div style={{ padding: "14px 20px" }}>
            <p style={{ fontSize: 12, color: "var(--bear)" }}>⚠ {balanceError}</p>
          </div>
        )}

        {balance && !balanceError && (
          <>
            {/* 요약 카드 */}
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, padding: "16px 20px",
              borderBottom: "1px solid var(--border-subtle)",
            }}>
              {[
                { label: "예수금", value: balance.cash.toLocaleString("ko-KR") + "원" },
                { label: "총평가금액", value: balance.total_eval.toLocaleString("ko-KR") + "원" },
                {
                  label: "총손익",
                  value: (balance.total_profit_loss >= 0 ? "+" : "") +
                    balance.total_profit_loss.toLocaleString("ko-KR") + "원",
                  color: balance.total_profit_loss >= 0 ? "var(--bull)" : "var(--bear)",
                  sub: (balance.total_profit_loss_pct >= 0 ? "+" : "") + balance.total_profit_loss_pct.toFixed(2) + "%",
                },
              ].map(({ label, value, color, sub }) => (
                <div key={label} style={{
                  background: "var(--bg-elevated)", borderRadius: "var(--radius-lg)", padding: "12px 14px",
                }}>
                  <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 4 }}>{label}</p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: color ?? "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                    {value}
                  </p>
                  {sub && <p style={{ fontSize: 10, color: color, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{sub}</p>}
                </div>
              ))}
            </div>

            {/* 보유종목 테이블 */}
            {balance.holdings.length === 0 ? (
              <div style={{ padding: "20px", textAlign: "center" }}>
                <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>보유 종목 없음</p>
              </div>
            ) : (
              <>
                {/* 헤더 */}
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 48px 72px 72px 80px",
                  gap: 8, padding: "8px 14px",
                  borderBottom: "1px solid var(--border-subtle)",
                }}>
                  {["종목", "수량", "평균단가", "현재가", "손익"].map((h) => (
                    <p key={h} style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 600, textAlign: h === "종목" ? "left" : "right" }}>{h}</p>
                  ))}
                </div>
                {balance.holdings.map((h) => (
                  <HoldingRow key={h.ticker} h={h} />
                ))}
              </>
            )}
          </>
        )}

        {!balance && !balanceError && !balanceLoading && (
          <div style={{ padding: "20px", textAlign: "center" }}>
            <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              &quot;잔고 새로고침&quot; 버튼을 눌러 잔고를 조회하세요
            </p>
          </div>
        )}
      </div>

      {/* ── 주문 폼 ─────────────────────────────────────────────── */}
      <div style={{
        background: "var(--bg-surface)", borderRadius: "var(--radius-xl)",
        border: "1px solid var(--border-default)", overflow: "hidden",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>빠른 주문</p>
          {isMock && (
            <p style={{ fontSize: 10, color: "#fbbf24", marginTop: 4 }}>
              ⚠ 현재 모의투자 모드입니다. 실제 주문이 체결되지 않습니다.
            </p>
          )}
          {!isMock && (
            <p style={{ fontSize: 10, color: "var(--bear)", marginTop: 4, fontWeight: 600 }}>
              🔴 실전투자 모드 — 실제 주문이 체결됩니다!
            </p>
          )}
          {!isMock && guruRequireUserConfirmation && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
              <p style={{ fontSize: 10, color: "var(--warning)", fontWeight: 700 }}>
                🛡 GURU 승인 강제 ON — 주문 전 승인요청 생성 후 승인/거절 버튼으로 최종 실행됩니다.
              </p>
              {onOpenSettings && (
                <button
                  onClick={() => onOpenSettings("guru")}
                  style={{
                    padding: "4px 8px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(245,166,35,0.4)",
                    background: "rgba(245,166,35,0.14)",
                    color: "var(--warning)",
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  승인 규칙
                </button>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* 종목코드 */}
          <div>
            <label style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 600, display: "block", marginBottom: 6 }}>
              종목코드
            </label>
            <input
              value={orderTicker}
              onChange={(e) => setOrderTicker(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="005930"
              maxLength={6}
              style={{
                width: "100%", padding: "9px 12px",
                borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)",
                background: "var(--bg-elevated)", color: "var(--text-primary)",
                fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums",
                outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          {/* 매수/매도 토글 */}
          <div>
            <label style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 600, display: "block", marginBottom: 6 }}>
              주문 유형
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["buy", "sell"] as const).map((side) => (
                <button
                  key={side}
                  onClick={() => setOrderSide(side)}
                  style={{
                    flex: 1, padding: "9px 0",
                    borderRadius: "var(--radius-lg)",
                    border: `1px solid ${orderSide === side
                      ? side === "buy" ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"
                      : "var(--border-default)"}`,
                    background: orderSide === side
                      ? side === "buy" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)"
                      : "var(--bg-elevated)",
                    color: orderSide === side
                      ? side === "buy" ? "var(--bull)" : "var(--bear)"
                      : "var(--text-secondary)",
                    fontWeight: orderSide === side ? 700 : 400,
                    fontSize: 13, cursor: "pointer",
                    transition: "all 150ms",
                  }}
                >
                  {side === "buy" ? "📈 매수" : "📉 매도"}
                </button>
              ))}
            </div>
          </div>

          {/* 주문 방식 */}
          <div>
            <label style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 600, display: "block", marginBottom: 6 }}>
              주문 방식
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["01", "00"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setOrderType(type)}
                  style={{
                    flex: 1, padding: "8px 0",
                    borderRadius: "var(--radius-lg)",
                    background: orderType === type ? "var(--brand-subtle)" : "var(--bg-elevated)",
                    color: orderType === type ? "var(--brand)" : "var(--text-secondary)",
                    border: `1px solid ${orderType === type ? "var(--brand)" : "var(--border-default)"}`,
                    fontWeight: orderType === type ? 700 : 400,
                    fontSize: 12, cursor: "pointer", transition: "all 150ms",
                  }}
                >
                  {type === "01" ? "시장가" : "지정가"}
                </button>
              ))}
            </div>
          </div>

          {/* 수량 + 가격 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 600, display: "block", marginBottom: 6 }}>
                수량
              </label>
              <input
                type="number"
                min={1}
                value={orderQty}
                onChange={(e) => setOrderQty(e.target.value)}
                style={{
                  width: "100%", padding: "9px 12px",
                  borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)",
                  background: "var(--bg-elevated)", color: "var(--text-primary)",
                  fontSize: 13, fontVariantNumeric: "tabular-nums",
                  outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 600, display: "block", marginBottom: 6 }}>
                가격 {orderType === "01" && <span style={{ color: "var(--text-quaternary)" }}>(시장가 — 무시됨)</span>}
              </label>
              <input
                type="number"
                min={0}
                value={orderType === "01" ? "0" : orderPrice}
                onChange={(e) => { if (orderType === "00") setOrderPrice(e.target.value); }}
                disabled={orderType === "01"}
                style={{
                  width: "100%", padding: "9px 12px",
                  borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)",
                  background: orderType === "01" ? "var(--bg-base)" : "var(--bg-elevated)",
                  color: orderType === "01" ? "var(--text-quaternary)" : "var(--text-primary)",
                  fontSize: 13, fontVariantNumeric: "tabular-nums",
                  outline: "none", boxSizing: "border-box",
                  cursor: orderType === "01" ? "not-allowed" : "text",
                }}
              />
            </div>
          </div>

          {/* 주문 버튼 */}
          <AnimatePresence mode="wait">
            {!showConfirm ? (
              <motion.button
                key="order"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={handleOrder}
                disabled={orderLoading || approvalLoading || hasPendingApproval || !orderTicker.trim()}
                whileTap={{ scale: 0.97 }}
                style={{
                  width: "100%", padding: "12px 0",
                  borderRadius: "var(--radius-lg)", border: "none",
                  background: !orderTicker.trim() || orderLoading || approvalLoading || hasPendingApproval
                    ? "var(--bg-elevated)"
                    : orderSide === "buy" ? "rgba(34,197,94,0.8)" : "rgba(239,68,68,0.8)",
                  color: !orderTicker.trim() || orderLoading || approvalLoading || hasPendingApproval ? "var(--text-tertiary)" : "#fff",
                  fontSize: 14, fontWeight: 700, cursor: (!orderTicker.trim() || orderLoading || approvalLoading || hasPendingApproval) ? "not-allowed" : "pointer",
                  transition: "all 200ms",
                }}
              >
                {hasPendingApproval
                  ? "승인 대기 중..."
                  : orderLoading
                  ? "주문 중..."
                  : `${orderSide === "buy" ? "매수" : "매도"} 주문`}
              </motion.button>
            ) : (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={SPRING}
                style={{
                  background: "var(--bg-elevated)", borderRadius: "var(--radius-lg)",
                  padding: "14px 16px", border: `1px solid ${orderSide === "buy" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                }}
              >
                <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
                  주문 확인 {isMock ? "(모의투자)" : "⚠ 실전투자"}
                </p>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12, lineHeight: 1.6 }}>
                  <b style={{ color: orderSide === "buy" ? "var(--bull)" : "var(--bear)" }}>
                    {orderSide === "buy" ? "매수" : "매도"}
                  </b>{" "}
                  {orderTicker} · {parseInt(orderQty, 10) || 1}주 ·{" "}
                  {orderType === "01" ? "시장가" : `${parseInt(orderPrice, 10).toLocaleString("ko-KR")}원 지정가`}
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setShowConfirm(false)}
                    style={{
                      flex: 1, padding: "8px 0", borderRadius: "var(--radius-md)", border: "none",
                      background: "var(--bg-overlay)", color: "var(--text-secondary)",
                      fontSize: 12, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    취소
                  </button>
                  <button
                    onClick={handleOrder}
                    disabled={orderLoading || approvalLoading}
                    style={{
                      flex: 2, padding: "8px 0", borderRadius: "var(--radius-md)", border: "none",
                      background: orderSide === "buy" ? "rgba(34,197,94,0.9)" : "rgba(239,68,68,0.9)",
                      color: "#fff", fontSize: 12, fontWeight: 700, cursor: (orderLoading || approvalLoading) ? "not-allowed" : "pointer",
                      opacity: (orderLoading || approvalLoading) ? 0.6 : 1,
                    }}
                  >
                    확인 — {orderSide === "buy" ? "매수" : "매도"} 진행
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 승인 요청 카드 */}
          {approvalRequest && (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "var(--radius-lg)",
                background: "rgba(251,191,36,0.08)",
                border: "1px solid rgba(251,191,36,0.35)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <p style={{ fontSize: 12, color: "#fbbf24", fontWeight: 700 }}>
                  승인 요청 상태: {approvalRequest.status.toUpperCase()}
                </p>
                <button
                  onClick={handleRefreshApproval}
                  disabled={approvalLoading}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(251,191,36,0.4)",
                    background: "rgba(251,191,36,0.16)",
                    color: "#fbbf24",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: approvalLoading ? "not-allowed" : "pointer",
                  }}
                >
                  상태 갱신
                </button>
              </div>
              <p style={{ fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.5, wordBreak: "break-all" }}>
                요청 ID: {approvalRequest.approval_id}
                <br />
                만료 시각: {approvalRequest.expires_at}
              </p>

              {approvalRequest.status === "pending" ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={handleReject}
                    disabled={approvalLoading}
                    style={{
                      flex: 1,
                      padding: "9px 0",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid rgba(239,68,68,0.5)",
                      background: "rgba(239,68,68,0.14)",
                      color: "var(--bear)",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: approvalLoading ? "not-allowed" : "pointer",
                    }}
                  >
                    거절
                  </button>
                  <button
                    onClick={handleApprove}
                    disabled={approvalLoading}
                    style={{
                      flex: 2,
                      padding: "9px 0",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid rgba(34,197,94,0.5)",
                      background: "rgba(34,197,94,0.16)",
                      color: "var(--bull)",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: approvalLoading ? "not-allowed" : "pointer",
                    }}
                  >
                    승인 후 실제 주문 실행
                  </button>
                </div>
              ) : (
                <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                  처리 시각: {approvalRequest.resolved_at ?? "-"}
                </p>
              )}
            </div>
          )}

          {/* 주문 결과 */}
          <AnimatePresence>
            {orderResult && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{
                  padding: "10px 14px", borderRadius: "var(--radius-lg)",
                  background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)",
                }}
              >
                <p style={{ fontSize: 12, color: "var(--bull)", fontWeight: 600 }}>✓ {orderResult}</p>
              </motion.div>
            )}
            {orderError && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{
                  padding: "10px 14px", borderRadius: "var(--radius-lg)",
                  background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                }}
              >
                <p style={{ fontSize: 12, color: "var(--bear)", fontWeight: 600 }}>⚠ {orderError}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
