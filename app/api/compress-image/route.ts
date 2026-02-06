import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

// Vercel has a 4.5MB request limit, set safer limit to account for base64 encoding overhead
// Base64 encoding increases size by ~33%, so 2MB original = ~2.7MB encoded
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: '没有找到文件' },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    console.log('Original image size:', buffer.length, 'bytes');

    // Always compress to ensure consistent size
    let compressedBuffer: Buffer = buffer;
    let quality = 85;
    let scale = 1;

    while (compressedBuffer.length > MAX_SIZE && quality > 20) {
      compressedBuffer = await sharp(buffer)
        .resize({
          width: Math.round(1920 * scale),
          height: Math.round(1920 * scale),
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality, progressive: true })
        .toBuffer();

      console.log('Compressed to:', compressedBuffer.length, 'bytes (quality:', quality, 'scale:', scale + ')');

      if (compressedBuffer.length > MAX_SIZE) {
        quality -= 10;
        if (quality < 60) {
          scale -= 0.15;
        }
      }
    }

    const base64 = compressedBuffer.toString('base64');
    const mimeType = 'image/jpeg';

    return NextResponse.json({
      compressed: buffer.length !== compressedBuffer.length,
      dataUrl: `data:${mimeType};base64,${base64}`,
      originalSize: buffer.length,
      compressedSize: compressedBuffer.length
    });
  } catch (error) {
    console.error('Error compressing image:', error);
    return NextResponse.json(
      { error: '图片压缩失败' },
      { status: 500 }
    );
  }
}
