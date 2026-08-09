import type { Metadata, Viewport } from "next";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "핀지도",
  description: "지도에 핀을 꽂고 친구와 같이 여행 계획을 세우는 앱",
  applicationName: "핀지도",
  appleWebApp: {
    capable: true,
    title: "핀지도",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f5f2ee",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
