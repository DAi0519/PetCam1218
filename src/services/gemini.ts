import { apiFetch } from "../lib/client";

export interface GenerationResult {
  success: boolean;
  content: string;
}

export async function generateChristmasPet(
  base64Image: string,
  mimeType: string,
  mode: 'pet_fashion' | 'simple_hat',
  onProgress?: (text: string) => void
): Promise<GenerationResult> {
  if (onProgress) onProgress("PROCESSING ON SERVER...");

  try {
    const response = await apiFetch("/api/public/gemini/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64Image, mimeType, mode })
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    const result = await response.json() as GenerationResult;
    return result;
  } catch (error: any) {
    console.error("Image generation error:", error);
    return { success: false, content: error.message || "An unexpected error occurred." };
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  const fallbackMessage = `Server Error (${response.status})`;
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const errorData = await response.json().catch(() => null) as { content?: string } | null;
    return errorData?.content || fallbackMessage;
  }

  const text = await response.text().catch(() => "");
  return text || fallbackMessage;
}
