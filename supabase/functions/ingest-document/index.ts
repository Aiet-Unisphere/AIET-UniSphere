import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateEmbedding } from "../_shared/ai/embeddings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface IngestDocumentRequestBody {
  action?: 'ingest' | 'approve';
  documentId?: string; // Used when action === 'approve'
  title?: string;
  description?: string;
  documentType?: string;
  visibilityScope?: string;
  departmentId?: string;
  courseId?: string;
  semester?: number;
  academicYear?: string;
  version?: string;
  fileName?: string;
  fileContent?: string; // Plain text or extracted text content
  mimeType?: string;
  pageNumberMap?: Array<{ page: number; text: string }>;
  approveImmediately?: boolean; // Must be explicitly true to auto-approve upon upload
}

async function computeSHA256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

function chunkText(
  text: string,
  chunkSize: number = 1500,
  overlap: number = 150
): Array<{ content: string; tokenCount: number; sectionTitle?: string }> {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];

  const chunks: Array<{ content: string; tokenCount: number; sectionTitle?: string }> = [];
  let startIndex = 0;

  while (startIndex < clean.length) {
    let endIndex = startIndex + chunkSize;

    // Try to break on paragraph or sentence boundary if possible
    if (endIndex < clean.length) {
      const nextBreak = clean.lastIndexOf("\n\n", endIndex);
      if (nextBreak > startIndex + 500) {
        endIndex = nextBreak;
      } else {
        const periodBreak = clean.lastIndexOf(". ", endIndex);
        if (periodBreak > startIndex + 500) {
          endIndex = periodBreak + 1;
        }
      }
    }

    const chunkStr = clean.substring(startIndex, endIndex).trim();
    if (chunkStr.length > 0) {
      const estTokens = Math.ceil(chunkStr.length / 4);
      
      // Try to infer a section heading if the chunk starts with a header-like line
      let sectionTitle: string | undefined = undefined;
      const firstLine = chunkStr.split("\n")[0];
      if (/^(#|Section|\d+\.|\d+\:\s*|[A-Z\s]{4,30}$)/i.test(firstLine)) {
        sectionTitle = firstLine.substring(0, 100).trim();
      }

      chunks.push({
        content: chunkStr,
        tokenCount: estTokens,
        sectionTitle,
      });
    }

    startIndex = endIndex - overlap;
    if (startIndex >= clean.length || endIndex >= clean.length) break;
  }

  return chunks;
}

