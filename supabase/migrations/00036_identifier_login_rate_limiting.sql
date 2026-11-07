-- Migration 00036: Production-Grade Rate Limiting and Abuse Protection for Identifier Login
-- AIET-UniSphere Security Architecture
--
-- Provides atomic, distributed rate limiting for:
-- 1. Client IP request flooding (max 15 requests / 60 seconds)
-- 2. Domain-separated HMAC-SHA-256 identifier brute-force mitigation (max 5 failed attempts / 15 minutes)

-- 1. Storage Table for Rate Limit Buckets
CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  bucket_key pg_catalog.text PRIMARY KEY,
  bucket_type pg_catalog.text NOT NULL CHECK (bucket_type IN ('IP', 'IDENTIFIER')),
  request_count pg_catalog.int4 NOT NULL DEFAULT 1 CHECK (request_count >= 0),
  window_start pg_catalog.timestamptz NOT NULL DEFAULT pg_catalog.now(),
  expires_at pg_catalog.timestamptz NOT NULL,
  created_at pg_catalog.timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at pg_catalog.timestamptz NOT NULL DEFAULT pg_catalog.now()
);

-- Index for window expiration and bounded cleanup
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_expires_at 
ON public.auth_rate_limits (expires_at);

-- 2. Restrict Table Access (Isolated completely from public/anon/authenticated)
ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.auth_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.auth_rate_limits TO service_role;

-- 3. Atomic IP Rate Limit Increment & Verification RPC
CREATE OR REPLACE FUNCTION public.check_and_increment_ip_rate_limit(p_client_ip pg_catalog.text)
RETURNS pg_catalog.jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clean_ip pg_catalog.text;
  v_key pg_catalog.text;
  v_now pg_catalog.timestamptz := pg_catalog.clock_timestamp();
  v_count pg_catalog.int4;
  v_expires pg_catalog.timestamptz;
  v_window_seconds pg_catalog.int4 := 60;
  v_max_requests pg_catalog.int4 := 15;
  v_allowed pg_catalog.bool;
  v_retry_after pg_catalog.int4 := 0;
BEGIN
  IF p_client_ip IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('allowed', true, 'remaining', v_max_requests, 'retry_after', 0);
  END IF;

  v_clean_ip := pg_catalog.btrim(p_client_ip);
  IF pg_catalog.length(v_clean_ip) = 0 THEN
    RETURN pg_catalog.jsonb_build_object('allowed', true, 'remaining', v_max_requests, 'retry_after', 0);
  END IF;

  v_key := 'ip:' || v_clean_ip;

  INSERT INTO public.auth_rate_limits (bucket_key, bucket_type, request_count, window_start, expires_at, updated_at)
  VALUES (v_key, 'IP', 1, v_now, v_now + (v_window_seconds || ' seconds')::pg_catalog.interval, v_now)
  ON CONFLICT (bucket_key) DO UPDATE
  SET 
    request_count = CASE 
      WHEN public.auth_rate_limits.expires_at <= v_now THEN 1
      ELSE public.auth_rate_limits.request_count + 1
    END,
    window_start = CASE 
      WHEN public.auth_rate_limits.expires_at <= v_now THEN v_now
      ELSE public.auth_rate_limits.window_start
    END,
    expires_at = CASE 
      WHEN public.auth_rate_limits.expires_at <= v_now THEN v_now + (v_window_seconds || ' seconds')::pg_catalog.interval
      ELSE public.auth_rate_limits.expires_at
    END,
    updated_at = v_now
  RETURNING request_count, expires_at INTO v_count, v_expires;

  IF v_count > v_max_requests THEN
    v_allowed := false;
    v_retry_after := GREATEST(1, pg_catalog.ceil(EXTRACT(epoch FROM (v_expires - v_now)))::pg_catalog.int4);
  ELSE
    v_allowed := true;
    v_retry_after := 0;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'allowed', v_allowed,
    'remaining', GREATEST(0, v_max_requests - v_count),
    'retry_after', v_retry_after,
    'current_count', v_count
  );
END;
$$;

-- 4. Identifier Rate Limit Pre-Check RPC (Prevents DB queries if locked out)
CREATE OR REPLACE FUNCTION public.check_identifier_rate_limit(p_identifier_hash pg_catalog.text)
RETURNS pg_catalog.jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clean_hash pg_catalog.text;
  v_key pg_catalog.text;
  v_now pg_catalog.timestamptz := pg_catalog.clock_timestamp();
  v_count pg_catalog.int4;
  v_expires pg_catalog.timestamptz;
  v_max_attempts pg_catalog.int4 := 5;
  v_retry_after pg_catalog.int4 := 0;
BEGIN
  IF p_identifier_hash IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('allowed', true, 'remaining', v_max_attempts, 'retry_after', 0);
  END IF;

  v_clean_hash := pg_catalog.btrim(p_identifier_hash);
  IF pg_catalog.length(v_clean_hash) = 0 THEN
    RETURN pg_catalog.jsonb_build_object('allowed', true, 'remaining', v_max_attempts, 'retry_after', 0);
  END IF;

  v_key := 'id:' || v_clean_hash;

  SELECT request_count, expires_at INTO v_count, v_expires
  FROM public.auth_rate_limits
  WHERE bucket_key = v_key;

  IF FOUND AND v_expires > v_now AND v_count >= v_max_attempts THEN
    v_retry_after := GREATEST(1, pg_catalog.ceil(EXTRACT(epoch FROM (v_expires - v_now)))::pg_catalog.int4);
    RETURN pg_catalog.jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'retry_after', v_retry_after
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'allowed', true,
    'remaining', CASE WHEN FOUND AND v_expires > v_now THEN GREATEST(0, v_max_attempts - v_count) ELSE v_max_attempts END,
    'retry_after', 0
  );
