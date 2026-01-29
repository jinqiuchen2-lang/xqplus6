import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const API_KEY = process.env.API_KEY;
const MODEL_NAME = process.env.MODEL_NAME || 'gemini-3-pro-preview';
const NANO_BANANA_MODEL = process.env.NANO_BANANA_MODEL || 'nano-banana-2';

export async function POST(request: NextRequest) {
  try {
    const { image, prompt, ratio = '1:1', quality = '2K' } = await request.json();

    if (!image) {
      return NextResponse.json(
        { error: '请提供图片' },
        { status: 400 }
      );
    }

    if (!prompt) {
      return NextResponse.json(
        { error: '请提供提示词' },
        { status: 400 }
      );
    }

    // Map ratio to dimensions
    const ratioMap: Record<string, { width: number; height: number }> = {
      '1:1': { width: 1024, height: 1024 },
      '2:3': { width: 683, height: 1024 },
      '3:2': { width: 1024, height: 683 },
      '3:4': { width: 768, height: 1024 },
      '4:3': { width: 1024, height: 768 },
      '4:5': { width: 820, height: 1024 },
      '5:4': { width: 1024, height: 820 },
      '9:16': { width: 576, height: 1024 },
      '16:9': { width: 1024, height: 576 },
    };

    const dimensions = ratioMap[ratio] || ratioMap['1:1'];

    console.log('=== Starting async image generation ===');
    console.log('Model:', NANO_BANANA_MODEL);
    console.log('Dimensions:', dimensions);

    // Step 1: Full vision analysis for product fidelity
    console.log('Step 1: Complete product analysis...');
    let finalPrompt = prompt;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // Reduced to 20s timeout

    let analysisSuccess = false;
    try {
      const analysisResponse = await fetch(`${API_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: MODEL_NAME,
          messages: [
            {
              role: 'system',
              content: `你是产品分析师。分析产品图片并生成英文增强提示词。

【产品特征】
- 产品类型、颜色、材质、款式特点

【增强提示词】
[基于用户提示词和产品特征，生成详细的英文图像生成提示词，保留产品所有视觉特征]`
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `分析产品图片，生成增强版提示词：\n\n${prompt}`
                },
                {
                  type: 'image_url',
                  image_url: { url: image }
                }
              ]
            }
          ],
          max_tokens: 800, // Reduced from 1500
        }),
      });

      if (analysisResponse.ok) {
        const analysisData = await analysisResponse.json();
        const analysisContent = analysisData.choices?.[0]?.message?.content || '';
        console.log('Product analysis completed');

        // Extract the enhanced prompt from the analysis
        const enhancedPromptMatch = analysisContent.match(/【增强提示词】\s*([\s\S]*?)(?=\n|$)/);
        if (enhancedPromptMatch) {
          finalPrompt = enhancedPromptMatch[1].trim();
          console.log('Using enhanced prompt with reference image features');
          analysisSuccess = true;
        }
      }
    } catch (analysisError) {
      console.log('Vision analysis error:', analysisError);
      // Continue with original prompt
    }

    clearTimeout(timeoutId);

    if (!analysisSuccess) {
      console.log('Vision analysis failed or timed out, using original prompt');
    }

    // Step 2: Generate image using edits endpoint (image-to-image)
    console.log('Step 2: Generating image with reference...');

    // Convert base64 to blob for FormData
    const imageBlob = await fetch(image).then(r => r.blob());

    // Use FormData for image upload (edits endpoint requires multipart)
    const formData = new FormData();
    formData.append('image', imageBlob);
    formData.append('prompt', finalPrompt);
    formData.append('size', `${dimensions.width}x${dimensions.height}`);
    formData.append('n', '1');

    const response = await fetch(`${API_URL}/v1/images/edits`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Image Generation Error Status:', response.status);
      console.error('Image Generation Error Response:', errorText);

      // Provide more helpful error messages
      if (response.status === 404) {
        throw new Error('图片生成端点不可用，请检查API配置');
      } else if (response.status === 401) {
        throw new Error('API密钥无效');
      } else if (response.status >= 500) {
        throw new Error('API服务暂时不可用，请稍后重试');
      }
      throw new Error(`生成图片失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Image generated successfully');

    // Extract image URL from response
    const imageUrl = data.data?.[0]?.url || data.url;

    if (!imageUrl) {
      console.error('Response data:', data);
      throw new Error('No image URL in response');
    }

    console.log('Image URL:', imageUrl);

    // Return the image directly instead of taskId
    return NextResponse.json({
      success: true,
      imageUrl,
      message: '图片生成成功'
    });

  } catch (error) {
    console.error('Error in generate-image API:', error);
    return NextResponse.json(
      {
        error: '生成图片失败，请稍后重试',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
