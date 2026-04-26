/**
 * CameraSystem — fit/free/follow 모드 + 자동 포커스 + 사용자 입력 가드
 * (v2 plan §C Phase 1, B-3/B-4/B-13 회피).
 *
 * 모드:
 *  - "fit": 월드 전체를 화면에 담는다. resize 시 자동 재계산.
 *  - "free": 사용자가 줌/팬한 상태 그대로 둔다. resize 시 카메라 변경 X.
 *  - "follow": 특정 월드 좌표를 부드럽게 추적. wheel/drag 발생 시 8초간 일시
 *    중지(manualOverrideUntil).
 *
 * 사용자 입력(휠/드래그)이 들어오면 모드가 무엇이든 `manualOverrideUntil`을
 * `now + manualHoldMs`로 갱신. follow에서는 그동안 추적이 멎고, focus 명령도
 * 무시된다. fit에서는 사용자가 줌하는 즉시 free로 강등.
 *
 * reduced-motion: prefers-reduced-motion이 reduce이면 tween 시간 0 (즉시 setScroll).
 */

import type Phaser from "phaser";
import { computeFitZoom, type WorldMetrics } from "./WorldMetrics";

export type CameraMode = "fit" | "free" | "follow";

export interface CameraSystemOptions {
  manualHoldMs?: number;
  followTweenMs?: number;
  fitZoomMin?: number;
  fitZoomMax?: number;
  fitPadding?: number;
}

