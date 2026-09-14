"use client";

import { useCallback, useEffect, useState } from "react";
import type { GenerationDto, GenerationStatus } from "../lib/contracts";
import { readApiError } from "../lib/contracts";

const LABELS: Record<GenerationStatus, string> = { QUEUED: "En cola", RUNNING: "Procesando", SUCCEEDED: "Completado", FAILED: "Fallido" };

export function GenerationPanel({ substationId, hasRevisions, initialGenerations }: { substationId: string; hasRevisions: boolean; initialGenerations: GenerationDto[] }) {
  const [generations, setGenerations] = useState(initialGenerations);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/substations/${substationId}/generations`, { cache: "no-store" });
    if (!response.ok) throw new Error(await readApiError(response, "No se pudo actualizar el estado."));
    const body = (await response.json()) as { generations: GenerationDto[] };
    setGenerations(body.generations);
  }, [substationId]);

  const active = generations.some((generation) => generation.status === "QUEUED" || generation.status === "RUNNING");
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => { void refresh().catch(() => setError("No se pudo actualizar el estado. Se volverá a intentar.")); }, 1500);
    return () => window.clearInterval(timer);
  }, [active, refresh]);

  async function requestGeneration() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/substations/${substationId}/generations`, { method: "POST" });
      if (!response.ok) throw new Error(await readApiError(response, "No se pudo solicitar la generación."));
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo solicitar la generación.");
    } finally { setPending(false); }
  }

  return (
    <section className="panel generation-panel" aria-labelledby="generation-heading">
      <div className="panel-heading">
        <div><p className="overline">Proceso asíncrono</p><h2 id="generation-heading">Generaciones SCD</h2></div>
        <button className="button accent" disabled={!hasRevisions || pending} onClick={requestGeneration} type="button">{pending ? "Solicitando…" : "Generar SCD"}</button>
      </div>
      <p className="notice"><strong>Simulador:</strong> el XML generado sirve para demostrar la arquitectura; no acredita conformidad IEC 61850.</p>
      {!hasRevisions && <div className="empty compact"><p>Crea una revisión antes de solicitar el archivo.</p></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {hasRevisions && generations.length === 0 && <div className="empty compact"><p>Todavía no hay generaciones. El worker las procesará fuera de la petición web.</p></div>}
      <div className="generation-list" aria-live="polite">
        {generations.map((generation) => (
          <article className={`generation-item ${!generation.isCurrent ? "obsolete" : ""}`} key={generation.jobId}>
            <div className="generation-main">
              <div><span className={`status status-${generation.status.toLowerCase()}`}><i />{LABELS[generation.status]}</span><strong>Revisión v{generation.revisionVersion}</strong></div>
              <small>{new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(generation.createdAt))} · {generation.attemptCount} intento{generation.attemptCount === 1 ? "" : "s"}</small>
              {generation.status === "FAILED" && <p className="safe-error">La generación no pudo completarse. Revisa el worker y vuelve a intentarlo.</p>}
              {!generation.isCurrent && <p className="obsolete-note">Obsoleto: existe una revisión de configuración más reciente.</p>}
            </div>
            <div className="generation-action">
              {generation.canDownload ? <a className="button secondary" href={`/api/generations/${generation.jobId}/artifact`}>Descargar SCD</a> : <span className="muted-action">{generation.status === "SUCCEEDED" && !generation.isCurrent ? "Descarga deshabilitada" : "Sin descarga"}</span>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
