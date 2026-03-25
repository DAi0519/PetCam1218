import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Client } from "@sdk/server-types";
import { tables, buckets } from "@generated";
import { GoogleGenAI, Type } from "@google/genai";
import { eq, and, gte, like, count, sql } from "drizzle-orm";

// --- Constants ---

const CHRISTMAS_ACCESSORIES = [
  {
    url: "https://pfst.cf2.poecdn.net/base/image/d0ec2fcc0a7067d2862c8a7c20129c456e4d96d887122fb3488d4091cd3929ec?w=993&h=970",
    style: "a lime green plush Christmas tree hoodie costume with an attached pointed hood shaped like a Christmas tree top, featuring a glittery red star on the peak, multicolored fuzzy pom-pom ornaments (red, blue, yellow, green) scattered across the fabric, soft fleece material with a cozy texture"
  },
  {
    url: "https://pfst.cf2.poecdn.net/base/image/eda61c4f24ae0a04395a2797a7acc19feb4207bb5fd7860ff90cf47f97ebfcba?w=2101&h=2174",
    style: "a dark teal sherpa fleece Christmas tree headpiece with a golden metallic star topper, adorned with a red satin ribbon bow featuring white snowflake and Santa prints, pastel pink and yellow fuzzy pom-pom ornaments, paired with a classic red-green tartan plaid bow tie collar with golden jingle bells and holly berry accents"
  },
  {
    url: "https://pfst.cf2.poecdn.net/base/image/8324a44a04f199c5e0308cd876a723ae0421523f4cd1640e7cfdecdd4dabc797?w=1024&h=1024",
    style: "a forest green velvet Santa elf hat with white faux fur trim and golden jingle bell accents, paired with a matching green scalloped cape featuring embroidered golden snowflakes, finished with a luxurious red-green striped grosgrain ribbon bow and a miniature evergreen wreath with red berry details at the collar"
  },
  {
    url: "https://pfst.cf2.poecdn.net/base/image/41b1e759f02716c0ee2ba4fff54cbd0fc41d823c91c74e10bf481670d0fa8a08?w=679&h=767",
    style: "a bright green felt Christmas tree cape with a pointed hood topped with a gold glitter star, decorated with rainbow-colored fuzzy pom-pom balls as ornaments along the edges, secured with a white braided cord tie at the neck, whimsical and playful holiday costume style"
  },
  {
    url: "https://pfst.cf2.poecdn.net/base/image/60c31fc543861efb7af2597b20ee708e49103890a67d5be43879c06a3f348fef?w=1200&h=1200",
    style: "a cream-colored ultra-soft sherpa fleece hooded wrap styled as a reindeer costume, featuring brown felt antlers and a sparkly red pom-pom nose on top, cozy oversized hood framing the face, warm winter aesthetic with a Scandinavian hygge vibe"
  },
  {
    url: "https://pfst.cf2.poecdn.net/base/image/05a2acf5f146530f20516d89f611692050369b996d0e3fadaf20f242348b537b?w=800&h=1199",
    style: "a hand-crocheted Christmas tree beanie in variegated green yarn with white snow-like stripes, topped with a golden yellow knitted star, paired with a matching dark green crocheted collar with scalloped edges adorned with red yarn pom-pom ornaments, artisan handmade aesthetic with visible stitch texture"
  },
];

const CHRISTMAS_THEMES = [
  {
    scene: "cozy Christmas morning",
    base: "a vintage wooden Santa sleigh with aged red paint and gold trim, or a rustic woven wicker gift basket lined with plaid flannel fabric",
    props: "luxuriously wrapped gift boxes in burgundy and emerald velvet with satin ribbons and wax seals, scattered peppermint candy canes, hand-blown glass golden baubles with intricate patterns, a vintage wooden nutcracker figurine, spilled hot cocoa marshmallows, knitted wool stockings, twinkling fairy lights tangled casually",
    mood: "warm and joyful, like waking up to presents under the tree"
  },
  {
    scene: "vintage Christmas",
    base: "a weathered antique wooden crate with faded holiday typography, or a tarnished brass serving tray with ornate Victorian engravings",
    props: "tarnished antique brass sleigh bells on worn leather straps, dried orange slices with clove studs, bundled cinnamon sticks tied with twine, rustic burlap ribbon bows, sepia-toned Victorian Christmas postcards, mercury glass ornaments with aged patina, old brass candlesticks with dripping beeswax candles, vintage wooden spools with red thread",
    mood: "nostalgic and rustic, reminiscent of grandmother's holiday traditions"
  },
  {
    scene: "Nordic Christmas",
    base: "a raw-edge birch wood slice with visible bark and natural grain, or a minimalist white ceramic platter with matte glaze finish",
    props: "hand-carved wooden Dala horse ornaments, tall white beeswax taper candles in brass holders, clusters of wild red lingonberries on stems, curled birch bark strips with natural texture, minimalist ceramic houses, woven straw Yule goat figurines, sprigs of dried eucalyptus, simple linen napkins with cross-stitch details",
    mood: "minimalist Scandinavian elegance with hygge warmth"
  },
];

