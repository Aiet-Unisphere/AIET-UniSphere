-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00024: PHASE 2 AI RAG & VECTOR SEARCH
-- ============================================================
-- 1. Enable pgvector extension
-- 2. Create institutional_documents & institutional_document_chunks tables
-- 3. Provision institutional-documents storage bucket
-- 4. Set up strict RLS policies on tables
-- 5. Create secure match_institutional_chunks SECURITY DEFINER RPC
-- ============================================================

-- 1. ENABLE PGVECTOR EXTENSION
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- 2. PROVISION STORAGE BUCKET FOR INSTITUTIONAL DOCUMENTS
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'institutional-documents',
  'institutional-documents',
  false,
  52428800, -- 50MB
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown'
  ]
)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 3. CREATE INSTITUTIONAL_DOCUMENTS TABLE
CREATE TABLE IF NOT EXISTS public.institutional_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  document_type TEXT NOT NULL CHECK (document_type IN (
    'REGULATION',
    'SYLLABUS',
    'ACADEMIC_CALENDAR',
    'HANDBOOK',
    'INTERNSHIP_POLICY',
    'EXAM_RULES',
    'DEPARTMENT_POLICY',
    'GENERAL_GUIDELINE'
  )),
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  course_id TEXT,
  semester INTEGER CHECK (semester BETWEEN 1 AND 8),
  academic_year TEXT,
  visibility_scope TEXT NOT NULL CHECK (visibility_scope IN (
    'PUBLIC_INSTITUTIONAL',
    'DEPARTMENT_SCOPED',
    'COURSE_SCOPED',
    'FACULTY_ONLY',
    'ADMIN_ONLY'
  )),
  version TEXT NOT NULL DEFAULT '1.0',
  is_active BOOLEAN NOT NULL DEFAULT true,
  approval_status TEXT NOT NULL DEFAULT 'APPROVED' CHECK (approval_status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ARCHIVED')),
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexing institutional_documents
CREATE INDEX IF NOT EXISTS idx_inst_docs_dept ON public.institutional_documents(department_id);
CREATE INDEX IF NOT EXISTS idx_inst_docs_course ON public.institutional_documents(course_id);
CREATE INDEX IF NOT EXISTS idx_inst_docs_scope ON public.institutional_documents(visibility_scope);
CREATE INDEX IF NOT EXISTS idx_inst_docs_status ON public.institutional_documents(is_active, approval_status);
CREATE INDEX IF NOT EXISTS idx_inst_docs_hash ON public.institutional_documents(file_hash);

-- 4. CREATE INSTITUTIONAL_DOCUMENT_CHUNKS TABLE
CREATE TABLE IF NOT EXISTS public.institutional_document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.institutional_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL,
  embedding extensions.vector(384) NOT NULL, -- all-MiniLM-L6-v2 384d output
  page_number INTEGER,
  section_title TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_doc_chunk_index UNIQUE (document_id, chunk_index)
);

-- Indexing document chunks
CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON public.institutional_document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw 
  ON public.institutional_document_chunks 
  USING hnsw (embedding extensions.vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 5. ROW LEVEL SECURITY (RLS) POLICIES

-- Enable RLS
ALTER TABLE public.institutional_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institutional_document_chunks ENABLE ROW LEVEL SECURITY;

-- Document Table SELECT Policy (Authenticated Users with Verified Scope)
DROP POLICY IF EXISTS "Users can view authorized institutional documents" ON public.institutional_documents;
CREATE POLICY "Users can view authorized institutional documents"
  ON public.institutional_documents FOR SELECT
  TO authenticated
  USING (
    public.is_active_auth_user()
    AND is_active = true
    AND approval_status = 'APPROVED'
    AND (
      public.get_auth_user_role() = 'ADMIN'
      OR visibility_scope = 'PUBLIC_INSTITUTIONAL'
      OR (visibility_scope = 'DEPARTMENT_SCOPED' AND department_id = public.get_auth_user_department_id())
      OR (visibility_scope = 'FACULTY_ONLY' AND public.get_auth_user_role() IN ('FACULTY', 'HOD'))
      OR (visibility_scope = 'COURSE_SCOPED' AND (
            department_id = public.get_auth_user_department_id()
            OR EXISTS (
              SELECT 1 FROM public.course_enrollments ce
              WHERE ce.student_id = auth.uid() AND ce.course_id = public.institutional_documents.course_id AND ce.status = 'Active'
            )
            OR EXISTS (
              SELECT 1 FROM public.course_enrollments ce
              WHERE ce.faculty_id = auth.uid() AND ce.course_id = public.institutional_documents.course_id
            )
          ))
    )
  );

-- Document Table Management Policy (Admin only)
DROP POLICY IF EXISTS "Admins can manage institutional documents" ON public.institutional_documents;
CREATE POLICY "Admins can manage institutional documents"
  ON public.institutional_documents FOR ALL
  TO authenticated
  USING (public.get_auth_user_role() = 'ADMIN')
  WITH CHECK (public.get_auth_user_role() = 'ADMIN');

-- Option A: Chunks direct access policy.
-- Restrict direct SELECT access to chunks, exposing content through the controlled SECURITY DEFINER RPC.
-- Users can only SELECT chunks if they have access to the parent document.
DROP POLICY IF EXISTS "Users can view chunks of authorized documents" ON public.institutional_document_chunks;
CREATE POLICY "Users can view chunks of authorized documents"
  ON public.institutional_document_chunks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.institutional_documents d
      WHERE d.id = document_id
        AND d.is_active = true
        AND d.approval_status = 'APPROVED'
        AND (
          public.get_auth_user_role() = 'ADMIN'
          OR d.visibility_scope = 'PUBLIC_INSTITUTIONAL'
          OR (d.visibility_scope = 'DEPARTMENT_SCOPED' AND d.department_id = public.get_auth_user_department_id())
          OR (d.visibility_scope = 'FACULTY_ONLY' AND public.get_auth_user_role() IN ('FACULTY', 'HOD'))
          OR (d.visibility_scope = 'COURSE_SCOPED' AND (
                d.department_id = public.get_auth_user_department_id()
                OR EXISTS (
                  SELECT 1 FROM public.course_enrollments ce
                  WHERE ce.student_id = auth.uid() AND ce.course_id = d.course_id AND ce.status = 'Active'
                )
                OR EXISTS (
                  SELECT 1 FROM public.course_enrollments ce
                  WHERE ce.faculty_id = auth.uid() AND ce.course_id = d.course_id
                )
              ))
        )
    )
  );

