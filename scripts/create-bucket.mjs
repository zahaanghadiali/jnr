import { loadEnvFile } from "node:process";
import { appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import {
  S3Client,
  CreateBucketCommand,
  PutPublicAccessBlockCommand,
  PutBucketEncryptionCommand,
  PutBucketCorsCommand,
  PutBucketOwnershipControlsCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
loadEnvFile(".env.local");
const region = process.env.AWS_REGION || "ap-south-1";
const Bucket =
  process.env.AWS_S3_BUCKET ||
  `jnr-party-media-${randomBytes(6).toString("hex")}`;
const client = new S3Client({ region });
try {
  if (!process.env.AWS_S3_BUCKET) {
    await client.send(
      new CreateBucketCommand({
        Bucket,
        ...(region === "us-east-1"
          ? {}
          : { CreateBucketConfiguration: { LocationConstraint: region } }),
      }),
    );
    appendFileSync(".env.local", `AWS_S3_BUCKET=${Bucket}\n`);
  }
  await client.send(
    new PutPublicAccessBlockCommand({
      Bucket,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
        BlockPublicPolicy: true,
        RestrictPublicBuckets: true,
      },
    }),
  );
  await client.send(
    new PutBucketOwnershipControlsCommand({
      Bucket,
      OwnershipControls: {
        Rules: [{ ObjectOwnership: "BucketOwnerEnforced" }],
      },
    }),
  );
  await client.send(
    new PutBucketEncryptionCommand({
      Bucket,
      ServerSideEncryptionConfiguration: {
        Rules: [
          { ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } },
        ],
      },
    }),
  );
  await client.send(
    new PutBucketCorsCommand({
      Bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: [
              "http://localhost:3000",
              ...(process.env.APP_ORIGIN ? [process.env.APP_ORIGIN] : []),
            ],
            AllowedMethods: ["POST", "GET", "HEAD"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
  await client.send(new HeadBucketCommand({ Bucket }));
  console.log(
    JSON.stringify({
      bucket: Bucket,
      region,
      status:
        "created and configured; private, encrypted, localhost CORS enabled",
    }),
  );
} catch (e) {
  console.error(
    JSON.stringify({
      bucket: Bucket,
      region,
      error: e.name,
      message: e.message,
    }),
  );
  process.exitCode = 1;
}
