// frontend/src/components/ui/index.ts
// Light-edition UI primitives. No external deps.
// See docs/UI_REDESIGN_LIGHT.md §5 for design rationale.

export { Surface } from "./Surface";
export { Stat } from "./Stat";
export { Pill } from "./Pill";
export { Hint } from "./Hint";
export { Empty } from "./Empty";
export { Skeleton } from "./Skeleton";
export { Toast, ToastProvider, useToast } from "./Toast";
export { Sheet } from "./Sheet";
export { Dialog } from "./Dialog";
export { TabPills } from "./TabPills";
export { Button } from "./Button";
export { Coachmark, OnboardingTour, type CoachStep } from "./Coachmark";
export { BrandMark, BrandLockup } from "./BrandMark";
export { ThemeProvider, useTheme, THEME_INIT_SCRIPT, type ThemeMode, type ResolvedTheme } from "./ThemeProvider";
export { Icon, type IconName } from "./Icon";
export { Tooltip, type TooltipProps } from "./Tooltip";
