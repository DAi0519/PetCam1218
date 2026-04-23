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

interface GenerateEnqueueResponse {
  success: boolean;
  generationId?: number;
  status?: string;
  content: string;
}

interface GenerationMetadata {
  mode?: GenerateMode;
  mimeType?: string;
  inlineDataUrl?: string;
  inputMimeType?: string;
  inputImageUri?: string | null;
  inlineInputDataUrl?: string;
  processingStartedAt?: number;
}

const PROCESSING_RETRY_AFTER_MS = 15 * 1000;

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

    const generationId = await createGenerationRecord(c.env.DB, ip, mode);
    const inputImage = await persistGenerationInput(
      c.env.IMAGES_BUCKET,
      generationId,
      body.base64Image,
      body.mimeType
    );

    await c.env.DB.prepare(
      `UPDATE generations
       SET image_metadata = ?
       WHERE id = ? AND ip_address = ?`
    )
      .bind(
        JSON.stringify({
          mode,
          inputMimeType: inputImage.mimeType,
          inputImageUri: inputImage.imageUri,
          inlineInputDataUrl: inputImage.inlineDataUrl
        } satisfies GenerationMetadata),
        generationId,
        ip
      )
      .run();

    return c.json<GenerateEnqueueResponse>({
      success: true,
      generationId,
      status: "queued",
      content: "Generation queued."
    });
  } catch (error: any) {
    const message = formatGenerationErrorMessage(error);
    console.error("Worker generation enqueue failed:", error);
    return c.json({ success: false, content: message }, 500);
  }
});

app.post("/api/public/gemini/generate/:id/process", async (c) => {
  const generationId = parseGenerationId(c.req.param("id"));
  if (generationId === null) {
    return c.json({ success: false, content: "Invalid generation id." }, 400);
  }

  const ip = getClientIp(c.req.header("CF-Connecting-IP"), c.req.header("x-forwarded-for"));
  const record = await getGenerationRecord(c.env.DB, generationId, ip);

  if (!record) {
    return c.json({ success: false, content: "Generation not found." }, 404);
  }

  const metadata = parseGenerationMetadata(record.imageMetadata);
  const normalizedStatus = normalizeGenerationStatus(record.status);

  if (normalizedStatus === "completed") {
    return c.json({ success: true, content: "Generation already completed.", status: normalizedStatus });
  }

  if (normalizedStatus === "failed" || normalizedStatus === "error") {
    return c.json({ success: false, content: record.errorLog || "Generation failed.", status: normalizedStatus }, 409);
  }

  if (!canStartGenerationProcessing(normalizedStatus, metadata.processingStartedAt ?? null)) {
    return c.json({ success: true, content: "Generation is already processing.", status: "processing" });
  }

  const processingMetadata: GenerationMetadata = {
    ...metadata,
    processingStartedAt: Date.now()
  };

  await c.env.DB.prepare(
    `UPDATE generations
     SET status = ?, image_metadata = ?, error_log = ?
     WHERE id = ? AND ip_address = ?`
  )
    .bind("processing", JSON.stringify(processingMetadata), null, generationId, ip)
    .run();

  const inputImage = await loadGenerationInput(c.env.IMAGES_BUCKET, processingMetadata);
  if (!inputImage) {
    await c.env.DB.prepare(
      `UPDATE generations
       SET status = ?, error_log = ?
       WHERE id = ? AND ip_address = ?`
    )
      .bind("error", "Original uploaded image is unavailable for processing.", generationId, ip)
      .run();

    return c.json({ success: false, content: "Original uploaded image is unavailable for processing." }, 410);
  }

  await processGenerationJob(
    c.env.DB,
    c.env.IMAGES_BUCKET,
    c.env.POE_API_KEY,
    generationId,
    ip,
    inputImage.base64Image,
    inputImage.mimeType,
    metadata.mode === "simple_hat" ? "simple_hat" : "pet_fashion"
  );

  return c.json({ success: true, content: "Generation processing finished." });
});

