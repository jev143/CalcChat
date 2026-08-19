import { MessageType } from '../types';

export interface UploadResult {
  downloadUrl: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  thumbnailUrl?: string;
}

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  type: MessageType;
}

/**
 * Validate file type and size constraints
 */
export function validateMediaFile(file: File | Blob, explicitType?: MessageType): FileValidationResult {
  const mimeType = file.type || '';
  const size = file.size;

  let resolvedType: MessageType = explicitType || 'file';

  if (!explicitType) {
    if (mimeType.startsWith('image/')) {
      resolvedType = 'image';
    } else if (mimeType.startsWith('video/')) {
      resolvedType = 'video';
    } else if (mimeType.startsWith('audio/')) {
      resolvedType = 'audio';
    } else {
      resolvedType = 'file';
    }
  }

  // Size limit validation
  const maxSizes: Record<MessageType, number> = {
    image: 25 * 1024 * 1024, // 25MB
    video: 100 * 1024 * 1024, // 100MB
    audio: 25 * 1024 * 1024, // 25MB
    file: 50 * 1024 * 1024, // 50MB
    text: 1024 * 1024,
  };

  const limit = maxSizes[resolvedType] || 50 * 1024 * 1024;
  if (size > limit) {
    const limitMB = Math.round(limit / (1024 * 1024));
    return {
      valid: false,
      error: `File size (${(size / (1024 * 1024)).toFixed(1)}MB) exceeds the ${limitMB}MB maximum limit.`,
      type: resolvedType,
    };
  }

  return { valid: true, type: resolvedType };
}

/**
 * Generate a thumbnail from an image file (max dimensions 320x320)
 */
export async function generateImageThumbnail(file: File | Blob): Promise<string | undefined> {
  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 320;
          let width = img.width;
          let height = img.height;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(undefined);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = () => resolve(undefined);
        img.src = e.target?.result as string;
      };
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(file);
    } catch {
      resolve(undefined);
    }
  });
}

/**
 * Generate thumbnail from video file
 */
export async function generateVideoThumbnail(file: File | Blob): Promise<string | undefined> {
  return new Promise((resolve) => {
    try {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      const url = URL.createObjectURL(file);
      video.src = url;

      video.onloadeddata = () => {
        video.currentTime = Math.min(1, video.duration / 2);
      };

      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          const maxDim = 320;
          let width = video.videoWidth || 320;
          let height = video.videoHeight || 240;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, width, height);
            const thumb = canvas.toDataURL('image/jpeg', 0.7);
            URL.revokeObjectURL(url);
            resolve(thumb);
          } else {
            URL.revokeObjectURL(url);
            resolve(undefined);
          }
        } catch {
          URL.revokeObjectURL(url);
          resolve(undefined);
        }
      };

      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(undefined);
      };
    } catch {
      resolve(undefined);
    }
  });
}

/**
 * Upload a media file or voice blob with real upload progress tracking
 */
export async function uploadMediaToStorage(
  fileOrBlob: File | Blob,
  conversationId: string,
  fileNameCustom?: string,
  onProgress?: (progressPercentage: number) => void,
  senderUid?: string,
  recipientUid?: string
): Promise<UploadResult> {
  const fileName =
    fileNameCustom ||
    (fileOrBlob instanceof File ? fileOrBlob.name : `voice_${Date.now()}.webm`);
  const lowerName = fileName.toLowerCase();
  const extensionMime: Record<string, string> = {
    '.webm': 'audio/webm', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
    '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
    '.pdf': 'application/pdf', '.zip': 'application/zip', '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain', '.csv': 'text/csv', '.rtf': 'application/rtf'
  };
  const ext = Object.keys(extensionMime).find((key) => lowerName.endsWith(key));
  const mimeType = fileOrBlob.type || (ext ? extensionMime[ext] : 'application/octet-stream');
  if (!mimeType || mimeType === 'application/octet-stream') {
    throw new Error('Unable to determine the media type. Please choose the file again.');
  }

  // Start thumbnail generation immediately so it runs while the upload is in progress.
  const thumbnailPromise: Promise<string | undefined> =
    mimeType.startsWith('image/')
      ? generateImageThumbnail(fileOrBlob)
      : mimeType.startsWith('video/')
        ? generateVideoThumbnail(fileOrBlob)
        : Promise.resolve(undefined);

  // Upload using XMLHttpRequest to /api/media/upload for real-time progress & reliable storage.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/media/upload', true);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', mimeType);
    xhr.setRequestHeader('x-file-name', encodeURIComponent(fileName));
    xhr.setRequestHeader('x-conversation-id', encodeURIComponent(conversationId));
    if (senderUid) xhr.setRequestHeader('x-sender-uid', encodeURIComponent(senderUid));
    if (recipientUid) xhr.setRequestHeader('x-recipient-uid', encodeURIComponent(recipientUid));

    // Authentication is cookie-only. The session cookie is HttpOnly and is sent by XHR via withCredentials.

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          if (onProgress) onProgress(100);
          thumbnailPromise.then((thumbnailUrl) => {
            resolve({
              downloadUrl: res.downloadUrl,
              storagePath: res.storagePath,
              fileName: res.fileName || fileName,
              fileSize: res.fileSize || fileOrBlob.size,
              mimeType: res.mimeType || mimeType,
              thumbnailUrl,
            });
          }).catch(() => {
            resolve({
              downloadUrl: res.downloadUrl,
              storagePath: res.storagePath,
              fileName: res.fileName || fileName,
              fileSize: res.fileSize || fileOrBlob.size,
              mimeType: res.mimeType || mimeType,
            });
          });
        } catch {
          reject(new Error('Invalid response from media server'));
        }
      } else {
        let errMessage = `Upload failed with status ${xhr.status}`;
        try {
          const errRes = JSON.parse(xhr.responseText);
          if (errRes.error) errMessage = errRes.error;
        } catch {
          // ignore
        }
        reject(new Error(errMessage));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error occurred during media upload. Check that you are signed in and the CalcChat server is running.'));
    };

    xhr.onabort = () => {
      reject(new Error('Media upload was cancelled.'));
    };

    xhr.send(fileOrBlob);
  });
}
