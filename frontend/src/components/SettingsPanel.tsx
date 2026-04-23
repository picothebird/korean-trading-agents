"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getSettings, updateSettings } from "@/lib/api";

// ── 모델 목록 ────────────────────────────────────────────────────
const DEFAULT_MODELS = [
  { value: "gpt-5.4",   label: "GPT-5.4",   desc: "최신 · 심층 추론 (권장)" },
  { value: "o4-mini",   label: "o4-mini",   desc: "빠른 추론 모델" },
  { value: "o3",        label: "o3",        desc: "강력한 추론" },
  { value: "o1",        label: "o1",        desc: "고급 추론 특화" },
];

const FAST_MODELS = [
  { value: "gpt-5.4-mini", label: "GPT-5.4 mini", desc: "경량 · 빠른 응답 (권장)" },
  { value: "gpt-4o-mini",  label: "GPT-4o mini",  desc: "저비용 · 안정적" },
  { value: "gpt-4o",       label: "GPT-4o",       desc: "균형잡힌 성능" },
];

const EFFORT_OPTIONS = [
  { value: "high",   label: "High",   desc: "깊은 추론\n최고 품질",  icon: "🧠", color: "#3182F6" },
  { value: "medium", label: "Medium", desc: "균형 분석\n속도 타협",  icon: "⚖️", color: "#F5A623" },
  { value: "low",    label: "Low",    desc: "빠른 판단\n저비용",    icon: "⚡", color: "#2FCA73" },
] as const;

// ── 서브 컴포넌트 ─────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <p style={{
        fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)",
        textTransform: "uppercase", letterSpacing: "0.1em",
        marginBottom: 16, borderBottom: "1px solid var(--border-subtle)", paddingBottom: 8,
      }}>
        {title}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, description, children }: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginBottom: 3 }}>{label}</p>
        {description && (
          <p style={{ fontSize: 10, color: "var(--text-tertiary)", lineHeight: 1.6 }}>{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

function ModelSelect({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; desc: string }[];
}) {
  const isCustom = !options.find(o => o.value === value);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ position: "relative" }}>
        <select
          value={isCustom ? "__custom__" : value}
          onChange={(e) => {
            if (e.target.value !== "__custom__") onChange(e.target.value);
          }}
          style={{
            width: "100%", padding: "9px 32px 9px 12px",
            borderRadius: 8,
            background: "var(--bg-elevated)", border: "1px solid var(--border-default)",
            color: "var(--text-primary)", fontSize: 12, outline: "none", cursor: "pointer",
            appearance: "none", WebkitAppearance: "none",
          }}
        >
          {options.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}  —  {o.desc}
            </option>
          ))}
          <option value="__custom__">✏️  직접 입력...</option>
        </select>
        <span style={{
          position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
          color: "var(--text-tertiary)", fontSize: 10, pointerEvents: "none",
        }}>▼</span>
      </div>

      {isCustom && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="모델명 직접 입력 (예: gpt-5, o4)"
          style={{
            width: "100%", padding: "9px 12px", borderRadius: 8,
            background: "var(--bg-elevated)", border: "1px solid var(--brand)",
            color: "var(--text-primary)", fontSize: 11, outline: "none",
            boxSizing: "border-box", fontFamily: "var(--font-mono, monospace)",
          }}
        />
      )}
    </div>
  );
}

