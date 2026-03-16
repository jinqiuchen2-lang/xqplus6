import { NextRequest, NextResponse } from 'next/server';

// Interface A (Apimart) - default
const API_A_BASE_URL = process.env.PROMPT_API_BASE_URL || 'https://api.apimart.ai/v1/chat/completions';
const API_A_KEY = process.env.PROMPT_API_KEY || '';
const API_A_MODEL = process.env.PROMPT_MODEL_NAME || 'gemini-3-flash-preview-thinking-apimart';

// Interface C (Comfly) - new
const API_C_BASE_URL = process.env.PROMPT_API_C_BASE_URL || 'https://ai.comfly.chat/v1/chat/completions';
const API_C_KEY = process.env.PROMPT_API_C_KEY || '';
const API_C_MODEL = process.env.PROMPT_API_C_MODEL || 'gemini-3-flash-preview';

// Prompt specifications for the 7 poster types
const PROMPT_SPECS: Record<string, { name: string; posterId: string; posterStyle: string; instruction: string }> = {
  main_kv: {
    name: '主KV视觉',
    posterId: '海报01',
    posterStyle: 'Hero Shot',
    instruction: `主KV视觉（Hero Shot，必须严格还原产品图，突出画面的氛围和光线）`,
  },
  usage_scenario: {
    name: '使用场景',
    posterId: '海报02',
    posterStyle: 'Lifestyle',
    instruction: `使用场景（Lifestyle，展示产品实际使用场景，必须严格还原产品图，不可出现裸体）`,
  },
  craft_visualization: {
    name: '工艺概念可视化',
    posterId: '海报03',
    posterStyle: 'Process/Concept',
    instruction: `工艺概念可视化（Process/Concept，必须严格还原产品图，需要详细排版布局说明）`,
  },
  detail_closeup: {
    name: '细节特写',
    posterId: '海报04',
    posterStyle: 'Detail 01',
    instruction: `细节特写（Detail 01，设计亮点）`,
  },
  texture_closeup: {
    name: '质感特写',
    posterId: '海报05',
    posterStyle: 'Detail 02',
    instruction: `质感特写（Detail 02，材质/质感特写，使用微距+掠射光）`,
  },
  functional_detail: {
    name: '功能细节',
    posterId: '海报06',
    posterStyle: 'Detail 03',
    instruction: `功能细节（Detail 03，功能细节）`,
  },
  color_inspiration: {
    name: '配色灵感',
    posterId: '海报07',
    posterStyle: '配色灵感',
    instruction: `配色灵感（画面中不展示任何英文和数字）`,
  },
};

