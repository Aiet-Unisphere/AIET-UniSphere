/**
 * AIET-UniSphere - Vector Embedding Service (all-MiniLM-L6-v2)
 * Generates 384-dimensional vector embeddings for text chunks and queries.
 * Enforces strict vector dimension validation (must be exactly 384).
 */

export interface EmbeddingOptions {
  model?: string;
  apiKey?: string;
}

/**
 * Generates a 384-dimensional vector embedding for the given input text.
 * Uses sentence-transformers/all-MiniLM-L6-v2.
 */
export async function generateEmbedding(text: string, options?: EmbeddingOptions): Promise<number[]> {
  const cleanText = text.trim();
  if (!cleanText) {
    throw new Error("EMBEDDING_FAILED: Input text for embedding cannot be empty.");
  }

  // @ts-ignore Deno global
  const apiKey = options?.apiKey || Deno.env.get("EMBEDDING_API_KEY") || Deno.env.get("HF_API_KEY") || "";
  // @ts-ignore Deno global
  const modelName = options?.model || Deno.env.get("EMBEDDING_MODEL") || "sentence-transformers/all-MiniLM-L6-v2";

  // Endpoint for feature-extraction using Hugging Face Inference or compatible endpoint
  // @ts-ignore Deno global
  const customEndpoint = Deno.env.get("EMBEDDING_ENDPOINT");
  const endpoint = customEndpoint || `https://router.huggingface.co/hf-inference/models/${encodeURIComponent(modelName)}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        inputs: cleanText,
        options: { wait_for_model: true }
      }),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("EMBEDDING_FAILED: Embedding request timed out after 15 seconds.");
    }
    const safeMsg = err instanceof Error ? err.message.replace(/key=[^&\s]+/gi, "key=REDACTED") : "Network error";
    throw new Error(`EMBEDDING_FAILED: Failed to connect to embedding service: ${safeMsg}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let errBody = "";
    try {
      errBody = await response.text();
    } catch {
      errBody = response.statusText;
    }
    const sanitized = errBody.replace(/key=[^&\s]+/gi, "key=REDACTED").replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer REDACTED");
    throw new Error(`EMBEDDING_FAILED: Service returned status ${response.status}: ${sanitized}`);
  }

  let vector: any;
  try {
    vector = await response.json();
  } catch {
    throw new Error("EMBEDDING_FAILED: Failed to parse vector response JSON.");
  }

  // Handle nested array response format if returned as [[...]]
  let floatVector: number[] = [];
  if (Array.isArray(vector) && Array.isArray(vector[0])) {
    // Mean pooling / feature extraction format [1, 384] or token embeddings
    if (typeof vector[0][0] === 'number') {
      floatVector = vector[0] as number[];
    } else if (Array.isArray(vector[0][0])) {
      // Mean pool token embeddings
      const tokenEmbeddings = vector[0] as number[][];
      const dim = tokenEmbeddings[0].length;
      floatVector = new Array(dim).fill(0);
      for (const tok of tokenEmbeddings) {
        for (let i = 0; i < dim; i++) {
          floatVector[i] += tok[i];
        }
      }
      for (let i = 0; i < dim; i++) {
        floatVector[i] /= tokenEmbeddings.length;
      }
    }
  } else if (Array.isArray(vector) && typeof vector[0] === 'number') {
    floatVector = vector as number[];
  } else if (vector?.embedding && Array.isArray(vector.embedding)) {
    floatVector = vector.embedding as number[];
  }

  // Validate vector dimension strictly (384 for all-MiniLM-L6-v2)
  if (floatVector.length !== 384) {
    throw new Error(`EMBEDDING_FAILED: Dimension mismatch. Expected exactly 384 dimensions for all-MiniLM-L6-v2, but received ${floatVector.length}.`);
  }

  return floatVector;
}
