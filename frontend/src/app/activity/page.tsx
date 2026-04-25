"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import {
  clearAccessToken,
  getMe,
  getMyActivity,
  getMyTrades,
  logoutUser,
} from "@/lib/api";
import type { ActivityLogItem, AppUser, UserTradeItem } from "@/types";

function safeDate(value?: string): string {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString("ko-KR");
}

export default function ActivityPage() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [logs, setLogs] = useState<ActivityLogItem[]>([]);
  const [trades, setTrades] = useState<UserTradeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    Promise.all([getMe(), getMyActivity(150), getMyTrades(150)])
      .then(([meRes, logRes, tradeRes]) => {
        setUser(meRes.user);
        setLogs(logRes.items);
        setTrades(tradeRes.items);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "활동 로그를 불러오지 못했습니다.");
      })
      .finally(() => setLoading(false));
  }, []);

  // Hide low-signal API call rows; users only care about meaningful actions.
  const visibleLogs = useMemo(
    () => logs.filter((l) => l.action_type !== "api_call"),
    [logs],
  );
  const latestActions = useMemo(() => visibleLogs.slice(0, 30), [visibleLogs]);
  const latestTrades = useMemo(() => trades.slice(0, 30), [trades]);

  if (loading) {
    return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>로딩 중...</div>;
  }

  if (error) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
        <div style={{ width: "min(660px, 100%)", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-xl)", padding: 18 }}>
          <h1 style={{ fontSize: 22, color: "var(--text-primary)", marginBottom: 8 }}>활동 로그 오류</h1>
          <p style={{ color: "var(--bear)", fontSize: 13 }}>{error}</p>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <Link href="/login" style={{ color: "var(--brand)", textDecoration: "none", fontWeight: 700 }}>로그인 페이지</Link>
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
              style={{ border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", padding: 0 }}
            >
              로그아웃
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", padding: 18, background: "var(--bg-base)" }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", display: "grid", gap: 14 }}>
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
              User Activity
            </p>
            <h1 style={{ marginTop: 4, color: "var(--text-primary)", fontSize: 24 }}>
              {user?.username || user?.email || "사용자"}님의 액션 로그
            </h1>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Link href="/" style={{ color: "var(--brand)", textDecoration: "none", fontWeight: 700, fontSize: 13 }}>트레이딩 화면</Link>
            {user?.role === "master" && (
              <Link href="/master" style={{ color: "var(--brand)", textDecoration: "none", fontWeight: 700, fontSize: 13 }}>마스터 패널</Link>
            )}
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

        <section style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
          <article style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-xl)", background: "var(--bg-surface)", padding: 14 }}>
            <h2 style={{ color: "var(--text-primary)", fontSize: 17, marginBottom: 10 }}>최근 활동 ({visibleLogs.length})</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={th}>시간</th>
                    <th style={th}>유형</th>
                    <th style={th}>API</th>
                    <th style={th}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {latestActions.length === 0 ? (
                    <tr>
                      <td style={td} colSpan={4}>기록 없음</td>
                    </tr>
                  ) : (
                    latestActions.map((item) => (
                      <tr key={item._id}>
                        <td style={td}>{safeDate(item.created_at)}</td>
                        <td style={td}>{item.action_type}</td>
                        <td style={td}>{item.method || "-"} {item.path || ""}</td>
                        <td style={td}>{item.status_code ?? "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-xl)", background: "var(--bg-surface)", padding: 14 }}>
            <h2 style={{ color: "var(--text-primary)", fontSize: 17, marginBottom: 10 }}>최근 주문/거래 ({trades.length})</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={th}>시간</th>
                    <th style={th}>타입</th>
                    <th style={th}>종목</th>
                    <th style={th}>수량</th>
                    <th style={th}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {latestTrades.length === 0 ? (
                    <tr>
                      <td style={td} colSpan={5}>기록 없음</td>
                    </tr>
                  ) : (
                    latestTrades.map((item) => (
                      <tr key={item._id}>
                        <td style={td}>{safeDate(item.created_at)}</td>
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
          </article>
        </section>
      </div>
    </main>
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
