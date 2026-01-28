import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const API_KEY = process.env.NEXT_PUBLIC_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gpt-4o-mini';
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

    // Map ratio to dimensions (assuming base size of 1024)
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

    console.log('=== Starting image generation with reference ===');
    console.log('Model:', NANO_BANANA_MODEL);
    console.log('Dimensions:', dimensions);

    // Step 1: Use vision model to analyze the reference image and enhance the prompt
    console.log('Step 1: Analyzing reference image with vision model...');

    let finalPrompt = prompt;

    const analysisResponse = await fetch(`${API_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        messages: [
          {
            role: 'system',
            content: `你是一个专业的产品分析师。请仔细分析上传的产品图片，提取关键特征，然后生成一个增强版的图像生成提示词。

请按以下格式输出：

【产品特征分析】
- 产品类型：[具体描述]
- 颜色：[主色调、辅助色]
- 材质：[面料/材质描述]
- 款式特点：[设计元素、LOGO位置等]
- 整体风格：[风格描述]

【增强提示词】
[基于用户原始提示词，结合产品特征，生成详细的英文图像生成提示词。提示词必须严格保留产品的所有视觉特征，包括颜色、款式、LOGO、材质等。确保生成的图片与参考产品高度一致。]`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `请分析这张产品图片，并基于以下用户提示词生成增强版提示词：\n\n${prompt}`
              },
              {
                type: 'image_url',
                image_url: { url: image }
              }
            ]
          }
        ],
        max_tokens: 1500,
      }),
    });

    if (!analysisResponse.ok) {
      console.error('Vision analysis failed, using original prompt');
    } else {
      const analysisData = await analysisResponse.json();
      const analysisContent = analysisData.choices?.[0]?.message?.content || '';
      console.log('Product analysis completed');

      // Extract the enhanced prompt from the analysis
      const enhancedPromptMatch = analysisContent.match(/【增强提示词】\s*([\s\S]*?)(?=$|$)/);
      if (enhancedPromptMatch) {
        finalPrompt = enhancedPromptMatch[1].trim();
        console.log('Using enhanced prompt with reference image features');
      }
    }

    // Step 2: Generate image with reference image using edits endpoint
    console.log('Step 2: Generating image with reference...');

    // Convert base64 to blob
    const imageBlob = await fetch(image).then(r => r.blob());

    // Create FormData with reference image
    const formData = new FormData();
    formData.append('image', imageBlob);
    formData.append('prompt', finalPrompt);
    formData.append('size', `${dimensions.width}x${dimensions.height}`);
    formData.append('n', '1');

    // Use edits endpoint with reference image (required, no fallback)
    const response = await fetch(`${API_URL}/v1/images/edits`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Edits API Error Status:', response.status);
      console.error('Edits API Error Response:', errorText);
      throw new Error(`图片生成失败（必须参考原图）: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Image generated successfully with reference image (edits endpoint)');

    // Extract the generated image URL
    const imageUrl = data.data?.[0]?.url || data.url;

    if (!imageUrl) {
      throw new Error('No image URL in response');
    }

    console.log('Image generated successfully with reference');

    return NextResponse.json({
      success: true,
      imageUrl,
      prompt: finalPrompt,
      ratio,
      quality
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
