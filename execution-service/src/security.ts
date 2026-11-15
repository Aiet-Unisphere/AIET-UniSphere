/**
 * Security validation and sanitization for execution inputs
 */

import path from 'node:path';

export interface PathValidationResult {
  valid: boolean;
  sanitizedPath?: string;
  error?: string;
}

/**
 * Validates that a file path stays strictly within the workspace directory.
 * Prevents directory traversal sequences (`..`), leading slashes, and null bytes.
 */
export const validateWorkspacePath = (filePath: string): PathValidationResult => {
  if (!filePath || typeof filePath !== 'string') {
    return { valid: false, error: 'Path must be a non-empty string.' };
  }

  // Reject null bytes
  if (filePath.indexOf('\0') !== -1) {
    return { valid: false, error: 'Null bytes are strictly prohibited.' };
  }

  // Normalize path separators to forward slashes
  const normalized = filePath.replace(/\\/g, '/').trim();

  // Check for traversal segments
  const segments = normalized.split('/');
  if (segments.some(seg => seg === '..' || seg === '.')) {
    return { valid: false, error: 'Directory traversal sequences (.. or .) are strictly prohibited.' };
  }

  // Reject absolute paths
  if (path.isAbsolute(normalized) || /^[a-zA-Z]:/.test(normalized) || normalized.startsWith('/')) {
    return { valid: false, error: 'Absolute paths are strictly prohibited.' };
  }

  // Reject dangerous characters
  if (/[<>:"|?*]/.test(normalized)) {
    return { valid: false, error: 'Path contains illegal filesystem characters.' };
  }

  return { valid: true, sanitizedPath: normalized };
};

/**
 * Validates total workspace payload size against the 100MB project storage limit.
 */
export const validateStorageQuota = (
  files: Array<{ path: string; content: string }>,
  maxBytes: number = 100 * 1024 * 1024
): { valid: boolean; totalBytes: number; error?: string } => {
  let totalBytes = 0;
  for (const file of files) {
    totalBytes += Buffer.byteLength(file.content || '', 'utf8');
    if (totalBytes > maxBytes) {
      return {
        valid: false,
        totalBytes,
        error: `Project workspace storage limit exceeded. Maximum allowed is ${maxBytes / (1024 * 1024)} MB.`
      };
    }
  }
  return { valid: true, totalBytes };
};

/**
 * Truncates output buffer to prevent buffer overflow denial-of-service.
 */
export const capOutputBuffer = (output: string, maxBytes: number = 1024 * 1024): string => {
  if (!output) return '';
  const buffer = Buffer.from(output, 'utf8');
  if (buffer.length <= maxBytes) {
    return output;
  }
  const truncated = buffer.subarray(0, maxBytes).toString('utf8');
  return `${truncated}\n[Output truncated: Exceeded maximum 1MB buffer limit]`;
};

