
/**
 * Poe API Service for RetroSnap Pet
 * Documentation Reference: https://developer.poe.com/server-bots/accessing-other-bots-on-poe
 */

// ---------------------------------------------------------------------------
// ⚠️ 配置区域 / CONFIGURATION
// ---------------------------------------------------------------------------

// 你的 Poe API Key
const POE_API_KEY = "";

// 指定 Bot 名字
const POE_BOT_NAME = "pet1216"; 

// 应用元数据
const APP_METADATA = {
  title: "RetroSnap Pet Camera",
  url: "http://localhost:3000"
};

// ---------------------------------------------------------------------------

export interface GenerationResult {
  success: boolean;
  content: string; // URL if success, text message if not
}

export async function generateChristmasPet(
  base64Image: string, 
  mimeType: string,
  onProgress?: (text: string) => void
): Promise<GenerationResult> {
  
  if (!POE_API_KEY) {
    throw new Error("API Key 未配置");
  }

  // 使用 CORS Proxy 绕过浏览器跨域限制
  const PROXY_URL = "https://corsproxy.io/?";
  const TARGET_URL = "https://api.poe.com/v1/chat/completions";
  const API_ENDPOINT = `${PROXY_URL}${encodeURIComponent(TARGET_URL)}`;

  const systemPrompt = `You are a vintage photography processor. 
  Task: Transform the user's pet photo into a 90s instant camera style photo (Polaroid/Fujifilm aesthetic) and add a festive red Santa Christmas hat to the pet.
  Style: Strong flash, film grain, slightly washed-out vintage colors, soft focus.
  Output: ONLY return the Markdown image link or the image URL. Do NOT explain what you did. Do NOT output conversational text.`;

  try {
    const controller = new AbortController();
    // 设置 90 秒超时
    const timeoutId = setTimeout(() => controller.abort(), 90000);

    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${POE_API_KEY}`,
        "HTTP-Referer": APP_METADATA.url,
        "X-Title": APP_METADATA.title
      },
      body: JSON.stringify({
        model: POE_BOT_NAME,
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Add a santa hat to this pet. Make it look like a vintage 90s photo."
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`
                }
              }
            ]
          }
        ],
        stream: true
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Poe API Error Payload:", errorText);
      
      let errorMsg = `Error ${response.status}`;
      try {
        const json = JSON.parse(errorText);
        if (json.error && json.error.message) errorMsg = json.error.message;
      } catch (e) {}

      if (response.status === 401) throw new Error("API Key 无效或未授权");
      if (response.status === 403) throw new Error("API Key 权限不足或 Bot 禁止访问");
      if (response.status === 429) throw new Error("请求太频繁 (Rate Limited)");
      throw new Error(errorMsg);
    }

    if (!response.body) throw new Error("Response body is empty");

    // --- 健壮的流式解析 (Robust Stream Parsing) ---
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let accumulatedContent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;
        
        if (trimmed.startsWith("data: ")) {
          try {
            const jsonStr = trimmed.slice(6);
            const data = JSON.parse(jsonStr);
            const delta = data.choices?.[0]?.delta?.content;
            if (delta) {
              accumulatedContent += delta;
              if (onProgress) onProgress(accumulatedContent);
            }
          } catch (e) {
            console.warn("Stream parse warning:", e);
          }
        }
      }
    }

    const content = accumulatedContent;
    console.log("Bot Response:", content);

    // 提取图片 URL
    const urlMatch = content.match(/\!\[.*?\]\((.*?)\)/) || content.match(/(https?:\/\/[^\s\)]+\.(?:png|jpg|jpeg|webp))/i);

    if (urlMatch && urlMatch[1]) {
      const imageUrl = urlMatch[1];
      try {
        const base64 = await convertUrlToBase64(imageUrl);
        return { success: true, content: base64 };
      } catch (e) {
        console.warn("Base64 conversion failed, falling back to URL", e);
        return { success: true, content: imageUrl };
      }
    }

    return { success: false, content: content || "No image generated." };

  } catch (error: any) {
    console.error("Generation Service Failed:", error);
    if (error.name === 'AbortError') {
      throw new Error("请求超时，请重试");
    }
    if (error.message.includes("Failed to fetch")) {
      throw new Error("网络连接失败 (可能是代理问题或断网)");
    }
    throw error;
  }
}

async function convertUrlToBase64(url: string): Promise<string> {
  const fetchImage = async (targetUrl: string) => {
    const response = await fetch(targetUrl);
    if (!response.ok) throw new Error(`Image fetch failed: ${response.status}`);
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  try {
    return await fetchImage(url);
  } catch (e) {
    try {
      const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
      return await fetchImage(proxyUrl);
    } catch (proxyError) {
      throw proxyError;
    }
  }
}
