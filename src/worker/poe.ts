import { Buffer } from "node:buffer";

const POE_CHAT_COMPLETIONS_URL = "https://api.poe.com/v1/chat/completions";
const POE_PROMPT_MODEL = "gemini-3.1-pro";
const POE_IMAGE_MODEL = "nano-banana-pro";
const MODE_SETTINGS = {
  simple_hat: {
    aspectRatio: "3:4",
    size: "2K"
  },
  pet_fashion: {
    aspectRatio: "3:4",
    size: "2K"
  }
} as const;

const CHRISTMAS_ACCESSORIES = [
  "a lime green plush Christmas tree hoodie costume with an attached pointed hood, a glittery red star topper, and multicolored fuzzy pom-pom ornaments",
  "a dark teal sherpa Christmas tree headpiece with a metallic gold star topper, pastel pom-pom ornaments, and a tartan bow tie collar",
  "a forest green velvet Santa elf hat with white faux fur trim and golden jingle bell accents, paired with a matching scalloped cape",
  "a bright green felt Christmas tree cape with a pointed hood topped with a gold glitter star and rainbow pom-pom ornaments",
  "a cream-colored ultra-soft sherpa reindeer hood with brown felt antlers and a sparkly red pom-pom nose",
  "a hand-crocheted Christmas tree beanie in variegated green yarn with white snow-like stripes and a knitted gold star topper"
];

const CHRISTMAS_THEMES = [
  {
    base: "a vintage wooden Santa sleigh with aged red paint and gold trim",
    props:
      "luxuriously wrapped burgundy and emerald gift boxes, scattered peppermint candy canes, glass golden baubles, knitted stockings, and warm fairy lights",
    mood: "warm, joyful, and polished like a premium holiday magazine cover"
  },
  {
    base: "a weathered antique wooden crate with faded holiday typography",
    props:
      "antique brass sleigh bells, dried orange slices, bundled cinnamon sticks, rustic ribbon bows, and sepia-toned Christmas postcards",
    mood: "nostalgic, rustic, and quietly elegant"
  },
  {
    base: "a raw-edge birch wood slice with visible bark and natural grain",
    props:
      "hand-carved wooden ornaments, white taper candles, red berries, curled birch bark strips, and soft evergreen sprigs",
    mood: "minimalist Scandinavian holiday elegance with cozy warmth"
  }
];

const FASHION_PROMPT_SYSTEM_INSTRUCTION = `# Role
You are a world-class pet fashion art director and prompt writer.
You analyze a real pet photo and produce one premium English image prompt for an image generation model.

# Goal
Create a single English prompt for an editorial Christmas pet portrait.
The generated image must:
- preserve the exact pet identity from the reference photo
- use a pure white isolated background
- feel like a premium holiday magazine cover
- include rich Christmas styling, luxurious textures, and tasteful scene props

# Output
Return JSON only in the format:
{"prompt":"..."}

# Rules
- The prompt must be in English.
- Keep the pet identity, breed, fur pattern, face shape, and body proportions faithful to the reference image.
- Explicitly mention "pure white background" and "isolated".
- Do not mention camera UI, JSON, analysis, or explanations.
- Return only one prompt string in the JSON object.`;

export interface GenerationResult {
  success: boolean;
  content: string;
  prompt?: string;
}

interface PoeMessageContentPart {
  text?: string;
  type?: string;
  image_url?: {
    url?: string;
  };
}

interface PoeChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | PoeMessageContentPart[];
    };
  }>;
  error?: {
    code?: number | string;
    type?: string;
    message?: string;
  };
}

class PoeApiError extends Error {
  status: number;
  retryAfterMs: number | null;

