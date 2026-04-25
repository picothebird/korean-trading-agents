/**
 * sfx.ts — MS10 Web Audio 합성 사운드 (외부 자산 무의존)
 *
 * 결정: Howler/외부 mp3 대신 Web Audio API로 짧은 "삐"/"팁" 톤을 합성.
 * 라이선스/저작권 검토 불필요, 0KB 추가, 클릭 응답성 1ms.
 *
 * 사용:
 *   import { playSfx } from './sfx';
 *   playSfx('click');
 *   setSfxEnabled(false); // 음소거
 *
 * 무음 SSR-safe: window 미존재 시 no-op.
 */

type SfxName = "click" | "select" | "thought" | "done" | "fanfare";

let ctx: AudioContext | null = null;
let enabled = true;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    type WebkitWindow = Window & {
      webkitAudioContext?: typeof AudioContext;
    };
    const w = window as WebkitWindow;
    const Ctor = window.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  return ctx;
}

interface ToneSpec {
  freq: number;
  duration: number; // s
  type: OscillatorType;
  gain: number;
}

const SFX: Record<SfxName, ToneSpec[]> = {
  // 액터 클릭 — 두 톤 짧게 (UI 클릭 느낌)
  click: [
    { freq: 880, duration: 0.04, type: "triangle", gain: 0.12 },
    { freq: 1320, duration: 0.05, type: "triangle", gain: 0.1 },
  ],
  // 선택 (예: 패널 오픈) — 단일 톤
  select: [{ freq: 660, duration: 0.08, type: "sine", gain: 0.12 }],
  // 사고 발화 — 매우 작은 틱
  thought: [{ freq: 1760, duration: 0.025, type: "sine", gain: 0.05 }],
  // 완료 — 두 음 상승 (긍정 종료)
  done: [
    { freq: 660, duration: 0.07, type: "triangle", gain: 0.13 },
    { freq: 990, duration: 0.09, type: "triangle", gain: 0.13 },
  ],
  // 최종 결정 팡파레 — 3 음 상승 (도-미-솔 비슷, 의식적 종결감)
  fanfare: [
    { freq: 523.25, duration: 0.12, type: "triangle", gain: 0.16 }, // C5
    { freq: 659.25, duration: 0.12, type: "triangle", gain: 0.16 }, // E5
    { freq: 783.99, duration: 0.22, type: "triangle", gain: 0.18 }, // G5
  ],
};

export function playSfx(name: SfxName): void {
  if (!enabled) return;
  const audio = getCtx();
  if (!audio) return;
  const tones = SFX[name];
  let when = audio.currentTime;
  for (const t of tones) {
    const osc = audio.createOscillator();
    const g = audio.createGain();
    osc.type = t.type;
    osc.frequency.value = t.freq;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(t.gain, when + 0.005);
    g.gain.linearRampToValueAtTime(0, when + t.duration);
    osc.connect(g).connect(audio.destination);
    osc.start(when);
    osc.stop(when + t.duration + 0.02);
    when += t.duration;
  }
}

export function setSfxEnabled(v: boolean): void {
  enabled = v;
}

export function isSfxEnabled(): boolean {
  return enabled;
}
