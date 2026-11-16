import { mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { loadEnvFile } from "node:process";
import { MongoMemoryServer } from "mongodb-memory-server";
import { chromium } from "@playwright/test";
import {
  S3Client,
  DeleteObjectCommand,
  GetPublicAccessBlockCommand,
  GetBucketEncryptionCommand,
} from "@aws-sdk/client-s3";
loadEnvFile(".env.local");
mkdirSync("work", { recursive: true });
const mongo = await MongoMemoryServer.create();
const port = 3107,
  origin = `http://localhost:${port}`;
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-p", String(port)],
  {
    env: {
      ...process.env,
      MONGODB_URI: mongo.getUri(),
      MONGODB_DB: "jnr_test",
      HOST_PASSWORD: "test-host-password-only",
    },
    stdio: "pipe",
  },
);
let output = "";
server.stderr.on("data", (d) => (output += d));
server.stdout.on("data", (d) => (output += d));
const s3 = new S3Client({ region: process.env.AWS_REGION });
const keys = [];
let browser;
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  let cookie = "";
  async function post(action, extra = {}, expected = 200) {
    const res = await fetch(origin + "/api/game", {
      method: "POST",
      headers: { origin, "content-type": "application/json", cookie },
      body: JSON.stringify({ action, ...extra }),
    });
    if (res.headers.get("set-cookie"))
      cookie = res.headers.get("set-cookie").split(";")[0];
    assert.equal(res.status, expected, await res.clone().text());
    return res.json();
  }
  const state = () =>
    fetch(origin + "/api/game", { headers: { cookie } }).then((r) => r.json());
  await post("join", { name: "Integration Guest" });
  await post("draw", { kind: "truth" });
  await post("complete", { answer: "   " }, 400);
  await post("complete", { answer: "A happy memory." });
  await post("draw", { kind: "truth" });
  await post("complete", { answer: "A second memory." });
  await post("draw", { kind: "truth" }, 400);
  await post("draw", { kind: "dare" });
  await post("complete", {}, 400);
  await post("swap");
  await post("draw", { kind: "dare" });
  await post("swap", {}, 400);
  assert.equal((await state()).wall.filter((e) => e.swapped).length, 1);
  const bad = await fetch(origin + "/api/game", {
    method: "POST",
    headers: {
      origin: "https://evil.invalid",
      cookie,
      "content-type": "application/json",
    },
    body: JSON.stringify({ action: "swap" }),
  });
  assert.equal(bad.status, 403);
  assert.equal((await fetch(origin + "/api/game?export=1")).status, 403);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5ioAAAAASUVORK5CYII=",
    "base64",
  );
  const sign = await fetch(origin + "/api/media", {
    method: "POST",
    headers: { origin, cookie, "content-type": "application/json" },
    body: JSON.stringify({ type: "image/png", size: png.length }),
  });
  assert.equal(sign.status, 200, await sign.clone().text());
  const signed = await sign.json();
  keys.push(signed.key);
  assert.ok(
    !signed.key.includes(cookie.split("=")[1]),
    "Object key must not expose session token",
  );
  const form = new FormData();
  Object.entries(signed.fields).forEach(([k, v]) => form.append(k, v));
  form.append("file", new Blob([png], { type: "image/png" }), "test.png");
  const uploaded = await fetch(signed.url, { method: "POST", body: form });
  assert.equal(uploaded.status, 204, await uploaded.text());
  await post("complete", { mediaKey: signed.key });
  let current = await state();
  assert.equal(current.leaders[0].dares, 1);
  const media = current.wall.find((e) => e.mediaUrl);
  assert.equal((await fetch(media.mediaUrl)).status, 200);
  await post("draw", { kind: "dare" });
  await post("complete", { mediaKey: signed.key });
  await post("draw", { kind: "dare" }, 400);
  const publicUrl = new URL(media.mediaUrl);
  publicUrl.search = "";
  assert.equal((await fetch(publicUrl)).status, 403);
  assert.equal(
    (
      await s3.send(
        new GetPublicAccessBlockCommand({ Bucket: process.env.AWS_S3_BUCKET }),
      )
    ).PublicAccessBlockConfiguration.BlockPublicPolicy,
    true,
  );
  assert.equal(
    (
      await s3.send(
        new GetBucketEncryptionCommand({ Bucket: process.env.AWS_S3_BUCKET }),
      )
    ).ServerSideEncryptionConfiguration.Rules[0]
      .ApplyServerSideEncryptionByDefault.SSEAlgorithm,
    "AES256",
  );
  const exported = await fetch(origin + "/api/game?export=1", {
    headers: { "x-host-password": "test-host-password-only" },
  });
  assert.equal(exported.status, 200);
  assert.ok(!(await exported.text()).includes(cookie.split("=")[1]));
  // Another anonymous browser sees the shared wall, without a player session.
  const other = await fetch(origin + "/api/game").then((r) => r.json());
  assert.equal(other.me, null);
  assert.ok(other.wall.some((e) => e.answer === "A happy memory."));
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page.getByLabel("What should we call you?").fill("Mobile Guest");
  await page.getByRole("button", { name: "Let’s play" }).click();
  await page
    .getByRole("heading", { name: "You’re up, Mobile Guest." })
    .waitFor();
  await page.getByRole("button", { name: "Truth A story" }).click();
  await page.getByLabel("The truth, please").fill("A mobile test answer");
  await page
    .getByRole("button", { name: "Answered. Put it on the Wall" })
    .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /The Wall/ })
    .click();
  await page.getByText("A mobile test answer", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  await page.screenshot({
    path: process.env.SCREENSHOT_PATH || "work/jnr-mobile.png",
    fullPage: true,
  });
  console.log(
    "PASS: guest sessions, truth validation, limits, swap enforcement, wall sync, host auth/export, real S3 upload/read, private bucket, encryption, mobile browser flow.",
  );
} catch (e) {
  console.error(e);
  console.error(output.slice(-2000));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  for (const Key of keys)
    await s3.send(
      new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key }),
    );
  server.kill();
  await mongo.stop();
}
