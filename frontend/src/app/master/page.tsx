"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import {
  clearAccessToken,
  getMasterActivity,
  getMasterOverview,
  getMasterTrades,
  getMasterUsers,
  getMe,
  logoutUser,
  updateMasterUserDisabled,
  updateMasterUserRole,
} from "@/lib/api";
import type { ActivityLogItem, AppUser, MasterOverview, UserRole, UserTradeItem } from "@/types";

function formatDate(value?: string): string {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString("ko-KR");
}

const ACTIVITY_PAGE_SIZE = 200;
const TRADES_PAGE_SIZE = 200;

type SectionStatus = "loading" | "ready" | "error";

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  tone: "danger" | "warning" | "default";
  onConfirm: () => Promise<void> | void;
}

export default function MasterPage() {
  const [authStatus, setAuthStatus] = useState<"loading" | "ok" | "denied" | "error">("loading");
  const [authError, setAuthError] = useState("");
  const [user, setUser] = useState<AppUser | null>(null);

  // Per-section state and errors so a single failing endpoint cannot blank
  // the entire console.
  const [overview, setOverview] = useState<MasterOverview | null>(null);
  const [overviewStatus, setOverviewStatus] = useState<SectionStatus>("loading");
  const [overviewError, setOverviewError] = useState("");

  const [users, setUsers] = useState<AppUser[]>([]);
  const [usersStatus, setUsersStatus] = useState<SectionStatus>("loading");
  const [usersError, setUsersError] = useState("");

  const [activity, setActivity] = useState<ActivityLogItem[]>([]);
  const [activityTotal, setActivityTotal] = useState<number | null>(null);
  const [activityVisible, setActivityVisible] = useState<number | null>(null);
  const [activityLimit, setActivityLimit] = useState(ACTIVITY_PAGE_SIZE);
  const [activityStatus, setActivityStatus] = useState<SectionStatus>("loading");
  const [activityError, setActivityError] = useState("");
  const [excludeNoise, setExcludeNoise] = useState(true);

  const [trades, setTrades] = useState<UserTradeItem[]>([]);
  const [tradesTotal, setTradesTotal] = useState<number | null>(null);
  const [tradesLimit, setTradesLimit] = useState(TRADES_PAGE_SIZE);
  const [tradesStatus, setTradesStatus] = useState<SectionStatus>("loading");
  const [tradesError, setTradesError] = useState("");

  const [roleUpdatingId, setRoleUpdatingId] = useState<string>("");
  const [disabledUpdatingId, setDisabledUpdatingId] = useState<string>("");
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  // ── Loaders (each isolated so one failure does not crash the page) ──
  const loadOverview = useCallback(async () => {
    setOverviewStatus("loading");
    try {
      const res = await getMasterOverview();
      setOverview(res);
      setOverviewStatus("ready");
      setOverviewError("");
    } catch (err) {
      setOverviewStatus("error");
      setOverviewError(err instanceof Error ? err.message : "오버뷰 로딩 실패");
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setUsersStatus("loading");
    try {
      const res = await getMasterUsers(500);
      setUsers(res.items);
      setUsersStatus("ready");
      setUsersError("");
    } catch (err) {
      setUsersStatus("error");
      setUsersError(err instanceof Error ? err.message : "유저 목록 로딩 실패");
    }
  }, []);

  const loadActivity = useCallback(
    async (limit: number, exclude: boolean) => {
      setActivityStatus("loading");
      try {
        const res = await getMasterActivity({ limit, excludeNoise: exclude });
        setActivity(res.items);
        setActivityTotal(typeof res.total === "number" ? res.total : null);
        setActivityVisible(
          typeof res.total_excluding_noise === "number" ? res.total_excluding_noise : null,
        );
        setActivityStatus("ready");
        setActivityError("");
      } catch (err) {
        setActivityStatus("error");
        setActivityError(err instanceof Error ? err.message : "활동 로그 로딩 실패");
      }
    },
    [],
  );

  const loadTrades = useCallback(async (limit: number) => {
    setTradesStatus("loading");
    try {
      const res = await getMasterTrades({ limit });
      setTrades(res.items);
      setTradesTotal(typeof res.total === "number" ? res.total : null);
      setTradesStatus("ready");
      setTradesError("");
    } catch (err) {
      setTradesStatus("error");
      setTradesError(err instanceof Error ? err.message : "주문 로그 로딩 실패");
    }
  }, []);

  // ── Boot: validate role first, then fan out section loads ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meRes = await getMe();
        if (cancelled) return;
        if (meRes.user.role !== "master") {
          setAuthStatus("denied");
          setUser(meRes.user);
          return;
        }
        setUser(meRes.user);
        setAuthStatus("ok");
      } catch (err) {
        if (cancelled) return;
        setAuthStatus("error");
        setAuthError(err instanceof Error ? err.message : "마스터 인증 확인 실패");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (authStatus !== "ok") return;
    void loadOverview();
    void loadUsers();
    void loadActivity(ACTIVITY_PAGE_SIZE, true);
    void loadTrades(TRADES_PAGE_SIZE);
  }, [authStatus, loadOverview, loadUsers, loadActivity, loadTrades]);

  const usersById = useMemo(() => {
    const map = new Map<string, AppUser>();
    users.forEach((u) => map.set(u._id, u));
    return map;
  }, [users]);

  // ── Mutations with explicit confirmation for destructive moves ──
  const performRoleChange = useCallback(
    async (target: AppUser, role: UserRole) => {
      setRoleUpdatingId(target._id);
      try {
        await updateMasterUserRole(target._id, role);
        await Promise.all([loadUsers(), loadOverview()]);
      } catch (err) {
        setUsersError(err instanceof Error ? err.message : "권한 변경 실패");
      } finally {
        setRoleUpdatingId("");
      }
    },
    [loadOverview, loadUsers],
  );

  const performDisabledChange = useCallback(
    async (target: AppUser, disabled: boolean) => {
      setDisabledUpdatingId(target._id);
      try {
        await updateMasterUserDisabled(target._id, disabled);
        await Promise.all([loadUsers(), loadOverview()]);
      } catch (err) {
        setUsersError(err instanceof Error ? err.message : "활성화 상태 변경 실패");
      } finally {
        setDisabledUpdatingId("");
      }
    },
    [loadOverview, loadUsers],
  );

  const requestRoleChange = (target: AppUser, role: UserRole) => {
    if (target.role === role) return;
    const isElevation = role === "master";
    const isDemotion = target.role === "master" && role !== "master";
    setConfirmState({
      title: "유저 권한 변경",
      message: `${target.email}의 권한을 [${target.role} → ${role}]로 변경합니다.${
        isElevation
          ? "\n해당 유저는 모든 마스터 기능에 접근할 수 있게 됩니다."
          : isDemotion
            ? "\n마스터 권한이 해제되어 운영 기능을 잃습니다."
            : ""
      }`,
      confirmLabel: "변경",
      tone: isElevation || isDemotion ? "danger" : "warning",
      onConfirm: () => performRoleChange(target, role),
    });
  };

  const requestDisabledChange = (target: AppUser, disabled: boolean) => {
    setConfirmState({
      title: disabled ? "계정 비활성화" : "계정 활성화",
      message: disabled
        ? `${target.email} 계정을 비활성화합니다.\n해당 유저는 더 이상 로그인하거나 API를 호출할 수 없습니다.`
        : `${target.email} 계정을 활성화합니다.\n로그인이 다시 가능해집니다.`,
      confirmLabel: disabled ? "비활성화" : "활성화",
      tone: disabled ? "danger" : "default",
      onConfirm: () => performDisabledChange(target, disabled),
    });
  };

  // ── Auth/early states ──
  if (authStatus === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        마스터 패널 인증 확인 중...
      </div>
    );
  }

  if (authStatus !== "ok") {
    const detail =
      authStatus === "denied"
        ? "마스터 권한이 필요합니다."
        : authError || "마스터 패널을 불러오지 못했습니다.";
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
        <div
          style={{
            width: "min(680px, 100%)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-xl)",
            background: "var(--bg-surface)",
            padding: 18,
          }}
        >
          <h1 style={{ color: "var(--text-primary)", fontSize: 22 }}>마스터 패널 접근 오류</h1>
          <p style={{ color: "var(--bear)", fontSize: 13, marginTop: 8, whiteSpace: "pre-wrap" }}>
            {detail}
          </p>
          <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
            <Link href="/" style={{ color: "var(--brand)", textDecoration: "none", fontWeight: 700 }}>
              홈으로
            </Link>
            <Link href="/login" style={{ color: "var(--brand)", textDecoration: "none", fontWeight: 700 }}>
              로그인
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", padding: 18, background: "var(--bg-base)" }}>
      <div style={{ maxWidth: 1300, margin: "0 auto", display: "grid", gap: 14 }}>
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-xl)",
            background: "var(--bg-surface)",
            padding: "14px 16px",
          }}
        >
          <div>
            <p
              style={{
                color: "var(--brand)",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Master Control Panel
            </p>
            <h1 style={{ color: "var(--text-primary)", fontSize: 24, marginTop: 4 }}>
              유저/로그/주문 통합 관리
            </h1>
            <p style={{ color: "var(--text-tertiary)", fontSize: 12, marginTop: 6 }}>
              접속 계정: {user?.username || user?.email || "-"}
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Link href="/" style={{ color: "var(--brand)", textDecoration: "none", fontWeight: 700, fontSize: 13 }}>
              트레이딩 화면
            </Link>
            <Link
              href="/activity"
              style={{ color: "var(--brand)", textDecoration: "none", fontWeight: 700, fontSize: 13 }}
            >
              내 활동 로그
            </Link>
            <button
              type="button"
              onClick={async () => {
                try {
                  await logoutUser();
                } catch {
                  // ignore
                }
                clearAccessToken();
                window.location.href = "/login";
              }}
              style={{
                border: "none",
                background: "transparent",
                color: "var(--text-tertiary)",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              로그아웃
            </button>
          </div>
        </header>

        {/* Overview ─────────────────────────────────────── */}
        <SectionShell
          title="현황 오버뷰"
          status={overviewStatus}
          error={overviewError}
          onRetry={loadOverview}
        >
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: 10,
            }}
          >
            <StatCard label="전체 유저" value={String(overview?.users.total ?? 0)} />
            <StatCard label="활성 유저" value={String(overview?.users.active ?? 0)} />
            <StatCard label="마스터" value={String(overview?.users.masters ?? 0)} />
            <StatCard label="트레이더" value={String(overview?.users.traders ?? 0)} />
            <StatCard label="뷰어" value={String(overview?.users.viewers ?? 0)} />
            <StatCard label="24h 액션" value={String(overview?.activity.logs_24h ?? 0)} />
            <StatCard label="24h 주문" value={String(overview?.activity.trades_24h ?? 0)} />
          </section>
        </SectionShell>

        {/* Users ─────────────────────────────────────── */}
        <SectionShell
          title="유저 권한 관리"
          status={usersStatus}
          error={usersError}
          onRetry={loadUsers}
          headerExtra={
            <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
              총 {users.length}명 표시 (최대 500명)
            </span>
          }
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={th}>이메일</th>
                  <th style={th}>이름</th>
                  <th style={th}>역할</th>
                  <th style={th}>상태</th>
                  <th style={th}>최근 로그인</th>
                  <th style={th}>관리</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td style={td} colSpan={6}>
                      유저 없음
                    </td>
                  </tr>
                ) : (
                  users.map((u) => {
                    const roleBusy = roleUpdatingId === u._id;
                    const disabledBusy = disabledUpdatingId === u._id;
                    return (
                      <tr key={u._id}>
                        <td style={td}>{u.email}</td>
                        <td style={td}>{u.username || "-"}</td>
                        <td style={td}>{u.role}</td>
                        <td style={td}>{u.disabled ? "disabled" : "active"}</td>
                        <td style={td}>{formatDate(u.last_login_at ?? undefined)}</td>
                        <td style={td}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {(["viewer", "trader", "master"] as UserRole[]).map((r) => (
                              <button
                                key={r}
                                type="button"
                                disabled={roleBusy || u.role === r}
                                onClick={() => requestRoleChange(u, r)}
                                style={{
                                  border: "1px solid var(--border-default)",
                                  background:
                                    u.role === r ? "var(--brand-subtle)" : "transparent",
                                  color:
                                    u.role === r
                                      ? "var(--brand)"
                                      : "var(--text-secondary)",
                                  borderRadius: 8,
                                  fontSize: 11,
                                  padding: "4px 8px",
                                  cursor:
                                    roleBusy || u.role === r ? "not-allowed" : "pointer",
                                }}
                              >
                                {r}
                              </button>
                            ))}

                            <button
                              type="button"
                              disabled={disabledBusy}
                              onClick={() => requestDisabledChange(u, !u.disabled)}
                              style={{
                                border: "1px solid var(--border-default)",
                                background: u.disabled
                                  ? "var(--success-subtle)"
                                  : "var(--error-subtle)",
                                color: u.disabled ? "var(--success)" : "var(--bear)",
                                borderRadius: 8,
                                fontSize: 11,
                                padding: "4px 8px",
                                cursor: disabledBusy ? "not-allowed" : "pointer",
                              }}
                            >
                              {u.disabled ? "활성화" : "비활성화"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </SectionShell>

        {/* Activity ─────────────────────────────────────── */}
        <SectionShell
          title="전체 액션 로그"
          status={activityStatus}
          error={activityError}
          onRetry={() => loadActivity(activityLimit, excludeNoise)}
          headerExtra={
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  color: "var(--text-secondary)",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={excludeNoise}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setExcludeNoise(next);
                    setActivityLimit(ACTIVITY_PAGE_SIZE);
                    void loadActivity(ACTIVITY_PAGE_SIZE, next);
                  }}
                />
                api_call 노이즈 숨김
              </label>
              <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
                {activity.length}건 표시
                {excludeNoise && activityVisible !== null
                  ? ` · 의미 있는 이벤트 ${activityVisible}건`
                  : ""}
                {activityTotal !== null ? ` · 전체 ${activityTotal}건` : ""}
              </span>
            </div>
          }
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={th}>시간</th>
                  <th style={th}>유저</th>
                  <th style={th}>액션</th>
                  <th style={th}>API</th>
                  <th style={th}>상태</th>
                </tr>
              </thead>
              <tbody>
                {activity.length === 0 ? (
                  <tr>
                    <td style={td} colSpan={5}>
                      기록 없음
                    </td>
                  </tr>
                ) : (
                  activity.map((item) => (
                    <tr key={item._id}>
                      <td style={td}>{formatDate(item.created_at)}</td>
                      <td style={td}>
                        {usersById.get(item.user_id || "")?.email || item.user_email || "-"}
                      </td>
                      <td style={td}>{item.action_type}</td>
                      <td style={td}>
                        {item.method || "-"} {item.path || ""}
                      </td>
                      <td style={td}>{item.status_code ?? "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <LoadMoreBar
            disabled={activityStatus === "loading"}
            visibleCount={activity.length}
            limit={activityLimit}
            onMore={() => {
              const next = Math.min(activityLimit + ACTIVITY_PAGE_SIZE, 1000);
              setActivityLimit(next);
              void loadActivity(next, excludeNoise);
            }}
            atMax={activityLimit >= 1000}
          />
        </SectionShell>

        {/* Trades ─────────────────────────────────────── */}
        <SectionShell
          title="전체 주문/거래 로그"
          status={tradesStatus}
          error={tradesError}
          onRetry={() => loadTrades(tradesLimit)}
          headerExtra={
            <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
              {trades.length}건 표시
              {tradesTotal !== null ? ` · 전체 ${tradesTotal}건` : ""}
            </span>
          }
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={th}>시간</th>
                  <th style={th}>유저</th>
                  <th style={th}>타입</th>
                  <th style={th}>종목</th>
                  <th style={th}>수량</th>
                  <th style={th}>상태</th>
                </tr>
              </thead>
              <tbody>
                {trades.length === 0 ? (
                  <tr>
                    <td style={td} colSpan={6}>
                      기록 없음
                    </td>
                  </tr>
                ) : (
                  trades.map((item) => (
                    <tr key={item._id}>
                      <td style={td}>{formatDate(item.created_at)}</td>
                      <td style={td}>
                        {usersById.get(item.user_id || "")?.email || item.user_email || "-"}
                      </td>
                      <td style={td}>{item.trade_type}</td>
                      <td style={td}>{item.ticker || "-"}</td>
                      <td style={td}>{item.qty ?? "-"}</td>
                      <td style={td}>{item.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <LoadMoreBar
            disabled={tradesStatus === "loading"}
            visibleCount={trades.length}
            limit={tradesLimit}
            onMore={() => {
              const next = Math.min(tradesLimit + TRADES_PAGE_SIZE, 1000);
              setTradesLimit(next);
              void loadTrades(next);
            }}
            atMax={tradesLimit >= 1000}
          />
        </SectionShell>
      </div>

      {confirmState && (
        <ConfirmDialog
          state={confirmState}
          onClose={() => setConfirmState(null)}
        />
      )}
    </main>
  );
}

// ── UI primitives ──────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-xl)",
        background: "var(--bg-surface)",
        padding: "12px 14px",
      }}
    >
      <p style={{ color: "var(--text-tertiary)", fontSize: 11 }}>{label}</p>
      <p
        style={{
          color: "var(--text-primary)",
          fontSize: 24,
          marginTop: 4,
          fontWeight: 800,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function SectionShell({
  title,
  status,
  error,
  onRetry,
  headerExtra,
  children,
}: {
  title: string;
  status: SectionStatus;
  error: string;
  onRetry: () => void | Promise<void>;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-xl)",
        background: "var(--bg-surface)",
        padding: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <h2 style={{ color: "var(--text-primary)", fontSize: 17 }}>{title}</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {headerExtra}
          {status === "loading" && (
            <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>로딩 중…</span>
          )}
          {status === "error" && (
            <button
              type="button"
              onClick={() => void onRetry()}
              style={{
                border: "1px solid var(--error-border)",
                background: "var(--error-subtle)",
                color: "var(--bear)",
                borderRadius: 8,
                fontSize: 11,
                padding: "4px 8px",
                cursor: "pointer",
              }}
            >
              재시도
            </button>
          )}
        </div>
      </div>

      {status === "error" && (
        <div
          style={{
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--error-border)",
            background: "var(--error-subtle)",
            color: "var(--bear)",
            padding: "8px 10px",
            fontSize: 12,
            marginBottom: 10,
          }}
        >
          {error || "데이터를 불러오지 못했습니다."}
        </div>
      )}

      {children}
    </section>
  );
}

function LoadMoreBar({
  disabled,
  visibleCount,
  limit,
  onMore,
  atMax,
}: {
  disabled: boolean;
  visibleCount: number;
  limit: number;
  onMore: () => void;
  atMax: boolean;
}) {
  // Only show when the server very likely has more rows (i.e. we hit the
  // current limit). Hides clutter when result set is small.
  if (visibleCount < limit) return null;
  return (
    <div
      style={{
        marginTop: 10,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <button
        type="button"
        disabled={disabled || atMax}
        onClick={onMore}
        style={{
          border: "1px solid var(--border-default)",
          background: "transparent",
          color: atMax ? "var(--text-tertiary)" : "var(--brand)",
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 700,
          padding: "6px 14px",
          cursor: disabled || atMax ? "not-allowed" : "pointer",
        }}
      >
        {atMax ? "최대치 도달 (1000건)" : "더 가져오기"}
      </button>
    </div>
  );
}

function ConfirmDialog({
  state,
  onClose,
}: {
  state: ConfirmState;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const tone = state.tone;
  const confirmBg =
    tone === "danger"
      ? "var(--error-subtle)"
      : tone === "warning"
        ? "var(--warning-subtle)"
        : "var(--brand-subtle)";
  const confirmFg =
    tone === "danger"
      ? "var(--bear)"
      : tone === "warning"
        ? "var(--warning)"
        : "var(--brand)";
  const confirmBorder =
    tone === "danger"
      ? "var(--error-border)"
      : tone === "warning"
        ? "var(--warning-border)"
        : "var(--brand-border)";

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "grid",
        placeItems: "center",
        zIndex: 50,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(440px, 100%)",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-xl)",
          padding: 18,
        }}
      >
        <h3 style={{ color: "var(--text-primary)", fontSize: 17, marginBottom: 8 }}>
          {state.title}
        </h3>
        <p
          style={{
            color: "var(--text-secondary)",
            fontSize: 13,
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
            marginBottom: 16,
          }}
        >
          {state.message}
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              border: "1px solid var(--border-default)",
              background: "transparent",
              color: "var(--text-secondary)",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              padding: "6px 12px",
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            취소
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await state.onConfirm();
              } finally {
                setBusy(false);
                onClose();
              }
            }}
            style={{
              border: `1px solid ${confirmBorder}`,
              background: confirmBg,
              color: confirmFg,
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              padding: "6px 12px",
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "처리 중…" : state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const th: CSSProperties = {
  textAlign: "left",
  padding: "9px 8px",
  borderBottom: "1px solid var(--border-subtle)",
  color: "var(--text-tertiary)",
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const td: CSSProperties = {
  padding: "8px",
  borderBottom: "1px solid var(--border-subtle)",
  color: "var(--text-secondary)",
  verticalAlign: "top",
};
