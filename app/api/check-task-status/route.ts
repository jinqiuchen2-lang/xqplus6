import { NextRequest, NextResponse } from 'next/server';

const KIE_API_URL = process.env.KIE_API_URL || 'https://api.kie.ai';
const KIE_API_KEY = process.env.KIE_API_KEY || '';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json(
        { error: '请提供任务ID' },
        { status: 400 }
      );
    }

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