export class CameraSystem {
  private mode: CameraMode = "fit";
  private followTarget: { x: number; y: number } | null = null;
  private manualOverrideUntil = 0;
  private readonly opts: Required<CameraSystemOptions>;
  private currentTween: Phaser.Tweens.Tween | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private getMetrics: () => WorldMetrics,
    options: CameraSystemOptions = {},
  ) {
    this.opts = {
      manualHoldMs: options.manualHoldMs ?? 8000,
      followTweenMs: options.followTweenMs ?? 600,
      fitZoomMin: options.fitZoomMin ?? 0.25,
      fitZoomMax: options.fitZoomMax ?? 4,
      fitPadding: options.fitPadding ?? 8,
    };
  }

  getMode(): CameraMode {
    return this.mode;
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
    if (mode === "fit") {
      this.applyFit();
    }
  }

  /** 사용자 휠/드래그가 일어났음을 알림 — 자동 카메라를 일시 정지. */
  notifyManualInput(): void {
    this.manualOverrideUntil = this.scene.time.now + this.opts.manualHoldMs;
    if (this.mode === "fit") {
      this.mode = "free";
    }
    this.cancelTween();
  }

  isManuallyHeld(): boolean {
    return this.scene.time.now < this.manualOverrideUntil;
  }

  /** 모드별 동작. follow에서는 추적, fit에서는 fit 재계산. */
  update(): void {
    if (this.isManuallyHeld()) return;
    if (this.mode === "follow" && this.followTarget) {
      const cam = this.scene.cameras.main;
      const tx = this.followTarget.x;
      const ty = this.followTarget.y;
      const dx = tx - (cam.scrollX + cam.width / cam.zoom / 2);
      const dy = ty - (cam.scrollY + cam.height / cam.zoom / 2);
      const distSq = dx * dx + dy * dy;
      if (distSq < 1) return;
      // 부드러운 lerp
      cam.setScroll(
        cam.scrollX + dx * 0.08,
        cam.scrollY + dy * 0.08,
      );
    }
  }

  /** Phaser scale resize 핸들러. fit 모드일 때만 재계산. */
  onResize(): void {
    if (this.mode === "fit" && !this.isManuallyHeld()) {
      this.applyFit();
    }
    // free / follow에서는 의도적으로 카메라 변경 없음 — 사용자 시점 보존.
    // 단, bounds는 항상 갱신해 월드 외 스크롤 방지.
    this.applyBounds();
  }

  /** 월드 전체를 화면에 담도록 줌과 스크롤을 강제. */
  applyFit(): void {
    const metrics = this.getMetrics();
    const cam = this.scene.cameras.main;
    this.applyBounds();
    const zoom = computeFitZoom(metrics, cam.width, cam.height, {
      padding: this.opts.fitPadding,
      max: this.opts.fitZoomMax,
      min: this.opts.fitZoomMin,
    });
    cam.setZoom(zoom);
    cam.centerOn(metrics.centerX, metrics.centerY);
  }

  /** 액터/좌표 추적. follow 모드로 자동 전환. */
  focus(worldX: number, worldY: number, opts?: { instant?: boolean }): void {
    if (this.isManuallyHeld()) return;
    this.followTarget = { x: worldX, y: worldY };
    this.mode = "follow";
    this.applyBounds();
    if (opts?.instant || this.prefersReducedMotion()) {
      this.scene.cameras.main.centerOn(worldX, worldY);
      return;
    }
    this.cancelTween();
    const cam = this.scene.cameras.main;
    const targetScrollX = worldX - cam.width / cam.zoom / 2;
    const targetScrollY = worldY - cam.height / cam.zoom / 2;
    this.currentTween = this.scene.tweens.add({
      targets: cam,
      scrollX: targetScrollX,
      scrollY: targetScrollY,
      duration: this.opts.followTweenMs,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.currentTween = null;
      },
    });
  }

  /** 외부 좌표로 즉시 이동(미니맵 클릭 등). */
  panTo(worldX: number, worldY: number): void {
    this.applyBounds();
    this.scene.cameras.main.centerOn(worldX, worldY);
  }

  /**
   * 월드 직사각형(rect)을 화면에 fit. follow 모드로 전환.
   *  - 기본으로는 manual hold 중이면 무시.
   *  - opts.force=true이면 hold를 강제 좀 해제하고 포커스 (stage 전환 용).
   */
  focusRect(
    rect: { x: number; y: number; w: number; h: number },
    opts?: { instant?: boolean; padding?: number; force?: boolean },
  ): void {
    if (this.isManuallyHeld() && !opts?.force) return;
    if (opts?.force) {
      // 자동 stage 포커스는 manual hold보다 우선 — hold 해제 후 재설정.
      this.manualOverrideUntil = 0;
    }
    const cam = this.scene.cameras.main;
    const padding = opts?.padding ?? this.opts.fitPadding;
    const availW = Math.max(1, cam.width - padding * 2);
    const availH = Math.max(1, cam.height - padding * 2);
    const zoom = Math.min(
      this.opts.fitZoomMax,
      Math.max(this.opts.fitZoomMin, Math.min(availW / rect.w, availH / rect.h)),
    );
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    this.followTarget = { x: cx, y: cy };
    this.mode = "follow";
    this.applyBounds();
    if (opts?.instant || this.prefersReducedMotion()) {
      cam.setZoom(zoom);
      cam.centerOn(cx, cy);
      return;
    }
    this.cancelTween();
    const targetScrollX = cx - cam.width / zoom / 2;
    const targetScrollY = cy - cam.height / zoom / 2;
    this.currentTween = this.scene.tweens.add({
      targets: cam,
      scrollX: targetScrollX,
      scrollY: targetScrollY,
      zoom,
      duration: this.opts.followTweenMs,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.currentTween = null;
      },
    });
  }

  /** 줌 입력. fit이면 free로 강등, manual hold 갱신. */
  zoomBy(delta: number, min: number, max: number): void {
    const cam = this.scene.cameras.main;
    const next = Math.min(max, Math.max(min, cam.zoom + delta));
    cam.setZoom(Math.round(next * 10) / 10);
    this.notifyManualInput();
  }

  reset(): void {
    this.cancelTween();
    this.followTarget = null;
    this.manualOverrideUntil = 0;
    this.setMode("fit");
  }

  private applyBounds(): void {
    const m = this.getMetrics();
    this.scene.cameras.main.setBounds(0, 0, m.worldWidth, m.worldHeight);
  }

  private cancelTween(): void {
    if (this.currentTween) {
      this.currentTween.stop();
      this.currentTween = null;
    }
  }

  private prefersReducedMotion(): boolean {
    if (typeof window === "undefined") return false;
    try {
      return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    } catch {
      return false;
    }
  }
}
