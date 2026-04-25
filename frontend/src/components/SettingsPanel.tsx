"use client";

import { useState, useEffect, type ReactNode } from "react";
import { motion } from "framer-motion";
import { getSettings, updateSettings } from "@/lib/api";
import { Sheet, useTheme, type ThemeMode } from "@/components/ui";

export type SettingsTab = "overview" | "appearance" | "llm" | "analysis" | "guru" | "kis";

const DEFAULT_MODELS = [
  { value: "gpt-5", label: "GPT-5", desc: "기본 추천 · 심층 추론" },
  { value: "gpt-5.4", label: "GPT-5.4", desc: "최신 · 심층 추론" },
  { value: "o4-mini", label: "o4-mini", desc: "빠른 추론 모델" },
  { value: "o3", label: "o3", desc: "강력한 추론" },
  { value: "o1", label: "o1", desc: "고급 추론 특화" },
];

const FAST_MODELS = [
  { value: "gpt-5-mini", label: "GPT-5 mini", desc: "기본 추천 · 경량 응답" },
  { value: "gpt-5.4-mini", label: "GPT-5.4 mini", desc: "경량 · 빠른 응답" },
  { value: "gpt-4o-mini", label: "GPT-4o mini", desc: "저비용 · 안정적" },
  { value: "gpt-4o", label: "GPT-4o", desc: "균형잡힌 성능" },
];

const EFFORT_OPTIONS = [
  { value: "high", label: "High", desc: "깊은 추론\n최고 품질", icon: "🧠", color: "#3182F6" },
  { value: "medium", label: "Medium", desc: "균형 분석\n속도 타협", icon: "⚖️", color: "#F5A623" },
  { value: "low", label: "Low", desc: "빠른 판단\n저비용", icon: "⚡", color: "#2FCA73" },
] as const;

const TABS: Array<{ key: SettingsTab; label: string; icon: string; hint: string }> = [
  { key: "overview", label: "개요", icon: "🧭", hint: "현재 상태와 빠른 진입" },
  { key: "appearance", label: "외관", icon: "🎨", hint: "테마 (라이트/다크/시스템)" },
  { key: "llm", label: "LLM", icon: "🧠", hint: "OpenAI 키와 모델" },
  { key: "analysis", label: "분석", icon: "📊", hint: "토론 라운드/분석 강도" },
  { key: "guru", label: "GURU", icon: "🧙", hint: "최종 정책 레이어" },
  { key: "kis", label: "KIS", icon: "💳", hint: "실전/모의 + 인증정보" },
];

const TAB_TITLE: Record<SettingsTab, string> = {
  overview: "설정 개요",
  appearance: "외관",
  llm: "LLM 설정",
  analysis: "분석 파라미터",
  guru: "GURU 정책",
  kis: "KIS 연동",
};

interface SettingsForm {
  openai_api_key: string;
  default_llm_model: string;
  fast_llm_model: string;
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

function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 10,
        fontWeight: 700,
        padding: "4px 10px",
        borderRadius: 99,
        background: ok ? "rgba(47,202,115,0.12)" : "rgba(240,68,82,0.12)",
        border: `1px solid ${ok ? "rgba(47,202,115,0.35)" : "rgba(240,68,82,0.35)"}`,
        color: ok ? "var(--success)" : "var(--bear)",
      }}
    >
      <span style={{ fontSize: 8 }}>●</span>
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
            fontSize: 10,
            pointerEvents: "none",
          }}
        >
          ▼
        </span>
      </div>

      {isCustom && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="예: gpt-5, o4-mini"
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
      )}
    </div>
  );
}

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
}

