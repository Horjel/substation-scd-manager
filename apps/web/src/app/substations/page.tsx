import type { Metadata } from "next";
import Link from "next/link";
import { createPrismaClient, listSubstations } from "@substation/db";
import { NewSubstationForm } from "../../components/NewSubstationForm";

export const metadata: Metadata = { title: "Subestaciones" };
export const dynamic = "force-dynamic";

export default async function SubstationsPage() {
  const db = createPrismaClient();
  const substations = await listSubstations(db).finally(() => db.$disconnect());
  return (
    <main className="page-shell">
      <header className="page-heading"><div><p className="eyebrow">Workspace</p><h1>Subestaciones</h1><p>Gestiona activos y sus revisiones de configuración desde una única vista.</p></div><span className="record-count">{substations.length} {substations.length === 1 ? "registro" : "registros"}</span></header>
      <div className="workspace-grid">
        <section className="panel" aria-labelledby="list-heading">
          <div className="panel-heading"><div><p className="overline">Inventario</p><h2 id="list-heading">Activos configurados</h2></div></div>
          {substations.length === 0 ? <div className="empty"><span>∿</span><h3>Tu workspace está vacío</h3><p>Crea la primera subestación para comenzar el recorrido.</p></div> : (
            <div className="substation-list">
              {substations.map((substation) => <Link className="substation-card" href={`/substations/${substation.id}`} key={substation.id}><div className="asset-icon">SE</div><div className="asset-copy"><strong>{substation.name}</strong><p>{substation.description ?? "Sin descripción"}</p><small>{substation.revisionCount} {substation.revisionCount === 1 ? "revisión" : "revisiones"}{substation.latestRevisionVersion ? ` · vigente v${substation.latestRevisionVersion}` : ""}</small></div><span className="arrow">→</span></Link>)}
            </div>
          )}
        </section>
        <aside><NewSubstationForm /></aside>
      </div>
    </main>
  );
}