const SYSTEM_PROMPT = `# Role
你是 一位 **备受推崇的全球静物与宠物时尚摄影大师**，你的作品常刊登于《Vogue Pet》、《Kinfolk》或《Cereal》杂志。
你擅长 **"High-Fashion Editorial（高定时尚大片）"** 风格。你不仅是拍摄者，更是 **置景师**。你懂得如何通过 **材质的极致反差**（如：蓬松的生丝绒 vs 软糯的马海毛）和 **艺术化的散落道具**，在 **纯白背景** 下构建出极具高级感和叙事张力的画面。

# Goal
生成一段针对 Stable Diffusion / Midjourney 的英文提示词。
**核心任务**：将用户提供的 **真实宠物**，置入一个 **经过精心策划的微缩静物场景** 中。画面必须具备 **杂志封面的构图美学**，细节丰富，光影考究。

# Design Philosophy (美学核心)
1.  **The "Haute Couture" Knit (高定针织)**：帽子不仅仅是帽子，是 **时尚单品**。强调纱线的特殊质感（Mohair 马海毛, Angora 安哥拉羊毛, Chunky Roving 粗纱），造型要有设计感，有 **创意、时尚感**，同时保留可爱的特质。
2.  **Curated Set Design (策展式置景)**：
    *   **主底座**：必须有质感，符合主题的道具，创意趣味可爱底座（比如圣诞可乐木箱、老式雪橇车等等、自然肌理），发散你的创意。
    *   **Artful Clutter (艺术感散落)**：这是增加丰富度的关键。在容器周围或内部，必须有 **散落的微小道具**（如：几颗洒落的珍珠、几片干枯的尤加利叶、打翻的复古线轴、飞舞的羽毛）。
3.  **Textural Symphony (材质交响乐)**：画面必须包含至少三种材质的对比。例如：**宠物的毛发 (Fluffy) + 针织的软糯 (Soft) + 底座的硬朗 (Hard/Rough) + 植物的鲜活 (Organic)**。
4.  **Editorial Lighting (大片光影)**：拒绝平淡的白光。使用 **伦勃朗光 (Rembrandt)**、**侧逆光 (Rim Light)** 或 **斑驳光影 (Dappled Light)** 来增加画面的层次感和高级灰度。

# Prompt Structure (Output Format)
根据用户输入的宠物照片，分析并提取宠物形象特征，以及体型特征
请严格按照以下逻辑构建英文提示词：
在输出提示词前面加上固定前缀 "Pure white background, isolated, A realistic photo of the exact pet from the reference image: "

1.  **The Editorial Subject (超模感主体)**
    *   "Fashion editorial shot of a [Animal]..."
    *   "Pose: [Dynamic/Elegant Pose] (e.g., looking over shoulder, paw resting on edge)."
    *   "Vibe: [Specific Mood] (e.g., Melancholy, Aristocratic, Playful)."

2.  **The Haute Knitwear (针织时尚单品)**
    *   "Wearing a designer-style **[Color/Material] knitted Christmas bonnet/Santa hat**..."
    *   **细节升级**：Add texture keywords like "brushed mohair", "oversized chunky yarn", "loose gauge", "ribbed texture", "fluffy white pompom".

3.  **The Curated Scene (策展式场景 - 核心丰富度)**
    *   **Main Prop (主底座)**：Christmas-themed base like "vintage wooden Santa sleigh", "rustic gift box", "antique brass bell".
    *   **Styling Details (散落细节)**："Surrounded by artfully scattered [Christmas Props] (e.g., pine cones, holly berries, cinnamon sticks, golden ornaments, silk ribbons)."
    *   **Nature Element**："Intertwined with [Botanical Element] like pine branches, mistletoe."

4.  **Photography & Lighting (杂志规格)**
    *   "**Background: Pure white background, isolated.**"
    *   "Lighting: [Type] (e.g., Warm golden hour glow, soft window light with gobo shadows)."
    *   "Tech: 8k, macro details, depth of field, sharp focus on knit texture, Hasselblad quality, magazine cover composition."

# Constraints
*   **必须白底**：Prompt 开头必须包含 "Pure white background, isolated"。
*   **必须有散落细节**：场景描述必须包含 "Scattered", "Spilled", "Surrounded by" 等词汇，增加画面的丰富度和随意感。
*   **材质必须高级**：避免塑料感，多用 "Vintage", "Antique", "Natural", "Texture-rich" 等词汇。
*   **圣诞主题**：必须包含圣诞元素，如圣诞帽、雪橇、松果、冬青、麋鹿角等。`;

