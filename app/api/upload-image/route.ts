import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export async function POST(request: NextRequest) {
  try {
    const { image } = await request.json();

    if (!image) {
      return NextResponse.json(
        { error: '请提供图片数据' },
        { status: 400 }
      );
    }

    // Extract base64 data
    const base64Data = image.includes('base64,') ? image.split('base64,')[1] : image;
    const buffer = Buffer.from(base64Data, 'base64');

    // Generate unique filename
    const filename = `upload-${Date.now()}-${Math.random().toString(36).substring(7)}.png`;

    console.log('=== Upload Image Request ===');
    console.log('Filename:', filename);
    console.log('Size:', buffer.length, 'bytes');

    // Check if BLOB_READ_WRITE_TOKEN is configured
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    if (!blobToken) {
      console.error('BLOB_READ_WRITE_TOKEN is not configured');
      return NextResponse.json(
        { error: '图片上传服务未配置' },
        { status: 503 }
      );
    }

    // Upload to Vercel Blob Storage
    const blob = await put(filename, buffer, {
      access: 'public',
    });

    console.log('Upload successful, URL:', blob.url);

    return NextResponse.json({
      success: true,
      url: blob.url,
    });

  } catch (error) {
    console.error('=== Error in upload-image API ===');
    console.error('Error:', error);

    return NextResponse.json(
      {
        error: '图片上传失败',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
