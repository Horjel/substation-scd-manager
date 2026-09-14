export const MAX_ARTIFACT_BYTES = 1024 * 1024;

export interface ArtifactInput {
  generationId: string;
  storageKey: string;
  fileName: string;
  mimeType: "application/xml";
  byteSize: number;
  checksum: string;
  bytes: Uint8Array;
}

export interface StoredArtifact extends ArtifactInput {
  createdAt: Date;
}

export interface ArtifactStore {
  put(input: ArtifactInput): Promise<{ created: boolean }>;
  getByGenerationId(generationId: string): Promise<StoredArtifact | null>;
}