app.get("/api/public/gemini/generate/:id", async (c) => {
  const generationId = parseGenerationId(c.req.param("id"));
  if (generationId === null) {
    return c.json({ success: false, content: "Invalid generation id." }, 400);
  }

  const ip = getClientIp(c.req.header("CF-Connecting-IP"), c.req.header("x-forwarded-for"));
  const record = await getGenerationRecord(c.env.DB, generationId, ip);

  if (!record) {
    return c.json({ success: false, content: "Generation not found." }, 404);
  }

  const metadata = parseGenerationMetadata(record.imageMetadata);
  const normalizedStatus = normalizeGenerationStatus(record.status);

  if (normalizedStatus === "completed") {
    return c.json({
      success: true,
      generationId,
      status: normalizedStatus,
      content: "Generation completed.",
      prompt: record.prompt,
      imageUrl: buildGenerationImagePath(generationId)
    });
  }

  if (normalizedStatus === "failed" || normalizedStatus === "error") {
    return c.json({
      success: false,
      generationId,
      status: normalizedStatus,
      content: record.errorLog || "Generation failed.",
      prompt: record.prompt,
      mode: metadata.mode ?? null
    });
  }

  return c.json({
    success: true,
    generationId,
    status: normalizedStatus,
    content: "Generation still processing.",
    prompt: record.prompt,
    mode: metadata.mode ?? null
  });
});

app.get("/api/public/gemini/generate/:id/image", async (c) => {
  const generationId = parseGenerationId(c.req.param("id"));
  if (generationId === null) {
    return c.json({ success: false, content: "Invalid generation id." }, 400);
  }

  const ip = getClientIp(c.req.header("CF-Connecting-IP"), c.req.header("x-forwarded-for"));
  const record = await getGenerationRecord(c.env.DB, generationId, ip);

  if (!record || normalizeGenerationStatus(record.status) !== "completed") {
    return c.json({ success: false, content: "Generated image not found." }, 404);
  }

  const metadata = parseGenerationMetadata(record.imageMetadata);

  if (record.imageUri && c.env.IMAGES_BUCKET) {
    const object = await c.env.IMAGES_BUCKET.get(record.imageUri);
    if (!object) {
      return c.json({ success: false, content: "Generated image asset is missing." }, 404);
    }

    const contentType = object.httpMetadata?.contentType || metadata.mimeType || "image/png";
    return new Response(object.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=31536000, immutable"
      }
    });
  }

  if (metadata.inlineDataUrl) {
    const inlineResponse = dataUrlToResponse(metadata.inlineDataUrl);
    if (inlineResponse) {
      return inlineResponse;
    }
  }

  return c.json({ success: false, content: "Generated image asset is unavailable." }, 404);
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
      "queued",
      JSON.stringify({ mode })
    )
    .run();

  return Number(result.meta.last_row_id);
}

async function processGenerationJob(
  db: D1Database,
  bucket: R2Bucket | undefined,
  apiKey: string,
  generationId: number,
  ip: string,
  base64Image: string,
  mimeType: string,
  mode: GenerateMode
): Promise<void> {
  try {
    const result = await generateChristmasPet(apiKey, base64Image, mimeType, mode);
    const currentMetadata = await getGenerationRecord(db, generationId, ip);
    const parsedMetadata = parseGenerationMetadata(currentMetadata?.imageMetadata ?? null);

    if (result.success && result.content.startsWith("data:image")) {
      const storedImage = await persistGeneratedImage(bucket, generationId, result.content);

      await db.prepare(
        `UPDATE generations
         SET status = ?, image_uri = ?, image_metadata = ?, prompt = ?, error_log = ?
         WHERE id = ? AND ip_address = ?`
      )
        .bind(
          "completed",
          storedImage.imageUri,
          JSON.stringify({
            ...parsedMetadata,
            mimeType: storedImage.mimeType,
            mode,
            inlineDataUrl: storedImage.inlineDataUrl,
            processingStartedAt: undefined
          } satisfies GenerationMetadata),
          result.prompt || "Christmas Pet Generation",
          null,
          generationId,
          ip
        )
        .run();
      return;
    }

    await db.prepare(
      `UPDATE generations
       SET status = ?, error_log = ?, image_metadata = ?
       WHERE id = ? AND ip_address = ?`
    )
      .bind(
        "failed",
        result.content,
        JSON.stringify({
          ...parsedMetadata,
          processingStartedAt: undefined
        } satisfies GenerationMetadata),
        generationId,
        ip
      )
      .run();
  } catch (error) {
    const message = formatGenerationErrorMessage(error);
    console.error("Worker generation failed:", error);
    const currentMetadata = await getGenerationRecord(db, generationId, ip);
    const parsedMetadata = parseGenerationMetadata(currentMetadata?.imageMetadata ?? null);

    await db.prepare(
      `UPDATE generations
       SET status = ?, error_log = ?, image_metadata = ?
       WHERE id = ? AND ip_address = ?`
    )
      .bind(
        "error",
        message,
        JSON.stringify({
          ...parsedMetadata,
          processingStartedAt: undefined
        } satisfies GenerationMetadata),
        generationId,
        ip
      )
      .run()
      .catch((dbError) => {
        console.error("Failed to persist generation error state:", dbError);
      });
  }
}

