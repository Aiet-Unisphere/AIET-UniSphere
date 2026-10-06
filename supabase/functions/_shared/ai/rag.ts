/**
 * AIET-UniSphere - Institutional Knowledge RAG Retrieval Module
 * Generates query embeddings and executes controlled PostgreSQL vector similarity search.
 * Enforces authorization pre-filtering inside database RPC match_institutional_chunks.
 */

import { generateEmbedding } from "./embeddings.ts";
import { DocumentCitation } from "./types.ts";

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  documentType: string;
  version: string;
  pageNumber?: number | null;
  sectionTitle?: string | null;
  content: string;
  similarity: number;
}

export interface RAGRetrievalResult {
  success: boolean;
  chunks: RetrievedChunk[];
  citations: DocumentCitation[];
  latencyMs: number;
  error?: string;
}

export interface RAGRetrievalOptions {
  documentType?: string;
  courseId?: string;
  matchThreshold?: number;
  matchCount?: number;
}

/**
 * Executes secure vector similarity search for institutional knowledge chunks.
 * Authorization is strictly enforced in PostgreSQL by match_institutional_chunks RPC.
 */
export async function retrieveInstitutionalKnowledge(
  userClient: any,
  queryText: string,
  options?: RAGRetrievalOptions
): Promise<RAGRetrievalResult> {
  const startTime = Date.now();
  const threshold = options?.matchThreshold ?? 0.65;
  const limit = options?.matchCount ?? 4;

  try {
    // 1. Generate Query Vector Embedding (384d)
    const queryVector = await generateEmbedding(queryText);

    // 2. Invoke Controlled SECURITY DEFINER RPC
    const { data: rows, error: rpcError } = await userClient.rpc("match_institutional_chunks", {
      p_query_embedding: queryVector,
      p_match_threshold: threshold,
      p_match_count: limit,
      p_document_type: options?.documentType || null,
      p_course_id: options?.courseId || null,
    });

    const latencyMs = Date.now() - startTime;

    if (rpcError) {
      console.error("[rag.ts] match_institutional_chunks RPC error:", rpcError.message);
      return {
        success: false,
        chunks: [],
        citations: [],
        latencyMs,
        error: rpcError.message,
      };
    }

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return {
        success: true,
        chunks: [],
        citations: [],
        latencyMs,
      };
    }

    // 3. Map retrieved rows to structured chunks and deduplicated citations
    const chunks: RetrievedChunk[] = rows.map((r: any) => ({
      chunkId: r.chunk_id,
      documentId: r.document_id,
      documentTitle: r.document_title,
      documentType: r.document_type,
      version: r.version,
      pageNumber: r.page_number,
      sectionTitle: r.section_title,
      content: r.content,
      similarity: Number(r.similarity),
    }));

    // Build deduplicated citations
    const citationMap = new Map<string, DocumentCitation>();
    for (const c of chunks) {
      const key = `${c.documentId}-${c.pageNumber || '0'}-${c.sectionTitle || ''}`;
      if (!citationMap.has(key)) {
        citationMap.set(key, {
          documentId: c.documentId,
          title: c.documentTitle,
          documentType: c.documentType,
          version: c.version,
          pageNumber: c.pageNumber || undefined,
          sectionTitle: c.sectionTitle || undefined,
        });
      }
    }

    return {
      success: true,
      chunks,
      citations: Array.from(citationMap.values()),
      latencyMs,
    };

  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    const msg = err instanceof Error ? err.message : "RAG retrieval exception";
    console.error("[rag.ts] RAG retrieval exception:", msg);

    return {
      success: false,
      chunks: [],
      citations: [],
      latencyMs,
      error: msg,
    };
  }
}
