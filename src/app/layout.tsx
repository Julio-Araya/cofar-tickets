import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tickets Cofar",
  description: "Sistema de tickets de soporte interno",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full bg-white text-gray-900">{children}</body>
    </html>
  );
}