// ── 메인 패널 ─────────────────────────────────────────────────────
interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [form, setForm] = useState({
    openai_api_key: "",
    default_llm_model: "gpt-5.4",
    fast_llm_model: "gpt-5.4-mini",
    reasoning_effort: "high" as "high" | "medium" | "low",
    max_debate_rounds: 2,
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

  // 패널 열릴 때 현재 설정 로드
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
        setForm(prev => ({
          ...prev,
          default_llm_model: s.default_llm_model,
          fast_llm_model: s.fast_llm_model,
          reasoning_effort: s.reasoning_effort,
          max_debate_rounds: s.max_debate_rounds,
          kis_mock: s.kis_mock,
          kis_account_no: s.kis_account_no ?? "",
        }));
      })
      .catch(() => {});
  }, [open]);

  const set = (key: string, val: unknown) =>
    setForm(prev => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus("idle");
    try {
      await updateSettings(form);
      setSaveStatus("ok");
      if (form.openai_api_key) {
        setApiKeyStatus({ set: true, preview: `sk-...${form.openai_api_key.slice(-4)}` });
        setForm(prev => ({ ...prev, openai_api_key: "" }));
      }
      if (form.kis_app_key) {
        setKisKeyStatus(prev => ({ ...prev, appKeySet: true }));
        setForm(prev => ({ ...prev, kis_app_key: "" }));
      }
      if (form.kis_app_secret) {
        setKisKeyStatus(prev => ({ ...prev, secretSet: true }));
        setForm(prev => ({ ...prev, kis_app_secret: "" }));
      }
      if (form.kis_account_no) {
        setKisKeyStatus(prev => ({ ...prev, accountNo: form.kis_account_no }));
      }
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch {
      setSaveStatus("err");
    } finally {
      setSaving(false);
    }
  };

  const SPRING = { ease: [0.16, 1, 0.3, 1] as const, duration: 0.35 };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* 오버레이 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: "fixed", inset: 0, zIndex: 200,
              background: "rgba(12,13,16,0.65)", backdropFilter: "blur(4px)",
            }}
          />

          {/* 패널 */}
          <motion.div
            initial={{ x: 440 }}
            animate={{ x: 0 }}
            exit={{ x: 440 }}
            transition={SPRING}
            style={{
              position: "fixed", top: 0, right: 0, bottom: 0, width: 420, zIndex: 201,
              background: "var(--bg-surface)", borderLeft: "1px solid var(--border-default)",
              display: "flex", flexDirection: "column",
              boxShadow: "-12px 0 48px rgba(0,0,0,0.5)",
            }}
          >
            {/* 헤더 */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "20px 24px", borderBottom: "1px solid var(--border-subtle)",
              flexShrink: 0,
            }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>⚙️ 설정</p>
                <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }}>
                  API 키 · LLM 모델 · 분석 파라미터
                </p>
              </div>
              <button
                onClick={onClose}
                style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
                  color: "var(--text-secondary)", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                }}
              >
                ×
              </button>
            </div>

            {/* 스크롤 가능한 본문 */}
            <div style={{ flex: 1, overflowY: "auto", padding: "24px 24px 8px" }}>

              {/* ── OpenAI 연결 ── */}
              <Section title="OpenAI 연결">
                <Field
                  label="API 키"
                  description="모든 에이전트 LLM 호출에 사용됩니다. 변경 시에만 입력하세요."
                >
                  {/* 현재 키 상태 뱃지 */}
                  {apiKeyStatus.set ? (
                    <div style={{
                      display: "inline-flex", alignItems: "center", gap: 5, marginBottom: 8,
                      padding: "4px 10px", borderRadius: 20,
                      background: "rgba(47,202,115,0.12)", border: "1px solid rgba(47,202,115,0.3)",
                    }}>
                      <span style={{ fontSize: 9 }}>●</span>
                      <span style={{ fontSize: 10, color: "var(--success)", fontWeight: 600 }}>
                        설정됨 — {apiKeyStatus.preview}
                      </span>
                    </div>
                  ) : (
                    <div style={{
                      display: "inline-flex", alignItems: "center", gap: 5, marginBottom: 8,
                      padding: "4px 10px", borderRadius: 20,
                      background: "rgba(255,95,95,0.12)", border: "1px solid rgba(255,95,95,0.3)",
                    }}>
                      <span style={{ fontSize: 9, color: "var(--bear)" }}>●</span>
                      <span style={{ fontSize: 10, color: "var(--bear)", fontWeight: 600 }}>미설정</span>
                    </div>
                  )}

                  {/* 키 입력 */}
                  <div style={{ position: "relative" }}>
                    <input
                      type={showKey ? "text" : "password"}
                      value={form.openai_api_key}
                      onChange={(e) => set("openai_api_key", e.target.value)}
                      placeholder={apiKeyStatus.set ? "새 키로 교체 시에만 입력" : "sk-..."}
                      autoComplete="off"
                      style={{
                        width: "100%", padding: "9px 44px 9px 12px", borderRadius: 8,
                        background: "var(--bg-elevated)", border: "1px solid var(--border-default)",
                        color: "var(--text-primary)", fontSize: 12, outline: "none",
                        boxSizing: "border-box", fontFamily: "monospace",
                      }}
                    />
                    <button
                      onClick={() => setShowKey(v => !v)}
                      style={{
                        position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                        background: "none", border: "none", color: "var(--text-tertiary)",
                        cursor: "pointer", fontSize: 14, padding: 0,
                      }}
                    >
                      {showKey ? "🙈" : "👁"}
                    </button>
                  </div>
                </Field>
              </Section>

              {/* ── LLM 모델 ── */}
              <Section title="LLM 모델 설정">
                <Field
                  label="심층 분석 모델"
                  description="기술적 분석 · 리스크 관리 · 최종 투자 판단에 사용됩니다. Reasoning 지원 모델(gpt-5*, o-series)을 권장합니다."
                >
                  <ModelSelect
                    value={form.default_llm_model}
                    onChange={(v) => set("default_llm_model", v)}
                    options={DEFAULT_MODELS}
                  />
                </Field>

                <Field
                  label="빠른 호출 모델"
                  description="뉴스 감성 분석 · 매크로 분석 · 강세/약세 토론에 사용됩니다. Reasoning 불필요, 속도 우선."
                >
                  <ModelSelect
                    value={form.fast_llm_model}
                    onChange={(v) => set("fast_llm_model", v)}
                    options={FAST_MODELS}
                  />
                </Field>

                <Field
                  label="추론 강도 (Reasoning Effort)"
                  description="심층 분석 모델에만 적용됩니다. High는 더 정확하지만 느리고 비용이 높습니다."
                >
                  <div style={{ display: "flex", gap: 8 }}>
                    {EFFORT_OPTIONS.map((opt) => {
                      const isActive = form.reasoning_effort === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => set("reasoning_effort", opt.value)}
                          style={{
                            flex: 1, padding: "12px 8px", borderRadius: 10,
                            border: `1.5px solid ${isActive ? opt.color : "var(--border-default)"}`,
                            background: isActive ? `${opt.color}18` : "var(--bg-elevated)",
                            cursor: "pointer", textAlign: "center", transition: "all 150ms",
                          }}
                        >
                          <p style={{ fontSize: 18, marginBottom: 4 }}>{opt.icon}</p>
                          <p style={{
                            fontSize: 11, fontWeight: 700, marginBottom: 4,
                            color: isActive ? opt.color : "var(--text-primary)",
                          }}>
                            {opt.label}
                          </p>
                          <p style={{
                            fontSize: 9, color: "var(--text-tertiary)", lineHeight: 1.5,
                            whiteSpace: "pre-line",
                          }}>
                            {opt.desc}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </Section>

              {/* ── 분석 파라미터 ── */}
              <Section title="분석 파라미터">
                <Field
                  label="토론 라운드 수"
                  description="강세/약세 연구원 간 토론 반복 횟수. 많을수록 균형 잡힌 분석이 되지만 시간이 더 걸립니다."
                >
                  <div style={{ display: "flex", gap: 8 }}>
                    {([1, 2, 3, 4] as const).map((n) => {
                      const isActive = form.max_debate_rounds === n;
                      const tags = ["빠름", "기본", "심층", "최심층"];
                      return (
                        <button
                          key={n}
                          onClick={() => set("max_debate_rounds", n)}
                          style={{
                            flex: 1, padding: "12px 6px", borderRadius: 10,
                            border: `1.5px solid ${isActive ? "var(--brand)" : "var(--border-default)"}`,
                            background: isActive ? "rgba(49,130,246,0.12)" : "var(--bg-elevated)",
                            cursor: "pointer", textAlign: "center", transition: "all 150ms",
                          }}
                        >
                          <p style={{
                            fontSize: 20, fontWeight: 800, lineHeight: 1,
                            color: isActive ? "var(--brand)" : "var(--text-primary)",
                          }}>
                            {n}
                          </p>
                          <p style={{
                            fontSize: 9, marginTop: 4,
                            color: isActive ? "var(--brand)" : "var(--text-tertiary)",
                          }}>
                            {tags[n - 1]}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </Field>

                <Field
                  label="KIS 투자 모드"
                  description="한국투자증권 API 사용 시 거래 모드를 설정합니다. 모의투자는 가상 계좌, 실투자는 실제 계좌를 사용합니다."
                >
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 14px", borderRadius: 10,
                    background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
                  }}>
                    <div>
                      <p style={{
                        fontSize: 12, fontWeight: 700,
                        color: form.kis_mock ? "var(--success)" : "var(--bear)",
                      }}>
                        {form.kis_mock ? "🟢 모의투자 (안전)" : "🔴 실투자 (주의)"}
                      </p>
                      <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }}>
                        {form.kis_mock
                          ? "가상 계좌 — 실제 자금 위험 없음"
                          : "실제 계좌 — 실제 거래 발생"}
                      </p>
                    </div>
                    {/* 토글 버튼 */}
                    <button
                      onClick={() => set("kis_mock", !form.kis_mock)}
                      style={{
                        width: 48, height: 26, borderRadius: 99, flexShrink: 0,
                        background: form.kis_mock ? "var(--success)" : "#555",
                        border: "none", cursor: "pointer", position: "relative",
                        transition: "background 200ms",
                      }}
                    >
                      <motion.div
                        animate={{ x: form.kis_mock ? 24 : 2 }}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        style={{
                          position: "absolute", top: 3, width: 20, height: 20,
                          borderRadius: "50%", background: "#fff",
                        }}
                      />
                    </button>
                  </div>
                </Field>
              </Section>

              {/* ── KIS API 자격증명 ── */}
              <Section title="KIS OpenAPI 자격증명">
                <Field
                  label="App Key"
                  description="한국투자증권 KIS OpenAPI에서 발급받은 앱 키입니다. 변경 시에만 입력하세요."
                >
                  {kisKeyStatus.appKeySet && (
                    <div style={{
                      display: "inline-flex", alignItems: "center", gap: 5, marginBottom: 8,
                      padding: "4px 10px", borderRadius: 20,
                      background: "rgba(47,202,115,0.12)", border: "1px solid rgba(47,202,115,0.3)",
                    }}>
                      <span style={{ fontSize: 9, color: "var(--success)" }}>●</span>
                      <span style={{ fontSize: 10, color: "var(--success)", fontWeight: 600 }}>설정됨</span>
                    </div>
                  )}
                  <input
                    type="text"
                    value={form.kis_app_key}
                    onChange={(e) => set("kis_app_key", e.target.value)}
                    placeholder={kisKeyStatus.appKeySet ? "새 키로 교체 시에만 입력" : "PS..."}
                    autoComplete="off"
                    style={{
                      width: "100%", padding: "9px 12px", borderRadius: 8,
                      background: "var(--bg-elevated)", border: "1px solid var(--border-default)",
                      color: "var(--text-primary)", fontSize: 12, outline: "none",
                      boxSizing: "border-box", fontFamily: "monospace",
                    }}
                  />
                </Field>

                <Field
                  label="App Secret"
                  description="앱 시크릿 키입니다. 변경 시에만 입력하세요."
                >
                  {kisKeyStatus.secretSet && (
                    <div style={{
                      display: "inline-flex", alignItems: "center", gap: 5, marginBottom: 8,
                      padding: "4px 10px", borderRadius: 20,
                      background: "rgba(47,202,115,0.12)", border: "1px solid rgba(47,202,115,0.3)",
                    }}>
                      <span style={{ fontSize: 9, color: "var(--success)" }}>●</span>
                      <span style={{ fontSize: 10, color: "var(--success)", fontWeight: 600 }}>설정됨</span>
                    </div>
                  )}
                  <div style={{ position: "relative" }}>
                    <input
                      type={showKisSecret ? "text" : "password"}
                      value={form.kis_app_secret}
                      onChange={(e) => set("kis_app_secret", e.target.value)}
                      placeholder={kisKeyStatus.secretSet ? "새 시크릿으로 교체 시에만 입력" : "..."}
                      autoComplete="off"
                      style={{
                        width: "100%", padding: "9px 44px 9px 12px", borderRadius: 8,
                        background: "var(--bg-elevated)", border: "1px solid var(--border-default)",
                        color: "var(--text-primary)", fontSize: 12, outline: "none",
                        boxSizing: "border-box", fontFamily: "monospace",
                      }}
                    />
                    <button
                      onClick={() => setShowKisSecret(v => !v)}
                      style={{
                        position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                        background: "none", border: "none", color: "var(--text-tertiary)",
                        cursor: "pointer", fontSize: 14, padding: 0,
                      }}
                    >
                      {showKisSecret ? "🙈" : "👁"}
                    </button>
                  </div>
                </Field>

                <Field
                  label="계좌번호"
                  description="종합 계좌번호 (예: 12345678-01). 앞 8자리-뒤 2자리 형식으로 입력하세요."
                >
                  {kisKeyStatus.accountNo && (
                    <div style={{
                      display: "inline-flex", alignItems: "center", gap: 5, marginBottom: 8,
                      padding: "4px 10px", borderRadius: 20,
                      background: "rgba(47,202,115,0.12)", border: "1px solid rgba(47,202,115,0.3)",
                    }}>
                      <span style={{ fontSize: 9, color: "var(--success)" }}>●</span>
                      <span style={{ fontSize: 10, color: "var(--success)", fontWeight: 600 }}>
                        {kisKeyStatus.accountNo}
                      </span>
                    </div>
                  )}
                  <input
                    type="text"
                    value={form.kis_account_no}
                    onChange={(e) => set("kis_account_no", e.target.value)}
                    placeholder="12345678-01"
                    maxLength={12}
                    style={{
                      width: "100%", padding: "9px 12px", borderRadius: 8,
                      background: "var(--bg-elevated)", border: "1px solid var(--border-default)",
                      color: "var(--text-primary)", fontSize: 13, outline: "none",
                      boxSizing: "border-box", fontVariantNumeric: "tabular-nums",
                    }}
                  />
                </Field>
              </Section>

            </div>

            {/* 푸터 */}
            <div style={{
              padding: "16px 24px 20px", borderTop: "1px solid var(--border-subtle)",
              display: "flex", flexDirection: "column", gap: 10, flexShrink: 0,
            }}>
              {saveStatus !== "idle" && (
                <motion.p
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    fontSize: 11, fontWeight: 600, textAlign: "center",
                    color: saveStatus === "ok" ? "var(--success)" : "var(--bear)",
                  }}
                >
                  {saveStatus === "ok"
                    ? "✓ 설정이 저장되었습니다 (즉시 적용)"
                    : "✗ 저장 실패 — 백엔드 연결을 확인하세요"}
                </motion.p>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={onClose}
                  style={{
                    flex: 1, padding: 10, borderRadius: 10,
                    background: "var(--bg-elevated)", border: "1px solid var(--border-default)",
                    color: "var(--text-secondary)", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  닫기
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    flex: 2, padding: 10, borderRadius: 10,
                    background: saving ? "var(--bg-elevated)" : "var(--brand)",
                    border: "none",
                    color: saving ? "var(--text-tertiary)" : "#fff",
                    fontSize: 13, fontWeight: 700,
                    cursor: saving ? "not-allowed" : "pointer",
                    transition: "all 150ms",
                  }}
                >
                  {saving ? "저장 중..." : "저장"}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
