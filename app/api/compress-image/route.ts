import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

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

    // Check file size (4.3MB = 4.3 * 1024 * 1024 bytes)
    const MAX_SIZE = 4.3 * 1024 * 1024;

    if (buffer.length <= MAX_SIZE) {
      // No compression needed
      const base64 = buffer.toString('base64');
      const mimeType = file.type;
      return NextResponse.json({
        compressed: false,
        dataUrl: `data:${mimeType};base64,${base64}`,
        size: buffer.length
      });
    }

    // Compress the image
    let compressedBuffer: Buffer = buffer;
    let quality = 90;
    let scale = 1;

    while (compressedBuffer.length > MAX_SIZE && quality > 10) {
      compressedBuffer = await sharp(buffer)
        .resize({
          width: Math.round(2000 * scale),
          height: Math.round(2000 * scale),
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality })
        .toBuffer();

      if (compressedBuffer.length > MAX_SIZE) {
        quality -= 10;
        if (quality < 50) {
          scale -= 0.1;
        }
      }
    }

    const base64 = compressedBuffer.toString('base64');
    const mimeType = 'image/jpeg';

    return NextResponse.json({
      compressed: true,
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