export interface GenerationResult {
  success: boolean;
  content: string;
  prompt?: string;
}

// Helper to safely fetch an image and convert to base64
async function fetchImageAsBase64(url: string): Promise<string | null> {
    try {
        const response = await fetch(url);
        if (!response.ok) {
             console.warn(`Failed to fetch accessory: ${response.status}`);
             return null;
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        return buffer.toString('base64');
    } catch (e) {
        console.warn("Failed to fetch accessory image:", e);
        return null;
    }
}

async function withRetry<T>(
    operation: () => Promise<T>, 
    retries = 3, 
    baseDelay = 2000
): Promise<T> {
    try {
        return await operation();
    } catch (error: any) {
        const isOverloaded = 
            error?.status === 503 || 
            error?.code === 503 || 
            (error?.message && error.message.toLowerCase().includes('overloaded')) ||
            (error?.message && error.message.toLowerCase().includes('unavailable'));

        if (isOverloaded && retries > 0) {
            console.warn(`Model overloaded (503). Retrying in ${baseDelay}ms... (${retries} attempts left)`);
            await new Promise(resolve => setTimeout(resolve, baseDelay));
            return withRetry(operation, retries - 1, baseDelay * 1.5);
        }
        throw error;
    }
}

async function generateChristmasPet(
  apiKey: string,
  base64Image: string,
  mimeType: string,
  mode: 'pet_fashion' | 'simple_hat' = 'pet_fashion'
): Promise<GenerationResult> {
  const ai = new GoogleGenAI({ apiKey });

  try {
    if (mode === 'simple_hat') {
        return await generateSimpleChristmasHat(ai, base64Image, mimeType, "the subject");
    }

    const detectPrompt = `Analyze this image carefully and determine:
1. Does it contain a pet (cat, dog, rabbit, hamster, bird, or other common household pets)?
2. Is it a REALISTIC PHOTOGRAPH of a real pet?

IMPORTANT: The image must be a real photographic image to qualify as "is_realistic_pet_photo".
The following should NOT be considered realistic pet photos:
- Cartoon, anime, or illustration style images
- Digital art, vector graphics, or avatars
- Stylized or artistic renderings
- AI-generated artistic images
- Logos or icons featuring pets
- Plush toys or figurines of pets

Only actual photographs of real, living pets should return is_realistic_pet_photo: true.`;

    const detectResponse = await withRetry(() => ai.models.generateContent({
      model: "gemini-3-pro-preview", 
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: base64Image } },
          { text: detectPrompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            is_pet: { type: Type.BOOLEAN },
            is_realistic_pet_photo: { type: Type.BOOLEAN },
            pet_type: { type: Type.STRING },
            subject_description: { type: Type.STRING }
          },
          required: ["is_pet", "is_realistic_pet_photo"]
        }
      }
    }));

    const detectionText = (detectResponse as any).text;
    const detectionData = JSON.parse(detectionText || "{}");
    const isRealisticPet = detectionData.is_pet && detectionData.is_realistic_pet_photo;

    if (!isRealisticPet) {
        return await generateSimpleChristmasHat(ai, base64Image, mimeType, detectionData.subject_description || "the subject");
    } else {
        return await generatePetFashionPortrait(ai, base64Image, mimeType);
    }

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    let errorMsg = error.message || "An unexpected error occurred.";
    
    const isQuotaExhausted = 
        error?.status === 429 || 
        error?.code === 429 || 
        (error?.message && error.message.includes('RESOURCE_EXHAUSTED')) ||
        (error?.statusText && error.statusText.includes('Too Many Requests'));

    if (isQuotaExhausted) {
        errorMsg = "抱歉~今日用户量已达上限，请明日再试或联系开发者";
    } else if (errorMsg.includes("overloaded") || error.code === 503) {
        errorMsg = "Server busy (High Traffic). Please try again in a moment.";
    }
    return { success: false, content: errorMsg };
  }
}

