"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { readApiError } from "../lib/contracts";

export function NewSubstationForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/substations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.get("name"), description: data.get("description") }),
      });
      if (!response.ok) throw new Error(await readApiError(response, "No se pudo crear la subestación."));
      const body = (await response.json()) as { substation: { id: string } };
      router.push(`/substations/${body.substation.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear la subestación.");
      setPending(false);
    }
  }

  return (
    <form className="form-card" onSubmit={submit}>
      <div className="form-heading">
        <div><p className="overline">Nuevo activo</p><h2>Crear subestación</h2></div>
        <span className="step-chip">01</span>
      </div>
      <label htmlFor="name">Nombre</label>
      <input id="name" name="name" maxLength={100} required placeholder="Ej. SE Norte 220 kV" />
      <label htmlFor="description">Descripción <span className="optional">opcional</span></label>
      <textarea id="description" name="description" maxLength={1000} rows={3} placeholder="Contexto breve para la demostración" />
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button primary" disabled={pending} type="submit">{pending ? "Creando…" : "Crear subestación"}</button>
    </form>
  );
}
