import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import { AuthProvider } from "@/contexts/AuthContext";
import PasswordResetHandler from "@/components/PasswordResetHandler";
import "./globals.css";

const notoSansKR = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "덴탈매니저 - 치과 업무 관리 시스템",
  description: "치과 데스크 업무를 효율적이고 체계적으로 관리하는 스마트 솔루션",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${notoSansKR.variable} antialiased font-sans`}
      >
        <AuthProvider>
          <PasswordResetHandler />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
