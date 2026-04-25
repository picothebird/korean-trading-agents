import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/components/ui/ThemeProvider";

export const metadata: Metadata = {
  title: "KTA · 한국 트레이딩 에이전트",
  description: "한국 주식을 위한 AI 멀티에이전트 트레이딩 워크스페이스 — 분석, 토론, 결정을 하나의 콘솔에서.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // lang="ko" enables correct CJK rendering and hyphenation.
    // data-theme is set by THEME_INIT_SCRIPT (head) before first paint to avoid FOUC,
    // and synchronized at runtime by ThemeProvider via localStorage('kta:theme').
    <html lang="ko" className="h-full" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body
        className="min-h-full flex flex-col antialiased"
        style={{ fontFamily: "var(--font-sans)", background: "var(--bg-canvas)", color: "var(--text-primary)" }}
      >
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
