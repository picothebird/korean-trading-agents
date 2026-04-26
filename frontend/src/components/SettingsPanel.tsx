"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  getSettings,
  updateSettings,
  logoutUser,
  clearAccessToken,
  masterListInviteCodes,
  masterCreateInviteCode,
  masterRevokeInviteCode,
} from "@/lib/api";
import { Sheet, useTheme, Icon, type ThemeMode, type IconName } from "@/components/ui";
import type { InviteCode, UserRole } from "@/types";
import { usePersonalization, type NotificationCondition } from "@/stores/usePersonalization";
import { requestNotificationPermission } from "@/lib/notifications";
import { AGENT_LABEL } from "@/lib/agentLabels";

export type SettingsTab = "overview" | "appearance" | "notifications" | "llm" | "analysis" | "guru" | "kis" | "invites";

// 단일 모델 설정. 기본값은 gpt-5.5. 직접 입력 시 "gpt-" 접두어를 자동 부착하고 소문자로 정규화합니다.
const DEFAULT_MODELS = [
  { value: "gpt-5.5", label: "GPT-5.5", desc: "기본 · 균형 (권장)" },
  { value: "gpt-5.5-pro", label: "GPT-5.5 Pro", desc: "최고 품질 · 심층 추론" },
  { value: "gpt-5.4", label: "GPT-5.4", desc: "안정 · 심층 추론" },
  { value: "gpt-5.4-mini", label: "GPT-5.4 mini", desc: "경량 · 저비용" },
];

// OpenAI 모델 카탈로그 https://developers.openai.com/api/docs/models/all 참고.
// 사용자 직접 입력값을 표준화합니다 (오타/케이스 방지).
function normalizeModelId(raw: string): string {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return "";
  // o1, o3, o4-mini 등 o-시리즈는 그대로
  if (/^o\d/.test(v)) return v;
  // 이미 gpt-/openai/ 등 접두어가 있으면 그대로
  if (v.startsWith("gpt-") || v.includes("/")) return v;
  return `gpt-${v.replace(/^gpt[-_ ]?/i, "")}`;
}

const EFFORT_OPTIONS = [
  { value: "high", label: "High", desc: "깊은 추론\n최고 품질", icon: "brain" as IconName, color: "#3182F6" },
  { value: "medium", label: "Medium", desc: "균형 분석\n속도 타협", icon: "scale" as IconName, color: "#F5A623" },
  { value: "low", label: "Low", desc: "빠른 판단\n저비용", icon: "bolt" as IconName, color: "#2FCA73" },
] as const;

const TABS: Array<{ key: SettingsTab; label: string; icon: IconName; hint: string; masterOnly?: boolean }> = [
  { key: "overview", label: "개요", icon: "compass", hint: "현재 상태와 빠른 진입" },
  { key: "appearance", label: "외관", icon: "palette", hint: "테마 (라이트/다크/시스템)" },
  { key: "notifications", label: "알림", icon: "info", hint: "신호/위험 푸시 규칙" },
  { key: "llm", label: "LLM", icon: "brain", hint: "OpenAI 키와 모델" },
  { key: "analysis", label: "분석", icon: "chart-bar", hint: "토론 라운드/분석 강도" },
  { key: "guru", label: "GURU", icon: "sparkles", hint: "최종 정책 레이어" },
  { key: "kis", label: "KIS", icon: "credit-card", hint: "실전/모의 + 인증정보" },
  { key: "invites", label: "초대 코드", icon: "key", hint: "마스터 전용 · 초대 코드 발급/관리", masterOnly: true },
];

const TAB_TITLE: Record<SettingsTab, string> = {
  overview: "설정 개요",
  appearance: "외관",
  notifications: "알림",
  llm: "LLM 설정",
  analysis: "분석 파라미터",
  guru: "GURU 정책",
  kis: "KIS 연동",
  invites: "초대 코드",
};

interface SettingsForm {
  openai_api_key: string;
  default_llm_model: string;
  reasoning_effort: "high" | "medium" | "low";
  max_debate_rounds: number;
  guru_enabled: boolean;
  guru_debate_enabled: boolean;
  guru_require_user_confirmation: boolean;
  guru_risk_profile: "defensive" | "balanced" | "aggressive";
  guru_investment_principles: string;
  guru_min_confidence_to_act: number;
  guru_max_risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  guru_max_position_pct: number;
  kis_mock: boolean;
  kis_app_key: string;
  kis_app_secret: string;
  kis_account_no: string;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <p
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 12,
          paddingBottom: 8,
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        {title}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
    </section>
  );
}

function Field({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 3 }}>{label}</p>
        {description && <p style={{ fontSize: 10, color: "var(--text-tertiary)", lineHeight: 1.6 }}>{description}</p>}
      </div>
      {children}
    </div>
  );
}

function HelpNote({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        color: "var(--text-tertiary)",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 8,
        padding: "8px 10px",
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  );
}

// Tone keys for status chips. We deliberately avoid using `--bear` (blue =
// price-down in Korea) for a generic "off/missing" indicator because that
// confuses users into thinking the setting is in a bad state when it is
// merely unconfigured.
type ChipTone = "on" | "off" | "warn" | "info";

function StatusChip({ tone, label }: { tone: ChipTone; label: string }) {
  const map = {
    on:   { bg: "var(--success-subtle)", border: "var(--success-border)", color: "var(--success)", icon: "check-circle" as IconName },
    off:  { bg: "var(--bg-overlay)",     border: "var(--border-subtle)",  color: "var(--text-tertiary)", icon: "info" as IconName },
    warn: { bg: "var(--warning-subtle)", border: "var(--warning-border)", color: "var(--warning)", icon: "warning" as IconName },
    info: { bg: "var(--brand-subtle)",   border: "var(--brand-border)",   color: "var(--brand)",   icon: "info" as IconName },
  } as const;
  const cfg = map[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        fontWeight: 600,
        padding: "4px 9px 4px 7px",
        borderRadius: 99,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        color: cfg.color,
        whiteSpace: "nowrap",
      }}
    >
      <Icon name={cfg.icon} size={12} strokeWidth={2} decorative />
      {label}
    </span>
  );
}

function ModelSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; desc: string }[];
}) {
  const isCustom = !options.some((o) => o.value === value);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ position: "relative" }}>
        <select
          value={isCustom ? "__custom__" : value}
          onChange={(e) => {
            if (e.target.value !== "__custom__") onChange(e.target.value);
          }}
          style={{
            width: "100%",
            padding: "9px 32px 9px 12px",
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            color: "var(--text-primary)",
            fontSize: 12,
            outline: "none",
            cursor: "pointer",
            appearance: "none",
            WebkitAppearance: "none",
          }}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}  -  {o.desc}
            </option>
          ))}
          <option value="__custom__">직접 입력...</option>
        </select>
        <span
          style={{
            position: "absolute",
            right: 10,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--text-tertiary)",
            pointerEvents: "none",
            display: "inline-flex",
          }}
        >
          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </div>

      {isCustom && (
        <>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={(e) => {
              const norm = normalizeModelId(e.target.value);
              if (norm && norm !== e.target.value) onChange(norm);
            }}
            placeholder="예: 5.5-pro, 5.4-mini, o4-mini"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            style={{
              width: "100%",
              padding: "9px 12px",
              borderRadius: 8,
              background: "var(--bg-elevated)",
              border: "1px solid var(--brand)",
              color: "var(--text-primary)",
              fontSize: 11,
              outline: "none",
              boxSizing: "border-box",
              fontFamily: "monospace",
            }}
          />
          <p style={{ fontSize: 10, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
            저장 시 자동으로 <code style={{ background: "var(--bg-overlay)", padding: "1px 4px", borderRadius: 4 }}>{normalizeModelId(value) || "gpt-..."}</code> 형태로 정규화됩니다.
            <br />
            전체 모델 목록:&nbsp;
            <a
              href="https://developers.openai.com/api/docs/models/all"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--brand)", textDecoration: "underline" }}
            >
              OpenAI 모델 카탈로그
            </a>
          </p>
        </>
      )}
    </div>
  );
}

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
  userRole?: UserRole;
}