-- Admins manage chunks
DROP POLICY IF EXISTS "Admins can manage document chunks" ON public.institutional_document_chunks;
CREATE POLICY "Admins can manage document chunks"
  ON public.institutional_document_chunks FOR ALL
  TO authenticated
  USING (public.get_auth_user_role() = 'ADMIN')
  WITH CHECK (public.get_auth_user_role() = 'ADMIN');

-- 6. CONTROLLED VECTOR SEARCH RPC: match_institutional_chunks
CREATE OR REPLACE FUNCTION public.match_institutional_chunks(
  p_query_embedding extensions.vector(384),
  p_match_threshold FLOAT DEFAULT 0.65,
  p_match_count INT DEFAULT 4,
  p_document_type TEXT DEFAULT NULL,
  p_course_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  chunk_id UUID,
  document_id UUID,
  document_title TEXT,
  document_type TEXT,
  version TEXT,
  page_number INT,
  section_title TEXT,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_caller_dept_id UUID;
  v_caller_status TEXT;
BEGIN
  -- 1. Authenticate caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Sign in required for institutional knowledge retrieval.';
  END IF;

  -- 2. Resolve caller profile, status, role, department
  SELECT role, department_id, account_status
  INTO v_caller_role, v_caller_dept_id, v_caller_status
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: User profile not found.';
  END IF;

  IF v_caller_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: User account is not active.';
  END IF;

  -- 3. Perform similarity search with STRICT pre-filtered authorization logic
  RETURN QUERY
  SELECT
    c.id AS chunk_id,
    d.id AS document_id,
    d.title AS document_title,
    d.document_type,
    d.version,
    c.page_number,
    c.section_title,
    c.content,
    (1 - (c.embedding <=> p_query_embedding))::FLOAT AS similarity
  FROM public.institutional_document_chunks c
  JOIN public.institutional_documents d ON d.id = c.document_id
  WHERE d.is_active = true
    AND d.approval_status = 'APPROVED'
    AND (p_document_type IS NULL OR d.document_type = p_document_type)
    AND (p_course_id IS NULL OR d.course_id = p_course_id)
    -- STRICT AUTHORIZATION SCOPING PRE-FILTERING
    AND (
      -- ADMIN: full access to all active approved documents
      v_caller_role = 'ADMIN'
      -- PUBLIC_INSTITUTIONAL: accessible to any active authenticated user
      OR d.visibility_scope = 'PUBLIC_INSTITUTIONAL'
      -- DEPARTMENT_SCOPED: accessible only if caller department matches document department
      OR (d.visibility_scope = 'DEPARTMENT_SCOPED' AND d.department_id = v_caller_dept_id)
      -- FACULTY_ONLY: accessible to Faculty, HOD, or Admin (scoped to dept if department_id specified)
      OR (d.visibility_scope = 'FACULTY_ONLY' AND v_caller_role IN ('FACULTY', 'HOD') AND (d.department_id IS NULL OR d.department_id = v_caller_dept_id))
      -- COURSE_SCOPED:
      --   - Student: MUST be actively enrolled in course (course_enrollments)
      --   - Faculty: MUST be assigned to course (course_enrollments or timetable_entries)
      --   - HOD: MUST match department
      OR (d.visibility_scope = 'COURSE_SCOPED' AND (
            (v_caller_role = 'STUDENT' AND EXISTS (
              SELECT 1 FROM public.course_enrollments ce
              WHERE ce.student_id = v_caller_id
                AND (ce.course_id = d.course_id OR ce.course_code = d.course_id)
                AND ce.status = 'Active'
            ))
            OR (v_caller_role = 'FACULTY' AND (
              EXISTS (
                SELECT 1 FROM public.course_enrollments ce
                WHERE ce.faculty_id = v_caller_id
                  AND (ce.course_id = d.course_id OR ce.course_code = d.course_id)
              )
              OR EXISTS (
                SELECT 1 FROM public.timetable_entries te
                WHERE te.faculty_id = v_caller_id
                  AND (te.course_id = d.course_id OR te.course_code = d.course_id)
              )
            ))
            OR (v_caller_role = 'HOD' AND d.department_id = v_caller_dept_id)
          ))
    )
    AND (1 - (c.embedding <=> p_query_embedding)) >= p_match_threshold
  ORDER BY c.embedding <=> p_query_embedding ASC
  LIMIT p_match_count;
END;
$$;

-- Restrict RPC permissions
REVOKE EXECUTE ON FUNCTION public.match_institutional_chunks FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_institutional_chunks TO authenticated;

-- RELOAD POSTGREST SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
