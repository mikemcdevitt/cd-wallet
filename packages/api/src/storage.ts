import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface PresignPutRequest {
  key: string;
  contentType: string;
  /** When set, the signed URL only accepts a body of exactly this size. */
  contentLength?: number;
  expiresInSeconds: number;
}

/** The slice of S3 the API needs. Audio bytes never pass through the API. */
export interface Storage {
  objectExists(key: string): Promise<boolean>;
  presignPut(request: PresignPutRequest): Promise<string>;
  presignGet(key: string, expiresInSeconds: number): Promise<string>;
}

export class S3Storage implements Storage {
  constructor(
    private readonly bucket: string,
    private readonly client: S3Client = new S3Client({}),
  ) {}

  async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404 || (err as Error).name === "NotFound") return false;
      throw err;
    }
  }

  presignPut(request: PresignPutRequest): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: request.key,
        ContentType: request.contentType,
        ContentLength: request.contentLength,
      }),
      { expiresIn: request.expiresInSeconds },
    );
  }

  presignGet(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }
}
