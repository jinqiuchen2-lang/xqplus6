import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const API_KEY = process.env.API_KEY;
const MODEL_NAME = process.env.MODEL_NAME || 'gemini-3-pro-preview';
const GEMINI_PRO_IMAGE_API_KEY = process.env.GEMINI_PRO_IMAGE_API_KEY;
const GEMINI_PRO_IMAGE_BASE_URL = process.env.GEMINI_PRO_IMAGE_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent';

// Proxy mode configuration
const PROXY_API_URL = process.env.PROXY_API_URL || 'https://ai.comfly.chat';
const PROXY_API_KEY = process.env.PROXY_API_KEY || 'sk-BBUADo4NEY066P3Q7PKJh2g4y3pP6CPy3hNFBt7cQqwBMVma';
const PROXY_MODEL = process.env.PROXY_MODEL || 'nano-banana-2';

// Helper function to create multipart/form-data body
function createFormData(fields: Record<string, string>, file: { buffer: Buffer; filename: string; contentType: string }): { body: Uint8Array; contentType: string } {
  const boundary = `----FormBoundary${Date.now()}`;
  const chunks: Buffer[] = [];

  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n`),
      Buffer.from(`${value}\r\n`)
    );
  }

  // Add file
  chunks.push(
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from(`Content-Disposition: form-data; name="image"; filename="${file.filename}"\r\n`),
    Buffer.from(`Content-Type: ${file.contentType}\r\n\r\n`),
    file.buffer,
    Buffer.from(`\r\n`)
  );

  chunks.push(Buffer.from(`--${boundary}--\r\n`));

  const body = new Uint8Array(Buffer.concat(chunks));
  const contentType = `multipart/form-data; boundary=${boundary}`;

  return { body, contentType };
}

export async function POST(request: NextRequest) {
  try {
    const { image, prompt, ratio = '1:1', quality = '2K', constraint, mode = 'official' } = await request.json();

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
    console.log('Mode:', mode);
    console.log('Aspect Ratio:', ratio);
    console.log('Quality:', quality);

    // Proxy mode: use the nano-banana-2 API directly
    if (mode === 'proxy') {
      console.log('Using proxy mode with nano-banana-2 API');

      // Convert base64 image to buffer
      const base64Data = image.includes('base64,') ? image.split('base64,')[1] : image;
      const imageBuffer = Buffer.from(base64Data, 'base64');

      // Create multipart/form-data body
      const { body, contentType } = createFormData(
        {
          model: PROXY_MODEL,
          prompt: fullPrompt,
          response_format: 'url',
          aspect_ratio: ratio,
          image_size: quality
        },
        {
          buffer: imageBuffer,
          filename: 'image.png',
          contentType: 'image/png'
        }
      );

      console.log('Proxy API request:', {
        model: PROXY_MODEL,
        prompt: fullPrompt.substring(0, 100) + '...',
        aspect_ratio: ratio,
        image_size: quality
      });

      const proxyResponse = await fetch(`${PROXY_API_URL}/v1/images/edits`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PROXY_API_KEY}`,
          'Content-Type': contentType
        },
        body: body,
      });

      if (!proxyResponse.ok) {
        const errorText = await proxyResponse.text();
        console.error('Proxy API Error Status:', proxyResponse.status);
        console.error('Proxy API Error Body:', errorText);
        throw new Error(`中转API调用失败: ${proxyResponse.status} - ${errorText}`);
      }

      const proxyData = await proxyResponse.json();
      console.log('Proxy API response:', JSON.stringify(proxyData, null, 2));

      // Extract image URL from proxy response
      // The response format follows OpenAI Dall-e format
      const imageUrl = proxyData.data?.[0]?.url || proxyData.url;

      if (!imageUrl) {
        console.error('Proxy response data:', proxyData);
        throw new Error('中转API未返回图片URL');
      }

      console.log('Proxy mode image generated successfully, URL:', imageUrl);

      return NextResponse.json({
        success: true,
        imageUrl,
        message: '图片生成成功（中转模式）'
      });
    }

    // Official mode: use the existing Gemini Pro Image API
    // Extract layout section from the original Chinese prompt before processing
    // This preserves the specific Chinese text content (titles, labels, etc.)
    const layoutMatch = fullPrompt.match(/【排版布局】\s*([\s\S]*?)(?=$|【|###|$)/);
    const originalLayout = layoutMatch ? layoutMatch[1].trim() : null;
    console.log('Original layout extracted:', originalLayout ? 'YES' : 'NO');
    if (originalLayout) {
      console.log('Layout content:', originalLayout.substring(0, 100) + '...');
    }

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
[基于用户的提示词（包含约束条件和中文描述），结合产品特征，生成详细的英文图像生成提示词。

**重要约束：**
1. 提示词必须严格保留产品的所有视觉特征，包括颜色、款式、LOGO、材质等
2. 必须遵守所有约束条件
3. 只翻译描述性语言和场景说明为英文，不要翻译排版布局部分（排版布局将单独保留）
4. 排版布局指令将在英文提示词之后以原样中文形式添加，用于指定图像中的文字内容]`
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

    // Append the original layout section (in Chinese) to the enhanced prompt
    // This ensures the specific Chinese text content is included in the image generation
    if (originalLayout && analysisSuccess) {
      finalPrompt = finalPrompt + '\n\n【Layout Requirements】\n' + originalLayout;
      console.log('Appended original layout to enhanced prompt');
      console.log('Final prompt with layout:', finalPrompt.substring(0, 300) + '...');
    }

    if (!analysisSuccess) {
      console.log('Vision analysis failed or timed out, using original prompt');
    }

    // Step 2: Generate image using Gemini Pro Image API
    console.log('Step 2: Generating image with reference...');
    console.log('Final prompt being used:', finalPrompt.substring(0, 200) + '...');
    console.log('Image reference included:', !!image);
    console.log('Aspect Ratio:', ratio);
    console.log('Image Size:', quality);

    // Convert base64 image to base64 string for Gemini API
    const base64Data = image.includes('base64,') ? image.split('base64,')[1] : image;

    // Build request body for Gemini Pro Image API
    const requestBody = {
      contents: [{
        parts: [
          { text: finalPrompt },
          {
            inline_data: {
              mime_type: 'image/png',
              data: base64Data
            }
          }
        ]
      }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio: ratio,
          imageSize: quality
        }
      }
    };

    console.log('Request body prepared:', {
      prompt: finalPrompt.substring(0, 100) + '...',
      aspectRatio: ratio,
      imageSize: quality
    });

    // Add API key as query parameter
    const url = `${GEMINI_PRO_IMAGE_BASE_URL}?key=${GEMINI_PRO_IMAGE_API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
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
    console.log('Response data:', JSON.stringify(data, null, 2));

    // Extract base64 image data from Gemini response
    // Response format: { candidates: [{ content: { parts: [{ inlineData: { data: "..." } }] } }] }
    const imageData = data.candidates?.[0]?.content?.parts?.find(
      (part: any) => part.inlineData?.data
    )?.inlineData?.data;

    if (!imageData) {
      console.error('Response data:', data);
      throw new Error('No image data in response');
    }

    // Convert base64 to data URL
    const imageUrl = `data:image/png;base64,${imageData}`;
    console.log('Image URL length:', imageUrl.length);

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