END;
$$;

-- 5. Record Failed Authentication Attempt RPC (Increments counter on failure)
CREATE OR REPLACE FUNCTION public.record_failed_identifier_attempt(p_identifier_hash pg_catalog.text)
RETURNS pg_catalog.jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clean_hash pg_catalog.text;
  v_key pg_catalog.text;
  v_now pg_catalog.timestamptz := pg_catalog.clock_timestamp();
  v_count pg_catalog.int4;
  v_expires pg_catalog.timestamptz;
  v_window_seconds pg_catalog.int4 := 15 * 60; -- 15 minutes window
  v_max_attempts pg_catalog.int4 := 5;
  v_allowed pg_catalog.bool;
  v_retry_after pg_catalog.int4 := 0;
BEGIN
  IF p_identifier_hash IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('allowed', true, 'remaining', v_max_attempts, 'retry_after', 0);
  END IF;

  v_clean_hash := pg_catalog.btrim(p_identifier_hash);
  IF pg_catalog.length(v_clean_hash) = 0 THEN
    RETURN pg_catalog.jsonb_build_object('allowed', true, 'remaining', v_max_attempts, 'retry_after', 0);
  END IF;

  v_key := 'id:' || v_clean_hash;

  INSERT INTO public.auth_rate_limits (bucket_key, bucket_type, request_count, window_start, expires_at, updated_at)
  VALUES (v_key, 'IDENTIFIER', 1, v_now, v_now + (v_window_seconds || ' seconds')::pg_catalog.interval, v_now)
  ON CONFLICT (bucket_key) DO UPDATE
  SET 
    request_count = CASE 
      WHEN public.auth_rate_limits.expires_at <= v_now THEN 1
      ELSE public.auth_rate_limits.request_count + 1
    END,
    window_start = CASE 
      WHEN public.auth_rate_limits.expires_at <= v_now THEN v_now
      ELSE public.auth_rate_limits.window_start
    END,
    expires_at = CASE 
      WHEN public.auth_rate_limits.expires_at <= v_now THEN v_now + (v_window_seconds || ' seconds')::pg_catalog.interval
      ELSE public.auth_rate_limits.expires_at
    END,
    updated_at = v_now
  RETURNING request_count, expires_at INTO v_count, v_expires;

  IF v_count >= v_max_attempts THEN
    v_allowed := false;
    v_retry_after := GREATEST(1, pg_catalog.ceil(EXTRACT(epoch FROM (v_expires - v_now)))::pg_catalog.int4);
  ELSE
    v_allowed := true;
    v_retry_after := 0;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'allowed', v_allowed,
    'remaining', GREATEST(0, v_max_attempts - v_count),
    'retry_after', v_retry_after,
    'current_count', v_count
  );
END;
$$;

-- 6. Clear Identifier Failed Attempts RPC (Called on successful login)
CREATE OR REPLACE FUNCTION public.clear_identifier_rate_limit(p_identifier_hash pg_catalog.text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clean_hash pg_catalog.text;
BEGIN
  IF p_identifier_hash IS NOT NULL THEN
    v_clean_hash := pg_catalog.btrim(p_identifier_hash);
    IF pg_catalog.length(v_clean_hash) > 0 THEN
      DELETE FROM public.auth_rate_limits WHERE bucket_key = 'id:' || v_clean_hash;
    END IF;
  END IF;
END;
$$;

-- 7. Bounded-Batch Cleanup RPC for Expired Buckets (Non-Blocking Maintenance)
CREATE OR REPLACE FUNCTION public.prune_expired_auth_rate_limits(p_batch_size pg_catalog.int4 DEFAULT 500)
RETURNS pg_catalog.int4
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted pg_catalog.int4;
  v_limit pg_catalog.int4;
BEGIN
  v_limit := GREATEST(1, LEAST(p_batch_size, 5000));

  WITH doomed AS (
    SELECT bucket_key
    FROM public.auth_rate_limits
    WHERE expires_at < pg_catalog.clock_timestamp() - INTERVAL '1 hour'
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.auth_rate_limits
  WHERE bucket_key IN (SELECT doomed.bucket_key FROM doomed);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- 8. Grant Execution Privileges strictly to service_role
REVOKE ALL ON FUNCTION public.check_and_increment_ip_rate_limit(pg_catalog.text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_increment_ip_rate_limit(pg_catalog.text) TO service_role;

REVOKE ALL ON FUNCTION public.check_identifier_rate_limit(pg_catalog.text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_identifier_rate_limit(pg_catalog.text) TO service_role;

REVOKE ALL ON FUNCTION public.record_failed_identifier_attempt(pg_catalog.text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_failed_identifier_attempt(pg_catalog.text) TO service_role;

REVOKE ALL ON FUNCTION public.clear_identifier_rate_limit(pg_catalog.text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_identifier_rate_limit(pg_catalog.text) TO service_role;

REVOKE ALL ON FUNCTION public.prune_expired_auth_rate_limits(pg_catalog.int4) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_expired_auth_rate_limits(pg_catalog.int4) TO service_role;
