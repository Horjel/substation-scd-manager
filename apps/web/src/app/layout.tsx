import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Substation SCD Manager", template: "%s · Substation SCD Manager" },
  description: "Gestión versionada de configuraciones y generación SCD asíncrona simulada.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es" data-scroll-behavior="smooth">
      <body>
        <header className="site-header">
          <Link className="brand" href="/"><span className="brand-mark">SC</span><span>Substation <b>SCD Manager</b></span></Link>
          <nav aria-label="Navegación principal"><Link href="/">Proyecto</Link><Link className="nav-cta" href="/substations">Subestaciones</Link></nav>
        </header>
        {children}
        <footer className="site-footer"><span>Foundation 001 · Desarrollo guiado por especificaciones</span><span>SCD simulado · No conforme con IEC 61850</span></footer>
      </body>
    </html>
  );
}
