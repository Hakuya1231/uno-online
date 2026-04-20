import type { Metadata } from "next";
import "./globals.css";
import { AuthBootstrap } from "./_components/AuthBootstrap";

export const metadata: Metadata = {
  title: "UNO Online",
  description: "UNO 在线联机",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <AuthBootstrap />
        {children}
      </body>
    </html>
  );
}
