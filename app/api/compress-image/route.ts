import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

// For FormData (multipart) upload: 4.3MB limit (no base64 overhead)
const MAX_INPUT_SIZE = 4.3 * 1024 * 1024;

// For base64 output in JSON: need to account for 33% base64 encoding overhead
// and stay under Vercel's 4.5MB request limit
const MAX_OUTPUT_SIZE = 2 * 1024 * 1024; // 2MB (base64 encoded ~2.7MB)

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

    console.log('Original image size:', (buffer.length / 1024 / 1024).toFixed(2), 'MB');

    // Check input size (FormData has no base64 overhead)
    if (buffer.length > MAX_INPUT_SIZE) {
      return NextResponse.json(
        { error: `图片太大，请上传小于4.3MB的图片` },
        { status: 400 }
      );
    }

    // Compress to output size limit (for base64 encoding in JSON)
    let compressedBuffer: Buffer = buffer;
    let quality = 80;
    let scale = 0.8; // Start with smaller scale for better compression

    // Aggressive compression loop
    let attempts = 0;
    const maxAttempts = 15;

    while (compressedBuffer.length > MAX_OUTPUT_SIZE && attempts < maxAttempts) {
      attempts++;
      console.log(`Compression attempt ${attempts}: current size ${(compressedBuffer.length / 1024 / 1024).toFixed(2)}MB, quality: ${quality}, scale: ${scale}`);

      // Reduce quality first, then scale
      if (quality > 50) {
        quality -= 10;
      } else if (quality > 30) {
        quality -= 5;
      } else {
        // Reduce scale more aggressively
        scale -= 0.1;
      }

      // Ensure minimum values
      quality = Math.max(quality, 20);
      scale = Math.max(scale, 0.3);

      compressedBuffer = await sharp(buffer)
        .resize({
          width: Math.round(1920 * scale),
          height: Math.round(1920 * scale),
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality, progressive: true, mozjpeg: true })
        .toBuffer();
    }

    // Final check
    if (compressedBuffer.length > MAX_OUTPUT_SIZE) {
      console.error('Failed to compress image to target size');
      return NextResponse.json(
        { error: `图片压缩失败，无法压缩到目标大小。请尝试上传更小的图片或降低分辨率。` },
        { status: 400 }
      );
    }

    console.log('Final compression:', (compressedBuffer.length / 1024 / 1024).toFixed(2), 'MB (quality:', quality, 'scale:', scale + ')');

    const base64 = compressedBuffer.toString('base64');
    const mimeType = 'image/jpeg';

    console.log('Final base64 size:', (base64.length / 1024 / 1024).toFixed(2), 'MB');

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
