import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DUPR 批次查詢",
  description: "登入自己的 DUPR 帳號，一次查詢多位球員的 DUPR 分數",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
