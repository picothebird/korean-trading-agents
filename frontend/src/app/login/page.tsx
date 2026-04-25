"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getAccessToken,
  getAuthBootstrapStatus,
  getMe,
  loginUser,
  registerUser,
  setAccessToken,
} from "@/lib/api";
import type { UserRole } from "@/types";
import { BrandLockup } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [bootstrapped, setBootstrapped] = useState(true);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string>("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [username, setUsername] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [role, setRole] = useState<UserRole>("viewer");

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setChecking(false);
      return;
    }

    getMe()
      .then(() => {
        router.replace("/");
      })
      .catch(() => {
        setChecking(false);
      });
  }, [router]);

  useEffect(() => {
    getAuthBootstrapStatus()
      .then((res) => {
        setBootstrapped(res.bootstrapped);
        if (!res.bootstrapped) {
          setMode("register");
          setRole("master");
        }
      })
      .catch(() => {
        // keep default UI behavior if backend check fails
      });
  }, []);

  const canChooseRole = useMemo(() => {
    return !bootstrapped;
  }, [bootstrapped]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (mode === "register" && password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }

    if (mode === "register" && password !== passwordConfirm) {
      setError("비밀번호가 서로 일치하지 않습니다. 다시 확인해 주세요.");
      return;
    }

    if (mode === "register" && bootstrapped && !inviteCode.trim()) {
      setError("이용에는 마스터가 발급한 초대 코드가 필요합니다.");
      return;
    }

    setLoading(true);

    try {
      if (mode === "login") {
        const res = await loginUser({ email, password });
        setAccessToken(res.access_token);
        router.replace("/");
        return;
      }

      const res = await registerUser({
        email,
        password,
        username,
        role: canChooseRole ? role : undefined,
        invite_code: bootstrapped ? inviteCode.trim().toUpperCase() : undefined,
      });
      setAccessToken(res.access_token);
      router.replace("/");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "로그인/회원가입 실패";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        인증 상태 확인 중...
      </div>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 20,
        background:
          "radial-gradient(900px 400px at 10% -10%, rgba(49,130,246,0.10), transparent 60%), radial-gradient(900px 450px at 100% 10%, rgba(16,185,129,0.08), transparent 60%), var(--bg-canvas)",
      }}
    >
      <section
        style={{
          width: "min(520px, 100%)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-2xl)",
          background: "var(--bg-surface)",
          boxShadow: "var(--shadow-lg)",
          padding: 24,
        }}
      >
        <BrandLockup size={40} />
        <h1 style={{ marginTop: 18, fontSize: 30, lineHeight: 1.1, color: "var(--text-primary)" }}>
          {mode === "login" ? "로그인" : "회원가입"}
        </h1>
        <p style={{ marginTop: 8, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          {bootstrapped
            ? "개인 계정으로 로그인하고 분석/매매 기능을 이용하세요."
            : "첫 계정을 생성합니다. 최초 사용자는 마스터 권한이 부여됩니다."}
        </p>

        <form onSubmit={handleSubmit} style={{ marginTop: 18, display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 700 }}>이메일</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                border: "1px solid var(--border-default)",
                background: "var(--bg-elevated)",
                color: "var(--text-primary)",
                borderRadius: "var(--radius-lg)",
                padding: "11px 12px",
                fontSize: 14,
              }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 700 }}>비밀번호</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              aria-describedby={mode === "register" ? "pw-hint" : undefined}
              style={{
                border: "1px solid var(--border-default)",
                background: "var(--bg-elevated)",
                color: "var(--text-primary)",
                borderRadius: "var(--radius-lg)",
                padding: "11px 12px",
                fontSize: 14,
              }}
            />
            {mode === "register" && (
              <p
                id="pw-hint"
                style={{
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                  lineHeight: 1.4,
                  margin: 0,
                }}
              >
                8자 이상의 비밀번호를 입력해 주세요.
              </p>
            )}
          </label>

          {mode === "register" && (
            <>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 700 }}>비밀번호 확인</span>
                <input
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  required
                  style={{
                    border: `1px solid ${
                      passwordConfirm.length > 0 && passwordConfirm !== password
                        ? "var(--error-border)"
                        : "var(--border-default)"
                    }`,
                    background: "var(--bg-elevated)",
                    color: "var(--text-primary)",
                    borderRadius: "var(--radius-lg)",
                    padding: "11px 12px",
                    fontSize: 14,
                  }}
                />
                {passwordConfirm.length > 0 && passwordConfirm !== password && (
                  <p style={{ fontSize: 11, color: "var(--bear)", margin: 0 }}>
                    비밀번호가 일치하지 않습니다.
                  </p>
                )}
                {passwordConfirm.length > 0 && passwordConfirm === password && password.length >= 8 && (
                  <p style={{ fontSize: 11, color: "var(--success)", margin: 0 }}>
                    비밀번호가 일치합니다.
                  </p>
                )}
              </label>

              {bootstrapped && (
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 700 }}>초대 코드</span>
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    required
                    placeholder="예: AB3CD7XY9P"
                    autoComplete="off"
                    spellCheck={false}
                    style={{
                      border: "1px solid var(--border-default)",
                      background: "var(--bg-elevated)",
                      color: "var(--text-primary)",
                      borderRadius: "var(--radius-lg)",
                      padding: "11px 12px",
                      fontSize: 14,
                      letterSpacing: "0.06em",
                      fontFamily: "monospace",
                      textTransform: "uppercase",
                    }}
                  />
                  <p style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.4, margin: 0 }}>
                    가입에는 마스터 사용자가 발급한 초대 코드가 필요합니다. 코드 1개당 1명만 가입할 수 있습니다.
                  </p>
                </label>
              )}

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 700 }}>닉네임 (선택)</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={40}
                  style={{
                    border: "1px solid var(--border-default)",
                    background: "var(--bg-elevated)",
                    color: "var(--text-primary)",
                    borderRadius: "var(--radius-lg)",
                    padding: "11px 12px",
                    fontSize: 14,
                  }}
                />
              </label>

              {!bootstrapped && (
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 700 }}>역할</span>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    disabled={!canChooseRole}
                    style={{
                      border: "1px solid var(--border-default)",
                      background: "var(--bg-elevated)",
                      color: "var(--text-primary)",
                      borderRadius: "var(--radius-lg)",
                      padding: "11px 12px",
                      fontSize: 14,
                    }}
                  >
                    <option value="viewer">viewer</option>
                    <option value="trader">trader</option>
                    <option value="master">master</option>
                  </select>
                </label>
              )}
            </>
          )}

          {error && (
            <div
              style={{
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--error-border)",
                background: "var(--error-subtle)",
                color: "var(--bear)",
                fontSize: 12,
                padding: "9px 11px",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 2,
              border: "none",
              borderRadius: "var(--radius-lg)",
              background: loading ? "var(--bg-elevated)" : "var(--brand)",
              color: loading ? "var(--text-tertiary)" : "var(--text-inverse)",
              padding: "12px 14px",
              fontSize: 14,
              fontWeight: 800,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "처리 중..." : mode === "login" ? "로그인" : "회원가입"}
          </button>
        </form>

        {bootstrapped && (
          <div style={{ marginTop: 14, fontSize: 12, color: "var(--text-tertiary)" }}>
            {mode === "login" ? "아직 계정이 없나요?" : "이미 계정이 있나요?"}{" "}
            <button
              type="button"
              onClick={() => {
                setMode((prev) => (prev === "login" ? "register" : "login"));
                setError("");
              }}
              style={{
                border: "none",
                background: "transparent",
                color: "var(--brand)",
                fontWeight: 700,
                cursor: "pointer",
                padding: 0,
              }}
            >
              {mode === "login" ? "회원가입으로 전환" : "로그인으로 전환"}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