serve(async (req: Request) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // 1. Authenticate user from JWT Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "AUTHENTICATION_REQUIRED: Sign in required." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // @ts-ignore Deno global
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    // @ts-ignore Deno global
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Backend Supabase environment misconfigured." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "AUTHENTICATION_REQUIRED: Invalid or expired session." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Authorize Admin Role
    const { data: profile, error: profileError } = await userClient
      .from('profiles')
      .select('id, role, account_status')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || profile.account_status !== 'ACTIVE') {
      return new Response(
        JSON.stringify({ success: false, error: "PERMISSION_DENIED: Active profile required." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (profile.role !== 'ADMIN') {
      return new Response(
        JSON.stringify({ success: false, error: "PERMISSION_DENIED: Only Administrators can ingest institutional documents." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Parse Request Body
    const body: IngestDocumentRequestBody = await req.json();

    // -------------------------------------------------------------
    // ACTION: APPROVE AN EXISTING PENDING DOCUMENT
    // -------------------------------------------------------------
    if (body.action === 'approve') {
      if (!body.documentId) {
        return new Response(
          JSON.stringify({ success: false, error: "documentId is required for approve action." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch target document
      const { data: targetDoc, error: targetErr } = await userClient
        .from('institutional_documents')
        .select('id, title, version')
        .eq('id', body.documentId)
        .single();

      if (targetErr || !targetDoc) {
        return new Response(
          JSON.stringify({ success: false, error: "DOCUMENT_NOT_FOUND: Target document not found." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Archive older active versions with matching title
      await userClient
        .from('institutional_documents')
        .update({ is_active: false, approval_status: 'ARCHIVED', updated_at: new Date().toISOString() })
        .eq('title', targetDoc.title)
        .eq('is_active', true);

      // Approve target document & set active
      const { error: approveErr } = await userClient
        .from('institutional_documents')
        .update({
          approval_status: 'APPROVED',
          is_active: true,
          approved_by: user.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', body.documentId);

      if (approveErr) {
        throw new Error(`APPROVAL_FAILED: ${approveErr.message}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Document '${targetDoc.title}' (v${targetDoc.version}) approved and activated for RAG retrieval.`,
          documentId: body.documentId,
          status: 'APPROVED_AND_ACTIVE'
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // -------------------------------------------------------------
    // ACTION: INGEST NEW DOCUMENT
    // -------------------------------------------------------------
    const {
      title,
      description,
      documentType,
      visibilityScope,
      departmentId,
      courseId,
      semester,
      academicYear,
      version = '1.0',
      fileName,
      fileContent,
      mimeType = 'text/plain',
      pageNumberMap,
      approveImmediately = false // Default is FALSE: document remains PENDING_APPROVAL & inactive until approved
    } = body;

    if (!title || !documentType || !visibilityScope || !fileName || !fileContent) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required document fields (title, documentType, visibilityScope, fileName, fileContent)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. SHA-256 Hash & Deduplication Check
    const fileHash = await computeSHA256(fileContent);

    const { data: existingDoc } = await userClient
      .from('institutional_documents')
      .select('id, title, version, approval_status')
      .eq('file_hash', fileHash)
      .maybeSingle();

    if (existingDoc && existingDoc.approval_status === 'APPROVED') {
      return new Response(
        JSON.stringify({
          success: false,
          error: `DOCUMENT_DUPLICATE: An active approved document with matching content hash already exists ('${existingDoc.title}' v${existingDoc.version}).`,
          existingDocumentId: existingDoc.id,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Document Lifecycle:
    // If approveImmediately === true -> approval_status = 'APPROVED', is_active = true
    // If approveImmediately === false -> approval_status = 'PENDING_APPROVAL', is_active = false (NOT searchable)
    const approvalStatus = approveImmediately ? 'APPROVED' : 'PENDING_APPROVAL';
    const isActive = approveImmediately ? true : false;
    const approvedBy = approveImmediately ? user.id : null;

    if (approveImmediately) {
      // If auto-approving a new version, archive older active versions
      await userClient
        .from('institutional_documents')
        .update({ is_active: false, approval_status: 'ARCHIVED', updated_at: new Date().toISOString() })
        .eq('title', title)
        .eq('is_active', true);
    }

    // 5. Insert Document Record
    const storagePath = `institutional-documents/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

    const { data: docRecord, error: docError } = await userClient
      .from('institutional_documents')
      .insert({
        title: title.trim(),
        description: description?.trim() || null,
        document_type: documentType,
        department_id: departmentId || null,
        course_id: courseId || null,
        semester: semester || null,
        academic_year: academicYear || null,
        visibility_scope: visibilityScope,
        version: version.trim(),
        is_active: isActive,
        approval_status: approvalStatus,
        storage_path: storagePath,
        file_name: fileName,
        file_size: new TextEncoder().encode(fileContent).length,
        mime_type: mimeType,
        file_hash: fileHash,
        uploaded_by: user.id,
        approved_by: approvedBy,
      })
      .select('id')
      .single();

    if (docError || !docRecord) {
      throw new Error(`INGESTION_FAILED: Failed to create document record: ${docError?.message || 'Unknown DB error'}`);
    }

    const documentId = docRecord.id;

    // 6. Chunk Text
    let extractedChunks: Array<{ content: string; tokenCount: number; pageNumber?: number; sectionTitle?: string }> = [];

    if (pageNumberMap && pageNumberMap.length > 0) {
      for (const p of pageNumberMap) {
        const pChunks = chunkText(p.text);
        for (const c of pChunks) {
          extractedChunks.push({
            ...c,
            pageNumber: p.page,
          });
        }
      }
    } else {
      extractedChunks = chunkText(fileContent);
    }

    if (extractedChunks.length === 0) {
      // Rollback document creation
      await userClient.from('institutional_documents').delete().eq('id', documentId);
      return new Response(
        JSON.stringify({ success: false, error: "TEXT_EXTRACTION_FAILED: No valid text chunks could be extracted from file content." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Generate Vector Embeddings & Insert Chunks
    const chunkInserts: any[] = [];
    let chunkIndex = 0;

    for (const chunk of extractedChunks) {
      let embedding: number[];
      try {
        embedding = await generateEmbedding(chunk.content);
      } catch (embErr: unknown) {
        // Rollback document on embedding failure
        await userClient.from('institutional_documents').delete().eq('id', documentId);
        const embMsg = embErr instanceof Error ? embErr.message : "Embedding failure";
        throw new Error(`EMBEDDING_FAILED: Document ingestion aborted on chunk #${chunkIndex}: ${embMsg}`);
      }

      chunkInserts.push({
        document_id: documentId,
        chunk_index: chunkIndex,
        content: chunk.content,
        token_count: chunk.tokenCount,
        embedding,
        page_number: chunk.pageNumber || null,
        section_title: chunk.sectionTitle || null,
        metadata: {
          embedding_model: 'all-MiniLM-L6-v2:384',
          document_title: title,
          version,
        },
      });

      chunkIndex++;
    }

    const { error: chunkErr } = await userClient
      .from('institutional_document_chunks')
      .insert(chunkInserts);

    if (chunkErr) {
      // Rollback document
      await userClient.from('institutional_documents').delete().eq('id', documentId);
      throw new Error(`INGESTION_FAILED: Failed to insert document chunks: ${chunkErr.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        documentId,
        title,
        version,
        chunksInserted: chunkInserts.length,
        status: "APPROVED_AND_INDEXED",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Document ingestion failure";
    console.error("[ingest-document] Exception:", msg);
    const sanitized = msg.replace(/key=[^&\s]+/gi, "key=REDACTED").replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer REDACTED");

    return new Response(
      JSON.stringify({
        success: false,
        error: sanitized,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