  constructor(message: string, status: number, retryAfterMs: number | null = null) {
    super(message);
    this.name = "PoeApiError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export async function generateChristmasPet(
  apiKey: string,
  base64Image: string,
  mimeType: string,
  mode: "pet_fashion" | "simple_hat" = "pet_fashion"
): Promise<GenerationResult> {
  if (!apiKey) {
    return { success: false, content: "POE_API_KEY is not configured." };
  }

  try {
    const prompt = await generatePromptWithGemini(apiKey, base64Image, mimeType, mode);
    const completion = await withRetry(() =>
      callPoeImageModel(apiKey, prompt, base64Image, mimeType, mode)
    );
    const imageUrl = extractImageUrl(completion);

    if (!imageUrl) {
      console.error("Poe image response did not include an image URL:", completion);
      return { success: false, content: "No image was returned by Poe." };
    }

    try {
      const dataUrl = await convertImageUrlToDataUrl(imageUrl);
      return {
        success: true,
        content: dataUrl,
        prompt
      };
    } catch (error) {
      // Cloudflare's runtime occasionally fails when refetching the generated Poe CDN image.
      // The frontend can render the original URL directly, so keep the request successful.
      console.warn("Falling back to Poe CDN image URL after data URL conversion failed:", error);
      return {
        success: true,
        content: imageUrl,
        prompt
      };
    }
  } catch (error) {
    console.error("Poe image generation failed:", error);
    return {
      success: false,
      content: formatPoeError(error)
    };
  }
}

async function generatePromptWithGemini(
  apiKey: string,
  base64Image: string,
  mimeType: string,
  mode: "pet_fashion" | "simple_hat"
): Promise<string> {
  const promptRequest =
    mode === "simple_hat"
      ? buildSimpleHatPromptRequest()
      : buildFashionPromptRequest();

  const completion = await withRetry(() =>
    callPoePromptModel(
      apiKey,
      promptRequest.systemInstruction,
      promptRequest.userInstruction,
      base64Image,
      mimeType
    )
  );

  const content = extractMessageContent(completion);
  const prompt = extractPromptFromGeminiContent(content);

  if (!prompt) {
    throw new Error("Gemini did not return a usable prompt.");
  }

  return prompt;
}

function buildSimpleHatPromptRequest(): {
  systemInstruction: string;
  userInstruction: string;
} {
  return {
    systemInstruction: `You are an expert image-edit prompt writer.
Return JSON only in the format {"prompt":"..."}.
Write one concise English prompt for an image model editing the attached image.
The prompt must preserve the exact subject, framing, lighting, and background.
The only change should be adding a festive red Santa hat with white fur trim and a fluffy white pom-pom.
Do not include explanations.`,
    userInstruction:
      "Analyze the attached image and write the final edit prompt now."
  };
}

function buildFashionPromptRequest(): {
  systemInstruction: string;
  userInstruction: string;
} {
  const accessory = pickRandom(CHRISTMAS_ACCESSORIES);
  const theme = pickRandom(CHRISTMAS_THEMES);

  return {
    systemInstruction: FASHION_PROMPT_SYSTEM_INSTRUCTION,
    userInstruction: [
      "Analyze the attached pet photo and write the final English image prompt now.",
      "Use the following required styling direction:",
      `- Outfit/accessory: ${accessory}`,
      `- Base scene element: ${theme.base}`,
      `- Supporting props: ${theme.props}`,
      `- Mood: ${theme.mood}`
    ].join("\n")
  };
}

async function callPoeImageModel(
  apiKey: string,
  prompt: string,
  base64Image: string,
  mimeType: string,
  mode: "pet_fashion" | "simple_hat"
): Promise<PoeChatCompletionResponse> {
  const settings = MODE_SETTINGS[mode];

  const response = await fetch(POE_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: POE_IMAGE_MODEL,
      stream: false,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      extra_body: {
        aspect_ratio: settings.aspectRatio,
        size: settings.size
      }
    })
  });

  const retryAfterMs = parseRetryAfterHeader(response.headers.get("Retry-After"));
  const payload = await response.json().catch(() => null) as PoeChatCompletionResponse | null;

  if (!response.ok) {
    const message = payload?.error?.message || `Poe request failed with status ${response.status}`;
    throw new PoeApiError(message, response.status, retryAfterMs);
  }

  return payload ?? {};
}

async function callPoePromptModel(
  apiKey: string,
  systemInstruction: string,
  userInstruction: string,
  base64Image: string,
  mimeType: string
): Promise<PoeChatCompletionResponse> {
  const response = await fetch(POE_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: POE_PROMPT_MODEL,
      stream: false,
      messages: [
        {
          role: "system",
          content: systemInstruction
        },
        {
          role: "user",
          content: [
            { type: "text", text: userInstruction },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ]
    })
  });

  const retryAfterMs = parseRetryAfterHeader(response.headers.get("Retry-After"));
  const payload = await response.json().catch(() => null) as PoeChatCompletionResponse | null;

  if (!response.ok) {
    const message = payload?.error?.message || `Poe request failed with status ${response.status}`;
    throw new PoeApiError(message, response.status, retryAfterMs);
  }

  return payload ?? {};
}

