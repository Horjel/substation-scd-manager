"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { readApiError } from "../lib/contracts";

interface ElementDraft { id: string; name: string; type: "IED" | "BAY" }

export function RevisionForm({ substationId, defaultName, latestVersion }: { substationId: string; defaultName: string; latestVersion: number }) {
  const router = useRouter();
  const [elements, setElements] = useState<ElementDraft[]>([{ id: "IED_01", name: "Protection IED", type: "IED" }]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(index: number, field: keyof ElementDraft, value: string) {
    setElements((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } as ElementDraft : item));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/substations/${substationId}/revisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "If-Match": String(latestVersion) },
        body: JSON.stringify({ substationName: data.get("substationName"), elements }),
      });
      if (!response.ok) throw new Error(await readApiError(response, "No se pudo guardar la revisión."));
      setElements([{ id: "IED_01", name: "Protection IED", type: "IED" }]);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la revisión.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="form-card" onSubmit={submit}>
      <div className="form-heading">
        <div><p className="overline">Snapshot inmutable</p><h2>Nueva revisión</h2></div>
        <span className="step-chip">02</span>
      </div>
      <label htmlFor="substationName">Nombre dentro de la configuración</label>
      <input id="substationName" name="substationName" defaultValue={defaultName} maxLength={100} required />
      <div className="field-heading"><span>Elementos simulados</span><button className="text-button" type="button" onClick={() => setElements((current) => [...current, { id: `BAY_${String(current.length + 1).padStart(2, "0")}`, name: "Bay", type: "BAY" }])}>+ Añadir</button></div>
      <div className="element-list">
        {elements.map((element, index) => (
          <div className="element-row" key={index}>
            <label><span className="sr-only">Identificador del elemento {index + 1}</span><input aria-label={`Identificador del elemento ${index + 1}`} value={element.id} maxLength={64} required onChange={(event) => update(index, "id", event.target.value)} /></label>
            <label><span className="sr-only">Nombre del elemento {index + 1}</span><input aria-label={`Nombre del elemento ${index + 1}`} value={element.name} maxLength={100} required onChange={(event) => update(index, "name", event.target.value)} /></label>
            <label><span className="sr-only">Tipo del elemento {index + 1}</span><select aria-label={`Tipo del elemento ${index + 1}`} value={element.type} onChange={(event) => update(index, "type", event.target.value)}><option value="IED">IED</option><option value="BAY">BAY</option></select></label>
            <button className="icon-button" type="button" aria-label={`Eliminar elemento ${index + 1}`} disabled={elements.length === 1} onClick={() => setElements((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button>
          </div>
        ))}
      </div>
      <p className="helper">Cada guardado crea una versión nueva; las versiones anteriores no se modifican.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button primary" disabled={pending} type="submit">{pending ? "Guardando…" : "Guardar nueva revisión"}</button>
    </form>
  );
}
