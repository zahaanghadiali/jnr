import { NextRequest, NextResponse } from "next/server";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { database } from "@/lib/mongodb";
import {
  mediaUrl,
  verifyMedia,
  allowedTypes,
  maxBytes,
  guestPrefix,
} from "@/lib/storage";
import { deck, Kind } from "@/lib/deck";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Card = { kind: Kind; prompt: string; started: number };
type Entry = Card & {
  answer?: string;
  mediaKey?: string;
  mediaType?: string;
  seconds: number;
  swapped?: boolean;
  at: number;
};
type Player = {
  _id: string;
  name: string;
  version: number;
  swaps: number;
  active: Card | null;
  entries: Entry[];
};
function host(req: NextRequest) {
  const a = Buffer.from(req.headers.get("x-host-password") || "");
  const b = Buffer.from(process.env.HOST_PASSWORD || "");
  return b.length >= 12 && a.length === b.length && timingSafeEqual(a, b);
}
function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
export async function GET(req: NextRequest) {
  try {
    const db = await database();
    if (req.nextUrl.searchParams.has("export")) {
      if (!host(req))
        return fail("Host password is incorrect or not configured.", 403);
      const rows = await db
        .collection<Player>("players")
        .find({}, { projection: { _id: 0 } })
        .toArray();
      const exported = await Promise.all(
        rows.map(async (p) => ({
          ...p,
          entries: await Promise.all(
            p.entries.map(async (e) => ({
              ...e,
              mediaUrl: e.mediaKey ? await mediaUrl(e.mediaKey) : undefined,
            })),
          ),
        })),
      );
      return NextResponse.json(exported, {
        headers: {
          "Content-Disposition": 'attachment; filename="jnr-export.json"',
        },
      });
    }
    const players = await db
      .collection<Player>("players")
      .find({}, { projection: { name: 1, entries: 1, _id: 0 } })
      .limit(1000)
      .toArray();
    const wall = await Promise.all(
      players
        .flatMap((p) => p.entries.map((e) => ({ ...e, name: p.name })))
        .sort((a, b) => b.at - a.at)
        .slice(0, 100)
        .map(async (e) => ({
          ...e,
          mediaKey: undefined,
          mediaUrl: e.mediaKey ? await mediaUrl(e.mediaKey) : undefined,
        })),
    );
    const leaders = players
      .map((p) => ({
        name: p.name,
        dares: p.entries.filter((e) => e.kind === "dare" && !e.swapped).length,
        seconds: p.entries
          .filter((e) => e.kind === "dare" && !e.swapped)
          .reduce((s, e) => s + e.seconds, 0),
      }))
      .filter((p) => p.dares)
      .sort((a, b) => b.dares - a.dares || a.seconds - b.seconds);
    const token = req.cookies.get("jnr-player")?.value;
    const me = token
      ? await db.collection<Player>("players").findOne({ _id: token })
      : null;
    return NextResponse.json({
      wall,
      leaders,
      me: me
        ? {
            ...me,
            _id: undefined,
            entries: me.entries.map((e) => ({ ...e, mediaKey: undefined })),
          }
        : null,
    });
  } catch {
    return fail(
      "Cannot reach MongoDB. Check the server database configuration.",
      503,
    );
  }
}
export async function POST(req: NextRequest) {
  try {
    if (req.headers.get("origin") !== req.nextUrl.origin)
      return fail("Invalid request origin.", 403);
    if (Number(req.headers.get("content-length") || 0) > 900000)
      return fail("Photo is too large.", 413);
    const body = await req.json();
    const db = await database();
    const col = db.collection<Player>("players");
    const token = req.cookies.get("jnr-player")?.value;
    const player = token ? await col.findOne({ _id: token }) : null;
    if (body.action === "join") {
      if (player) return NextResponse.json({ ok: true });
      const name =
        typeof body.name === "string" ? body.name.trim().slice(0, 40) : "";
      if (!name) return fail("Enter your name.");
      const id = randomBytes(32).toString("hex");
      await col.insertOne({
        _id: id,
        name,
        version: 0,
        swaps: 0,
        active: null,
        entries: [],
      });
      const res = NextResponse.json({ ok: true });
      res.cookies.set("jnr-player", id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30,
        path: "/",
      });
      return res;
    }
    if (!player) return fail("Join the party first.", 401);
    const version = player.version;
    if (body.action === "draw") {
      const kind = body.kind as Kind;
      if (kind !== "truth" && kind !== "dare")
        return fail("Choose truth or dare.");
      if (player.active) return fail("Finish your current card first.");
      if (
        player.entries.filter((e) => e.kind === kind && !e.swapped).length >= 2
      )
        return fail("You have completed both cards of this type.");
      const used = player.entries.map((e) => e.prompt);
      const cards = deck[kind].filter((c) => !used.includes(c));
      player.active = {
        kind,
        prompt: cards[Math.floor(Math.random() * cards.length)],
        started: Date.now(),
      };
    } else if (body.action === "complete" || body.action === "swap") {
      if (!player.active) return fail("Draw a card first.");
      const card = player.active;
      const entry: Entry = {
        ...card,
        seconds: Math.max(1, Math.round((Date.now() - card.started) / 1000)),
        at: Date.now(),
      };
      if (body.action === "swap") {
        if (player.swaps >= 1) return fail("Only one swap per guest.");
        player.swaps++;
        entry.swapped = true;
      } else if (card.kind === "truth") {
        if (
          typeof body.answer !== "string" ||
          !body.answer.trim() ||
          body.answer.length > 2000
        )
          return fail("Add an answer (up to 2,000 characters).");
        entry.answer = body.answer.trim();
      } else {
        if (
          typeof body.mediaKey !== "string" ||
          !body.mediaKey.startsWith(guestPrefix(player._id)) ||
          body.mediaKey.includes("..")
        )
          return fail("Upload a photo or video first.");
        const media = await verifyMedia(body.mediaKey);
        if (
          !media.ContentType ||
          !allowedTypes.includes(media.ContentType) ||
          !media.ContentLength ||
          media.ContentLength > maxBytes(media.ContentType)
        )
          return fail("Invalid uploaded media.");
        entry.mediaKey = body.mediaKey;
        entry.mediaType = media.ContentType;
      }
      player.entries.push(entry);
      player.active = null;
    } else return fail("Unknown action.");
    const result = await col.updateOne(
      { _id: player._id, version },
      {
        $set: {
          active: player.active,
          entries: player.entries,
          swaps: player.swaps,
        },
        $inc: { version: 1 },
      },
    );
    if (!result.modifiedCount)
      return fail("Your game changed. Refresh and try again.", 409);
    return NextResponse.json({ ok: true });
  } catch {
    return fail(
      "Could not save. Check your connection and MongoDB configuration.",
      503,
    );
  }
}
