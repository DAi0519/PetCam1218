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

app.get("/api/public/generations/:id/image", async (c) => {
  const generationId = Number(c.req.param("id"));
  if (!Number.isInteger(generationId) || generationId <= 0) {
    return c.json({ success: false, content: "Invalid generation id" }, 400);
  }

  const record = await c.env.DB.prepare(
    `SELECT image_uri, image_metadata
     FROM generations
     WHERE id = ? AND status = ?`
  )
    .bind(generationId, "completed")
    .first<{ image_uri?: string | null; image_metadata?: string | null }>();

  if (!record?.image_uri) {
    return c.json({ success: false, content: "Image not found" }, 404);
  }

  if (/^https?:\/\//i.test(record.image_uri)) {
    return c.redirect(record.image_uri, 302);
  }

  if (!c.env.IMAGES_BUCKET) {
    return c.json({ success: false, content: "Image storage is not configured" }, 503);
  }

  const object = await c.env.IMAGES_BUCKET.get(record.image_uri);
  if (!object) {
    return c.json({ success: false, content: "Stored image not found" }, 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");

  const storedMimeType = readStoredMimeType(record.image_metadata);
  if (storedMimeType && !headers.has("content-type")) {
    headers.set("content-type", storedMimeType);
  }

  return new Response(object.body, {
    headers
  });
});

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
      const isDataUrl = result.content.startsWith("data:image");
      const isRemoteUrl = result.content.startsWith("http");
      const responseImageUrl = buildGenerationImageUrl(new URL(c.req.url).origin, generationId);
      let storedImageUri: string | null = null;
      let storedMimeType: string | null = null;
      let transport: "data_url" | "remote_url" | "remote_url_mirrored" | "unknown" = "unknown";

      if (isDataUrl) {
        transport = "data_url";
        storedImageUri = await uploadResultImage(c.env.IMAGES_BUCKET, generationId, result.content);
        storedMimeType = "image/png";
      } else if (isRemoteUrl) {
        transport = "remote_url";
        const mirroredImage = await uploadRemoteResultImage(c.env.IMAGES_BUCKET, generationId, result.content);
        if (mirroredImage) {
          storedImageUri = mirroredImage.key;
          storedMimeType = mirroredImage.contentType;
          transport = "remote_url_mirrored";
        }
      }

      await c.env.DB.prepare(
        `UPDATE generations
         SET status = ?, image_uri = ?, image_metadata = ?, prompt = ?
         WHERE id = ?`
      )
        .bind(
          "completed",
          storedImageUri ?? (isRemoteUrl ? result.content : null),
          JSON.stringify({
            mimeType: storedMimeType,
            mode,
            transport
          }),
          result.prompt || "Christmas Pet Generation",
          generationId
        )
        .run();

      return c.json({
        ...result,
        content: storedImageUri ? responseImageUrl : result.content
      });
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

async function uploadRemoteResultImage(
  bucket: R2Bucket | undefined,
  generationId: number,
  imageUrl: string
): Promise<{ key: string; contentType: string | null } | null> {
  if (!bucket) {
    return null;
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download generated image (${response.status})`);
  }

  const key = `anonymous/${generationId}.png`;
  await bucket.put(key, response.body, {
    httpMetadata: {
      contentType: response.headers.get("content-type") ?? "image/png"
    }
  });

  return {
    key,
    contentType: response.headers.get("content-type")
  };
}

function buildGenerationImageUrl(origin: string, generationId: number): string {
  return `${origin}/api/public/generations/${generationId}/image`;
}

function readStoredMimeType(imageMetadata: string | null | undefined): string | null {
  if (!imageMetadata) {
    return null;
  }

  try {
    const parsed = JSON.parse(imageMetadata) as { mimeType?: unknown };
    return typeof parsed.mimeType === "string" ? parsed.mimeType : null;
  } catch {
    return null;
  }
}

function formatGenerationErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "Internal Server Error");

  if (message.includes("no such table:")) {
    return "Database schema is missing for this environment. Run the D1 migrations and try again.";
  }

  return message;
}