// Base system prompt with the new Prompt Spec format
const BASE_SYSTEM_PROMPT = `你是一个专业的电商海报提示词生成专家。根据用户上传的儿童服饰产品图片，生成完整的电商KV视觉系统提示词。

【核心目标】：对产品实物进行工程级还原，严禁AI幻觉。

请严格按照以下步骤生成提示词：

---

Step 1: Product Information & Visual Constraint Extraction
请仔细分析我上传的多张产品图片，自动提取以下信息：

1. 自动识别项目 (Basic Info):
- 产品类型: 识别具体品类（如：针织爬服/羽绒外套/纯棉内衣）。
- 卖点提取: 视觉特征与功能卖点。
- 配色方案: 主色调、辅助色、点缀色，配色风格。
- 设计风格: 识别图案、款式风格。
- 目标受众: 推断年龄段（如：0-6个月，1-3岁）。

2. 视觉约束立法提取 (Visual Constraint Extraction) [CRITICAL]:
请像工业工程师一样提取"不可变特征"：
- 几何结构锁定: 描述产品绝对轮廓。
- 材质物理属性: 精准描述材质的光学反应（如：带绒毛的羊毛、哑光纯棉）。
- 固定组件: 必须保留的扣子、标签、印花位置。

---

Step 2: Visual Style Selection
基于产品信息推荐视觉风格（如：水彩艺术、极简北欧、自然有机、可爱色彩、日系淡彩等）。
AI推荐依据：根据产品类型自动匹配最佳风格，根据产品/包装设计风格延续品牌调性，根据目标受众审美偏好推荐，所有图片大致风格统一。

---

Step 2.5: Photography & Lighting Strategy [NEW - 核心升级]
请根据海报类型，自动匹配摄影方案（如：北欧自然柔光 (Nordic Soft)、梦幻逆光质感 (Dreamy Backlight)、微距触感光影 (Macro Tactile) 等）。

---

Step 3: Typography Selection
推荐适合的文字排版风格（如：杂志风、卡通告、可爱风、极简风）。

---

Step 4: Generate Complete Prompt (System Refined)
请严格按照以下逻辑生成海报的提示词：

1. Prompt 核心结构 (The Logic):
在生成具体的海报提示词之前，你必须基于【Step 1】中提取的"视觉约束立法"，编写一段 [CRITICAL CONSTRAINT] 英文代码块。
这段代码块必须作为每一张海报提示词的"第一段"，置于所有描述之前。
代码块内容必须包含：
- Strictly restore reference image (严格还原参考图)
- DO NOT alter structure (禁止改变结构，引用Step 1提取的结构特征)
- Material accuracy (材质精准度，引用Step 1提取的材质特征)
- No Hallucinations (禁止幻觉，禁止随意添加装饰)

2. 产品图还原要求: 必须在Prompt中明确说明："严格还原上传的产品图，包括设计、LOGO位置、文字内容、图案元素等所有细节"。

---

输出格式要求：

【识别报告】
产品类型：[大类] - [具体产品]
产品规格：[具体规格]
核心卖点：[卖点1]...
主色调：[颜色名称] (#HEX)...
设计风格：[风格描述]

【视觉约束立法 / Visual Constraints】
- 结构特征：[详细描述]
- 材质特征：[详细描述]
- 固定组件：[详细描述]

### {POSTER_ID}｜{POSTER_NAME} · {STYLE}

[CRITICAL CONSTRAINT: PRODUCT FIDELITY]
1. STRUCTURE: [结构描述]
2. MATERIAL: [材质描述]
[END CONSTRAINT]

中文提示词：[600-1000字的详细中文提示词]

负面词 / Negative: [负面提示词]

排版布局：
- 对于"主KV视觉"、"使用场景"、"细节特写"、"质感特写"、"功能细节"、"配色灵感"类型，排版布局为可选项（AI根据画面需要决定是否添加）
- 对于"工艺概念可视化"类型，排版布局为必填项，必须按照以下格式输出：

排版布局示例：
顶部居中：
主标题：[产品名称或宣传语] (字体样式，颜色，字号)
中部区域：[产品主体展示位置说明]
底部居中：
副标题：[核心卖点或品牌标语] (字体样式，颜色)
标签/卖点：[具体卖点文字1] [具体卖点文字2] (位置说明)

注意事项：
- 排版布局必须详细描述每个文字元素的位置、字体、颜色、大小
- 标题和副标题要有明确的层次关系
- 所有文字元素必须与产品风格保持一致
- **排版布局中的文字内容必须是中文，但品牌名和英文术语保持原文（不需要翻译）**

【重要输出要求】
- 严格按照上述格式输出，**不要添加任何问候语、结束语、对话性内容或提问**
- **不要问"是否需要生成其他风格"或"是否有修改建议"等问题**
- 输出内容直接以"负面词"部分结束，不要有任何额外的文字或符号
- 不要添加"希望对您有帮助"、"祝您创作顺利"等客套话
`;

