import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/contexts/AuthContext";
import { AIGenerationProvider } from "@/contexts/AIGenerationContext";
import PasswordResetHandler from "@/components/PasswordResetHandler";
import { AppDialogRoot } from "@/components/ui/AppDialog";
import ServiceWorkerRegistrar from "@/components/PWA/ServiceWorkerRegistrar";
import AIGenerationFloating from "@/components/marketing/AIGenerationFloating";
import UpdatePrompt from "@/components/PWA/UpdatePrompt";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://hi-clinic.co.kr'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: '클리닉 매니저 - 치과 업무 관리 시스템',
    template: '%s | 클리닉 매니저',
  },
  description: '치과 데스크 업무를 효율적이고 체계적으로 관리하는 스마트 솔루션. 근태관리, 게시판, 급여명세서, 업무 체크리스트를 한 곳에서.',
  keywords: ['치과', '업무관리', '근태관리', '클리닉매니저', '하얀치과', '대시보드', '병원관리'],
  authors: [{ name: '하얀치과' }],
  creator: '하얀치과',
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: SITE_URL,
    siteName: '클리닉 매니저',
    title: '클리닉 매니저 - 치과 업무 관리 시스템',
    description: '치과 데스크 업무를 효율적이고 체계적으로 관리하는 스마트 솔루션',
  },
  twitter: {
    card: 'summary',
    title: '클리닉 매니저 - 치과 업무 관리 시스템',
    description: '치과 데스크 업무를 효율적이고 체계적으로 관리하는 스마트 솔루션',
  },
  robots: {
    index: true,
    follow: true,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '클리닉 매니저',
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/apple-touch-icon.png',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
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
          <AIGenerationProvider>
            <ServiceWorkerRegistrar />
            <UpdatePrompt autoReloadDelay={30000} />
            <PasswordResetHandler />
            {children}
            <AIGenerationFloating />
            <AppDialogRoot />
          </AIGenerationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
