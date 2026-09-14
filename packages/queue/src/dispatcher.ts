import {
  ScdGenerationStatus,
  recoverExpiredGenerationLeases,
  type PrismaClient,
} from "@substation/db";
import type { GenerationPublisher } from "./publisher";

export interface DispatchResult {
  published: number;
  failed: number;
  reconciled: number;
  recoveredLeases: number;
}

export interface DispatcherLogger {
  info(fields: Record<string, unknown>): void;
  error(fields: Record<string, unknown>): void;
}

const silentLogger: DispatcherLogger = { info: () => undefined, error: () => undefined };

function retryAt(now: Date, attempt: number): Date {
  const delay = Math.min(30_000, 1000 * 2 ** Math.max(0, attempt - 1));
  return new Date(now.getTime() + delay);
}

export async function dispatchGenerationOutbox(
  db: PrismaClient,
  publisher: GenerationPublisher,
  now = new Date(),
): Promise<Pick<DispatchResult, "published" | "failed">> {
  const events = await db.generationOutbox.findMany({
    where: { publishedAt: null, nextAttemptAt: { lte: now } },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  let published = 0;
  let failed = 0;
  for (const event of events) {
    try {
      await publisher.publish(event.generationId);
      await db.generationOutbox.updateMany({
        where: { id: event.id, publishedAt: null },
        data: { publishedAt: now, publishAttempts: { increment: 1 }, lastError: null },
      });
      published += 1;
    } catch {
      const attempt = event.publishAttempts + 1;
      await db.generationOutbox.updateMany({
        where: { id: event.id, publishedAt: null },
        data: {
          publishAttempts: { increment: 1 },
          lastError: "Queue publication failed; retry scheduled.",
          nextAttemptAt: retryAt(now, attempt),
        },
      });
      failed += 1;
    }
  }
  return { published, failed };
}

export async function reconcileQueuedGenerations(
  db: PrismaClient,
  publisher: GenerationPublisher,
): Promise<number> {
  const generations = await db.scdGeneration.findMany({
    where: {
      status: ScdGenerationStatus.QUEUED,
      outbox: { is: { publishedAt: { not: null } } },
    },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: { id: true },
  });
  let reconciled = 0;
  for (const generation of generations) {
    if (!(await publisher.has(generation.id))) {
      await publisher.publish(generation.id);
      reconciled += 1;
    }
  }
  return reconciled;
}

export async function runDispatchCycle(
  db: PrismaClient,
  publisher: GenerationPublisher,
  now = new Date(),
): Promise<DispatchResult> {
  const recoveredLeases = await recoverExpiredGenerationLeases(db, now);
  const dispatched = await dispatchGenerationOutbox(db, publisher, now);
  const reconciled = await reconcileQueuedGenerations(db, publisher);
  return { ...dispatched, reconciled, recoveredLeases };
}

export class GenerationDispatcher {
  private timer: ReturnType<typeof setInterval> | undefined;
  private activeCycle: Promise<void> | undefined;

  constructor(
    private readonly db: PrismaClient,
    private readonly publisher: GenerationPublisher,
    private readonly intervalMs = 1000,
    private readonly logger: DispatcherLogger = silentLogger,
  ) {}

  start(): void {
    if (this.timer) return;
    this.run();
    this.timer = setInterval(() => this.run(), this.intervalMs);
  }

  private run(): void {
    if (this.activeCycle) return;
    this.activeCycle = runDispatchCycle(this.db, this.publisher)
      .then((result) => {
        if (result.published || result.failed || result.reconciled || result.recoveredLeases) {
          this.logger.info({ event: "generation_dispatch", ...result });
        }
      })
      .catch(() => this.logger.error({ event: "generation_dispatch_failed" }))
      .finally(() => {
        this.activeCycle = undefined;
      });
  }

  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.activeCycle;
  }
}
