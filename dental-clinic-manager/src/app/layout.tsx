import type { Metadata } from "next";
import { AuthProvider } from "@/contexts/AuthContext";
import PasswordResetHandler from "@/components/PasswordResetHandler";
import "./globals.css";

export const metadata: Metadata = {
  title: "클리닉 매니저 - 치과 업무 관리 시스템",
  description: "치과 데스크 업무를 효율적이고 체계적으로 관리하는 스마트 솔루션",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased font-sans">
        <AuthProvider>
          <PasswordResetHandler />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