async function persistGenerationInput(
  bucket: R2Bucket | undefined,
  generationId: number,
  base64Image: string,
  mimeType: string
): Promise<{ imageUri: string | null; inlineDataUrl?: string; mimeType: string }> {
  if (bucket) {
    const key = `anonymous/${generationId}-input`;
    const imageBuffer = Buffer.from(base64Image, "base64");
    await bucket.put(key, imageBuffer, {
      httpMetadata: {
        contentType: mimeType
      }
    });

    return { imageUri: key, mimeType };
  }

  return {
    imageUri: null,
    inlineDataUrl: `data:${mimeType};base64,${base64Image}`,
    mimeType
  };
}

async function loadGenerationInput(
  bucket: R2Bucket | undefined,
  metadata: GenerationMetadata
): Promise<{ base64Image: string; mimeType: string } | null> {
  if (metadata.inputImageUri && bucket) {
    const object = await bucket.get(metadata.inputImageUri);
    if (!object) {
      return null;
    }

    const arrayBuffer = await object.arrayBuffer();
    return {
      base64Image: Buffer.from(arrayBuffer).toString("base64"),
      mimeType: object.httpMetadata?.contentType || metadata.inputMimeType || "image/png"
    };
  }

  if (metadata.inlineInputDataUrl) {
    const parsed = parseDataUrl(metadata.inlineInputDataUrl);
    if (parsed) {
      return {
        base64Image: parsed.base64Data,
        mimeType: parsed.mimeType
      };
    }
  }

  return null;
}

function canStartGenerationProcessing(status: string, processingStartedAt: number | null): boolean {
  if (status === "queued") {
    return true;
  }

  if (status !== "processing") {
    return false;
  }

  if (!processingStartedAt) {
    return true;
  }

  return Date.now() - processingStartedAt >= PROCESSING_RETRY_AFTER_MS;
}

async function getGenerationRecord(db: D1Database, generationId: number, ip: string) {
  return db
    .prepare(
      `SELECT id, prompt, status, image_uri AS imageUri, image_metadata AS imageMetadata, error_log AS errorLog
       FROM generations
       WHERE id = ? AND ip_address = ?`
    )
    .bind(generationId, ip)
    .first<{
      id: number;
      prompt: string | null;
      status: string | null;
      imageUri: string | null;
      imageMetadata: string | null;
      errorLog: string | null;
    }>();
}

async function uploadResultImage(
  bucket: R2Bucket | undefined,
  generationId: number,
  dataUrl: string
) : Promise<string | null> {
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

async function persistGeneratedImage(
  bucket: R2Bucket | undefined,
  generationId: number,
  dataUrl: string
): Promise<{ imageUri: string | null; inlineDataUrl?: string; mimeType: string }> {
  const mimeType = extractMimeTypeFromDataUrl(dataUrl) ?? "image/png";
  const imageUri = await uploadResultImage(bucket, generationId, dataUrl);

  if (imageUri) {
    return { imageUri, mimeType };
  }

  return {
    imageUri: null,
    inlineDataUrl: dataUrl,
    mimeType
  };
}

function parseGenerationId(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parseGenerationMetadata(value: string | null): GenerationMetadata {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as GenerationMetadata;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeGenerationStatus(status: string | null): string {
  if (!status || status === "started") {
    return "processing";
  }

  return status;
}

function buildGenerationImagePath(generationId: number): string {
  return `/api/public/gemini/generate/${generationId}/image`;
}

function extractMimeTypeFromDataUrl(dataUrl: string): string | null {
  const match = dataUrl.match(/^data:([^;,]+)[;,]/i);
  return match?.[1] ?? null;
}

function dataUrlToResponse(dataUrl: string): Response | null {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    return null;
  }

  const buffer = Buffer.from(parsed.base64Data, "base64");
  return new Response(buffer, {
    headers: {
      "Content-Type": parsed.mimeType,
      "Cache-Control": "private, max-age=31536000, immutable"
    }
  });
}

function parseDataUrl(dataUrl: string): { mimeType: string; base64Data: string } | null {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) {
    return null;
  }

  return {
    mimeType: match[1],
    base64Data: match[2]
  };
}

function formatGenerationErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "Internal Server Error");

  if (message.includes("no such table:")) {
    return "Database schema is missing for this environment. Run the D1 migrations and try again.";
  }

  return message;
}
