import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomePage from "../apps/web/src/app/page";

describe("Página inicial", () => {
  it("presenta el ejercicio sin ofrecer generación todavía y explica su alcance simulado", () => {
    const html = renderToStaticMarkup(<HomePage />);

    expect(html).toContain("<h1>Substation SCD Manager</h1>");
    expect(html).toContain("simulado y determinista");
    expect(html).toContain("No es una");
    expect(html).toContain("implementación de IEC 61850");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<form");
  });
});
