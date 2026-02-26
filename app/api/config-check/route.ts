import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const config = {
    geminiProImageApiKey: !!process.env.GEMINI_PRO_IMAGE_API_KEY,
    geminiProImageApiKeyLength: process.env.GEMINI_PRO_IMAGE_API_KEY?.length || 0,
    proxyApiKey: !!process.env.PROXY_API_KEY,
    proxyApiKeyLength: process.env.PROXY_API_KEY?.length || 0,
    proxyApiUrl: process.env.PROXY_API_URL,
    proxyModel: process.env.PROXY_MODEL,
    kieApiKey: !!process.env.KIE_API_KEY,
    kieApiKeyLength: process.env.KIE_API_KEY?.length || 0,
    kieApiUrl: process.env.KIE_API_URL,
    kieModel: process.env.KIE_MODEL,
    blobReadWriteToken: !!process.env.BLOB_READ_WRITE_TOKEN,
    blobReadWriteTokenLength: process.env.BLOB_READ_WRITE_TOKEN?.length || 0,
    apiUrl: process.env.NEXT_PUBLIC_API_URL,
    apiKey: !!process.env.API_KEY,
    apiKeyLength: process.env.API_KEY?.length || 0,
    modelName: process.env.MODEL_NAME,
  };

  // Hide sensitive data (show only first/last few chars)
  const masked = {
    ...config,
    geminiProImageApiKey: config.geminiProImageApiKey ? `AI***${process.env.GEMINI_PRO_IMAGE_API_KEY?.slice(-4)} (length: ${config.geminiProImageApiKeyLength})` : 'NOT SET',
    proxyApiKey: config.proxyApiKey ? `sk-***${process.env.PROXY_API_KEY?.slice(-4)} (length: ${config.proxyApiKeyLength})` : 'NOT SET',
    kieApiKey: config.kieApiKey ? `0***${process.env.KIE_API_KEY?.slice(-4)} (length: ${config.kieApiKeyLength})` : 'NOT SET',
    blobReadWriteToken: config.blobReadWriteToken ? `vercel_blob_***${process.env.BLOB_READ_WRITE_TOKEN?.slice(-4)} (length: ${config.blobReadWriteTokenLength})` : 'NOT SET',
    apiKey: config.apiKey ? `sk-***${process.env.API_KEY?.slice(-4)} (length: ${config.apiKeyLength})` : 'NOT SET',
  };

  return NextResponse.json(masked);
}
