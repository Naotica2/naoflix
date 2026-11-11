import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import * as DocumentPicker from 'expo-document-picker';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@env';
import { supabase } from '../config/supabaseClient';
import { ForumMediaItem, UploadQuotaInfo } from '../types/forum';

export const MAX_FORUM_IMAGES_PER_POST = 4;
export const MAX_FORUM_IMAGE_BYTES = 500 * 1024;

export interface PickedImageAsset {
  uri: string;
  fileName: string;
  mimeType: string;
  width?: number;
  height?: number;
  sizeBytes: number;
}

export interface PreparedForumImage {
  localUri: string;
  originalUri: string;
  fileName: string;
  mimeType: string;
  width?: number;
  height?: number;
  originalBytes: number;
  compressedBytes: number;
  exceedsLimit: boolean;
  isAnimatedGif?: boolean;
}

interface ImageKitSignPayload {
  configured: boolean;
  provider?: 'imagekit' | 'supabase';
  token?: string;
  expire?: number;
  signature?: string;
  publicKey?: string;
  urlEndpoint?: string;
  folder?: string;
  error?: string;
  quota?: UploadQuotaInfo;
}

let cachedImageKitUnavailableUntil = 0;

export function formatBytesShort(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export async function measureFileSize(uri: string): Promise<number> {
  try {
    const cleanPath = uri.startsWith('file://') ? uri.replace('file://', '') : uri;
    if (!cleanPath.startsWith('content://') && !cleanPath.startsWith('http')) {
      const stat = await ReactNativeBlobUtil.fs.stat(cleanPath);
      const parsed = Number(stat?.size);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  } catch {}

  try {
    const res = await fetch(uri);
    const blob = await res.blob();
    return blob.size || 0;
  } catch {
    return 0;
  }
}

export async function pickForumImages(maxSelect: number = 4): Promise<PickedImageAsset[]> {
  const clampedLimit = Math.max(1, Math.min(MAX_FORUM_IMAGES_PER_POST, maxSelect));
  const nativePicker = requireOptionalNativeModule<any>('ExponentImagePicker');

  if (nativePicker) {
    try {
      const ImagePicker = require('expo-image-picker');
      const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!req.granted && req.accessPrivileges !== 'limited') {
          throw new Error('PERMISSION_DENIED');
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: clampedLimit > 1,
        selectionLimit: clampedLimit,
        quality: 1,
        exif: false,
      });

      if (result.canceled || !Array.isArray(result.assets) || result.assets.length === 0) {
        return [];
      }

      const out: PickedImageAsset[] = [];
      for (let i = 0; i < result.assets.length; i++) {
        const asset = result.assets[i];
        if (!asset?.uri) continue;
        const sizeBytes =
          typeof asset.fileSize === 'number' && asset.fileSize > 0
            ? asset.fileSize
            : await measureFileSize(asset.uri);
        const fallbackName = `forum_${Date.now()}_${i}.jpg`;
        out.push({
          uri: asset.uri,
          fileName: asset.fileName || fallbackName,
          mimeType: asset.mimeType || inferMimeFromUri(asset.fileName || asset.uri),
          width: asset.width,
          height: asset.height,
          sizeBytes,
        });
      }
      return out.slice(0, clampedLimit);
    } catch (err: any) {
      if (err?.message === 'PERMISSION_DENIED') throw err;
      console.warn('ImagePicker fallback to DocumentPicker:', err);
    }
  }

  const docRes = await DocumentPicker.getDocumentAsync({
    type: ['image/webp', 'image/jpeg', 'image/png', 'image/gif'],
    multiple: clampedLimit > 1,
    copyToCacheDirectory: true,
  });

  if (docRes.canceled || !Array.isArray(docRes.assets)) return [];
  const out: PickedImageAsset[] = [];
  for (let i = 0; i < Math.min(clampedLimit, docRes.assets.length); i++) {
    const asset = docRes.assets[i];
    if (!asset?.uri) continue;
    const sizeBytes =
      typeof asset.size === 'number' && asset.size > 0
        ? asset.size
        : await measureFileSize(asset.uri);
    out.push({
      uri: asset.uri,
      fileName: asset.name || `forum_${Date.now()}_${i}.jpg`,
      mimeType: asset.mimeType || inferMimeFromUri(asset.name || asset.uri),
      sizeBytes,
    });
  }
  return out;
}

