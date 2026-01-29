import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const imageUrl = searchParams.get('url');

    if (!imageUrl) {
      return NextResponse.json(
        { error: '请提供图片URL' },
        { status: 400 }
      );
    }

    console.log('Proxying image download:', imageUrl);

    // Fetch the image server-side (no CORS issues)
    const response = await fetch(imageUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    // Get the image blob
    const blob = await response.blob();

    // Get content type from response
    const contentType = response.headers.get('content-type') || 'image/png';

    // Extract filename from URL or use default
    const urlParts = imageUrl.split('/');
    const filename = urlParts[urlParts.length - 1] || 'downloaded-image.png';

    // Return the image with proper headers
    return new NextResponse(blob, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  } catch (error) {
    console.error('Error in download-image API:', error);
    return NextResponse.json(
      {
        error: '下载图片失败',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
