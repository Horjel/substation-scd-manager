import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvalidIdentifierError, SubstationNotFoundError, createPrismaClient, getSubstationDetail } from "@substation/db";
import { GenerationPanel } from "../../../components/GenerationPanel";
import { RevisionForm } from "../../../components/RevisionForm";
import type { GenerationDto } from "../../../lib/contracts";

export const metadata: Metadata = { title: "Detalle de subestación" };
export const dynamic = "force-dynamic";

async function loadSubstation(id: string) {
  const db = createPrismaClient();
  try { return await getSubstationDetail(db, id); }
  catch (error) { if (error instanceof InvalidIdentifierError || error instanceof SubstationNotFoundError) notFound(); throw error; }
  finally { await db.$disconnect(); }
}

export default async function SubstationDetailPage({ params }: { params: Promise<{ substationId: string }> }) {
  const { substationId } = await params;
  const substation = await loadSubstation(substationId);
  const generations: GenerationDto[] = substation.generations.map((generation) => ({ ...generation, createdAt: generation.createdAt.toISOString(), startedAt: generation.startedAt?.toISOString() ?? null, finishedAt: generation.finishedAt?.toISOString() ?? null }));
  return (
    <main className="page-shell">
      <Link className="back-link" href="/substations">← Volver a subestaciones</Link>
      <header className="detail-heading"><div className="detail-icon">SE</div><div><p className="eyebrow">Subestación</p><h1>{substation.name}</h1><p>{substation.description ?? "Sin descripción"}</p></div><div className="version-summary"><span>Revisión vigente</span><strong>{substation.latestRevisionVersion ? `v${substation.latestRevisionVersion}` : "—"}</strong></div></header>
      <div className="detail-grid">
        <RevisionForm substationId={substation.id} defaultName={substation.name} latestVersion={substation.latestRevisionVersion ?? 0} />
        <section className="panel" aria-labelledby="history-heading"><div className="panel-heading"><div><p className="overline">Historial protegido</p><h2 id="history-heading">Revisiones</h2></div><span className="record-count">{substation.revisionCount}</span></div>
          {substation.revisions.length === 0 ? <div className="empty compact"><p>No hay revisiones todavía.</p></div> : <div className="revision-list">{substation.revisions.map((revision, index) => <article className="revision-item" key={revision.id}><div><strong>Versión {revision.version}</strong>{index === 0 && <span className="current-chip">Vigente</span>}<small>{new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(revision.createdAt)}</small></div><code>{revision.contentHash.slice(0, 12)}…</code></article>)}</div>}
        </section>
      </div>
      <GenerationPanel key={substation.revisions[0]?.id ?? "empty"} substationId={substation.id} hasRevisions={substation.revisionCount > 0} initialGenerations={generations} />
    </main>
  );
}