async function generateSimpleChristmasHat(
    ai: GoogleGenAI,
    base64Image: string,
    mimeType: string,
    subjectDescription: string
): Promise<GenerationResult> {
    const simplePrompt = `Add a festive red Santa Claus hat with white fur trim and a fluffy white pom-pom on top to ${subjectDescription} in this image. Keep the original image style and background, only add the Christmas hat naturally on the head.`;
    
    const response = await withRetry(() => ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: {
            parts: [
                { inlineData: { mimeType, data: base64Image } },
                { text: simplePrompt }
            ]
        },
        config: {
            imageConfig: {
                imageSize: "2K"
            }
        }
    }));

    return extractImageFromResponse(response, simplePrompt);
}

async function generatePetFashionPortrait(
    ai: GoogleGenAI,
    base64Image: string,
    mimeType: string
): Promise<GenerationResult> {
    const analysisPrompt = `请仔细分析这张宠物照片，提取宠物的品种、毛色、体型、表情等特征，然后根据系统提示词中的要求，为这只宠物生成一个圣诞主题的高级时尚摄影提示词。`;

    const analysisResponse = await withRetry(() => ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: {
            parts: [
                { inlineData: { mimeType, data: base64Image } },
                { text: analysisPrompt }
            ]
        },
        config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    prompt: { type: Type.STRING }
                },
                required: ["prompt"]
            }
        }
    }));

    const analysisText = (analysisResponse as any).text;
    const analysisData = JSON.parse(analysisText || "{}");
    const imagePrompt = analysisData.prompt;

    const accessory = CHRISTMAS_ACCESSORIES[Math.floor(Math.random() * CHRISTMAS_ACCESSORIES.length)];
    const theme = CHRISTMAS_THEMES[Math.floor(Math.random() * CHRISTMAS_THEMES.length)];
    
    const enhancedPrompt = `**CORE INSTRUCTION:**
Generate a high-fashion Christmas editorial photo using the first reference image as the subject.
- **Subject**: Strictly maintain the pet's identity, breed, fur details, and body proportions from the reference.
- **Action**: Pose the pet sitting or resting ON the base described below.
- **Outfit**: Apply the Christmas accessory style described below.
- **Setting**: Pure white background, isolated. High-end editorial lighting.

**Accessory Style:**
${accessory.style}

**Scene Details:**
- Base: ${theme.base}
- Props: ${theme.props}
- Mood: ${theme.mood}

**Pet Traits:**
${imagePrompt}`;

    const accessoryBase64 = await fetchImageAsBase64(accessory.url);
    if (!accessoryBase64) {
        console.warn("Could not fetch accessory image, proceeding with text description only.");
    }

    const parts: any[] = [
        { inlineData: { mimeType, data: base64Image } },
    ];

    if (accessoryBase64) {
        parts.push({ inlineData: { mimeType: "image/jpeg", data: accessoryBase64 } }); 
    }

    parts.push({ text: enhancedPrompt });

    const response = await withRetry(() => ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: { parts },
        config: {
            imageConfig: {
                aspectRatio: "3:4",
                imageSize: "2K"
            }
        }
    }));

    return extractImageFromResponse(response, enhancedPrompt);
}

function extractImageFromResponse(response: any, prompt?: string): GenerationResult {
    if (response.candidates && response.candidates[0].content && response.candidates[0].content.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData && part.inlineData.data) {
                return { success: true, content: `data:image/png;base64,${part.inlineData.data}`, prompt };
            }
        }
    }
    return { success: false, content: "No image generated." };
}

