import { supabase } from '../lib/supabase';

export const STORAGE_BUCKETS = {
  AVATARS: 'avatars',
  ASSIGNMENTS: 'assignments',
  SUBMISSIONS: 'submissions',
  ASSESSMENTS: 'assessments',
  ANNOUNCEMENTS: 'announcements',
  ACADEMIC_MATERIALS: 'academic-materials',
  STUDENT_DOCUMENTS: 'student-documents',
  PROJECT_FILES: 'project-files',
} as const;

export type StorageBucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];

const DANGEROUS_EXTENSIONS = [
  'exe', 'bat', 'cmd', 'sh', 'ps1', 'vbs', 'msi', 'dll', 'com', 'scr', 'bin', 'jar', 'app'
];

const BUCKET_LIMITS: Record<StorageBucket, { maxSizeMB: number; allowedExts?: string[] }> = {
  [STORAGE_BUCKETS.AVATARS]: {
    maxSizeMB: 5,
    allowedExts: ['jpg', 'jpeg', 'png', 'webp']
  },
  [STORAGE_BUCKETS.ASSIGNMENTS]: {
    maxSizeMB: 20,
    allowedExts: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'zip', 'jpg', 'jpeg', 'png', 'txt']
  },
  [STORAGE_BUCKETS.SUBMISSIONS]: {
    maxSizeMB: 20,
    allowedExts: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'zip', 'jpg', 'jpeg', 'png', 'txt', 'py', 'js', 'ts', 'java', 'c', 'cpp', 'html', 'css', 'json']
  },
  [STORAGE_BUCKETS.ASSESSMENTS]: {
    maxSizeMB: 20,
    allowedExts: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'zip', 'jpg', 'jpeg', 'png']
  },
  [STORAGE_BUCKETS.ANNOUNCEMENTS]: {
    maxSizeMB: 20,
    allowedExts: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'webp']
  },
  [STORAGE_BUCKETS.ACADEMIC_MATERIALS]: {
    maxSizeMB: 50,
    allowedExts: ['pdf', 'ppt', 'pptx', 'doc', 'docx', 'xls', 'xlsx', 'zip', 'txt']
  },
  [STORAGE_BUCKETS.STUDENT_DOCUMENTS]: {
    maxSizeMB: 20,
    allowedExts: ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx']
  },
  [STORAGE_BUCKETS.PROJECT_FILES]: {
    maxSizeMB: 30
  }
};

/**
 * Validates a file against security constraints, size limits, and allowed extensions for a bucket.
 */
export const validateFile = (file: File, bucket: StorageBucket): { valid: boolean; error?: string } => {
  if (!file) {
    return { valid: false, error: 'No file provided.' };
  }

  const fileName = file.name || '';
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  // 1. Check for dangerous executables
  if (DANGEROUS_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `Executable and script files (.${ext}) are not permitted for security reasons.`
    };
  }

  const config = BUCKET_LIMITS[bucket];
  if (!config) {
    return { valid: true };
  }

  // 2. Check maximum size
  const maxBytes = config.maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `File size exceeds the maximum limit of ${config.maxSizeMB} MB.`
    };
  }

  // 3. Check allowed extensions
  if (config.allowedExts && config.allowedExts.length > 0) {
    if (!config.allowedExts.includes(ext)) {
      return {
        valid: false,
        error: `File format (.${ext}) is not supported for this bucket. Allowed formats: ${config.allowedExts.join(', ')}.`
      };
    }
  }

  return { valid: true };
};

/**
 * Sanitizes a filename to ensure safe S3/Storage object paths.
 */
export const sanitizeFileName = (fileName: string): string => {
  return fileName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_');
};

/**
 * Uploads a file to Supabase Storage in a specific private bucket.
 */
export const uploadFile = async ({
  bucket,
  path,
  file,
  upsert = true
}: {
  bucket: StorageBucket;
  path: string;
  file: File;
  upsert?: boolean;
}): Promise<{ path: string; error?: string }> => {
  const validation = validateFile(file, bucket);
  if (!validation.valid) {
    throw new Error(validation.error || 'File validation failed.');
  }

  const { data: { user } } = await (supabase as any).auth.getUser();
  if (!user) {
    throw new Error('Authentication required to upload files.');
  }

  const cleanPath = path.replace(/^\/+/, '');

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(cleanPath, file, {
      upsert,
      cacheControl: '3600',
      contentType: file.type || undefined
    });

  if (error) {
    console.error(`[StorageService] Upload failed to ${bucket}/${cleanPath}:`, error);
    throw new Error(error.message || 'File upload failed.');
  }

  return { path: data?.path || cleanPath };
};

/**
 * Generates a temporary Signed URL for secure authenticated access to private bucket objects.
 */
export const getSignedUrl = async (
  bucket: StorageBucket,
  path: string,
  expiresIn: number = 3600
): Promise<string | null> => {
  if (!path) return null;
  const cleanPath = path.replace(/^\/+/, '');

  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(cleanPath, expiresIn);

    if (error) {
      console.warn(`[StorageService] Failed to create signed URL for ${bucket}/${cleanPath}:`, error.message);
      return null;
    }

    return data?.signedUrl || null;
  } catch (err) {
    console.error(`[StorageService] Signed URL exception:`, err);
    return null;
  }
};

/**
 * Authenticated download helper: downloads the file binary blob from Supabase Storage
 * and triggers a native browser download save dialog.
 */
export const downloadStorageFile = async (
  bucket: StorageBucket,
  path: string,
  downloadName?: string
): Promise<void> => {
  if (!path) throw new Error('File is no longer available.');
  const cleanPath = path.replace(/^\/+/, '');
  const targetFileName = downloadName || cleanPath.split('/').pop() || 'download';

  try {
    // 1. First attempt direct SDK download
    const { data, error } = await supabase.storage
      .from(bucket)
      .download(cleanPath);

    if (!error && data) {
      const blobUrl = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = targetFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      return;
    }

    // 2. Fallback: generate signed URL and fetch blob or trigger download
    const { data: signedData, error: signedError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(cleanPath, 300, {
        download: targetFileName
      });

    if (signedError || !signedData?.signedUrl) {
      const errMsg = error?.message || signedError?.message || '';
      if (errMsg.toLowerCase().includes('not found') || errMsg.toLowerCase().includes('404') || errMsg.toLowerCase().includes('object not found')) {
        throw new Error('File is no longer available.');
      }
      throw new Error(errMsg || 'File is no longer available.');
    }

    // Fetch blob via signed URL
    const response = await fetch(signedData.signedUrl);
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('File is no longer available.');
      }
      throw new Error('Unable to download file. Please try again.');
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = targetFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch (err: any) {
    console.error(`[StorageService] Download error for ${bucket}/${cleanPath}:`, err);
    if (err?.message?.toLowerCase().includes('not found') || err?.message?.toLowerCase().includes('404')) {
      throw new Error('File is no longer available.');
    }
    throw err instanceof Error ? err : new Error('Unable to download file. Please try again.');
  }
};

/**
 * Deletes a file from Supabase Storage.
 */
export const deleteStorageFile = async (
  bucket: StorageBucket,
  path: string
): Promise<boolean> => {
  if (!path) return false;
  const cleanPath = path.replace(/^\/+/, '');

  try {
    const { error } = await supabase.storage
      .from(bucket)
      .remove([cleanPath]);

    if (error) {
      console.error(`[StorageService] Delete error for ${bucket}/${cleanPath}:`, error);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`[StorageService] Delete exception:`, err);
    return false;
  }
};
