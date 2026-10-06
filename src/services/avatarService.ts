import { supabase } from '../lib/supabase';
import { STORAGE_BUCKETS, uploadFile, getSignedUrl } from './storageService';

// Memory cache for signed avatar URLs: avatarPath -> { signedUrl, fetchedAt }
const avatarCache = new Map<string, { signedUrl: string; fetchedAt: number }>();

/**
 * Gets a signed URL for a given avatar storage path with in-memory caching.
 */
export const getUserAvatarUrl = async (avatarPath?: string | null): Promise<string | null> => {
  if (!avatarPath) return null;

  const cached = avatarCache.get(avatarPath);
  const now = Date.now();
  // Reuse cached URL if fetched within the last 12 hours (43200000 ms)
  if (cached && (now - cached.fetchedAt < 43200000)) {
    return cached.signedUrl;
  }

  try {
    const signedUrl = await getSignedUrl(STORAGE_BUCKETS.AVATARS, avatarPath, 86400);
    if (signedUrl) {
      avatarCache.set(avatarPath, { signedUrl, fetchedAt: now });
    }
    return signedUrl;
  } catch (err) {
    console.warn('[avatarService] Failed to generate avatar signed URL:', err);
    return null;
  }
};

/**
 * Uploads a profile avatar photo to Supabase Storage private avatars bucket and updates database metadata.
 */
export const uploadAvatar = async (file: File): Promise<{ storagePath: string; signedUrl: string | null }> => {
  // Validate file type
  const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  if (!allowedMimeTypes.includes(file.type.toLowerCase())) {
    throw new Error('Invalid file format. Only PNG, JPEG, JPG, and WEBP profile photos are permitted.');
  }

  // Enforce 5 MB limit
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('File size exceeds maximum limit of 5 MB.');
  }

  const { data: { user }, error: authErr } = await (supabase as any).auth.getUser();
  if (authErr || !user) {
    throw new Error('Authentication required to upload profile avatar.');
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const timestamp = Date.now();
  const storagePath = `${user.id}/avatar_${timestamp}.${ext}`;

  // Upload to Supabase Storage avatars bucket
  await uploadFile({
    bucket: STORAGE_BUCKETS.AVATARS,
    path: storagePath,
    file,
    upsert: true
  });

  const nowIso = new Date().toISOString();

  // 1. Update profiles table (authoritative identity table)
  const { error: profErr } = await (supabase as any)
    .from('profiles')
    .update({ 
      avatar_path: storagePath, 
      avatar_url: storagePath,
      updated_at: nowIso 
    })
    .eq('id', user.id);

  if (profErr) {
    console.warn('[avatarService] Profile table update warning:', profErr.message);
  }

  // 2. Also sync to student_profiles if student
  await (supabase as any)
    .from('student_profiles')
    .update({ 
      avatar_storage_path: storagePath,
      updated_at: nowIso 
    })
    .eq('profile_id', user.id)
    .catch(() => {/* ignore if not student */});

  // Generate signed URL
  const signedUrl = await getSignedUrl(STORAGE_BUCKETS.AVATARS, storagePath, 86400);

  // Update in-memory cache
  if (signedUrl) {
    avatarCache.set(storagePath, { signedUrl, fetchedAt: Date.now() });
  }

  // Dispatch global window event so all UserAvatar components update instantly
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('profile_avatar_updated', {
      detail: { userId: user.id, storagePath, signedUrl }
    }));
  }

  return { storagePath, signedUrl };
};
