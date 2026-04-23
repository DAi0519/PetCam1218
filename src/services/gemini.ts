import { apiFetch } from "../lib/client";

export interface GenerationSubmitResult {
  success: boolean;
  content: string;
  generationId?: number;
  status?: string;
}

export interface GenerationStatusResult {
  success: boolean;
  content: string;
  generationId?: number;
  status?: string;
  imageUrl?: string;
  prompt?: string;
  mode?: "pet_fashion" | "simple_hat" | null;
}

export async function generateChristmasPet(
  base64Image: string,
  mimeType: string,
  mode: 'pet_fashion' | 'simple_hat',
  onProgress?: (text: string) => void
): Promise<GenerationSubmitResult> {
  if (onProgress) onProgress("QUEUEING JOB...");

  try {
    const response = await apiFetch("/api/public/gemini/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64Image, mimeType, mode })
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    const result = await response.json() as GenerationSubmitResult;
    return result;
  } catch (error: any) {
    console.error("Image generation error:", error);
    return { success: false, content: error.message || "An unexpected error occurred." };
  }
}

export async function getGenerationStatus(generationId: number): Promise<GenerationStatusResult> {
  try {
    const response = await apiFetch(`/api/public/gemini/generate/${generationId}`);

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    return await response.json() as GenerationStatusResult;
  } catch (error: any) {
    console.error("Generation status error:", error);
    return { success: false, content: error.message || "An unexpected error occurred." };
  }
}

export async function startGenerationProcessing(
  generationId: number,
  signal?: AbortSignal
): Promise<GenerationStatusResult> {
  try {
    const response = await apiFetch(`/api/public/gemini/generate/${generationId}/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    return await response.json() as GenerationStatusResult;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return { success: false, content: "Request aborted." };
    }

    console.error("Generation processing error:", error);
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
