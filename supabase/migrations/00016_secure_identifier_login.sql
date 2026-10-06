-- Remove anonymous access to the historical email-resolution RPC.
-- Identifier lookups are now performed inside the identifier-login Edge Function.
REVOKE EXECUTE ON FUNCTION public.get_email_by_identifier(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_by_identifier(TEXT) TO service_role;