import { NextRequest, NextResponse } from 'next/server';

const KIE_API_URL = process.env.KIE_API_URL || 'https://api.kie.ai';
const KIE_API_KEY = process.env.KIE_API_KEY || '';

// Apimart mode configuration
const APIMART_IMAGE_API_URL = process.env.APIMART_IMAGE_API_URL || 'https://api.apimart.ai/v1/images/generations';
const APIMART_IMAGE_API_KEY = process.env.APIMART_IMAGE_API_KEY || '';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const taskId = searchParams.get('taskId');
    const provider = searchParams.get('provider') || 'kie'; // Default to KIE, support 'apimart'

    if (!taskId) {
      return NextResponse.json(
        { error: '请提供任务ID' },
        { status: 400 }
      );
    }

    // Route to appropriate provider
    if (provider === 'apimart') {
      return await checkApimartTaskStatus(taskId);
    } else {
      return await checkKieTaskStatus(taskId);
    }
  } catch (error) {
    console.error('Error in check-task-status API:', error);
    return NextResponse.json(
      {
        error: '查询任务状态失败',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Check KIE task status
async function checkKieTaskStatus(taskId: string) {
  // Check if KIE API key is configured
  if (!KIE_API_KEY || KIE_API_KEY === '') {
    console.error('KIE API key is not configured');
    return NextResponse.json(
      { error: 'KIE模式暂不可用' },
      { status: 503 }
    );
  }

  console.log('=== Checking KIE Task Status ===');
  console.log('TaskId:', taskId);

  // Add timeout controller for KIE API (10 seconds)
  const kieController = new AbortController();
  const kieTimeoutId = setTimeout(() => kieController.abort(), 10000);

  let kieResponse: Response;
  try {
    kieResponse = await fetch(`${KIE_API_URL}/api/v1/jobs/recordInfo?taskId=${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${KIE_API_KEY}`,
      },
      signal: kieController.signal,
    });
    clearTimeout(kieTimeoutId);
  } catch (fetchError: any) {
    clearTimeout(kieTimeoutId);
    if (fetchError.name === 'AbortError') {
      console.error('KIE API request timed out after 10 seconds');
      throw new Error('KIE API请求超时，请稍后重试');
    }
    throw fetchError;
  }

  if (!kieResponse.ok) {
    const errorText = await kieResponse.text();
    console.error('KIE API Error Status:', kieResponse.status);
    console.error('KIE API Error Body:', errorText);
    throw new Error(`KIE API调用失败: ${kieResponse.status} - ${errorText}`);
  }

  const kieData = await kieResponse.json();
  console.log('KIE API response:', JSON.stringify(kieData, null, 2));

  // Extract task data
  const taskData = kieData.data;
  if (!taskData) {
    throw new Error('KIE API未返回任务数据');
  }

  const { state, resultJson, failMsg } = taskData;

  console.log('Task state:', state);

  // Return task status
  return NextResponse.json({
    success: true,
    state,
    resultJson,
    failMsg,
    taskId
  });
}

// Check Apimart task status
async function checkApimartTaskStatus(taskId: string) {
  // Check if Apimart API key is configured
  if (!APIMART_IMAGE_API_KEY || APIMART_IMAGE_API_KEY === '') {
    console.error('Apimart API key is not configured');
    return NextResponse.json(
      { error: 'APImart模式暂不可用' },
      { status: 503 }
    );
  }

  console.log('=== Checking Apimart Task Status ===');
  console.log('TaskId:', taskId);

  // Use the correct Apimart task query endpoint: /v1/tasks/{taskId}
  const apimartTaskUrl = `https://api.apimart.ai/v1/tasks/${taskId}`;
  console.log('Fetching Apimart task status from:', apimartTaskUrl);

  // Add timeout controller for Apimart API (10 seconds)
  const apimartController = new AbortController();
  const apimartTimeoutId = setTimeout(() => apimartController.abort(), 10000);

  let apimartResponse: Response;
  try {
    apimartResponse = await fetch(apimartTaskUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${APIMART_IMAGE_API_KEY}`,
      },
      signal: apimartController.signal,
    });
    clearTimeout(apimartTimeoutId);
  } catch (fetchError: any) {
    clearTimeout(apimartTimeoutId);
    if (fetchError.name === 'AbortError') {
      console.error('Apimart API request timed out after 10 seconds');
      throw new Error('APImart API请求超时，请稍后重试');
    }
    throw fetchError;
  }

  if (!apimartResponse.ok) {
    const errorText = await apimartResponse.text();
    console.error('Apimart API Error Status:', apimartResponse.status);
    console.error('Apimart API Error Body:', errorText);
    throw new Error(`APImart API调用失败: ${apimartResponse.status} - ${errorText}`);
  }

  const apimartData = await apimartResponse.json();
  console.log('Apimart API response:', JSON.stringify(apimartData, null, 2));

  // Extract task data - handle multiple response formats
  // Format 1: { data: [{ status, task_id, image_url }] }
  // Format 2: { status, task_id, image_url } (direct)
  // Format 3: { data: { status, task_id, image_url } } (single object)
  let taskData = apimartData.data?.[0] || apimartData.data || apimartData;

  if (!taskData) {
    console.error('APImart response structure:', {
      hasData: !!apimartData.data,
      dataKeys: apimartData.data ? Object.keys(apimartData.data) : 'no data',
      fullResponse: apimartData
    });
    throw new Error('APImart API未返回任务数据');
  }

  const { status, task_id, image_url, url, result, error } = taskData;

  console.log('Task status:', status);
  console.log('Task data keys:', Object.keys(taskData));
  console.log('Full task data:', JSON.stringify(taskData, null, 2));

  // Normalize status to our standard format
  // Apimart statuses: submitted, processing, success, succeeded, completed, failed, pending
  // Our format: submitted, processing, success, fail
  const originalState = status?.toLowerCase() || 'unknown';

  console.log('Original status:', status, 'Lowercase:', originalState);

  // Map statuses - use if-else to prevent cascading mapping
  let state: string;

  if (['success', 'completed', 'succeeded', 'done', 'finished'].includes(originalState)) {
    console.log('Mapping', originalState, 'to success');
    state = 'success';
  } else if (originalState === 'failed' || originalState === 'error') {
    console.log('Mapping', originalState, 'to fail');
    state = 'fail';
  } else if (['submitted', 'pending', 'queued', 'in_progress', 'generating', 'processing'].includes(originalState)) {
    console.log('Mapping', originalState, 'to processing');
    state = 'processing';
  } else {
    // Keep original status if not recognized
    console.log('Unknown status:', originalState, 'keeping as is');
    state = originalState;
  }

  // Extract image URL from possible fields
  let imageUrl = image_url || url;

  // Also check result field if imageUrl is not available
  if (!imageUrl && result) {
    if (typeof result === 'string') {
      imageUrl = result;
    } else if (result.url || result.image_url) {
      imageUrl = result.url || result.image_url;
    }
  }

  console.log('Normalized state:', state);
  console.log('Image URL exists:', !!imageUrl);
  if (imageUrl) {
    console.log('Image URL (first 100 chars):', imageUrl.substring(0, 100));
  }

  // Return task status
  return NextResponse.json({
    success: true,
    state,
    imageUrl: imageUrl || null,
    taskId: task_id || taskId,
    failMsg: error?.message || (state === 'fail' ? '图片生成失败' : undefined), // Include error message
    rawStatus: status, // Include raw status for debugging
    _debug: {
      originalStatus: status,
      allKeys: Object.keys(taskData),
      hasImageUrl: !!imageUrl,
      taskDataSample: JSON.stringify(taskData).substring(0, 500) // First 500 chars
    }
  });
}