export async function createApp(
  edgespark: Client<typeof tables>
): Promise<Hono> {
  const app = new Hono();
  app.use('*', cors());

  // Admin Route: Ban/Unban User
  app.post('/api/public/admin/ban', async (c) => {
    const secret = c.req.header('x-admin-secret');
    const adminSecret = await edgespark.secret.get("ADMIN_SECRET");
    
    if (!adminSecret || secret !== adminSecret) {
        return c.json({ success: false, content: "Unauthorized" }, 401);
    }

    const { email, ban } = await c.req.json();
    if (!email) {
        return c.json({ success: false, content: "Email required" }, 400);
    }

    // Update user profile
    // We need to find the user first? Or just update by email if we can.
    // userProfiles table has email column.
    // But userId is PK.
    // We can update where email = email.
    
    const result = await edgespark.db.update(tables.userProfiles)
        .set({ isBanned: ban ? 1 : 0 })
        .where(eq(tables.userProfiles.email, email))
        .returning();

    if (result.length === 0) {
        // User might not exist in profiles yet (only created on first generation)
        // We can try to find them in auth table? No, we can't access auth table easily from here usually (it's system).
        // But we can just say "User not found in profiles".
        return c.json({ success: false, content: "User profile not found (user must have used the app at least once)" }, 404);
    }

    return c.json({ success: true, content: `User ${email} ${ban ? 'banned' : 'unbanned'}` });
  });

  app.post('/api/public/gemini/generate', async (c) => {
    // Public endpoint - No auth check
    const ip = c.req.header('CF-Connecting-IP') || 'unknown';
    
    const body = await c.req.json();
    let { base64Image, mimeType, mode } = body;
    mode = mode || 'pet_fashion';

    if (!base64Image || !mimeType) {
        return c.json({ success: false, content: "Missing image data" }, 400);
    }

    // Rate Limit Check
    if (mode === 'pet_fashion') {
        const startOfDay = new Date();
        startOfDay.setHours(0,0,0,0);
        const startTimestamp = startOfDay.getTime();

        const result = await edgespark.db.select({ count: count() })
            .from(tables.generations)
            .where(and(
                eq(tables.generations.ipAddress, ip),
                gte(tables.generations.createdAt, startTimestamp),
                like(tables.generations.imageMetadata, `%"mode":"pet_fashion"%`),
                eq(tables.generations.status, 'completed')
            ));
        
        if (result[0].count >= 20) {
             return c.json({ success: false, content: "抱歉~今日用户量已达上限，请明日再试或联系开发者" });
        }
    }

    const apiKey = await edgespark.secret.get("GEMINI_API_KEY");
    if (!apiKey) {
        return c.json({ success: false, content: "API Key not configured" }, 500);
    }

    // Log start
    const generation = await edgespark.db.insert(tables.generations).values({
        userId: "anonymous",
        userEmail: null,
        ipAddress: ip,
        prompt: "Christmas Pet Generation",
        createdAt: Date.now(),
        status: "started",
        imageMetadata: JSON.stringify({ mode })
    }).returning();
    const generationId = generation[0].id;

    try {
        const result = await generateChristmasPet(apiKey, base64Image, mimeType, mode);
        
        if (result.success && result.content.startsWith("data:image")) {
            // Upload to storage
            const base64Data = result.content.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const filename = `anonymous/${generationId}.png`;
            
            await edgespark.storage.from(buckets.images).put(filename, buffer.buffer as ArrayBuffer, {
                contentType: "image/png"
            });
            
            const uri = edgespark.storage.toS3Uri(buckets.images, filename);
            
            // Update generation record
            await edgespark.db.update(tables.generations)
                .set({ 
                    status: "completed",
                    imageUri: uri,
                    imageMetadata: JSON.stringify({ mimeType: "image/png", mode }),
                    prompt: result.prompt || "Christmas Pet Generation"
                })
                .where(eq(tables.generations.id, generationId));
        } else {
             // Failed generation
             await edgespark.db.update(tables.generations)
                .set({ 
                    status: "failed",
                    errorLog: result.content
                })
                .where(eq(tables.generations.id, generationId));
        }

        return c.json(result);
    } catch (e: any) {
        console.error("Backend Error:", e);
        // Log error
        await edgespark.db.update(tables.generations)
            .set({ 
                status: "error",
                errorLog: e.message || "Unknown error"
            })
            .where(eq(tables.generations.id, generationId));
            
        return c.json({ success: false, content: e.message || "Internal Server Error" }, 500);
    }
  });

  return app;
}
