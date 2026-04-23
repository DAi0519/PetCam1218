/// <reference path="../../worker-configuration.d.ts" />

import { cors } from "hono/cors";
import { Hono } from "hono";
import { Buffer } from "node:buffer";
import { generateChristmasPet } from "./poe";

interface WorkerBindings {
  ADMIN_SECRET: string;
  DB: D1Database;
  POE_API_KEY: string;
  IMAGES_BUCKET?: R2Bucket;
}

type AppEnv = {
  Bindings: WorkerBindings;
};

type GenerateMode = "pet_fashion" | "simple_hat";

interface GenerateRequest {
  base64Image?: string;
  mimeType?: string;
  mode?: GenerateMode;
}

const DAILY_FASHION_LIMIT = 20;
const app = new Hono<AppEnv>();

app.use("/api/*", cors());

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    runtime: "cloudflare-workers"
  })
);

app.post("/api/public/admin/ban", async (c) => {
  const secret = c.req.header("x-admin-secret");
  if (!secret || secret !== c.env.ADMIN_SECRET) {
    return c.json({ success: false, content: "Unauthorized" }, 401);
  }

  const body = await c.req.json<{ email?: string; ban?: boolean }>().catch(() => null);
  if (!body?.email) {
    return c.json({ success: false, content: "Email required" }, 400);
  }

  await c.env.DB.prepare(
    `INSERT INTO user_profiles (email, is_banned)
     VALUES (?, ?)
     ON CONFLICT(email) DO UPDATE SET is_banned = excluded.is_banned`
  )
    .bind(body.email, body.ban ? 1 : 0)
    .run();

  return c.json({
    success: true,
    content: `User ${body.email} ${body.ban ? "banned" : "unbanned"}`
  });
});

app.post("/api/public/gemini/generate", async (c) => {
  const body = await c.req.json<GenerateRequest>().catch(() => null);
  const mode: GenerateMode = body?.mode === "simple_hat" ? "simple_hat" : "pet_fashion";
  const ip = getClientIp(c.req.header("CF-Connecting-IP"), c.req.header("x-forwarded-for"));
  let generationId: number | null = null;

  if (!body?.base64Image || !body.mimeType) {
    return c.json({ success: false, content: "Missing image data" }, 400);
  }

  try {
    if (mode === "pet_fashion") {
      const generationCount = await getDailyGenerationCount(c.env.DB, ip);
      if (generationCount >= DAILY_FASHION_LIMIT) {
        return c.json({ success: false, content: "抱歉~今日用户量已达上限，请明日再试或联系开发者" });
      }
    }

    generationId = await createGenerationRecord(c.env.DB, ip, mode);
    const result = await generateChristmasPet(c.env.POE_API_KEY, body.base64Image, body.mimeType, mode);

    if (result.success) {
      const storedImageUri = result.content.startsWith("data:image")
        ? await uploadResultImage(c.env.IMAGES_BUCKET, generationId, result.content)
        : result.content.startsWith("http")
          ? result.content
          : null;

      await c.env.DB.prepare(
        `UPDATE generations
         SET status = ?, image_uri = ?, image_metadata = ?, prompt = ?
         WHERE id = ?`
      )
        .bind(
          "completed",
          storedImageUri,
          JSON.stringify({
            mimeType: result.content.startsWith("data:image") ? "image/png" : null,
            mode,
            transport: result.content.startsWith("data:image") ? "data_url" : "remote_url"
          }),
          result.prompt || "Christmas Pet Generation",
          generationId
        )
        .run();
    } else {
      await c.env.DB.prepare(
        `UPDATE generations
         SET status = ?, error_log = ?
         WHERE id = ?`
      )
        .bind("failed", result.content, generationId)
        .run();
    }

    return c.json(result);
  } catch (error: any) {
    const message = formatGenerationErrorMessage(error);
    console.error("Worker generation failed:", error);

    if (generationId !== null) {
      await c.env.DB.prepare(
        `UPDATE generations
         SET status = ?, error_log = ?
         WHERE id = ?`
      )
        .bind("error", message, generationId)
        .run()
        .catch((dbError) => {
          console.error("Failed to persist generation error state:", dbError);
        });
    }

    return c.json({ success: false, content: message }, 500);
  }
});

export default app;

function getClientIp(
  cfConnectingIp: string | null | undefined,
  forwardedFor: string | null | undefined
): string {
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return "unknown";
}

async function getDailyGenerationCount(db: D1Database, ip: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM generations
       WHERE ip_address = ?
         AND created_at >= ?
         AND image_metadata LIKE ?
         AND status = ?`
    )
    .bind(ip, startOfDay.getTime(), '%"mode":"pet_fashion"%', "completed")
    .first<{ count: number | string }>();

  return Number(row?.count ?? 0);
}

async function createGenerationRecord(
  db: D1Database,
  ip: string,
  mode: GenerateMode
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO generations (
        user_id,
        user_email,
        ip_address,
        prompt,
        created_at,
        status,
        image_metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      "anonymous",
      null,
      ip,
      "Christmas Pet Generation",
      Date.now(),
      "started",
      JSON.stringify({ mode })
    )
    .run();

  return Number(result.meta.last_row_id);
}

async function uploadResultImage(
  bucket: R2Bucket | undefined,
  generationId: number,
  dataUrl: string
): Promise<string | null> {
  if (!bucket) {
    return null;
  }

  const base64Data = dataUrl.split(",")[1];
  const key = `anonymous/${generationId}.png`;
  const imageBuffer = Buffer.from(base64Data, "base64");

  await bucket.put(key, imageBuffer, {
    httpMetadata: {
      contentType: "image/png"
    }
  });

  return key;
}

function formatGenerationErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "Internal Server Error");

  if (message.includes("no such table:")) {
    return "Database schema is missing for this environment. Run the D1 migrations and try again.";
  }

  return message;
}