export async function POST(request: NextRequest) {
  console.log('=== generate-single-prompt API called ===');
  try {
    const body = await request.json();
    console.log('Request body keys:', Object.keys(body));
    const { images, posterType, promptApi = 'A' } = body;
    console.log('Images array length:', images?.length);
    console.log('Poster type:', posterType);
    console.log('Prompt API selected:', promptApi);

    // Select API configuration based on promptApi parameter
    let API_BASE_URL: string;
    let API_KEY: string;
    let MODEL_NAME: string;

    if (promptApi === 'C') {
      API_BASE_URL = API_C_BASE_URL;
      API_KEY = API_C_KEY;
      MODEL_NAME = API_C_MODEL;
      console.log('Using Prompt API C (Comfly)');
    } else {
      // Default to A (Apimart)
      API_BASE_URL = API_A_BASE_URL;
      API_KEY = API_A_KEY;
      MODEL_NAME = API_A_MODEL;
      console.log('Using Prompt API A (Apimart)');
    }

    console.log('API_BASE_URL:', API_BASE_URL);
    console.log('MODEL_NAME:', MODEL_NAME);
    console.log('API_KEY exists:', !!API_KEY);

    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json(
        { error: '请至少上传一张图片' },
        { status: 400 }
      );
    }

    if (!posterType || !PROMPT_SPECS[posterType]) {
      return NextResponse.json(
        { error: '无效的海报类型' },
        { status: 400 }
      );
    }

    if (images.length > 8) {
      return NextResponse.json(
        { error: '最多只能上传8张图片' },
        { status: 400 }
      );
    }

    const spec = PROMPT_SPECS[posterType];
    console.log(`Generating prompt for ${spec.name} (${posterType})`);

    // Replace placeholders in system prompt
    const systemPrompt = BASE_SYSTEM_PROMPT
      .replace('{POSTER_ID}', spec.posterId)
      .replace('{POSTER_NAME}', spec.name)
      .replace('{STYLE}', spec.posterStyle);

    // New API streaming request with timeout
    // Note: Vercel has strict limits (Free: 10s, Pro: 60s)
    // Set timeout to 120s - requires Vercel Pro for full functionality
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 seconds timeout

    let content = '';
    let reasoningContent = '';
    let finalContent = '';
    let creditsConsumed = 0;

    try {
      // Build content array with text and images (direct base64)
      const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
        {
          type: 'text',
          text: `请根据我上传的图片，为"${spec.name}"（${spec.instruction}）生成海报提示词。严格按照Prompt Spec格式输出。`,
        },
      ];

      // Add images as base64 data URLs directly
      for (const img of images) {
        // If img already has data:image prefix, use it directly; otherwise add it
        const imageUrl = img.startsWith('data:') ? img : `data:image/png;base64,${img}`;
        userContent.push({
          type: 'image_url',
          image_url: { url: imageUrl },
        });
      }

      const requestBody = {
        model: MODEL_NAME,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userContent,
          },
        ],
        max_tokens: 2000,
      };

      console.log('Request to:', API_BASE_URL);
      console.log('Using base64 images directly, count:', images.length);
      console.log('Request body size:', JSON.stringify(requestBody).length);
      console.log('Starting fetch request...');

      const response = await fetch(API_BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      console.log('Fetch completed, response status:', response.status, response.ok);

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API Error for ${spec.name}:`, response.status, errorText);

        // Provide more specific error messages
        let errorMessage = '生成提示词失败，请稍后重试';
        if (response.status === 401) {
          errorMessage = 'API密钥无效，请检查配置';
        } else if (response.status === 403) {
          errorMessage = 'API访问被拒绝，请检查权限';
        } else if (response.status === 429) {
          errorMessage = '请求过于频繁，请稍后再试';
        } else if (response.status >= 500) {
          errorMessage = 'API服务暂时不可用，请稍后重试';
        }

        throw new Error(errorMessage);
      }

      // Parse response (may be streaming or non-streaming)
      const contentType = response.headers.get('content-type') || '';
      const isStreaming = contentType.includes('text/event-stream');

      if (isStreaming) {
        // Process streaming response
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error('无法读取响应流');
        }

        console.log(`[${spec.name}] Starting to read stream...`);
        let buffer = '';
        let chunkCount = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log(`[${spec.name}] Stream done. Total chunks: ${chunkCount}`);
            break;
          }

          chunkCount++;
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          // Log first few chunks for debugging
          if (chunkCount <= 3) {
            console.log(`[${spec.name}] Chunk ${chunkCount}:`, chunk.substring(0, 200));
          }

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            if (trimmedLine.startsWith('data: ')) {
              const dataStr = trimmedLine.slice(6).trim();
              if (dataStr === '[DONE]') continue;

              try {
                const data = JSON.parse(dataStr);
                const delta = data.choices?.[0]?.delta;

                if (delta?.reasoning_content) {
                  reasoningContent += delta.reasoning_content;
                  console.log('Reasoning content received:', delta.reasoning_content.substring(0, 100));
                }

                if (delta?.content) {
                  finalContent += delta.content;
                }

                if (data.credits_consumed !== undefined) {
                  creditsConsumed = data.credits_consumed;
                  console.log('Credits consumed:', creditsConsumed);
                }
              } catch (e) {
                if (chunkCount <= 5) {
                  console.log(`[${spec.name}] Parse error:`, e instanceof Error ? e.message : e);
                }
              }
            }
          }
        }
      } else {
        // Non-streaming response
        const data = await response.json();
        console.log(`[${spec.name}] Parsed non-streaming response`);

        if (data.error) {
          throw new Error(data.error.message || data.msg || 'API Error');
        }

        if (data.choices?.[0]?.message?.content) {
          finalContent = data.choices[0].message.content;
        }
      }

      console.log(`[${spec.name}] Response processing complete. Content length: ${finalContent.length}`);

      content = finalContent;
      console.log(`Raw response for ${spec.name}:`, content.substring(0, 200));

    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      console.error('Fetch error details:', {
        name: fetchError?.name,
        message: fetchError?.message,
        cause: fetchError?.cause,
        stack: fetchError?.stack?.substring(0, 500)
      });
      if (fetchError.name === 'AbortError') {
        throw new Error('请求超时（120秒）。API响应时间过长，可能原因：1) 图片太大，请压缩图片；2) API服务繁忙。');
      }
      throw fetchError;
    }

    // Parse the response to extract components
    let chinesePrompt = '';
    let constraint = '';
    let identificationReport = '';
    let layout = '';

    // Extract identification report
    const reportMatch = content.match(/【识别报告】([\s\S]*?)【视觉约束立法】/);
    if (reportMatch) {
      identificationReport = reportMatch[1].trim();
    }

    // Extract constraint section
    const constraintMatch = content.match(/\[CRITICAL CONSTRAINT: PRODUCT FIDELITY\]([\s\S]*?)\[END CONSTRAINT\]/);
    if (constraintMatch) {
      constraint = constraintMatch[1].trim();
    } else {
      // Fallback: try to find constraint in old format
      const oldConstraintMatch = content.match(/CRITICAL CONSTRAINT[：:]\s*([\s\S]*?)(?=$|中文提示词|负面词)/);
      if (oldConstraintMatch) {
        constraint = oldConstraintMatch[1].trim();
      }
    }

    // Extract Chinese prompt (includes everything after 中文提示词)
    // First, clean the content to remove metadata sections
    let cleanedContent = content;

    // Remove 【识别报告】section
    cleanedContent = cleanedContent.replace(/【识别报告】[\s\S]*?【视觉约束立法】/, '');

    // Remove 【视觉约束立法】section
    cleanedContent = cleanedContent.replace(/【视觉约束立法\/\s*Visual Constraints】[\s\S]*?(?=###|中文提示词|$)/, '');

    // Remove [CRITICAL CONSTRAINT] block
    cleanedContent = cleanedContent.replace(/\[CRITICAL CONSTRAINT[^\]]*\][\s\S]*?\[END CONSTRAINT\]/, '');

    // Remove "### 海报XX | ..." title lines
    cleanedContent = cleanedContent.replace(/### [^\n]+\n/, '');

    // Remove "Prompt (English):" label
    cleanedContent = cleanedContent.replace(/Prompt \(English\):[\s\n]*/i, '');

    // Now extract Chinese prompt from cleaned content
    const chineseMatch = cleanedContent.match(/中文提示词[：:]\s*([\s\S]*?)(?=$)/);
    if (chineseMatch) {
      chinesePrompt = chineseMatch[1].trim();
    }

    // Remove "负面词" section if present
    chinesePrompt = chinesePrompt.replace(/负面词[：:]\s*[\s\S]*?(?=$)/, '').trim();

    // Extract layout section - try multiple patterns for robustness
    let layoutMatch = chinesePrompt.match(/排版布局[：:]\s*([\s\S]*?)(?=$|负面词|###|$)/);
    if (!layoutMatch) {
      layoutMatch = cleanedContent.match(/排版布局[：:]\s*([\s\S]*?)(?=$|负面词|###|$)/);
    }

    if (layoutMatch) {
      layout = layoutMatch[1].trim();
      console.log(`Layout found for ${spec.name}, length: ${layout.length}`);
    } else {
      console.log(`No layout found for ${spec.name}`);
    }

    // Remove layout from chinesePrompt if it's there (to avoid duplication when we re-append)
    chinesePrompt = chinesePrompt.replace(/排版布局[：:]\s*[\s\S]*?(?=$|负面词|###|$)/, '').trim();

    // If still empty, try to extract main content without metadata
    if (!chinesePrompt || chinesePrompt.length < 10) {
      const mainContentMatch = content.match(/\[END CONSTRAINT\][\s\S]*?(?=负面词|$)/);
      if (mainContentMatch) {
        chinesePrompt = mainContentMatch[1].trim();
      }
    }

    // Always append formatted layout to chinesePrompt at the end
    // Layout content must be in Chinese only
    if (layout) {
      chinesePrompt = chinesePrompt + '\n\n【排版布局】\n' + layout;
    }

    // If still empty (API returned empty response), keep it empty for frontend to handle
    if (!chinesePrompt || chinesePrompt.length < 10) {
      console.log(`Empty response for ${spec.name}, returning empty prompt`);
    }

    console.log(`Parsed for ${spec.name} - Prompt length:`, chinesePrompt.length, 'Has layout:', !!layout);

    const prompt: PromptData = {
      type: posterType,
      name: spec.name,
      chinesePrompt: chinesePrompt,
      constraint: constraint,
      identificationReport: identificationReport,
      layout: layout,
      fullPrompt: content,
    };

    return NextResponse.json({ prompt });
  } catch (error) {
    console.error('Error in generate-single-prompt API:', error);

    // Handle Response objects from failed retries
    if (error instanceof Response) {
      const errorText = await error.text();
      console.error('API Response error:', error.status, errorText);

      let errorMessage = '生成提示词失败，请稍后重试';
      if (error.status === 401) {
        errorMessage = 'API密钥无效，请检查配置';
      } else if (error.status === 403) {
        errorMessage = 'API访问被拒绝，请检查权限';
      } else if (error.status === 429) {
        errorMessage = '请求过于频繁，请稍后再试';
      } else if (error.status >= 500) {
        errorMessage = 'API服务暂时不可用，请稍后重试';
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: error.status }
      );
    }

    const errorMessage = error instanceof Error ? error.message : '生成提示词失败，请稍后重试';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

interface PromptData {
  type: string;
  name: string;
  chinesePrompt: string;
  constraint: string;
  identificationReport: string;
  layout: string;
  fullPrompt: string;
}
