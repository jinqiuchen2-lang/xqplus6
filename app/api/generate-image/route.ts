import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const API_KEY = process.env.API_KEY;
const MODEL_NAME = process.env.MODEL_NAME || 'gemini-3-pro-preview';
const NANO_BANANA_MODEL = process.env.NANO_BANANA_MODEL || 'nano-banana-2';
const NANO_BANANA_API_KEY = process.env.NANO_BANANA_API_KEY || API_KEY;

export async function POST(request: NextRequest) {
  try {
    const { image, prompt, ratio = '1:1', quality = '2K', constraint } = await request.json();

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

    // Combine constraint with prompt if provided
    const fullPrompt = constraint ? `${constraint}\n\n${prompt}` : prompt;

    console.log('=== Starting async image generation ===');
    console.log('Model:', NANO_BANANA_MODEL);
    console.log('Aspect Ratio:', ratio);
    console.log('Quality:', quality);

    // Step 1: Full vision analysis for product fidelity
    console.log('Step 1: Complete product analysis...');
    console.log('Input prompt with constraint:', fullPrompt.substring(0, 300) + '...');
    let finalPrompt = fullPrompt;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 40000); // 40s timeout for complete analysis

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
              content: `你是一个专业的产品分析师。请仔细分析上传的产品图片，提取关键特征。

请按以下格式输出：

【产品特征分析】
- 产品类型：[具体描述]
- 颜色：[主色调、辅助色]
- 材质：[面料/材质描述]
- 款式特点：[设计元素、LOGO位置、图案等]
- 整体风格：[风格描述]

【英文增强提示词】
[基于用户的提示词（包含约束条件和中文描述），结合产品特征，生成详细的英文图像生成提示词。提示词必须严格保留产品的所有视觉特征，包括颜色、款式、LOGO、材质等。必须遵守所有约束条件。]`
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `请分析这张产品图片，并基于以下用户提示词生成英文增强版提示词（直接输出英文提示词，不要包含其他内容）：\n\n${fullPrompt}`
                },
                {
                  type: 'image_url',
                  image_url: { url: image }
                }
              ]
            }
          ],
          max_tokens: 1500, // Full analysis
        }),
      });

      if (analysisResponse.ok) {
        const analysisData = await analysisResponse.json();
        const analysisContent = analysisData.choices?.[0]?.message?.content || '';
        console.log('Product analysis completed');
        console.log('Analysis content:', analysisContent);

        // Extract the enhanced prompt from the analysis
        // Match everything after 【英文增强提示词】 until the end
        const enhancedPromptMatch = analysisContent.match(/【英文增强提示词】\s*([\s\S]*)/);
        if (enhancedPromptMatch) {
          finalPrompt = enhancedPromptMatch[1].trim();
          console.log('Using enhanced prompt with reference image features');
          console.log('Enhanced prompt length:', finalPrompt.length);
          console.log('Enhanced prompt preview:', finalPrompt.substring(0, 200));
          analysisSuccess = true;
        } else {
          console.log('Could not extract enhanced prompt, using original full prompt');
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
    console.log('Final prompt being used:', finalPrompt.substring(0, 200) + '...');
    console.log('Image reference included:', !!image);
    console.log('Model:', NANO_BANANA_MODEL);
    console.log('Aspect Ratio:', ratio);
    console.log('Image Size:', quality);

    // Convert base64 to blob for FormData
    const imageBlob = await fetch(image).then(r => r.blob());

    // Use FormData according to API spec
    // Required: model, prompt, image
    // Optional: aspect_ratio, image_size, response_format
    const formData = new FormData();
    formData.append('model', NANO_BANANA_MODEL);
    formData.append('prompt', finalPrompt);
    formData.append('image', imageBlob);
    formData.append('aspect_ratio', ratio);
    formData.append('image_size', quality);
    formData.append('response_format', 'url');

    console.log('FormData prepared:', {
      model: NANO_BANANA_MODEL,
      prompt: finalPrompt.substring(0, 100) + '...',
      aspect_ratio: ratio,
      image_size: quality,
      response_format: 'url'
    });

    const response = await fetch(`${API_URL}/v1/images/edits`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NANO_BANANA_API_KEY}`,
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