function inferMimeFromUri(nameOrUri: string): string {
  const lower = (nameOrUri || '').toLowerCase().split('?')[0];
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

function isGifAsset(asset: PickedImageAsset): boolean {
  return (
    asset.mimeType === 'image/gif' ||
    asset.fileName.toLowerCase().endsWith('.gif') ||
    asset.uri.toLowerCase().split('?')[0].endsWith('.gif')
  );
}

export async function compressForumImage(
  asset: PickedImageAsset,
  forceStaticWebp: boolean = false,
): Promise<PreparedForumImage> {
  const originalBytes = asset.sizeBytes > 0 ? asset.sizeBytes : await measureFileSize(asset.uri);
  const isGif = isGifAsset(asset);

  // Preserve small animated GIFs under 500 KB directly unless caller forces static WebP
  if (isGif && !forceStaticWebp) {
    if (originalBytes > 0 && originalBytes <= MAX_FORUM_IMAGE_BYTES) {
      return {
        localUri: asset.uri,
        originalUri: asset.uri,
        fileName: asset.fileName.replace(/\.[^.]+$/, '') + '.gif',
        mimeType: 'image/gif',
        width: asset.width,
        height: asset.height,
        originalBytes,
        compressedBytes: originalBytes,
        exceedsLimit: false,
        isAnimatedGif: true,
      };
    }
    // Over-sized GIFs cannot be shrunk safely while keeping animation without external server transcoder
    return {
      localUri: asset.uri,
      originalUri: asset.uri,
      fileName: asset.fileName,
      mimeType: 'image/gif',
      width: asset.width,
      height: asset.height,
      originalBytes,
      compressedBytes: originalBytes,
      exceedsLimit: true,
      isAnimatedGif: true,
    };
  }

  const hasManipulator = Boolean(requireOptionalNativeModule('ExpoImageManipulator'));
  if (!hasManipulator) {
    return {
      localUri: asset.uri,
      originalUri: asset.uri,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      originalBytes,
      compressedBytes: originalBytes,
      exceedsLimit: originalBytes > MAX_FORUM_IMAGE_BYTES || originalBytes === 0,
    };
  }

  const { ImageManipulator, SaveFormat } = require('expo-image-manipulator');

  const passes: { maxSide: number; quality: number }[] = [
    { maxSide: 1280, quality: 0.78 },
    { maxSide: 960, quality: 0.65 },
    { maxSide: 720, quality: 0.55 },
    { maxSide: 540, quality: 0.45 },
  ];

  let bestUri = asset.uri;
  let bestBytes = originalBytes;
  let bestWidth = asset.width;
  let bestHeight = asset.height;

  for (const pass of passes) {
    let ctx: any = null;
    let rendered: any = null;
    try {
      ctx = ImageManipulator.manipulate(asset.uri);
      const w = asset.width || 0;
      const h = asset.height || 0;
      if (w > 0 && h > 0) {
        if (w >= h && w > pass.maxSide) {
          ctx.resize({ width: pass.maxSide });
        } else if (h > w && h > pass.maxSide) {
          ctx.resize({ height: pass.maxSide });
        }
      } else {
        ctx.resize({ width: pass.maxSide });
      }

      rendered = await ctx.renderAsync();
      const saved = await rendered.saveAsync({
        compress: pass.quality,
        format: SaveFormat.WEBP,
      });

      const savedBytes = await measureFileSize(saved.uri);
      if (savedBytes > 0) {
        bestUri = saved.uri;
        bestBytes = savedBytes;
        bestWidth = saved.width ?? bestWidth;
        bestHeight = saved.height ?? bestHeight;
        if (savedBytes <= MAX_FORUM_IMAGE_BYTES) {
          break;
        }
      }
    } catch (err) {
      console.warn('Compression pass error:', err);
    } finally {
      try {
        rendered?.release?.();
      } catch {}
      try {
        ctx?.release?.();
      } catch {}
    }
  }

  const baseName = asset.fileName.replace(/\.[^.]+$/, '') || `img_${Date.now()}`;
  return {
    localUri: bestUri,
    originalUri: asset.uri,
    fileName: `${baseName}.webp`,
    mimeType: 'image/webp',
    width: bestWidth,
    height: bestHeight,
    originalBytes,
    compressedBytes: bestBytes,
    exceedsLimit: bestBytes > MAX_FORUM_IMAGE_BYTES || bestBytes <= 0,
    isAnimatedGif: false,
  };
}

export async function getDailyUploadQuota(): Promise<UploadQuotaInfo> {
  const { data, error } = await supabase.rpc('check_daily_upload_quota', {
    p_incoming_count: 1,
  });
  if (error || !data) {
    return { allowed: true, used: 0, limit: 12, remaining: 12 };
  }
  return data as UploadQuotaInfo;
}

async function requestImageKitSign(
  accessToken: string,
  count: number,
): Promise<ImageKitSignPayload> {
  if (Date.now() < cachedImageKitUnavailableUntil) {
    return { configured: false, provider: 'supabase' };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${SUPABASE_URL}/functions/v1/forum-media-sign`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'sign', count }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.status === 404 || res.status >= 500) {
      cachedImageKitUnavailableUntil = Date.now() + 5 * 60 * 1000;
      return { configured: false, provider: 'supabase' };
    }

    const payload = (await res.json()) as ImageKitSignPayload;
    if (res.status === 429 || payload?.error === 'QUOTA_EXCEEDED') {
      throw new Error('QUOTA_EXCEEDED');
    }
    if (!payload?.configured) {
      cachedImageKitUnavailableUntil = Date.now() + 5 * 60 * 1000;
      return { configured: false, provider: 'supabase' };
    }
    return payload;
  } catch (err: any) {
    if (err?.message === 'QUOTA_EXCEEDED') throw err;
    cachedImageKitUnavailableUntil = Date.now() + 5 * 60 * 1000;
    return { configured: false, provider: 'supabase' };
  }
}

async function uploadSingleToImageKit(
  image: PreparedForumImage,
  sign: ImageKitSignPayload,
): Promise<ForumMediaItem> {
  const ext = image.mimeType === 'image/gif' ? 'gif' : 'webp';
  const uploadName = `naoflix_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const form = new FormData();
  form.append('file', {
    uri: Platform.OS === 'android' ? image.localUri : image.localUri.replace('file://', ''),
    name: uploadName,
    type: image.mimeType,
  } as any);
  form.append('publicKey', sign.publicKey || '');
  form.append('signature', sign.signature || '');
  form.append('expire', String(sign.expire || ''));
  form.append('token', sign.token || '');
  form.append('fileName', uploadName);
  form.append('folder', sign.folder || '/naoflix-forum');
  form.append('useUniqueFileName', 'true');

  const res = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    throw new Error(`ImageKit upload failed (${res.status})`);
  }

  const json = await res.json();
  const url = String(json.url);
  const sep = url.includes('?') ? '&' : '?';

  return {
    url,
    thumbUrl: image.mimeType === 'image/gif' ? url : `${url}${sep}tr=w-640,q-72,f-webp`,
    provider: 'imagekit',
    fileId: json.fileId,
    storagePath: json.filePath || uploadName,
    width: json.width || image.width,
    height: json.height || image.height,
    sizeBytes: json.size || image.compressedBytes,
  };
}

async function uploadSingleToSupabase(
  userId: string,
  accessToken: string,
  image: PreparedForumImage,
): Promise<ForumMediaItem> {
  const ext =
    image.mimeType === 'image/gif'
      ? 'gif'
      : image.mimeType === 'image/png'
        ? 'png'
        : image.mimeType === 'image/jpeg'
          ? 'jpg'
          : 'webp';
  const storagePath = `${userId}/forum_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const form = new FormData();
  form.append('file', {
    uri: Platform.OS === 'android' ? image.localUri : image.localUri.replace('file://', ''),
    name: storagePath.split('/').pop() || `forum.${ext}`,
    type: image.mimeType,
  } as any);

  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/forum-media/${storagePath}`;
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Storage upload failed (${res.status}): ${errText.slice(0, 120)}`);
  }

  const { data } = supabase.storage.from('forum-media').getPublicUrl(storagePath);
  return {
    url: data.publicUrl,
    thumbUrl: data.publicUrl,
    provider: 'supabase',
    storagePath,
    width: image.width,
    height: image.height,
    sizeBytes: image.compressedBytes,
  };
}

export async function uploadForumImages(images: PreparedForumImage[]): Promise<ForumMediaItem[]> {
  if (images.length === 0) return [];
  if (images.length > MAX_FORUM_IMAGES_PER_POST) {
    throw new Error(`Maximum ${MAX_FORUM_IMAGES_PER_POST} images allowed`);
  }

  for (const img of images) {
    if (img.exceedsLimit || img.compressedBytes > MAX_FORUM_IMAGE_BYTES) {
      throw new Error('FILE_TOO_LARGE');
    }
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;
  if (!session?.access_token || !session?.user?.id) {
    throw new Error('AUTH_REQUIRED');
  }

  const { data: quotaCheck } = await supabase.rpc('check_daily_upload_quota', {
    p_incoming_count: images.length,
  });
  if (quotaCheck && quotaCheck.allowed === false) {
    throw new Error('QUOTA_EXCEEDED');
  }

  const uploaded: ForumMediaItem[] = [];
  const signProbe = await requestImageKitSign(session.access_token, images.length);
  const useImageKit = Boolean(signProbe.configured && signProbe.token && signProbe.signature);

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    let item: ForumMediaItem | null = null;

    if (useImageKit) {
      try {
        const sign =
          i === 0 ? signProbe : await requestImageKitSign(session.access_token, images.length - i);
        if (sign.configured && sign.token && sign.signature) {
          item = await uploadSingleToImageKit(img, sign);
        }
      } catch (err: any) {
        if (err?.message === 'QUOTA_EXCEEDED') throw err;
        console.warn('ImageKit failed, falling back to Supabase Storage:', err);
      }
    }

    if (!item) {
      item = await uploadSingleToSupabase(session.user.id, session.access_token, img);
    }

    uploaded.push(item);

    await supabase.rpc('record_forum_upload', {
      p_provider: item.provider,
      p_storage_path: item.storagePath || item.url,
      p_file_id: item.fileId || null,
      p_size_bytes: item.sizeBytes || img.compressedBytes || 1,
    });
  }

  return uploaded;
}

export async function cleanupDeletedForumMedia(mediaItems: ForumMediaItem[]): Promise<void> {
  if (!Array.isArray(mediaItems) || mediaItems.length === 0) return;

  const supabasePaths = mediaItems
    .filter(m => m?.provider === 'supabase' && m.storagePath)
    .map(m => m.storagePath!);

  if (supabasePaths.length > 0) {
    supabase.storage
      .from('forum-media')
      .remove(supabasePaths)
      .catch(() => {});
  }

  const imageKitFileIds = mediaItems
    .filter(m => m?.provider === 'imagekit' && m.fileId)
    .map(m => m.fileId!);

  if (imageKitFileIds.length > 0) {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (token) {
        fetch(`${SUPABASE_URL}/functions/v1/forum-media-sign`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'delete', fileIds: imageKitFileIds }),
        }).catch(() => {});
      }
    } catch {}
  }
}