export function SettingsPanel({ open, onClose, initialTab = "overview", userRole }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [isCompact, setIsCompact] = useState(false);
  const { mode: themeMode, resolved: themeResolved, setMode: setThemeMode } = useTheme();
  const [form, setForm] = useState<SettingsForm>({
    openai_api_key: "",
    default_llm_model: "gpt-5.5",
    reasoning_effort: "high",
    max_debate_rounds: 2,
    guru_enabled: false,
    guru_debate_enabled: true,
    guru_require_user_confirmation: false,
    guru_risk_profile: "balanced",
    guru_investment_principles: "",
    guru_min_confidence_to_act: 0.72,
    guru_max_risk_level: "HIGH",
    guru_max_position_pct: 20,
    kis_mock: true,
    kis_app_key: "",
    kis_app_secret: "",
    kis_account_no: "",
  });

  const [apiKeyStatus, setApiKeyStatus] = useState({ set: false, preview: "" });
  const [kisKeyStatus, setKisKeyStatus] = useState({ appKeySet: false, secretSet: false, accountNo: "" });
  const [showKey, setShowKey] = useState(false);
  const [showKisSecret, setShowKisSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "ok" | "err">("idle");

  // 마스터 전용: 초대 코드 관리 상태
  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [invitesError, setInvitesError] = useState("");
  const [inviteForm, setInviteForm] = useState<{ note: string; role: UserRole }>({ note: "", role: "viewer" });
  const [inviteBusy, setInviteBusy] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string>("");

  const refreshInvites = useCallback(async () => {
    setInvitesLoading(true);
    setInvitesError("");
    try {
      const res = await masterListInviteCodes(200);
      setInvites(res.items);
    } catch (err) {
      setInvitesError(err instanceof Error ? err.message : "초대 코드 목록을 불러오지 못했습니다.");
    } finally {
      setInvitesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setActiveTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    if (activeTab !== "invites") return;
    if (userRole !== "master") return;
    void refreshInvites();
  }, [open, activeTab, userRole, refreshInvites]);

  const handleCreateInvite = useCallback(async () => {
    if (inviteBusy) return;
    setInviteBusy(true);
    setInvitesError("");
    try {
      const created = await masterCreateInviteCode({
        note: inviteForm.note.trim() || undefined,
        role: inviteForm.role,
      });
      setInvites((prev) => [created.invite, ...prev]);
      setInviteForm({ note: "", role: "viewer" });
    } catch (err) {
      setInvitesError(err instanceof Error ? err.message : "초대 코드 발급 실패");
    } finally {
      setInviteBusy(false);
    }
  }, [inviteBusy, inviteForm]);

  const handleRevokeInvite = useCallback(async (id: string) => {
    if (!window.confirm("이 초대 코드를 폐기하시겠습니까? 폐기된 코드로는 회원가입할 수 없습니다.")) return;
    try {
      await masterRevokeInviteCode(id);
      setInvites((prev) => prev.filter((x) => x.id !== id));
    } catch (err) {
      setInvitesError(err instanceof Error ? err.message : "폐기 실패");
    }
  }, []);

  const handleCopyCode = useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode((cur) => (cur === code ? "" : cur)), 1600);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 980px)");
    const sync = () => setIsCompact(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    getSettings()
      .then((s) => {
        setApiKeyStatus({ set: s.openai_api_key_set, preview: s.openai_api_key_preview });
        setKisKeyStatus({
          appKeySet: s.kis_app_key_set ?? false,
          secretSet: s.kis_app_secret_set ?? false,
          accountNo: s.kis_account_no ?? "",
        });
        setForm((prev) => ({
          ...prev,
          default_llm_model: s.default_llm_model || "gpt-5.5",
          reasoning_effort: s.reasoning_effort,
          max_debate_rounds: s.max_debate_rounds,
          guru_enabled: s.guru_enabled ?? false,
          guru_debate_enabled: s.guru_debate_enabled ?? true,
          guru_require_user_confirmation: s.guru_require_user_confirmation ?? false,
          guru_risk_profile: s.guru_risk_profile ?? "balanced",
          guru_investment_principles: s.guru_investment_principles ?? "",
          guru_min_confidence_to_act: s.guru_min_confidence_to_act ?? 0.72,
          guru_max_risk_level: s.guru_max_risk_level ?? "HIGH",
          guru_max_position_pct: s.guru_max_position_pct ?? 20,
          kis_mock: s.kis_mock,
          kis_account_no: s.kis_account_no ?? "",
        }));
      })
      .catch(() => {});
  }, [open]);

  const setField = <K extends keyof SettingsForm>(key: K, val: SettingsForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus("idle");
    try {
      const normalizedModel = normalizeModelId(form.default_llm_model) || "gpt-5.5";
      const payload = { ...form, default_llm_model: normalizedModel };
      if (normalizedModel !== form.default_llm_model) {
        setForm((prev) => ({ ...prev, default_llm_model: normalizedModel }));
      }
      await updateSettings(payload);
      setSaveStatus("ok");

      if (form.openai_api_key) {
        setApiKeyStatus({ set: true, preview: `sk-...${form.openai_api_key.slice(-4)}` });
        setForm((prev) => ({ ...prev, openai_api_key: "" }));
      }
      if (form.kis_app_key) {
        setKisKeyStatus((prev) => ({ ...prev, appKeySet: true }));
        setForm((prev) => ({ ...prev, kis_app_key: "" }));
      }
      if (form.kis_app_secret) {
        setKisKeyStatus((prev) => ({ ...prev, secretSet: true }));
        setForm((prev) => ({ ...prev, kis_app_secret: "" }));
      }
      if (form.kis_account_no) {
        setKisKeyStatus((prev) => ({ ...prev, accountNo: form.kis_account_no }));
      }

      setTimeout(() => setSaveStatus("idle"), 2600);
    } catch {
      setSaveStatus("err");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="right"
      width={880}
      title="통합 설정"
      description={`${TAB_TITLE[activeTab]} · 맥락별 탭 진입 지원`}
    >
      <div
        style={{
          display: "flex",
          flexDirection: isCompact ? "column" : "row",
          minHeight: 0,
          flex: 1,
          marginInline: -24,
          marginTop: -20,
        }}
      >
              <aside
                style={{
                  width: isCompact ? "100%" : 240,
                  borderRight: isCompact ? "none" : "1px solid var(--border-subtle)",
                  borderBottom: isCompact ? "1px solid var(--border-subtle)" : "none",
                  padding: isCompact ? "8px 10px" : "12px",
                  display: "flex",
                  flexDirection: isCompact ? "row" : "column",
                  gap: 8,
                  overflowX: isCompact ? "auto" : "visible",
                  flexShrink: 0,
                }}
              >
                {TABS.map((tab) => {
                  if (tab.masterOnly && userRole !== "master") return null;
                  const active = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      style={{
                        minWidth: isCompact ? 154 : "100%",
                        textAlign: "left",
                        borderRadius: "var(--radius-lg)",
                        border: `1px solid ${active ? "var(--brand)" : "var(--border-default)"}`,
                        background: active ? "var(--brand-subtle)" : "var(--bg-elevated)",
                        color: active ? "var(--brand)" : "var(--text-secondary)",
                        padding: "10px 11px",
                        cursor: "pointer",
                        transition: "all 120ms",
                      }}
                    >
                      <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 3, display: "inline-flex", alignItems: "center", gap: 7 }}>
                        <Icon name={tab.icon} size={14} decorative />
                        {tab.label}
                      </p>
                      <p style={{ fontSize: 10, color: active ? "var(--brand)" : "var(--text-tertiary)", lineHeight: 1.4 }}>
                        {tab.hint}
                      </p>
                    </button>
                  );
                })}
              </aside>

              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 18px 10px" }}>
                {activeTab === "overview" && (
                  <>
                    <Section title="현재 상태">
                      <div style={{ display: "grid", gridTemplateColumns: isCompact ? "1fr" : "1fr 1fr", gap: 10 }}>
                        <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: "10px 12px" }}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>OpenAI 연결</p>
                          <StatusChip tone={apiKeyStatus.set ? "on" : "off"} label={apiKeyStatus.set ? `설정됨 ${apiKeyStatus.preview ? `(${apiKeyStatus.preview})` : ""}` : "미설정"} />
                        </div>

                        <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: "10px 12px" }}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>KIS 인증 상태</p>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <StatusChip tone={kisKeyStatus.appKeySet ? "on" : "off"} label="App Key" />
                            <StatusChip tone={kisKeyStatus.secretSet ? "on" : "off"} label="App Secret" />
                            <StatusChip tone={kisKeyStatus.accountNo ? "on" : "off"} label="계좌번호" />
                          </div>
                        </div>

                        <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: "10px 12px" }}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>GURU 정책</p>
                          <StatusChip tone={form.guru_enabled ? "on" : "off"} label={form.guru_enabled ? "GURU ON" : "GURU OFF"} />
                          <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 6 }}>
                            승인 강제: {form.guru_require_user_confirmation ? "ON" : "OFF"}
                          </p>
                        </div>

                        <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: "10px 12px" }}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>KIS 거래 모드</p>
                          <StatusChip tone={form.kis_mock ? "info" : "warn"} label={form.kis_mock ? "모의투자" : "실전투자"} />
                          <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 6 }}>
                            토론 라운드: {form.max_debate_rounds}회
                          </p>
                        </div>
                      </div>
                    </Section>

                    <Section title="계정">
                      <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.55, marginBottom: 10 }}>
                        현재 세션을 종료하고 로그인 화면으로 돌아갑니다. 다시 로그인하면 모든 설정이 그대로 유지됩니다.
                      </p>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await logoutUser();
                          } catch {
                            // best effort
                          }
                          clearAccessToken();
                          window.location.href = "/login";
                        }}
                        style={{
                          alignSelf: "flex-start",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 7,
                          padding: "9px 14px",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid var(--error-border)",
                          background: "var(--error-subtle)",
                          color: "var(--bear)",
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        <Icon name="logout" size={14} decorative />
                        로그아웃
                      </button>
                    </Section>
                  </>
                )}

                {activeTab === "appearance" && (
                  <>
                    <Section title="테마 모드">
                      <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.55, marginBottom: 12 }}>
                        라이트는 일반 환경에 최적화, 다크는 야간/저조도 환경에 눈의 피로를 줄입니다. 시스템을 선택하면 OS 설정을 따릅니다. 선택은 이 브라우저에 저장되어 다음 방문 시에도 유지됩니다.
                      </p>
                      <div role="radiogroup" aria-label="테마 모드" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                        {([
                          { key: "light", label: "라이트", icon: "sun" as IconName, desc: "환한 배경" },
                          { key: "dark", label: "다크", icon: "moon" as IconName, desc: "어두운 배경" },
                          { key: "system", label: "시스템", icon: "monitor" as IconName, desc: "OS 설정 따라감" },
                        ] as Array<{ key: ThemeMode; label: string; icon: IconName; desc: string }>).map((opt) => {
                          const active = themeMode === opt.key;
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              onClick={() => setThemeMode(opt.key)}
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "flex-start",
                                gap: 4,
                                padding: "12px 14px",
                                borderRadius: "var(--radius-lg)",
                                border: `1.5px solid ${active ? "var(--brand)" : "var(--border-default)"}`,
                                background: active ? "var(--brand-subtle)" : "var(--bg-elevated)",
                                color: active ? "var(--brand)" : "var(--text-primary)",
                                cursor: "pointer",
                                textAlign: "left",
                                transition: "all 150ms",
                              }}
                            >
                              <Icon name={opt.icon} size={20} decorative />
                              <span style={{ fontSize: 13, fontWeight: 700 }}>{opt.label}</span>
                              <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 500 }}>{opt.desc}</span>
                            </button>
                          );
                        })}
                      </div>
                      <div
                        style={{
                          marginTop: 12,
                          padding: "8px 12px",
                          borderRadius: "var(--radius-md)",
                          background: "var(--bg-overlay)",
                          border: "1px solid var(--border-subtle)",
                          fontSize: 11,
                          color: "var(--text-secondary)",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <Icon name={themeResolved === "dark" ? "moon" : "sun"} size={14} decorative />
                        <span>
                          현재 적용:&nbsp;
                          <strong style={{ color: "var(--text-primary)" }}>{themeResolved === "dark" ? "다크" : "라이트"}</strong>
                          {themeMode === "system" && <span style={{ color: "var(--text-tertiary)" }}> · 시스템 설정 기반</span>}
                        </span>
                      </div>
                    </Section>

                    <Section title="컬러 컨벤션 (한국 시장)">
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--bull-subtle)", border: "1px solid var(--bull-border)" }}>
                          <p style={{ fontSize: 11, fontWeight: 800, color: "var(--bull)", display: "inline-flex", alignItems: "center", gap: 5 }}>
                            <Icon name="trend-up" size={12} strokeWidth={2.4} decorative />
                            상승 — 빨강
                          </p>
                          <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }}>한국 거래소 표준</p>
                        </div>
                        <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--bear-subtle)", border: "1px solid var(--bear-border)" }}>
                          <p style={{ fontSize: 11, fontWeight: 800, color: "var(--bear)", display: "inline-flex", alignItems: "center", gap: 5 }}>
                            <Icon name="trend-down" size={12} strokeWidth={2.4} decorative />
                            하락 — 파랑
                          </p>
                          <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }}>한국 거래소 표준</p>
                        </div>
                      </div>
                    </Section>
                  </>
                )}

                {activeTab === "notifications" && <NotificationsPanel />}

                {activeTab === "llm" && (
                  <>
                    <Section title="OpenAI 연결">
                      <Field label="API 키" description="모든 에이전트 LLM 호출에 사용됩니다. 기존 키를 유지하려면 비워두고 저장하세요.">
                        <div style={{ marginBottom: 8 }}>
                          <StatusChip tone={apiKeyStatus.set ? "on" : "off"} label={apiKeyStatus.set ? `설정됨 (${apiKeyStatus.preview})` : "미설정"} />
                        </div>
                        <div style={{ position: "relative" }}>
                          <input
                            type={showKey ? "text" : "password"}
                            className="kta-no-native-reveal"
                            value={form.openai_api_key}
                            onChange={(e) => setField("openai_api_key", e.target.value)}
                            placeholder={apiKeyStatus.set ? "새 키로 교체 시에만 입력" : "sk-..."}
                            autoComplete="off"
                            style={{
                              width: "100%",
                              padding: "9px 44px 9px 12px",
                              borderRadius: 8,
                              background: "var(--bg-elevated)",
                              border: "1px solid var(--border-default)",
                              color: "var(--text-primary)",
                              fontSize: 12,
                              outline: "none",
                              boxSizing: "border-box",
                              fontFamily: "monospace",
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowKey((v) => !v)}
                            style={{
                              position: "absolute",
                              right: 10,
                              top: "50%",
                              transform: "translateY(-50%)",
                              background: "none",
                              border: "none",
                              color: "var(--text-tertiary)",
                              cursor: "pointer",
                              padding: 0,
                              display: "inline-flex",
                              alignItems: "center",
                            }}
                            aria-label={showKey ? "키 숨기기" : "키 보기"}
                          >
                            <Icon name={showKey ? "eye-off" : "eye"} size={15} decorative />
                          </button>
                        </div>
                        <HelpNote>
                          어디서 가져오나요? OpenAI 대시보드의 API Keys 메뉴에서 새 키를 발급받아 붙여넣으세요.
                        </HelpNote>
                      </Field>
                    </Section>

                    <Section title="모델">
                      <Field label="LLM 모델 (단일)" description="모든 에이전트(분석/토론/뉴스/최종판단 등)가 이 모델 하나를 사용합니다. 기본값: gpt-5.5">
                        <ModelSelect value={form.default_llm_model} onChange={(v) => setField("default_llm_model", v)} options={DEFAULT_MODELS} />
                      </Field>

                      <Field label="추론 강도" description="심층 분석 모델에 적용됩니다. High일수록 품질이 높지만 느리고 비용이 증가합니다.">
                        <div style={{ display: "flex", gap: 8, flexWrap: isCompact ? "wrap" : "nowrap" }}>
                          {EFFORT_OPTIONS.map((opt) => {
                            const active = form.reasoning_effort === opt.value;
                            return (
                              <button
                                key={opt.value}
                                onClick={() => setField("reasoning_effort", opt.value)}
                                style={{
                                  flex: isCompact ? "1 1 calc(50% - 6px)" : 1,
                                  minWidth: isCompact ? 0 : "auto",
                                  padding: "11px 8px",
                                  borderRadius: 10,
                                  border: `1.5px solid ${active ? opt.color : "var(--border-default)"}`,
                                  background: active ? `${opt.color}18` : "var(--bg-elevated)",
                                  cursor: "pointer",
                                  textAlign: "center",
                                }}
                              >
                                <p style={{ marginBottom: 4, color: active ? opt.color : "var(--text-secondary)", display: "inline-flex" }}>
                                  <Icon name={opt.icon} size={18} decorative />
                                </p>
                                <p style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, color: active ? opt.color : "var(--text-primary)" }}>{opt.label}</p>
                                <p style={{ fontSize: 9, color: "var(--text-tertiary)", lineHeight: 1.5, whiteSpace: "pre-line" }}>{opt.desc}</p>
                              </button>
                            );
                          })}
                        </div>
                      </Field>
                    </Section>
                  </>
                )}

                {activeTab === "analysis" && (
                  <>
                    <Section title="토론/분석 품질">
                      <Field
                        label="토론 라운드 수"
                        description="강세/약세 연구원 토론 횟수입니다. 많을수록 다양한 관점을 반영하지만 실행 시간이 길어집니다."
                      >
                        <div style={{ display: "flex", gap: 8 }}>
                          {([1, 2, 3, 4] as const).map((n) => {
                            const active = form.max_debate_rounds === n;
                            const tags = ["빠름", "기본", "심층", "최심층"];
                            return (
                              <button
                                key={n}
                                onClick={() => setField("max_debate_rounds", n)}
                                style={{
                                  flex: 1,
                                  padding: "12px 6px",
                                  borderRadius: 10,
                                  border: `1.5px solid ${active ? "var(--brand)" : "var(--border-default)"}`,
                                  background: active ? "rgba(49,130,246,0.12)" : "var(--bg-elevated)",
                                  cursor: "pointer",
                                }}
                              >
                                <p style={{ fontSize: 20, fontWeight: 800, lineHeight: 1, color: active ? "var(--brand)" : "var(--text-primary)" }}>{n}</p>
                                <p style={{ fontSize: 9, marginTop: 4, color: active ? "var(--brand)" : "var(--text-tertiary)" }}>{tags[n - 1]}</p>
                              </button>
                            );
                          })}
                        </div>
                      </Field>

                      <HelpNote>
                        추천값: 기본은 2회, 변동성이 큰 장세는 3회. 4회는 품질은 높지만 지연이 커집니다.
                      </HelpNote>
                    </Section>
                  </>
                )}

                {activeTab === "guru" && (
                  <>
                    <Section title="활성화">
                      <Field label="GURU 레이어" description="포트폴리오 매니저 초안에 사용자 철학과 룰 기반 정책을 최종 반영합니다.">
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "12px 14px",
                            borderRadius: 10,
                            background: "var(--bg-elevated)",
                            border: "1px solid var(--border-subtle)",
                          }}
                        >
                          <div>
                            <p style={{ fontSize: 12, fontWeight: 700, color: form.guru_enabled ? "var(--brand)" : "var(--text-secondary)" }}>
                              {form.guru_enabled ? "GURU ON" : "GURU OFF"}
                            </p>
                            <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }}>ON일 때만 GURU 토론/룰 오버라이드가 적용됩니다.</p>
                          </div>
                          <button
                            onClick={() => setField("guru_enabled", !form.guru_enabled)}
                            style={{
                              width: 48,
                              height: 26,
                              borderRadius: 99,
                              flexShrink: 0,
                              background: form.guru_enabled ? "var(--brand)" : "#555",
                              border: "none",
                              cursor: "pointer",
                              position: "relative",
                            }}
                          >
                            <motion.div
                              animate={{ x: form.guru_enabled ? 24 : 2 }}
                              transition={{ type: "spring", stiffness: 500, damping: 30 }}
                              style={{ position: "absolute", top: 3, width: 20, height: 20, borderRadius: "50%", background: "#fff" }}
                            />
                          </button>
                        </div>
                      </Field>
                    </Section>

                    <Section title="정책">
                      <Field label="투자 성향" description="GURU가 최종 결정을 해석할 때 기본적으로 어떤 렌즈를 썰지 정하는 설정. Defensive는 년장명·탐주·탁구제에 근처 이끌고 Aggressive는 점프 의용궁이 세직니다. 명확한 입장이 없으면 Balanced 권장.">
                        <select
                          value={form.guru_risk_profile}
                          onChange={(e) => setField("guru_risk_profile", e.target.value as "defensive" | "balanced" | "aggressive")}
                          style={{
                            width: "100%",
                            padding: "9px 12px",
                            borderRadius: 8,
                            background: "var(--bg-elevated)",
                            border: "1px solid var(--border-default)",
                            color: "var(--text-primary)",
                            fontSize: 12,
                            outline: "none",
                          }}
                        >
                          <option value="defensive">Defensive · 손실 방어 우선</option>
                          <option value="balanced">Balanced · 위험/수익 균형</option>
                          <option value="aggressive">Aggressive · 기회 포착 우선</option>
                        </select>
                      </Field>

                      <Field label="투자 철학 메모" description="원칙을 적으면 GURU가 최종 판단 시 문맥으로 반영합니다.">
                        <textarea
                          value={form.guru_investment_principles}
                          onChange={(e) => setField("guru_investment_principles", e.target.value.slice(0, 1200))}
                          rows={4}
                          placeholder="예: 손절 엄수, 포지션 분할, 특정 섹터 회피"
                          style={{
                            width: "100%",
                            padding: "9px 12px",
                            borderRadius: 8,
                            background: "var(--bg-elevated)",
                            border: "1px solid var(--border-default)",
                            color: "var(--text-primary)",
                            fontSize: 12,
                            outline: "none",
                            boxSizing: "border-box",
                            resize: "vertical",
                            lineHeight: 1.6,
                          }}
                        />
                      </Field>

                      <Field label="룰 임계값" description="이 세 값이 AI의 결정을 '구속'합니다. 신뢰도가 기준 미만이면 도면 BUY/SELL 신호여도 강제로 HOLD로 바뀌고, 포지션이 상한을 넘어서면 자동으로 쇼이고, 렌즈가 허용 레벨을 초과하면 거부됩니다.">
                        <div style={{ display: "grid", gridTemplateColumns: isCompact ? "1fr" : "1fr 1fr", gap: 8 }}>
                          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>최소 행동 신뢰도 (%)</span>
                            <span style={{ fontSize: 9, color: "var(--text-quaternary)" }}>이 미만이면 강제로 HOLD. 권장: 60~75</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={1}
                              value={Math.round(form.guru_min_confidence_to_act * 100)}
                              onChange={(e) => {
                                const v = Number(e.target.value || 0);
                                setField("guru_min_confidence_to_act", Math.max(0, Math.min(1, v / 100)));
                              }}
                              style={{
                                width: "100%",
                                padding: "8px 10px",
                                borderRadius: 8,
                                background: "var(--bg-elevated)",
                                border: "1px solid var(--border-default)",
                                color: "var(--text-primary)",
                                fontSize: 12,
                                outline: "none",
                                boxSizing: "border-box",
                              }}
                            />
                          </label>

                          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>최대 포지션 (%)</span>
                            <span style={{ fontSize: 9, color: "var(--text-quaternary)" }}>한 종목에 전체 자산의 최대 몇 % 투입할지. 넘으면 자동 축소.</span>
                            <input
                              type="number"
                              min={1}
                              max={100}
                              step={0.5}
                              value={form.guru_max_position_pct}
                              onChange={(e) => setField("guru_max_position_pct", Math.max(1, Math.min(100, Number(e.target.value || 1))))}
                              style={{
                                width: "100%",
                                padding: "8px 10px",
                                borderRadius: 8,
                                background: "var(--bg-elevated)",
                                border: "1px solid var(--border-default)",
                                color: "var(--text-primary)",
                                fontSize: 12,
                                outline: "none",
                                boxSizing: "border-box",
                              }}
                            />
                          </label>

                          <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: isCompact ? "auto" : "1 / -1" }}>
                            <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>허용 최대 리스크 레벨</span>
                            <span style={{ fontSize: 9, color: "var(--text-quaternary)" }}>AI가 평가한 렌즈가 이 레벨을 넘으면 거래 거부. LOW=안정, CRITICAL=대부분 허용.</span>
                            <select
                              value={form.guru_max_risk_level}
                              onChange={(e) => setField("guru_max_risk_level", e.target.value as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL")}
                              style={{
                                width: "100%",
                                padding: "8px 10px",
                                borderRadius: 8,
                                background: "var(--bg-elevated)",
                                border: "1px solid var(--border-default)",
                                color: "var(--text-primary)",
                                fontSize: 12,
                                outline: "none",
                              }}
                            >
                              <option value="LOW">LOW · 안전한 결정만 허용</option>
                              <option value="MEDIUM">MEDIUM · 적당한 렌즈까지 허용</option>
                              <option value="HIGH">HIGH · 높은 렌즈도 허용</option>
                              <option value="CRITICAL">CRITICAL · 제한 없이 허용</option>
                            </select>
                          </label>
                        </div>
                      </Field>

                      <Field label="GURU 동작 옵션" description="토론 기반 보정과 사용자 최종 승인 강제를 제어합니다.">
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <button
                            onClick={() => setField("guru_debate_enabled", !form.guru_debate_enabled)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              width: "100%",
                              padding: "10px 12px",
                              borderRadius: 10,
                              border: "1px solid var(--border-default)",
                              background: "var(--bg-elevated)",
                              color: "var(--text-primary)",
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                          >
                            <span style={{ fontSize: 11, fontWeight: 700 }}>GURU 토론(LLM) 사용</span>
                            <span style={{ fontSize: 10, color: form.guru_debate_enabled ? "var(--success)" : "var(--text-tertiary)" }}>
                              {form.guru_debate_enabled ? "ON" : "OFF"}
                            </span>
                          </button>

                          <button
                            onClick={() => setField("guru_require_user_confirmation", !form.guru_require_user_confirmation)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              width: "100%",
                              padding: "10px 12px",
                              borderRadius: 10,
                              border: "1px solid var(--border-default)",
                              background: "var(--bg-elevated)",
                              color: "var(--text-primary)",
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                          >
                            <span style={{ fontSize: 11, fontWeight: 700 }}>BUY/SELL 사용자 최종 실행 승인 강제</span>
                            <span style={{ fontSize: 10, color: form.guru_require_user_confirmation ? "var(--warning)" : "var(--text-tertiary)" }}>
                              {form.guru_require_user_confirmation ? "ON" : "OFF"}
                            </span>
                          </button>
                        </div>
                      </Field>
                    </Section>
                  </>
                )}

                {activeTab === "kis" && (
                  <>
                    {/* KIS 토큰 발급 Stepper (P3.K6 + S4) */}
                    <Section title="KIS 연동 시작 가이드">
                      <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: "14px 16px" }}>
                        <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 10 }}>
                          처음이라면 아래 4단계를 순서대로 따라 하세요. 모의투자는 키 없이도 작동하지만, 실거래는 모든 단계가 필요합니다.
                        </p>
                        <ol style={{ paddingLeft: 0, listStyle: "none", margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                          {[
                            {
                              n: 1, title: "KIS Developers 가입",
                              body: "한국투자증권 OPEN API Developers에 가입하고 로그인합니다.",
                              link: { url: "https://apiportal.koreainvestment.com/", label: "apiportal.koreainvestment.com →" },
                            },
                            {
                              n: 2, title: "앱 등록 → AppKey/AppSecret 발급",
                              body: "Developers 대시보드에서 새 앱을 등록하면 AppKey, AppSecret 두 값이 발급됩니다.",
                              link: { url: "https://apiportal.koreainvestment.com/howto-use", label: "발급 가이드 →" },
                            },
                            {
                              n: 3, title: "계좌번호 확인",
                              body: "본인 계좌번호 8자리(예: 5012345601). 위탁 가능 계좌만 사용 가능.",
                            },
                            {
                              n: 4, title: "아래 [인증 정보] 입력 후 [저장] → [연결 테스트]",
                              body: "값을 저장하면 자동으로 토큰이 발급되고, 거래 탭에서 잔고가 조회되면 성공입니다.",
                            },
                          ].map((s) => (
                            <li key={s.n} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                              <div style={{
                                flexShrink: 0, width: 26, height: 26, borderRadius: 99,
                                background: "var(--brand-active)", color: "#fff",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 12, fontWeight: 800,
                              }}>
                                {s.n}
                              </div>
                              <div style={{ flex: 1 }}>
                                <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 2 }}>{s.title}</p>
                                <p style={{ fontSize: 10, color: "var(--text-tertiary)", lineHeight: 1.5 }}>{s.body}</p>
                                {s.link && (
                                  <a
                                    href={s.link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ fontSize: 10, color: "var(--brand-active)", marginTop: 3, display: "inline-block", fontWeight: 600 }}
                                  >
                                    {s.link.label}
                                  </a>
                                )}
                              </div>
                            </li>
                          ))}
                        </ol>
                      </div>
                    </Section>

                    <Section title="거래 모드">
                      <Field label="KIS 투자 모드" description="모의투자는 가상 계좌, 실투자는 실제 계좌를 사용합니다.">
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "12px 14px",
                            borderRadius: 10,
                            background: "var(--bg-elevated)",
                            border: "1px solid var(--border-subtle)",
                          }}
                        >
                          <div>
                            <p style={{ fontSize: 12, fontWeight: 700, color: form.kis_mock ? "var(--success)" : "var(--bear)" }}>
                              {form.kis_mock ? "모의투자 (안전)" : "실전투자 (주의)"}
                            </p>
                            <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }}>
                              {form.kis_mock ? "가상 체결 - 자금 위험 없음" : "실제 체결 - 실계좌 주문 발생"}
                            </p>
                          </div>
                          <button
                            onClick={() => setField("kis_mock", !form.kis_mock)}
                            style={{
                              width: 48,
                              height: 26,
                              borderRadius: 99,
                              flexShrink: 0,
                              background: form.kis_mock ? "var(--success)" : "#555",
                              border: "none",
                              cursor: "pointer",
                              position: "relative",
                            }}
                          >
                            <motion.div
                              animate={{ x: form.kis_mock ? 24 : 2 }}
                              transition={{ type: "spring", stiffness: 500, damping: 30 }}
                              style={{ position: "absolute", top: 3, width: 20, height: 20, borderRadius: "50%", background: "#fff" }}
                            />
                          </button>
                        </div>
                        <HelpNote>
                          실전투자 모드에서는 계좌/키가 정확하지 않으면 주문 승인/실행 API가 실패할 수 있습니다.
                        </HelpNote>
                      </Field>
                    </Section>

                    <Section title="KIS 인증 정보">
                      <Field label="App Key" description="KIS OpenAPI 포털에서 발급받는 앱 키입니다. 변경 시에만 입력하세요.">
                        <div style={{ marginBottom: 8 }}>
                          <StatusChip tone={kisKeyStatus.appKeySet ? "on" : "off"} label={kisKeyStatus.appKeySet ? "설정됨" : "미설정"} />
                        </div>
                        <input
                          type="text"
                          value={form.kis_app_key}
                          onChange={(e) => setField("kis_app_key", e.target.value)}
                          placeholder={kisKeyStatus.appKeySet ? "새 키로 교체 시에만 입력" : "PS..."}
                          autoComplete="off"
                          style={{
                            width: "100%",
                            padding: "9px 12px",
                            borderRadius: 8,
                            background: "var(--bg-elevated)",
                            border: "1px solid var(--border-default)",
                            color: "var(--text-primary)",
                            fontSize: 12,
                            outline: "none",
                            boxSizing: "border-box",
                            fontFamily: "monospace",
                          }}
                        />
                      </Field>

                      <Field label="App Secret" description="KIS OpenAPI 포털에서 발급받는 시크릿 키입니다. 변경 시에만 입력하세요.">
                        <div style={{ marginBottom: 8 }}>
                          <StatusChip tone={kisKeyStatus.secretSet ? "on" : "off"} label={kisKeyStatus.secretSet ? "설정됨" : "미설정"} />
                        </div>
                        <div style={{ position: "relative" }}>
                          <input
                            type={showKisSecret ? "text" : "password"}
                            className="kta-no-native-reveal"
                            value={form.kis_app_secret}
                            onChange={(e) => setField("kis_app_secret", e.target.value)}
                            placeholder={kisKeyStatus.secretSet ? "새 시크릿으로 교체 시에만 입력" : "..."}
                            autoComplete="off"
                            style={{
                              width: "100%",
                              padding: "9px 44px 9px 12px",
                              borderRadius: 8,
                              background: "var(--bg-elevated)",
                              border: "1px solid var(--border-default)",
                              color: "var(--text-primary)",
                              fontSize: 12,
                              outline: "none",
                              boxSizing: "border-box",
                              fontFamily: "monospace",
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowKisSecret((v) => !v)}
                            style={{
                              position: "absolute",
                              right: 10,
                              top: "50%",
                              transform: "translateY(-50%)",
                              background: "none",
                              border: "none",
                              color: "var(--text-tertiary)",
                              cursor: "pointer",
                              padding: 0,
                              display: "inline-flex",
                              alignItems: "center",
                            }}
                            aria-label={showKisSecret ? "시크릿 숨기기" : "시크릿 보기"}
                          >
                            <Icon name={showKisSecret ? "eye-off" : "eye"} size={15} decorative />
                          </button>
                        </div>
                      </Field>

                      <Field label="계좌번호" description="예: 12345678-01 형식. 없으면 주문/잔고 조회가 실패합니다.">
                        <div style={{ marginBottom: 8 }}>
                          <StatusChip tone={kisKeyStatus.accountNo ? "on" : "off"} label={kisKeyStatus.accountNo || "미설정"} />
                        </div>
                        <input
                          type="text"
                          value={form.kis_account_no}
                          onChange={(e) => setField("kis_account_no", e.target.value)}
                          placeholder="12345678-01"
                          maxLength={12}
                          style={{
                            width: "100%",
                            padding: "9px 12px",
                            borderRadius: 8,
                            background: "var(--bg-elevated)",
                            border: "1px solid var(--border-default)",
                            color: "var(--text-primary)",
                            fontSize: 13,
                            outline: "none",
                            boxSizing: "border-box",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        />
                      </Field>

                      <HelpNote>
                        어디서 가져오나요? 한국투자증권 KIS 개발자센터에서 App Key/App Secret을 발급받고,
                        HTS/MTS 계좌의 종합 계좌번호를 입력하세요.
                      </HelpNote>
                    </Section>
                  </>
                )}

                {activeTab === "invites" && userRole === "master" && (
                  <>
                    <Section title="새 초대 코드 발급">
                      <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.55, marginBottom: 10 }}>
                        회원가입에는 초대 코드가 1개씩 필요합니다. 발급된 코드는 1명만 사용할 수 있고, 사용 즉시 자동으로 소진됩니다.
                      </p>
                      <Field label="권한" description="이 코드를 사용해 가입하는 사용자에게 부여될 권한입니다.">
                        <div style={{ display: "flex", gap: 8 }}>
                          {(["viewer", "trader", "master"] as UserRole[]).map((r) => {
                            const active = inviteForm.role === r;
                            const labelKor = r === "viewer" ? "관전자" : r === "trader" ? "트레이더" : "마스터";
                            return (
                              <button
                                key={r}
                                type="button"
                                onClick={() => setInviteForm((prev) => ({ ...prev, role: r }))}
                                style={{
                                  flex: 1,
                                  padding: "9px 10px",
                                  borderRadius: 10,
                                  border: `1.5px solid ${active ? "var(--brand)" : "var(--border-default)"}`,
                                  background: active ? "var(--brand-subtle)" : "var(--bg-elevated)",
                                  color: active ? "var(--brand)" : "var(--text-primary)",
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                {labelKor}
                                <span style={{ display: "block", fontSize: 9, fontWeight: 500, color: "var(--text-tertiary)", marginTop: 2 }}>
                                  {r}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </Field>

                      <Field label="메모 (선택)" description="누구에게 줄 코드인지, 언제까지 유효한지 등을 자유롭게 적어두세요.">
                        <input
                          type="text"
                          value={inviteForm.note}
                          onChange={(e) => setInviteForm((prev) => ({ ...prev, note: e.target.value }))}
                          placeholder="예: 5월 베타테스터 김XX"
                          maxLength={200}
                          style={{
                            width: "100%",
                            padding: "9px 12px",
                            borderRadius: 8,
                            background: "var(--bg-elevated)",
                            border: "1px solid var(--border-default)",
                            color: "var(--text-primary)",
                            fontSize: 13,
                            outline: "none",
                            boxSizing: "border-box",
                          }}
                        />
                      </Field>

                      <button
                        type="button"
                        onClick={handleCreateInvite}
                        disabled={inviteBusy}
                        style={{
                          alignSelf: "flex-start",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 7,
                          padding: "9px 14px",
                          borderRadius: "var(--radius-md)",
                          border: "none",
                          background: inviteBusy ? "var(--bg-elevated)" : "var(--brand)",
                          color: inviteBusy ? "var(--text-tertiary)" : "#fff",
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: inviteBusy ? "not-allowed" : "pointer",
                        }}
                      >
                        <Icon name="key" size={14} decorative />
                        {inviteBusy ? "발급 중..." : "초대 코드 발급"}
                      </button>

                      {invitesError && (
                        <p style={{ fontSize: 11, color: "var(--bear)", fontWeight: 600 }}>{invitesError}</p>
                      )}
                    </Section>

                    <Section title={`발급된 초대 코드 (${invites.length})`}>
                      {invitesLoading && (
                        <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>불러오는 중…</p>
                      )}
                      {!invitesLoading && invites.length === 0 && (
                        <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                          아직 발급된 초대 코드가 없습니다. 위에서 새로 발급해보세요.
                        </p>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {invites.map((inv) => {
                          const used = !!inv.used_by;
                          const revoked = !!inv.revoked;
                          const status = revoked ? "폐기됨" : used ? "사용됨" : "미사용";
                          const tone: ChipTone = revoked ? "warn" : used ? "info" : "on";
                          const usedByLabel = inv.used_by_user
                            ? inv.used_by_user.username || inv.used_by_user.email
                            : "";
                          return (
                            <div
                              key={inv.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                padding: "10px 12px",
                                borderRadius: 10,
                                background: "var(--bg-elevated)",
                                border: "1px solid var(--border-subtle)",
                              }}
                            >
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                                  <span
                                    style={{
                                      fontFamily: "monospace",
                                      fontSize: 14,
                                      fontWeight: 700,
                                      color: "var(--text-primary)",
                                      letterSpacing: "0.05em",
                                    }}
                                  >
                                    {inv.code}
                                  </span>
                                  <StatusChip tone={tone} label={status} />
                                  <StatusChip tone="info" label={inv.role} />
                                </div>
                                <p style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                                  {inv.note || "메모 없음"}
                                  {used && usedByLabel && <> · 사용: {usedByLabel}</>}
                                  {inv.created_at && <> · 발급: {new Date(inv.created_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}</>}
                                </p>
                              </div>
                              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                                <button
                                  type="button"
                                  onClick={() => handleCopyCode(inv.code)}
                                  title="코드 복사"
                                  style={{
                                    padding: "6px 10px",
                                    borderRadius: 8,
                                    border: "1px solid var(--border-default)",
                                    background: "var(--bg-surface)",
                                    color: "var(--text-secondary)",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                  }}
                                >
                                  <Icon name={copiedCode === inv.code ? "check-circle" : "key"} size={12} decorative />
                                  {copiedCode === inv.code ? "복사됨" : "복사"}
                                </button>
                                {!used && !revoked && (
                                  <button
                                    type="button"
                                    onClick={() => handleRevokeInvite(inv.id)}
                                    title="코드 폐기"
                                    style={{
                                      padding: "6px 10px",
                                      borderRadius: 8,
                                      border: "1px solid var(--error-border)",
                                      background: "var(--error-subtle)",
                                      color: "var(--bear)",
                                      fontSize: 11,
                                      fontWeight: 600,
                                      cursor: "pointer",
                                    }}
                                  >
                                    폐기
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Section>
                  </>
                )}
              </div>
            </div>

            <div
              style={{
                padding: "12px 18px 16px",
                borderTop: "1px solid var(--border-subtle)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                flexShrink: 0,
              }}
            >
              {saveStatus !== "idle" && (
                <motion.p
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textAlign: "center",
                    color: saveStatus === "ok" ? "var(--success)" : "var(--bear)",
                  }}
                >
                  {saveStatus === "ok" ? "설정이 저장되었습니다 (즉시 적용)" : "저장 실패 - 백엔드 연결을 확인하세요"}
                </motion.p>
              )}

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={onClose}
                  style={{
                    flex: 1,
                    padding: 10,
                    borderRadius: 10,
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-secondary)",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  닫기
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    flex: 2,
                    padding: 10,
                    borderRadius: 10,
                    background: saving ? "var(--bg-elevated)" : "var(--brand)",
                    border: "none",
                    color: saving ? "var(--text-tertiary)" : "#fff",
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  {saving ? "저장 중..." : "저장"}
                </button>
              </div>
            </div>
    </Sheet>
  );
}

// ─────────────────────────────────────────────
// MS-F F5 — 알림 (브라우저 푸시 + 인앱 토스트 규칙)
// ─────────────────────────────────────────────
function NotificationsPanel() {
  const rules = usePersonalization((s) => s.notificationRules);
  const addRule = usePersonalization((s) => s.addNotificationRule);
  const removeRule = usePersonalization((s) => s.removeNotificationRule);
  const toggleRule = usePersonalization((s) => s.toggleNotificationRule);
  const updateRule = usePersonalization((s) => s.updateNotificationRule);
  const permission = usePersonalization((s) => s.notificationsPermission);
  const setPermission = usePersonalization((s) => s.setNotificationsPermission);

  const handleRequestPermission = async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
  };

  const addPreset = (preset: "bull-90" | "bear-strong" | "risk-warning") => {
    const presets: Record<typeof preset, { name: string; conditions: NotificationCondition[] }> = {
      "bull-90": {
        name: "강한 매수 신호 (신뢰도 90%+)",
        conditions: [{ kind: "signal", signal: "bull" }, { kind: "confidence-min", min: 0.9 }],
      },
      "bear-strong": {
        name: "강한 매도 신호 (신뢰도 80%+)",
        conditions: [{ kind: "signal", signal: "bear" }, { kind: "confidence-min", min: 0.8 }],
      },
      "risk-warning": {
        name: "리스크 경고",
        conditions: [{ kind: "signal", signal: "risk" }],
      },
    };
    const p = presets[preset];
    addRule({
      name: p.name,
      enabled: true,
      conditions: p.conditions,
      channels: { toast: true, browser: permission === "granted" },
    });
  };

  return (
    <>
      <Section title="브라우저 알림 권한">
        <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.55, marginBottom: 10 }}>
          탭이 백그라운드에 있어도 새 결정·위험 신호를 OS 알림으로 받습니다. 인앱 토스트는 권한 없이도 작동합니다.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              padding: "3px 9px",
              borderRadius: 99,
              fontSize: 11,
              fontWeight: 700,
              background: permission === "granted" ? "var(--success-subtle)" : permission === "denied" ? "var(--bear-subtle)" : "var(--bg-overlay)",
              color: permission === "granted" ? "var(--success)" : permission === "denied" ? "var(--bear)" : "var(--text-tertiary)",
            }}
          >
            {permission === "granted" ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="check" size={11} decorative /> 허용됨</span>
            ) : permission === "denied" ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="x" size={11} decorative /> 차단됨</span>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>· 미설정</span>
            )}
          </span>
          {permission !== "granted" && (
            <button
              type="button"
              onClick={handleRequestPermission}
              disabled={permission === "denied"}
              title={permission === "denied" ? "브라우저 설정에서 직접 허용해야 합니다" : ""}
              style={{
                padding: "5px 12px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--brand-border)",
                background: "var(--brand)",
                color: "var(--text-inverse)",
                fontSize: 11,
                fontWeight: 700,
                cursor: permission === "denied" ? "not-allowed" : "pointer",
                opacity: permission === "denied" ? 0.5 : 1,
              }}
            >
              권한 요청
            </button>
          )}
        </div>
      </Section>

      <Section title="알림 규칙">
        <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.55, marginBottom: 10 }}>
          새 thought가 도착할 때마다 활성 규칙을 평가합니다 (모든 조건이 매치되어야 발화).
        </p>

        {rules.length === 0 ? (
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-overlay)",
              border: "1px dashed var(--border-default)",
              color: "var(--text-tertiary)",
              fontSize: 12,
              textAlign: "center",
            }}
          >
            아직 알림 규칙이 없습니다. 아래 프리셋을 추가해 보세요.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rules.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-elevated)",
                  border: `1px solid ${r.enabled ? "var(--brand-border)" : "var(--border-subtle)"}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => toggleRule(r.id)}
                    aria-pressed={r.enabled}
                    title={r.enabled ? "비활성화" : "활성화"}
                    style={{
                      width: 36,
                      height: 20,
                      borderRadius: 99,
                      border: "none",
                      background: r.enabled ? "var(--brand)" : "var(--bg-overlay)",
                      position: "relative",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: 2,
                        left: r.enabled ? 18 : 2,
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        background: "white",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                        transition: "left 150ms",
                      }}
                    />
                  </button>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{r.name}</span>
                  <button
                    type="button"
                    onClick={() => removeRule(r.id)}
                    aria-label="규칙 삭제"
                    style={{
                      padding: "2px 6px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-subtle)",
                      background: "transparent",
                      color: "var(--text-tertiary)",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    ×
                  </button>
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", paddingLeft: 44 }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--text-secondary)", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={r.channels.toast}
                      onChange={(e) =>
                        updateRule(r.id, { channels: { ...r.channels, toast: e.target.checked } })
                      }
                    />
                    인앱 토스트
                  </label>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--text-secondary)", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={r.channels.browser}
                      onChange={(e) =>
                        updateRule(r.id, { channels: { ...r.channels, browser: e.target.checked } })
                      }
                      disabled={permission !== "granted"}
                    />
                    브라우저 푸시{permission !== "granted" && " (권한 필요)"}
                  </label>
                </div>
                <div style={{ paddingLeft: 44, fontSize: 10, color: "var(--text-tertiary)" }}>
                  조건: {r.conditions.map((c) => formatCondition(c)).join(" + ")}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          <p style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            프리셋 추가
          </p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => addPreset("bull-90")}
              style={presetBtnStyle("var(--bull)", "var(--bull-border)")}
            >
              + 강한 매수 (90%+)
            </button>
            <button
              type="button"
              onClick={() => addPreset("bear-strong")}
              style={presetBtnStyle("var(--bear)", "var(--bear-border)")}
            >
              + 강한 매도 (80%+)
            </button>
            <button
              type="button"
              onClick={() => addPreset("risk-warning")}
              style={presetBtnStyle("var(--warning)", "var(--warning-border)")}
            >
              + 리스크 경고
            </button>
          </div>
        </div>
      </Section>
    </>
  );
}

function presetBtnStyle(color: string, border: string): React.CSSProperties {
  return {
    padding: "6px 12px",
    borderRadius: "var(--radius-md)",
    border: `1px solid ${border}`,
    background: "transparent",
    color,
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
  };
}

function formatCondition(c: NotificationCondition): string {
  switch (c.kind) {
    case "signal":
      return `신호=${c.signal === "bull" ? "매수" : c.signal === "bear" ? "매도" : "위험"}`;
    case "confidence-min":
      return `신뢰도≥${Math.round(c.min * 100)}%`;
    case "role":
      return `역할=${AGENT_LABEL[c.role]}`;
    case "status":
      return `상태=${c.status}`;
    default:
      return "?";
  }
}
