import { createHash } from "node:crypto";
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
export const s3 = new S3Client({
  region: process.env.AWS_REGION || "ap-south-1",
});
export function bucket() {
  if (!process.env.AWS_S3_BUCKET) throw new Error("S3 is not configured");
  return process.env.AWS_S3_BUCKET;
}
export async function mediaUrl(key: string) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn: 3600 },
  );
}
export async function verifyMedia(key: string) {
  return s3.send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
}
export const allowedTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
];
export const maxBytes = (type: string) =>
  (type.startsWith("video/") ? 100 : 20) * 1024 * 1024;

export const guestPrefix = (id: string) =>
  `guests/${createHash("sha256").update(id).digest("hex")}/`;
