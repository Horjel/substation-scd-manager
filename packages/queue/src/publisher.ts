import { Queue } from "bullmq";
import Redis from "ioredis";
import {
  GENERATION_JOB_NAME,
  GENERATION_QUEUE_NAME,
  type GenerationJobPayload,
} from "./contract";

export interface GenerationPublisher {
  publish(jobId: string): Promise<void>;
  has(jobId: string): Promise<boolean>;
  close(): Promise<void>;
}

export interface PublisherOptions {
  attempts?: number;
  backoffDelayMs?: number;
  queueName?: string;
}

export class BullMqGenerationPublisher implements GenerationPublisher {
  private readonly connection: Redis;
  private readonly queue: Queue<GenerationJobPayload>;
  private readonly attempts: number;
  private readonly backoffDelayMs: number;

  constructor(redisUrl: string, options: PublisherOptions = {}) {
    const url = new URL(redisUrl);
    if (url.protocol !== "redis:" && url.protocol !== "rediss:") throw new Error("REDIS_URL must be a Redis URL.");
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
    this.connection.on("error", () => undefined);
    this.queue = new Queue(options.queueName ?? GENERATION_QUEUE_NAME, { connection: this.connection });
    this.attempts = options.attempts ?? 3;
    this.backoffDelayMs = options.backoffDelayMs ?? 1000;
  }

  async publish(jobId: string): Promise<void> {
    await this.queue.add(
      GENERATION_JOB_NAME,
      { jobId },
      {
        jobId,
        attempts: this.attempts,
        backoff: { type: "exponential", delay: this.backoffDelayMs },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );
  }

  async has(jobId: string): Promise<boolean> {
    return (await this.queue.getJob(jobId)) !== undefined;
  }

  async close(): Promise<void> {
    await this.queue.close();
    if (this.connection.status !== "end") await this.connection.quit();
  }
}