export function SettingsPanel({ open, onClose, initialTab = "overview" }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [isCompact, setIsCompact] = useState(false);
  const { mode: themeMode, resolved: themeResolved, setMode: setThemeMode } = useTheme();
  const [form, setForm] = useState<SettingsForm>({
    openai_api_key: "",
    default_llm_model: "gpt-5",
    fast_llm_model: "gpt-5-mini",
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

  useEffect(() => {
    if (!open) return;
    setActiveTab(initialTab);
  }, [open, initialTab]);

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
          default_llm_model: s.default_llm_model,
          fast_llm_model: s.fast_llm_model,
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
      await updateSettings(form);
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
                      <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>
                        {tab.icon} {tab.label}
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
                          <StatusChip ok={apiKeyStatus.set} label={apiKeyStatus.set ? `설정됨 ${apiKeyStatus.preview ? `(${apiKeyStatus.preview})` : ""}` : "미설정"} />
                        </div>

                        <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: "10px 12px" }}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>KIS 인증 상태</p>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <StatusChip ok={kisKeyStatus.appKeySet} label="App Key" />
                            <StatusChip ok={kisKeyStatus.secretSet} label="App Secret" />
                            <StatusChip ok={Boolean(kisKeyStatus.accountNo)} label="계좌번호" />
                          </div>
                        </div>

                        <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: "10px 12px" }}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>GURU 정책</p>
                          <StatusChip ok={form.guru_enabled} label={form.guru_enabled ? "GURU ON" : "GURU OFF"} />
                          <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 6 }}>
                            승인 강제: {form.guru_require_user_confirmation ? "ON" : "OFF"}
                          </p>
                        </div>

                        <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: "10px 12px" }}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>KIS 거래 모드</p>
                          <StatusChip ok={form.kis_mock} label={form.kis_mock ? "모의투자" : "실전투자"} />
                          <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 6 }}>
                            토론 라운드: {form.max_debate_rounds}회
                          </p>
                        </div>
                      </div>
                    </Section>

                    <Section title="빠른 이동">
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {TABS.filter((x) => x.key !== "overview").map((x) => (
                          <button
                            key={x.key}
                            onClick={() => setActiveTab(x.key)}
                            style={{
                              borderRadius: 99,
                              border: "1px solid var(--border-default)",
                              background: "var(--bg-elevated)",
                              color: "var(--text-secondary)",
                              fontSize: 11,
                              fontWeight: 600,
                              padding: "6px 11px",
                              cursor: "pointer",
                            }}
                          >
                            {x.icon} {x.label} 열기
                          </button>
                        ))}
                      </div>
                      <HelpNote>
                        팁: 화면 곳곳의 설정 버튼은 이 팝업을 열되, 해당 맥락의 탭(예: KIS 영역에서는 KIS 탭)으로 바로 이동합니다.
                      </HelpNote>
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
                          { key: "light", label: "라이트", icon: "☀️", desc: "환한 배경" },
                          { key: "dark", label: "다크", icon: "🌙", desc: "어두운 배경" },
                          { key: "system", label: "시스템", icon: "🖥️", desc: "OS 설정 따라감" },
                        ] as Array<{ key: ThemeMode; label: string; icon: string; desc: string }>).map((opt) => {
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
                              <span style={{ fontSize: 20, lineHeight: 1 }}>{opt.icon}</span>
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
                        <span style={{ fontSize: 14 }}>{themeResolved === "dark" ? "🌙" : "☀️"}</span>
                        <span>
                          현재 적용:&nbsp;
                          <strong style={{ color: "var(--text-primary)" }}>
                            {themeResolved === "dark" ? "다크" : "라이트"}
                          </strong>
                          {themeMode === "system" && <span style={{ color: "var(--text-tertiary)" }}> · 시스템 설정 기반</span>}
                        </span>
                      </div>
                    </Section>

                    <Section title="컬러 컨벤션 (한국 시장)">
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--bull-subtle)", border: "1px solid var(--bull-border)" }}>
                          <p style={{ fontSize: 11, fontWeight: 800, color: "var(--bull)" }}>▲ 상승 — 빨강</p>
                          <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }}>한국 거래소 표준</p>
                        </div>
                        <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--bear-subtle)", border: "1px solid var(--bear-border)" }}>
                          <p style={{ fontSize: 11, fontWeight: 800, color: "var(--bear)" }}>▼ 하락 — 파랑</p>
                          <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }}>한국 거래소 표준</p>
                        </div>
                      </div>
                    </Section>
                  </>
                )}

                {activeTab === "llm" && (
                  <>
                    <Section title="OpenAI 연결">
                      <Field label="API 키" description="모든 에이전트 LLM 호출에 사용됩니다. 기존 키를 유지하려면 비워두고 저장하세요.">
                        <div style={{ marginBottom: 8 }}>
                          <StatusChip ok={apiKeyStatus.set} label={apiKeyStatus.set ? `설정됨 (${apiKeyStatus.preview})` : "미설정"} />
                        </div>
                        <div style={{ position: "relative" }}>
                          <input
                            type={showKey ? "text" : "password"}
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
                              fontSize: 14,
                            }}
                          >
                            {showKey ? "🙈" : "👁"}
                          </button>
                        </div>
                        <HelpNote>
                          어디서 가져오나요? OpenAI 대시보드의 API Keys 메뉴에서 새 키를 발급받아 붙여넣으세요.
                        </HelpNote>
                      </Field>
                    </Section>

                    <Section title="모델">
                      <Field label="심층 분석 모델" description="기술/리스크/최종판단에 사용됩니다. reasoning 지원 모델(gpt-5, o-series)을 권장합니다.">
                        <ModelSelect value={form.default_llm_model} onChange={(v) => setField("default_llm_model", v)} options={DEFAULT_MODELS} />
                      </Field>

                      <Field label="빠른 호출 모델" description="뉴스 감성/매크로/토론 단계에 사용됩니다. 속도와 비용이 중요합니다.">
                        <ModelSelect value={form.fast_llm_model} onChange={(v) => setField("fast_llm_model", v)} options={FAST_MODELS} />
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
                                <p style={{ fontSize: 18, marginBottom: 4 }}>{opt.icon}</p>
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
                      <Field label="투자 성향" description="GURU가 결정을 해석하는 기본 프레임입니다.">
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

                      <Field label="룰 임계값" description="신뢰도·리스크·포지션 상한으로 자동 HOLD/축소를 적용합니다.">
                        <div style={{ display: "grid", gridTemplateColumns: isCompact ? "1fr" : "1fr 1fr", gap: 8 }}>
                          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>최소 행동 신뢰도 (%)</span>
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
                              <option value="LOW">LOW</option>
                              <option value="MEDIUM">MEDIUM</option>
                              <option value="HIGH">HIGH</option>
                              <option value="CRITICAL">CRITICAL</option>
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
                          <StatusChip ok={kisKeyStatus.appKeySet} label={kisKeyStatus.appKeySet ? "설정됨" : "미설정"} />
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
                          <StatusChip ok={kisKeyStatus.secretSet} label={kisKeyStatus.secretSet ? "설정됨" : "미설정"} />
                        </div>
                        <div style={{ position: "relative" }}>
                          <input
                            type={showKisSecret ? "text" : "password"}
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
                              fontSize: 14,
                            }}
                          >
                            {showKisSecret ? "🙈" : "👁"}
                          </button>
                        </div>
                      </Field>

                      <Field label="계좌번호" description="예: 12345678-01 형식. 없으면 주문/잔고 조회가 실패합니다.">
                        <div style={{ marginBottom: 8 }}>
                          <StatusChip ok={Boolean(kisKeyStatus.accountNo)} label={kisKeyStatus.accountNo || "미설정"} />
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
