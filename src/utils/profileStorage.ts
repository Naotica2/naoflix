import { supabase } from '../config/supabaseClient';
import { Platform } from 'react-native';

const MAX_AVATAR_SIZE_MB = 4;
const MAX_BANNER_SIZE_MB = 6;

export interface UploadResult {
  url?: string;
  error?: string;
}

export async function validateFileSize(uri: string, maxMb: number): Promise<boolean> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const sizeInMB = blob.size / (1024 * 1024);
    return sizeInMB <= maxMb;
  } catch (e) {
    console.warn('Failed to get file size:', e);
    return true; // Fallback to allowing if we can't check
  }
}

function getFileInfo(uri: string): { ext: string, type: string } {
  let ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
  ext = ext.split('?')[0];

  let type = 'image/jpeg';
  if (ext === 'png') type = 'image/png';
  if (ext === 'gif') type = 'image/gif';
  if (ext === 'webp') type = 'image/webp';
  
  if (!['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
    ext = 'jpg';
    type = 'image/jpeg';
  }

  return { ext, type };
}

async function uploadToSupabase(
  bucket: 'avatars' | 'banners',
  userId: string,
  uri: string,
  maxMb: number
): Promise<UploadResult> {
  try {
    const isValidSize = await validateFileSize(uri, maxMb);
    if (!isValidSize) {
      return { error: `Ukuran file terlalu besar! Maksimal ${maxMb}MB` };
    }

    const { ext, type } = getFileInfo(uri);
    const timestamp = new Date().getTime();
    const fileName = `${userId}/media_${timestamp}.${ext}`;

    const formData = new FormData();
    formData.append('file', {
      uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
      name: fileName,
      type: type,
    } as any);

    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;

    if (!token) return { error: 'Belum login' };

    const supabaseUrl = process.env.SUPABASE_URL || '';
    const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${fileName}`;

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errRes = await response.json();
      console.warn('Upload error:', errRes);
      return { error: 'Gagal mengunggah gambar' };
    }

    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return { url: publicUrl };

  } catch (error) {
    console.error(`Error uploading ${bucket}:`, error);
    return { error: 'Terjadi kesalahan sistem' };
  }
}

export async function uploadAvatar(userId: string, uri: string): Promise<UploadResult> {
  return uploadToSupabase('avatars', userId, uri, MAX_AVATAR_SIZE_MB);
}

export async function uploadBanner(userId: string, uri: string): Promise<UploadResult> {
  return uploadToSupabase('banners', userId, uri, MAX_BANNER_SIZE_MB);
}
