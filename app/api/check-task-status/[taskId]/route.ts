import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const API_KEY = process.env.API_KEY;

export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const { taskId } = await params;

    if (!taskId) {
      return NextResponse.json(
        { error: '请提供 taskId' },
        { status: 400 }
      );
    }

    console.log('=== Checking task status ===');
    console.log('Task ID:', taskId);

    // Check task status
    const response = await fetch(`${API_URL}/v1/images/tasks/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Task Status Error:', response.status, errorText);

      // If task not found, it might have failed or been purged
      if (response.status === 404) {
        return NextResponse.json({
          status: 'failed',
          error: '任务未找到或已过期'
        });
      }

      throw new Error(`查询任务状态失败: ${response.status}`);
    }

    const data = await response.json();
    console.log('Task Status Response:', data);

    // Check the task status
    // Based on the API, we need to check the data structure
    const task = data.data || data;

    // Common status: processing, succeeded, failed
    let status = 'processing';
    let imageUrl = null;
    let errorMessage = null;

    if (task.status === 'succeeded' || task.status === 'completed') {
      status = 'completed';
      // Extract image URL from the task result
      imageUrl = task.result?.data?.[0]?.url || task.result?.url || null;
    } else if (task.status === 'failed' || task.status === 'error') {
      status = 'failed';
      errorMessage = task.error?.message || '生成失败';
    }

    console.log('Final Status:', status, 'Image URL:', imageUrl, 'Error:', errorMessage);

    return NextResponse.json({
      taskId,
      status,
      imageUrl,
      error: errorMessage
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
