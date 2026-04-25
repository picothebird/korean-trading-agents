"use client";

import { useEffect, useMemo, useState } from "react";
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

export default function MasterPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState<AppUser | null>(null);

  const [overview, setOverview] = useState<MasterOverview | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [activity, setActivity] = useState<ActivityLogItem[]>([]);
  const [trades, setTrades] = useState<UserTradeItem[]>([]);

  const [roleUpdatingId, setRoleUpdatingId] = useState<string>("");
  const [disabledUpdatingId, setDisabledUpdatingId] = useState<string>("");

  const reload = async () => {
    const [meRes, overviewRes, usersRes, activityRes, tradesRes] = await Promise.all([
      getMe(),
      getMasterOverview(),
      getMasterUsers(500),
      getMasterActivity({ limit: 300 }),
      getMasterTrades({ limit: 300 }),
    ]);

    if (meRes.user.role !== "master") {
      throw new Error("마스터 권한이 필요합니다.");
    }

    setUser(meRes.user);
    setOverview(overviewRes);
    setUsers(usersRes.items);
    setActivity(activityRes.items);
    setTrades(tradesRes.items);
  };

  useEffect(() => {
    reload()
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "마스터 데이터를 불러오지 못했습니다.");
      })
      .finally(() => setLoading(false));
  }, []);

  const usersById = useMemo(() => {
    const map = new Map<string, AppUser>();
    users.forEach((u) => map.set(u._id, u));
    return map;
  }, [users]);

  const handleRoleChange = async (target: AppUser, role: UserRole) => {
    setRoleUpdatingId(target._id);
    try {
      await updateMasterUserRole(target._id, role);
      await reload();
      setError("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "권한 변경 실패");
    } finally {
      setRoleUpdatingId("");
    }
  };

  const handleDisabledChange = async (target: AppUser, disabled: boolean) => {
    setDisabledUpdatingId(target._id);
    try {
      await updateMasterUserDisabled(target._id, disabled);
      await reload();
      setError("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "활성화 상태 변경 실패");
    } finally {
      setDisabledUpdatingId("");
    }
  };

  if (loading) {
    return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>마스터 패널 로딩 중...</div>;
  }

  if (error && !overview) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
        <div style={{ width: "min(680px, 100%)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-xl)", background: "var(--bg-surface)", padding: 18 }}>
          <h1 style={{ color: "var(--text-primary)", fontSize: 22 }}>마스터 패널 접근 오류</h1>
          <p style={{ color: "var(--bear)", fontSize: 13, marginTop: 8 }}>{error}</p>
          <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
            <Link href="/" style={{ color: "var(--brand)", textDecoration: "none", fontWeight: 700 }}>홈으로</Link>
            <Link href="/login" style={{ color: "var(--brand)", textDecoration: "none", fontWeight: 700 }}>로그인</Link>
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
            <p style={{ color: "var(--brand)", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Master Control Panel
            </p>
            <h1 style={{ color: "var(--text-primary)", fontSize: 24, marginTop: 4 }}>유저/로그/주문 통합 관리</h1>
            <p style={{ color: "var(--text-tertiary)", fontSize: 12, marginTop: 6 }}>
              접속 계정: {user?.username || user?.email || "-"}
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Link href="/" style={{ color: "var(--brand)", textDecoration: "none", fontWeight: 700, fontSize: 13 }}>트레이딩 화면</Link>
            <Link href="/activity" style={{ color: "var(--brand)", textDecoration: "none", fontWeight: 700, fontSize: 13 }}>내 활동 로그</Link>
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
              style={{ border: "none", background: "transparent", color: "var(--text-tertiary)", fontWeight: 700, cursor: "pointer" }}
            >
              로그아웃
            </button>
          </div>
        </header>

        {error && (
          <div style={{ borderRadius: "var(--radius-lg)", border: "1px solid var(--error-border)", background: "var(--error-subtle)", color: "var(--bear)", padding: "9px 11px", fontSize: 12 }}>
            {error}
          </div>
        )}

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
          <StatCard label="전체 유저" value={String(overview?.users.total ?? 0)} />
          <StatCard label="활성 유저" value={String(overview?.users.active ?? 0)} />
          <StatCard label="마스터" value={String(overview?.users.masters ?? 0)} />
          <StatCard label="트레이더" value={String(overview?.users.traders ?? 0)} />
          <StatCard label="뷰어" value={String(overview?.users.viewers ?? 0)} />
          <StatCard label="24h 액션" value={String(overview?.activity.logs_24h ?? 0)} />
          <StatCard label="24h 주문" value={String(overview?.activity.trades_24h ?? 0)} />
        </section>

        <section style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-xl)", background: "var(--bg-surface)", padding: 14 }}>
          <h2 style={{ color: "var(--text-primary)", fontSize: 17, marginBottom: 10 }}>유저 권한 관리</h2>
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
                {users.map((u) => {
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
                              onClick={() => handleRoleChange(u, r)}
                              style={{
                                border: "1px solid var(--border-default)",
                                background: u.role === r ? "var(--brand-subtle)" : "transparent",
                                color: u.role === r ? "var(--brand)" : "var(--text-secondary)",
                                borderRadius: 8,
                                fontSize: 11,
                                padding: "4px 8px",
                                cursor: roleBusy || u.role === r ? "not-allowed" : "pointer",
                              }}
                            >
                              {r}
                            </button>
                          ))}

                          <button
                            type="button"
                            disabled={disabledBusy}
                            onClick={() => handleDisabledChange(u, !u.disabled)}
                            style={{
                              border: "1px solid var(--border-default)",
                              background: u.disabled ? "var(--success-subtle)" : "var(--error-subtle)",
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
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
          <article style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-xl)", background: "var(--bg-surface)", padding: 14 }}>
            <h2 style={{ color: "var(--text-primary)", fontSize: 17, marginBottom: 10 }}>전체 액션 로그</h2>
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
                  {activity.slice(0, 120).map((item) => (
                    <tr key={item._id}>
                      <td style={td}>{formatDate(item.created_at)}</td>
                      <td style={td}>{usersById.get(item.user_id || "")?.email || item.user_email || "-"}</td>
                      <td style={td}>{item.action_type}</td>
                      <td style={td}>{item.method || "-"} {item.path || ""}</td>
                      <td style={td}>{item.status_code ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-xl)", background: "var(--bg-surface)", padding: 14 }}>
            <h2 style={{ color: "var(--text-primary)", fontSize: 17, marginBottom: 10 }}>전체 주문/거래 로그</h2>
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
                  {trades.slice(0, 120).map((item) => (
                    <tr key={item._id}>
                      <td style={td}>{formatDate(item.created_at)}</td>
                      <td style={td}>{usersById.get(item.user_id || "")?.email || item.user_email || "-"}</td>
                      <td style={td}>{item.trade_type}</td>
                      <td style={td}>{item.ticker || "-"}</td>
                      <td style={td}>{item.qty ?? "-"}</td>
                      <td style={td}>{item.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}

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
      <p style={{ color: "var(--text-primary)", fontSize: 24, marginTop: 4, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </p>
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
