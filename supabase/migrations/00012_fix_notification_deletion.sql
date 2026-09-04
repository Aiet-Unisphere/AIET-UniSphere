-- ============================================================
-- AIET-UNISPHERE — MIGRATION 00012: FIX NOTIFICATION DELETION RLS & RPC
-- ============================================================

-- 1. Enable RLS on public.notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing DELETE policies to prevent conflicts
DROP POLICY IF EXISTS "Users can delete own read notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON public.notifications;

-- 3. Create explicit RLS DELETE policy for authenticated users
CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
  );

-- 4. Create explicit RLS SELECT policy for authenticated users
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
  );

-- 5. Security Definer RPC for deleting a single notification owned by current user
CREATE OR REPLACE FUNCTION public.delete_notification(p_notification_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INT;
BEGIN
  DELETE FROM public.notifications
  WHERE id = p_notification_id
    AND user_id = auth.uid();
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count > 0;
END;
$$;

-- 6. Security Definer RPC for clearing all read notifications for current user
CREATE OR REPLACE FUNCTION public.clear_all_read_notifications()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INT;
BEGIN
  DELETE FROM public.notifications
  WHERE user_id = auth.uid()
    AND is_read = true;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;

-- 7. Grant execution permissions
GRANT EXECUTE ON FUNCTION public.delete_notification(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_all_read_notifications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_notification(UUID) TO anon, service_role;
GRANT EXECUTE ON FUNCTION public.clear_all_read_notifications() TO anon, service_role;
