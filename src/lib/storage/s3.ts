import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      endpoint: process.env.STORAGE_ENDPOINT || undefined,
      region: process.env.STORAGE_REGION || "auto",
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY || "",
        secretAccessKey: process.env.STORAGE_SECRET_KEY || "",
      },
    });
  }
  return client;
}

/** Uploads a buffer under a tenant-namespaced key and returns its public URL. */
export async function uploadObject(
  tenantId: string,
  folder: string,
  buffer: Buffer,
  contentType: string,
  filename?: string
): Promise<string> {
  const bucket = process.env.STORAGE_BUCKET;
  if (!bucket) throw new Error("STORAGE_BUCKET is not set");

  const key = `${tenantId}/${folder}/${randomUUID()}${filename ? `-${filename}` : ""}`;

  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  const publicBase = process.env.STORAGE_PUBLIC_URL?.replace(/\/$/, "");
  if (publicBase) return `${publicBase}/${key}`;
  return `${process.env.STORAGE_ENDPOINT?.replace(/\/$/, "")}/${bucket}/${key}`;
}
