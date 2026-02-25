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

// Helper function to create multipart/form-data body with multiple images
// Uses indexed field names (image[0], image[1], etc.) for proper multi-image support
function createFormDataWithImages(
  fields: Record<string, string>,
  files: { buffer: Buffer; filename: string; contentType: string }[]
): { body: BodyInit; contentType: string } {
  const boundary = `----FormBoundary${Date.now()}`;
  const chunks: Buffer[] = [];

  console.log('[createFormDataWithImages] Creating multipart form data with', files.length, 'images');

  // Add text fields
  for (const [name, value] of Object.entries(fields)) {
    const valuePreview = value.length > 50 ? value.substring(0, 50) + '...' : value;
    console.log(`[createFormDataWithImages] Adding field: ${name} = ${valuePreview}`);
    chunks.push(
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n`),
      Buffer.from(`${value}\r\n`)
    );
  }

  // Add multiple image files with indexed field names (image[0], image[1], etc.)
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fieldName = `image[${i}]`;
    const fileSizeKB = Math.round(file.buffer.length / 1024);
    console.log(`[createFormDataWithImages] Adding image ${i}: ${fieldName}, filename=${file.filename}, size=${fileSizeKB}KB, type=${file.contentType}`);
    chunks.push(
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from(`Content-Disposition: form-data; name="${fieldName}"; filename="${file.filename}"\r\n`),
      Buffer.from(`Content-Type: ${file.contentType}\r\n\r\n`),
      file.buffer,
      Buffer.from(`\r\n`)
    );
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));

  const body = Buffer.concat(chunks);
  const totalSizeKB = Math.round(body.length / 1024);
  const contentType = `multipart/form-data; boundary=${boundary}`;

  console.log(`[createFormDataWithImages] Total multipart body size: ${totalSizeKB}KB`);

  return { body, contentType };
}

export async function POST(request: NextRequest) {
  // Set a longer timeout for this route (5 minutes)
  // Note: This requires the Next.js server to support timeout configuration
  try {
    const { images, prompt, ratio = '1:1', quality = '2K', constraint, mode = 'official' } = await request.json();

    if (!images || !Array.isArray(images) || images.length === 0) {
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

    // Log detailed image information
    console.log('=== Image Upload Verification ===');
    console.log('Total images received:', images.length);
    images.forEach((img: string, index: number) => {
      const hasBase64Prefix = img.includes('base64,');
      const base64Part = hasBase64Prefix ? img.split('base64,')[1] : img;
      const dataLength = base64Part?.length || 0;
      const estimatedSizeKB = Math.round(dataLength * 0.75 / 1024); // base64 is ~4/3 of original
      const mimeType = img.match(/data:image\/([^;]+)/)?.[1] || 'unknown';
      console.log(`  Image ${index}: mimeType=${mimeType}, base64Length=${dataLength}, estimatedSize=${estimatedSizeKB}KB`);
    });

    // Combine constraint with prompt if provided
    const fullPrompt = constraint ? `${constraint}\n\n${prompt}` : prompt;

    console.log('=== Starting async image generation ===');
    console.log('Mode:', mode);
    console.log('Aspect Ratio:', ratio);
    console.log('Quality:', quality);
    console.log('Prompt length:', fullPrompt.length);
    console.log('Constraint:', constraint ? 'YES' : 'NO');

    // Proxy mode: use the nano-banana-2 API directly
    if (mode === 'proxy') {
      console.log('=== PROXY MODE: nano-banana-2 ===');
      console.log('Number of images to send:', images.length);
      console.log('Proxy API URL:', `${PROXY_API_URL}/v1/images/edits`);
      console.log('Model:', PROXY_MODEL);

      // Convert all base64 images to buffers with detailed logging
      const imageBuffers = images.map((img: string, index: number) => {
        const base64Data = img.includes('base64,') ? img.split('base64,')[1] : img;
        const buffer = Buffer.from(base64Data, 'base64');
        const sizeKB = Math.round(buffer.length / 1024);
        console.log(`  [Image ${index}] Buffer size: ${sizeKB}KB`);
        return {
          buffer,
          filename: `image${index + 1}.png`,
          contentType: 'image/png'
        };
      });

      // Create multipart/form-data body with multiple images
      const { body, contentType } = createFormDataWithImages(
        {
          model: PROXY_MODEL,
          prompt: fullPrompt,
          response_format: 'url',
          aspect_ratio: ratio,
          image_size: quality
        },
        imageBuffers
      );

      console.log('=== Sending Request to Proxy API ===');
      console.log('Request params:', {
        model: PROXY_MODEL,
        prompt: fullPrompt.substring(0, 100) + '...',
        aspect_ratio: ratio,
        image_size: quality,
        image_count: imageBuffers.length,
        content_type: contentType
      });

      // Add timeout controller for proxy API (3 minutes)
      const proxyController = new AbortController();
      const proxyTimeoutId = setTimeout(() => proxyController.abort(), 180000); // 3 minutes

      let proxyResponse: Response;
      try {
        proxyResponse = await fetch(`${PROXY_API_URL}/v1/images/edits`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${PROXY_API_KEY}`,
            'Content-Type': contentType
          },
          body: body,
          signal: proxyController.signal,
        });
        clearTimeout(proxyTimeoutId);
      } catch (fetchError: any) {
        clearTimeout(proxyTimeoutId);
        if (fetchError.name === 'AbortError') {
          console.error('Proxy API request timed out after 3 minutes');
          throw new Error('中转API请求超时，请减少图片数量或降低图片质量后重试');
        }
        throw fetchError;
      }

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
    console.log('=== OFFICIAL MODE: Gemini Pro Image API ===');

    // Extract layout section from the original Chinese prompt before processing
    // This preserves the specific Chinese text content (titles, labels, etc.)
    const layoutMatch = fullPrompt.match(/【排版布局】\s*([\s\S]*?)(?=$|【|###|$)/);
    const originalLayout = layoutMatch ? layoutMatch[1].trim() : null;
    console.log('Original layout extracted:', originalLayout ? 'YES' : 'NO');
    if (originalLayout) {
      console.log('Layout content:', originalLayout.substring(0, 100) + '...');
    }

    // Step 1: Full vision analysis for product fidelity
    console.log('=== Step 1: Vision Analysis ===');
    console.log('Number of images for analysis:', images.length);
    console.log('Input prompt with constraint:', fullPrompt.substring(0, 300) + '...');
    let finalPrompt = fullPrompt;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 40000); // 40s timeout for complete analysis

    let analysisSuccess = false;
    try {
      // Build messages with all images for analysis
      const imageContents = images.map((img: string, index: number) => {
        const urlPreview = img.length > 50 ? img.substring(0, 50) + '...' : img;
        console.log(`  [Analysis Image ${index}] ${urlPreview}`);
        return {
          type: 'image_url',
          image_url: { url: img }
        };
      });
      console.log('Total image contents for analysis:', imageContents.length);

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
                  text: `请分析这些产品图片（共${images.length}张），并基于以下用户提示词生成英文增强版提示词（直接输出英文提示词，不要包含其他内容）：\n\n${fullPrompt}`
                },
                ...imageContents
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
    console.log('=== Step 2: Image Generation ===');
    console.log('Final prompt being used:', finalPrompt.substring(0, 200) + '...');
    console.log('Number of reference images:', images.length);
    console.log('Aspect Ratio:', ratio);
    console.log('Image Size:', quality);

    // Build request body for Gemini Pro Image API with all images
    // Start with text prompt
    const parts: any[] = [{ text: finalPrompt }];

    // Add all images to parts with detailed logging
    console.log('Building request parts with images:');
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const base64Data = img.includes('base64,') ? img.split('base64,')[1] : img;
      const dataLength = base64Data?.length || 0;
      const sizeKB = Math.round(dataLength * 0.75 / 1024);
      console.log(`  [Part ${i + 1}] inline_data: mime_type=image/png, data_length=${dataLength}, size=${sizeKB}KB`);
      parts.push({
        inline_data: {
          mime_type: 'image/png',
          data: base64Data
        }
      });
    }
    console.log('Total parts in request:', parts.length);

    const requestBody = {
      contents: [{
        parts: parts
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
      imageSize: quality,
      imageCount: images.length
    });

    // Add API key as query parameter
    const url = `${GEMINI_PRO_IMAGE_BASE_URL}?key=${GEMINI_PRO_IMAGE_API_KEY}`;

    // Add timeout controller for Gemini API (3 minutes)
    const geminiController = new AbortController();
    const geminiTimeoutId = setTimeout(() => geminiController.abort(), 180000); // 3 minutes

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: geminiController.signal,
      });
      clearTimeout(geminiTimeoutId);
    } catch (fetchError: any) {
      clearTimeout(geminiTimeoutId);
      if (fetchError.name === 'AbortError') {
        console.error('Gemini API request timed out after 3 minutes');
        throw new Error('图片生成超时，请减少图片数量或降低图片质量后重试');
      }
      throw fetchError;
    }

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
    console.error('=== Error in generate-image API ===');
    console.error('Error type:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('Error message:', error instanceof Error ? error.message : String(error));
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');

    // Check for specific error types
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return NextResponse.json(
          {
            error: '请求超时，请减少图片数量后重试',
            details: error.message
          },
          { status: 408 }
        );
      }
      if (error.message.includes('JSON') || error.message.includes('parse')) {
        return NextResponse.json(
          {
            error: 'API响应解析失败',
            details: error.message
          },
          { status: 502 }
        );
      }
      if (error.message.includes('fetch') || error.message.includes('network')) {
        return NextResponse.json(
          {
            error: '网络连接失败，请检查网络后重试',
            details: error.message
          },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      {
        error: '生成图片失败，请稍后重试',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
