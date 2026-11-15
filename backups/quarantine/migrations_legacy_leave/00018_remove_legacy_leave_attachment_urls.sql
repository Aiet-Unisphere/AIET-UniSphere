-- AIET-UNISPHERE - MIGRATION 00018: REMOVE LEGACY LEAVE ATTACHMENT PATHS
-- Attachment metadata is authoritative in leave_attachments.

DROP INDEX IF EXISTS public.idx_leave_requests_attachment_urls;

ALTER TABLE public.leave_requests
  DROP COLUMN IF EXISTS attachment_urls;
