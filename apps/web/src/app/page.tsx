import Link from "next/link";

export default function HomePage() {
  return (
    <main className="home-main">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Ejercicio técnico · Portfolio</p>
          <h1>Substation SCD Manager</h1>
          <p className="intro">Configuraciones trazables, revisiones inmutables y generación de archivos desacoplada de la web.</p>
          <div className="hero-actions"><Link className="button accent" href="/substations">Abrir workspace</Link><a className="button ghost" href="#architecture">Ver arquitectura</a></div>
        </div>
        <div className="hero-visual" aria-label="Flujo de generación asíncrona">
          <div className="visual-label">Flujo principal</div>
          <div className="flow-node"><span>01</span><div><strong>Configuración</strong><small>Snapshot versionado</small></div></div>
          <div className="flow-line" />
          <div className="flow-node"><span>02</span><div><strong>Cola BullMQ</strong><small>Entrega recuperable</small></div></div>
          <div className="flow-line" />
          <div className="flow-node highlight"><span>03</span><div><strong>Worker SCD</strong><small>Proceso independiente</small></div></div>
        </div>
      </section>

      <section className="architecture" id="architecture" aria-labelledby="architecture-heading">
        <div className="section-title"><p className="overline">Decisiones visibles</p><h2 id="architecture-heading">Una vertical pequeña, con límites reales</h2></div>
        <div className="feature-grid">
          <article><span className="feature-number">01</span><h3>PostgreSQL decide</h3><p>Configuraciones, trabajos y artefactos mantienen un historial persistente. Redis solo transporta mensajes.</p></article>
          <article><span className="feature-number">02</span><h3>HTTP no genera</h3><p>La petición crea el trabajo y su outbox. Un worker separado produce el XML y actualiza su estado.</p></article>
          <article><span className="feature-number">03</span><h3>Revisiones intactas</h3><p>Cada cambio crea un snapshot nuevo. Un SCD anterior se marca como obsoleto y deja de descargarse.</p></article>
        </div>
      </section>

      <section className="scope-banner" aria-labelledby="scope-heading">
        <div><p className="overline">Alcance responsable</p><h2 id="scope-heading">Simulación, no conformidad industrial</h2></div>
        <p>El primer generador SCD es simulado y determinista. No es una implementación de IEC 61850 ni una herramienta validada para uso operativo.</p>
      </section>
    </main>
  );
}
