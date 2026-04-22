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
        const errorData = await response.json() as { content?: string };
        throw new Error(errorData.content || "Server Error");
    }

    const result = await response.json() as GenerationResult;
    return result;
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return { success: false, content: error.message || "An unexpected error occurred." };
  }
}
