export type GenerationStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";

export interface GenerationDto {
  jobId: string;
  revisionId: string;
  revisionVersion: number;
  generatorVersion: string;
  status: GenerationStatus;
  attemptCount: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  isCurrent: boolean;
  canDownload: boolean;
  artifact: { fileName: string; mimeType: string; byteSize: number; checksum: string } | null;
}

export async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}
