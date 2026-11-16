import { NextRequest, NextResponse } from "next/server";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { randomUUID } from "node:crypto";
import { database } from "@/lib/mongodb";
import { s3, bucket, allowedTypes, maxBytes, guestPrefix } from "@/lib/storage";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    if (req.headers.get("origin") !== req.nextUrl.origin)
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    const id = req.cookies.get("jnr-player")?.value;
    const db = await database();
    const player = id
      ? await db
          .collection<{ _id: string; active?: { kind: string } }>("players")
          .findOne({ _id: id })
      : null;
    if (!player || player.active?.kind !== "dare")
      return NextResponse.json(
        { error: "Draw a dare before uploading." },
        { status: 403 },
      );
    const { type, size } = await req.json();
    if (
      !allowedTypes.includes(type) ||
      !Number.isInteger(size) ||
      size < 1 ||
      size > maxBytes(type)
    )
      return NextResponse.json(
        { error: "Choose a photo up to 20 MB or a video up to 100 MB." },
        { status: 400 },
      );
    // Only one upload grant every ten seconds per guest, enforced atomically.
    const permit = await db
      .collection<{ _id: string }>("players")
      .updateOne(
        {
          _id: id!,
          $or: [
            { lastUpload: { $exists: false } },
            { lastUpload: { $lt: Date.now() - 10000 } },
          ],
        },
        { $set: { lastUpload: Date.now() } },
      );
    if (!permit.modifiedCount)
      return NextResponse.json(
        { error: "Wait a few seconds before uploading again." },
        { status: 429 },
      );
    const key = `${guestPrefix(id!)}${randomUUID()}`;
    const upload = await createPresignedPost(s3, {
      Bucket: bucket(),
      Key: key,
      Expires: 300,
      Fields: { "Content-Type": type },
      Conditions: [
        ["content-length-range", 1, maxBytes(type)],
        ["eq", "$Content-Type", type],
      ],
    });
    return NextResponse.json({ key, ...upload });
  } catch {
    return NextResponse.json(
      { error: "Upload unavailable. Check S3 and database configuration." },
      { status: 503 },
    );
  }
}
