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
  let taskData = apimartData.data?.[0] || apimartData;

  if (!taskData) {
    throw new Error('APImart API未返回任务数据');
  }

  const { status, task_id, image_url, url } = taskData;

  console.log('Task status:', status);
  console.log('Task data keys:', Object.keys(taskData));

  // Normalize status to our standard format
  // Apimart statuses: submitted, processing, success, succeeded, completed, failed
  // Our format: submitted, processing, success, fail
  let state = status?.toLowerCase() || 'unknown';

  // Map completed/succeeded to success
  if (['completed', 'succeeded'].includes(state)) {
    state = 'success';
  }

  // Map failed to fail
  if (state === 'failed') {
    state = 'fail';
  }

  // Extract image URL from possible fields
  const imageUrl = image_url || url;

  console.log('Normalized state:', state);
  console.log('Image URL exists:', !!imageUrl);

  // Return task status
  return NextResponse.json({
    success: true,
    state,
    imageUrl: imageUrl || null,
    taskId: task_id || taskId,
    rawStatus: status // Include raw status for debugging
  });
}
