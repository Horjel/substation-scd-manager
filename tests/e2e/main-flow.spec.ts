import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import Redis from "ioredis";
import { createPrismaClient } from "../../packages/db/src/index";
import { startWorkerRuntime } from "../../apps/worker/src/index";
import { generateSimulatedScd } from "../../packages/scd/src/index";

const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;
if (!databaseUrl || !redisUrl) throw new Error("E2E environment is incomplete.");
const db = createPrismaClient(databaseUrl);
const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
let runtime: Awaited<ReturnType<typeof startWorkerRuntime>>;

test.beforeAll(async () => {
  await redis.flushdb();
  await db.$executeRawUnsafe('TRUNCATE TABLE "GeneratedArtifact", "GenerationOutbox", "ScdGeneration", "ConfigurationRevision", "Substation" CASCADE');
  runtime = await startWorkerRuntime({
    databaseUrl,
    redisUrl,
    dispatcherIntervalMs: 20,
    backoffDelayMs: 10,
    logger: { info: () => undefined, error: () => undefined },
    generator(input) {
      if (typeof input === "object" && input !== null && "substationName" in input && input.substationName === "CONTROLLED_FAILURE") {
        throw new Error("C:\\private\\worker\\secret.txt API_TOKEN=do-not-expose");
      }
      return generateSimulatedScd(input);
    },
  });
});

test.afterAll(async () => {
  await runtime.close();
  if (redis.status !== "end") await redis.quit();
  await db.$disconnect();
});

test("crea una subestación, genera y descarga el SCD vigente, y después lo marca obsoleto", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Substation SCD Manager" })).toBeVisible();
  await page.getByRole("link", { name: "Abrir workspace" }).click();

  await page.getByLabel("Nombre", { exact: true }).fill("SE Playwright");
  await page.getByLabel("Descripción").fill("Recorrido integral del portfolio");
  await page.getByRole("button", { name: "Crear subestación" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "SE Playwright" })).toBeVisible();

  await page.getByRole("button", { name: "Guardar nueva revisión" }).click();
  await expect(page.getByText("Versión 1")).toBeVisible();
  await page.getByRole("button", { name: "Generar SCD" }).click();
  await expect(page.getByText("Completado")).toBeVisible({ timeout: 15_000 });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Descargar SCD" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error("The downloaded artifact is unavailable.");
  const xml = await readFile(path, "utf8");
  expect(xml).toContain('<SCD data-generator="substation-scd-manager-simulator" data-conformance="none">');

  await page.getByLabel("Identificador del elemento 1").fill("BAY_02");
  await page.getByLabel("Nombre del elemento 1").fill("Second bay");
  await page.getByLabel("Tipo del elemento 1").selectOption("BAY");
  await page.getByRole("button", { name: "Guardar nueva revisión" }).click();
  await expect(page.getByText("Versión 2")).toBeVisible();
  await expect(page.getByText("Obsoleto: existe una revisión de configuración más reciente.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Descargar SCD" })).toHaveCount(0);
});

test("muestra un fallo controlado sin filtrar detalles internos ni habilitar descarga", async ({ page }) => {
  await page.goto("/substations");
  await page.getByLabel("Nombre", { exact: true }).fill("CONTROLLED_FAILURE");
  await page.getByLabel("Descripción").fill("Fixture determinista de error");
  await page.getByRole("button", { name: "Crear subestación" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "CONTROLLED_FAILURE" })).toBeVisible();

  await page.getByRole("button", { name: "Guardar nueva revisión" }).click();
  await expect(page.getByText("Versión 1")).toBeVisible();
  await page.getByRole("button", { name: "Generar SCD" }).click();
  await expect(page.getByText("Fallido")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("La generación no pudo completarse. Revisa el worker y vuelve a intentarlo.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Descargar SCD" })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("secret.txt");
  await expect(page.locator("body")).not.toContainText("API_TOKEN");

  const failed = await db.scdGeneration.findFirstOrThrow({
    where: { revision: { substation: { name: "CONTROLLED_FAILURE" } } },
    orderBy: { createdAt: "desc" },
  });
  expect(failed.status).toBe("FAILED");
  expect(failed.attemptCount).toBe(3);
  expect(failed.errorMessage).toBe("A transient generation error occurred.");
  expect(failed.errorMessage).not.toContain("API_TOKEN");
});
