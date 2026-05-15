import { getSupabaseAdmin } from '@/lib/supabase/admin';

export function buildImageDataUrl(imageBase64: string, mimeType: string = 'image/png'): string {
  return `data:${mimeType};base64,${imageBase64}`;
}

export async function uploadMarketingImage(
  imageBase64: string,
  filePrefix: string = 'generated',
): Promise<string | null> {
  const admin = getSupabaseAdmin();
  if (!admin || !imageBase64) return null;

  try {
    const buffer = Buffer.from(imageBase64, 'base64');
    const safeFileName = `${filePrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
    const storagePath = `generated/${safeFileName}`;
    const { error: uploadError } = await admin.storage
      .from('marketing-images')
      .upload(storagePath, buffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadError) {
      console.error('[ImageStorage] Storage 업로드 실패:', {
        filePrefix,
        bytes: buffer.byteLength,
        message: uploadError.message,
      });
      return null;
    }

    const { data: urlData } = admin.storage
      .from('marketing-images')
      .getPublicUrl(storagePath);
    return urlData.publicUrl || null;
  } catch (error) {
    console.error('[ImageStorage] Storage 업로드 예외:', error);
    return null;
  }
}
