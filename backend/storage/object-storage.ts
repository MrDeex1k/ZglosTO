export interface PutObjectInput {
  body: Uint8Array;
  checksumSha256: string;
  contentType: string;
  objectKey: string;
}

export interface StoredObject {
  checksumSha256: string;
  etag: string | null;
  objectKey: string;
  sizeBytes: number;
  versionId: string | null;
}

export interface ObjectBody {
  body: Uint8Array;
  checksumSha256: string | null;
  contentType: string | null;
  objectKey: string;
  sizeBytes: number;
}

export interface StoredObjectSummary {
  objectKey: string;
  sizeBytes: number;
}

export interface ObjectMetadata {
  checksumSha256: string | null;
  contentType: string | null;
  objectKey: string;
  sizeBytes: number;
}

export interface PresignedUploadInput {
  checksumSha256: string;
  contentType: string;
  expiresInSeconds: number;
  objectKey: string;
  sizeBytes: number;
}

export interface PresignedUpload {
  expiresAt: string;
  headers: Readonly<Record<string, string>>;
  method: 'PUT';
  uploadUrl: string;
}

export interface ObjectStorage {
  checkReadiness(): Promise<void>;
  close(): Promise<void>;
  createPresignedUpload(input: PresignedUploadInput): Promise<PresignedUpload>;
  deleteObject(objectKey: string): Promise<void>;
  getObject(objectKey: string): Promise<ObjectBody>;
  headObject(objectKey: string): Promise<ObjectMetadata>;
  initialize(): Promise<void>;
  listObjects(): AsyncIterable<StoredObjectSummary>;
  objectExists(objectKey: string): Promise<boolean>;
  putObject(input: PutObjectInput): Promise<StoredObject>;
}
