import { NextRequest, NextResponse } from 'next/server';

const KIE_UPLOAD_URL = 'https://kieai.redpandaai.co/api/file-base64-upload';
const KIE_API_KEY = process.env.KIE_API_KEY || '';

export async function POST(request: NextRequest) {
  try {
    const { base64Data, fileName } = await request.json();

    if (!base64Data) {
      return NextResponse.json(
        { error: '请提供图片数据' },
        { status: 400 }
      );
    }

    if (!KIE_API_KEY || KIE_API_KEY === '') {
      console.error('KIE_API_KEY is not configured');
      return NextResponse.json(
        { error: 'KIE上传服务未配置' },
        { status: 503 }
      );
    }

    console.log('=== Upload to KIE Request ===');
    console.log('Filename:', fileName || 'unnamed.png');

    // Upload to KIE file storage
    const response = await fetch(KIE_UPLOAD_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${KIE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        base64Data,
        uploadPath: 'images/base64',
        fileName: fileName || `upload-${Date.now()}.png`,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('KIE Upload Error Status:', response.status);
      console.error('KIE Upload Error Body:', errorText);
      throw new Error(`KIE上传失败: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('KIE Upload response:', JSON.stringify(data, null, 2));

    // Extract the URL from KIE response
    const imageUrl = data.url || data.data?.url || data.fileUrl;

    if (!imageUrl) {
      console.error('KIE Upload response data:', data);
      throw new Error('KIE未返回图片URL');
    }

    console.log('Upload successful, URL:', imageUrl);

    return NextResponse.json({
      success: true,
      url: imageUrl,
    });

  } catch (error) {
    console.error('=== Error in upload-to-kie API ===');
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