async function withRetry<T>(
  operation: () => Promise<T>,
  retries = 3,
  baseDelayMs = 1_500
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!(error instanceof PoeApiError) || retries <= 0 || !shouldRetry(error.status)) {
      throw error;
    }

    const waitMs =
      error.retryAfterMs ??
      Math.round(baseDelayMs * (1 + Math.random() * 0.2));

    console.warn(`Poe API retry after ${waitMs}ms (status ${error.status}, ${retries} retries left)`);
    await delay(waitMs);

    return withRetry(operation, retries - 1, Math.round(baseDelayMs * 1.8));
  }
}

function shouldRetry(status: number): boolean {
  return [408, 429, 500, 502, 503, 529].includes(status);
}

function parseRetryAfterHeader(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000;
  }

  const dateValue = Date.parse(value);
  if (!Number.isNaN(dateValue)) {
    return Math.max(dateValue - Date.now(), 0);
  }

  return null;
}

function extractMessageContent(response: PoeChatCompletionResponse): string {
  const content = response.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => part?.text ?? "")
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

function extractImageUrl(response: PoeChatCompletionResponse): string | null {
  const content = response.choices?.[0]?.message?.content;

  if (Array.isArray(content)) {
    const structuredImageUrl = content.find((part) => part?.image_url?.url)?.image_url?.url;
    if (structuredImageUrl) {
      return structuredImageUrl;
    }
  }

  const textContent = extractMessageContent(response);
  return extractImageUrlFromText(textContent);
}

function extractImageUrlFromText(content: string): string | null {
  const markdownMatch = content.match(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/i);
  if (markdownMatch?.[1]) {
    return markdownMatch[1];
  }

  const directUrlMatch = content.match(/https?:\/\/\S+/i);
  if (!directUrlMatch?.[0]) {
    return null;
  }

  return directUrlMatch[0].replace(/[),.\]]+$/, "");
}

function extractPromptFromGeminiContent(content: string): string | null {
  const fencedJsonMatch = content.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fencedJsonMatch?.[1]?.trim() || content.trim();

  const parsedPrompt = tryParsePromptJson(candidate);
  if (parsedPrompt) {
    return parsedPrompt;
  }

  return candidate || null;
}

function tryParsePromptJson(value: string): string | null {
  const objectMatch = value.match(/\{[\s\S]*\}/);
  if (!objectMatch) {
    return null;
  }

  try {
    const parsed = JSON.parse(objectMatch[0]) as { prompt?: unknown };
    return typeof parsed.prompt === "string" ? parsed.prompt.trim() : null;
  } catch {
    return null;
  }
}

async function convertImageUrlToDataUrl(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download generated image (${response.status})`);
  }

  const contentType = response.headers.get("content-type") ?? "image/png";
  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  return `data:${contentType};base64,${base64}`;
}

function formatPoeError(error: unknown): string {
  if (!(error instanceof PoeApiError)) {
    if (error instanceof Error && /network connection lost/i.test(error.message)) {
      return "The connection to Poe dropped before image generation finished. Please try again.";
    }

    return error instanceof Error ? error.message : "An unexpected error occurred.";
  }

  if (error.status === 401) {
    return "Poe API key is invalid or expired.";
  }

  if (error.status === 402) {
    return "Poe account points are insufficient. Please recharge or use another key.";
  }

  if (error.status === 403) {
    return "Poe rejected this request due to permission or moderation rules.";
  }

  if (error.status === 404) {
    return "Poe image model was not found. Please verify Nano-Banana-Pro is available for this account.";
  }

  if (error.status === 408 || error.status === 429 || error.status === 529) {
    return "Poe is busy right now. Please try again in a moment.";
  }

  if (error.status >= 500) {
    return "Poe or the upstream image model is temporarily unavailable. Please try again shortly.";
  }

  return error.message;
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
