import { Worker } from "bullmq";
import Redis from "ioredis";
import { createPrismaClient, type PrismaClient } from "@substation/db";
import {
  BullMqGenerationPublisher,
  GENERATION_QUEUE_NAME,
  GenerationDispatcher,
  type DispatcherLogger,
} from "@substation/queue";
import { createGenerationProcessor, type ScdGenerator } from "./processor";

export interface WorkerRuntimeOptions {
  databaseUrl?: string;
  redisUrl?: string;
  queueName?: string;
  dispatcherIntervalMs?: number;
  backoffDelayMs?: number;
  db?: PrismaClient;
  generator?: ScdGenerator;
  logger?: DispatcherLogger;
}

const consoleLogger: DispatcherLogger = {
  info: (fields) => console.log(JSON.stringify(fields)),
  error: (fields) => console.error(JSON.stringify(fields)),
};

export async function startWorkerRuntime(options: WorkerRuntimeOptions = {}) {
  const db = options.db ?? createPrismaClient(options.databaseUrl);
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;
  if (!redisUrl) throw new Error("REDIS_URL is required for the worker.");
  const queueName = options.queueName ?? GENERATION_QUEUE_NAME;
  const publisher = new BullMqGenerationPublisher(redisUrl, {
    queueName,
    attempts: MAX_ATTEMPTS,
    ...(options.backoffDelayMs === undefined ? {} : { backoffDelayMs: options.backoffDelayMs }),
  });
  const workerConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const processor = createGenerationProcessor({
    db,
    ...(options.generator === undefined ? {} : { generator: options.generator }),
  });
  const worker = new Worker(queueName, processor, {
    connection: workerConnection,
    concurrency: 1,
    lockDuration: 60_000,
    maxStalledCount: 2,
  });
  const logger = options.logger ?? consoleLogger;
  worker.on("completed", (job) => logger.info({ event: "generation_completed", jobId: job.id }));
  worker.on("failed", (job) => logger.error({ event: "generation_failed", jobId: job?.id }));
  worker.on("error", () => logger.error({ event: "worker_connection_error" }));
  await worker.waitUntilReady();
  const dispatcher = new GenerationDispatcher(db, publisher, options.dispatcherIntervalMs ?? 1000, logger);
  dispatcher.start();

  let closed = false;
  return {
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      await dispatcher.close();
      await worker.close();
      await publisher.close();
      if (workerConnection.status !== "end") await workerConnection.quit();
      await db.$disconnect();
    },
  };
}

const MAX_ATTEMPTS = 3;
