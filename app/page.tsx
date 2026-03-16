'use client';

import { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';

// Types
interface PromptData {
  type: string;
  name: string;
  chinesePrompt: string;
  constraint: string;
  fullPrompt: string;
}

interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  date: string;
  posterType: string;
  isBatch?: boolean;
  batchImages?: Array<{ tabId: string; tabName: string; url: string; prompt: string }>;
}

interface UploadedImage {
  id: string;
  dataUrl: string;
  file: File;
}

const TABS = [
  { id: 'main_kv', name: '主KV视觉' },
  { id: 'usage_scenario', name: '使用场景' },
  { id: 'craft_visualization', name: '工艺概念可视化' },
  { id: 'detail_closeup', name: '细节特写' },
  { id: 'texture_closeup', name: '质感特写' },
  { id: 'functional_detail', name: '功能细节' },
  { id: 'color_inspiration', name: '配色灵感' },
];

const RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9'];
const QUALITIES = ['1K', '2K', '4K'];
const MODES = [
  { id: 'apimart', name: 'A线' },
  { id: 'proxy', name: 'C线' },
  { id: 'kie', name: 'K线' },
];

// Storage keys
const HISTORY_STORAGE_KEY = 'poster-generator-history';
const MAX_HISTORY_ITEMS = 10; // Limit history to avoid localStorage quota exceeded

// Compression constants (shared with upload handler)
const TOTAL_BUDGET = 3.0 * 1024 * 1024; // 3MB total budget
const MAX_SINGLE_SIZE = 3.3 * 1024 * 1024; // 3.3MB per image limit

// Calculate base64 string actual size in bytes (shared helper)
function calculateBase64Size(base64String: string): number {
  const parts = base64String.split(',');
  if (parts.length < 2) return base64String.length;
  // Base64 encoded size is approximately 4/3 of original binary size
  // So actual size = base64StringLength * (3/4)
  return Math.floor(parts[1].length * 0.75);
}

// Helper function to check if images are too large
function checkImageSizes(images: UploadedImage[]): { valid: boolean; message?: string } {
  // Check individual images
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const actualSize = calculateBase64Size(img.dataUrl);
    const sizeInMB = (actualSize / 1024 / 1024).toFixed(2);

    if (actualSize > MAX_SINGLE_SIZE) {
      return {
        valid: false,
        message: `图片 ${i + 1} 太大（${sizeInMB}MB），请删除后重新上传。请尝试上传更小的图片或降低图片分辨率。`
      };
    }
  }

  // Check total size of all images combined
  const totalSize = images.reduce((sum, img) => sum + calculateBase64Size(img.dataUrl), 0);
  const totalSizeInMB = (totalSize / 1024 / 1024).toFixed(2);

  if (totalSize > TOTAL_BUDGET) {
    return {
      valid: false,
      message: `${images.length}张图片总大小为${totalSizeInMB}MB，超过3MB限制。请减少图片数量或上传更小的图片。`
    };
  }

  return { valid: true };
}

export default function Home() {
  // Image modal state
  const [modalImage, setModalImage] = useState<string | null>(null);

  // Module 1: Image Upload State
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false);
  const [isGeneratingSinglePrompt, setIsGeneratingSinglePrompt] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Module 2: Prompt & Generate State
  const [activeTab, setActiveTab] = useState(TABS[0].id);
  const [prompts, setPrompts] = useState<Record<string, PromptData>>({});
  const [editedPrompts, setEditedPrompts] = useState<Record<string, string>>({});
  const [selectedRatio, setSelectedRatio] = useState('1:1');
  const [selectedQuality, setSelectedQuality] = useState('2K');
  const [selectedMode, setSelectedMode] = useState('apimart');
  const [selectedPromptApi, setSelectedPromptApi] = useState('A'); // Prompt API selection (A or C)
  const [isPromptApiExpanded, setIsPromptApiExpanded] = useState(false); // Prompt API dropdown expanded state
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [currentGeneratedImage, setCurrentGeneratedImage] = useState<string | null>(null);
  const [tabsTriedGenerating, setTabsTriedGenerating] = useState<Record<string, boolean>>({});

  // Generate All Images state
  const [isGeneratingAllImages, setIsGeneratingAllImages] = useState(false);
  const [allGeneratedImages, setAllGeneratedImages] = useState<Array<{ tabId: string; tabName: string; url: string; prompt: string }>>([]);

  // Check if any prompts exist
  const hasAnyPrompts = TABS.some(tab => {
    const prompt = editedPrompts[tab.id];
    return prompt && prompt.trim().length > 0;
  });

  // Module 3: History State - Load from localStorage on mount
  const [history, setHistory] = useState<GeneratedImage[]>([]);

  // Load history from localStorage on client side only
  useEffect(() => {
    const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Migrate old data: replace "批量生成" with "批量"
        let needsMigration = false;
        const migrated = parsed.map((item: GeneratedImage) => {
          if (item.posterType === '批量生成') {
            needsMigration = true;
            return { ...item, posterType: '批量' };
          }
          return item;
        });

        if (needsMigration) {
          // Save migrated data back to localStorage
          localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(migrated));
        }

        console.log('Loaded history from localStorage:', parsed.length, 'items');
        console.log('First item prompt:', parsed[0]?.prompt);
        setHistory(migrated);
      } catch (e) {
        console.error('Failed to parse history:', e);
        // Invalid data, ignore
      }
    }
  }, []);

  // Save history to localStorage whenever it changes
  useEffect(() => {
    if (history.length > 0) {
      try {
        // Limit history to MAX_HISTORY_ITEMS to avoid quota exceeded
        const limitedHistory = history.slice(0, MAX_HISTORY_ITEMS);
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(limitedHistory));
      } catch (error) {
        console.error('Failed to save history to localStorage:', error);
        // If quota exceeded, clear old items and try again
        try {
          const limitedHistory = history.slice(0, 2);
          localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(limitedHistory));
        } catch {
          // If still fails, clear all history
          localStorage.removeItem(HISTORY_STORAGE_KEY);
        }
      }
    }
  }, [history]);

  // Module 1: Image Upload Functions

  // Compression constants
  const MAX_WIDTH = 1280; // Max width for AI recognition
  const MIN_QUALITY = 0.3;
  const INITIAL_QUALITY = 0.8;

  // Load image from file
  function loadImageFromFile(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  // Compress image using Canvas
  async function canvasCompress(file: File, quality: number): Promise<string> {
    const img = await loadImageFromFile(file);

    // Calculate new dimensions (max width 1280px, maintain aspect ratio)
    let width = img.width;
    let height = img.height;

    if (width > MAX_WIDTH) {
      height = Math.round((height * MAX_WIDTH) / width);
      width = MAX_WIDTH;
    }

    // Create canvas and compress
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法创建 Canvas 上下文');
    }

    ctx.drawImage(img, 0, 0, width, height);

    // Convert to blob then to dataUrl
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('压缩失败'));
            return;
          }
          const reader = new FileReader();
          reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            URL.revokeObjectURL(img.src); // Clean up object URL
            resolve(dataUrl);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        },
        'image/jpeg',
        quality
      );
    });
  }

  // Smart compression with dynamic target size
  async function smartCompress(file: File, targetSize: number): Promise<string> {
    console.log(`[smartCompress] Compressing to target size: ${(targetSize / 1024 / 1024).toFixed(2)}MB`);
    console.log(`[smartCompress] Original file size: ${(file.size / 1024 / 1024).toFixed(2)}MB`);

    let quality = INITIAL_QUALITY;
    let dataUrl = await canvasCompress(file, quality);
    let currentSize = calculateBase64Size(dataUrl);

    console.log(`[smartCompress] Initial compression: quality=${quality}, size=${(currentSize / 1024 / 1024).toFixed(2)}MB`);

    // If still over target size and quality not at minimum, continue reducing
    while (currentSize > targetSize && quality > MIN_QUALITY) {
      quality -= 0.1;
      quality = Math.max(quality, MIN_QUALITY); // Ensure minimum

      dataUrl = await canvasCompress(file, quality);
      currentSize = calculateBase64Size(dataUrl);

      console.log(`[smartCompress] Reduced quality to ${quality}, size=${(currentSize / 1024 / 1024).toFixed(2)}MB`);
    }

    console.log(`[smartCompress] Final: quality=${quality}, size=${(currentSize / 1024 / 1024).toFixed(2)}MB`);
    return dataUrl;
  }

  const handleFileSelect = async (files: FileList | null) => {
    if (!files) return;

    const newImages: UploadedImage[] = [];
    const remainingSlots = 5 - uploadedImages.length;
    const filesToProcess = Math.min(files.length, remainingSlots);

    // Check if already at max limit
    if (remainingSlots <= 0) {
      alert('最多只能上传5张图片');
      return;
    }

    // Calculate dynamic quota per image
    const targetSizePerImage = Math.floor(TOTAL_BUDGET / filesToProcess);

    console.log(`[handleFileSelect] Processing ${filesToProcess} files`);
    console.log(`[handleFileSelect] Target size per image: ${(targetSizePerImage / 1024 / 1024).toFixed(2)}MB`);

    // Process each file with smart compression
    for (let i = 0; i < filesToProcess; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;

      try {
        // Compress with dynamic target size
        const compressedDataUrl = await smartCompress(file, targetSizePerImage);

        // Check if single image exceeds limit
        const actualSize = calculateBase64Size(compressedDataUrl);
        if (actualSize > MAX_SINGLE_SIZE) {
          alert(`图片 ${i + 1} 压缩后仍然过大（${(actualSize / 1024 / 1024).toFixed(2)}MB），请上传更小的图片`);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
          return;
        }

        newImages.push({
          id: `${Date.now()}-${i}`,
          dataUrl: compressedDataUrl,
          file,
        });

        console.log(`[handleFileSelect] Image ${i + 1} processed successfully`);
      } catch (error) {
        console.error(`[handleFileSelect] Error processing image ${i + 1}:`, error);
        alert(`图片 ${i + 1} 处理失败，请重试`);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
    }

    // Calculate total size after compression
    const totalSize = newImages.reduce((sum, img) => sum + calculateBase64Size(img.dataUrl), 0);
    console.log(`[handleFileSelect] Total size after compression: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);

    // Final check: ensure total doesn't exceed budget
    if (totalSize > TOTAL_BUDGET) {
      alert(`压缩后图片总大小为${(totalSize / 1024 / 1024).toFixed(2)}MB，超过3MB限制。请减少图片数量或上传更小的图片。`);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    setUploadedImages([...uploadedImages, ...newImages]);

    // Reset file input to allow selecting the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (id: string) => {
    setUploadedImages(uploadedImages.filter((img) => img.id !== id));
  };

  const removeAllImages = () => {
    setUploadedImages([]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Generate all prompts for all tabs
  const generateAllPrompts = async () => {
    if (uploadedImages.length === 0) {
      alert('请先上传图片');
      return;
    }

    // Check image sizes before sending
    const sizeCheck = checkImageSizes(uploadedImages);
    if (!sizeCheck.valid) {
      alert(sizeCheck.message);
      return;
    }

    setIsGeneratingPrompts(true);

    // Fetch with timeout helper
    const fetchWithTimeout = async (url: string, options: RequestInit, timeout = 180000) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    };

    try {
      const response = await fetchWithTimeout('/api/generate-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: uploadedImages.map((img) => img.dataUrl),
          promptApi: selectedPromptApi,
        }),
      });

      // Handle 413 error (payload too large)
      if (response.status === 413) {
        throw new Error('图片太大，请删除当前图片并重新上传');
      }

      // Try to parse JSON, handle non-JSON responses
      let data;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        console.error('Non-JSON response:', text);
        throw new Error('服务器响应错误，请稍后重试');
      }

      if (!response.ok) {
        console.error('API Error:', data);
        throw new Error(data.error || '生成提示词失败');
      }

      console.log('API Response:', data);

      if (!data.prompts || !Array.isArray(data.prompts)) {
        console.error('Invalid response format:', data);
        throw new Error('返回数据格式错误');
      }

      // Show warning if some prompts failed to generate
      if (data.warning) {
        alert(`提示：${data.warning}`);
      }

      // If no prompts were generated, show error
      if (data.prompts.length === 0) {
        throw new Error('未能生成任何提示词，请稍后重试或使用"单张生成"模式');
      }

      const promptsMap: Record<string, PromptData> = {};
      const editedPromptsMap: Record<string, string> = {};

      data.prompts.forEach((prompt: PromptData) => {
        console.log(`Processing prompt for ${prompt.type}:`, prompt);
        promptsMap[prompt.type] = prompt;
        editedPromptsMap[prompt.type] = prompt.chinesePrompt;
      });

      console.log('Final promptsMap:', promptsMap);
      console.log('Final editedPromptsMap:', editedPromptsMap);

      setPrompts(promptsMap);
      setEditedPrompts(editedPromptsMap);
      // Mark all tabs as tried
      setTabsTriedGenerating(
        TABS.reduce((acc, tab) => ({ ...acc, [tab.id]: true }), {})
      );

      // 自动切换到第一个有提示词的Tab
      if (data.prompts.length > 0) {
        setActiveTab(data.prompts[0].type);
      }
    } catch (error) {
      console.error('Error generating prompts:', error);
      alert(`生成提示词失败：${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsGeneratingPrompts(false);
    }
  };

  // Generate prompt for current tab only
  const generateSinglePrompt = async () => {
    if (uploadedImages.length === 0) {
      alert('请先上传图片');
      return;
    }

    // Check image sizes before sending
    const sizeCheck = checkImageSizes(uploadedImages);
    if (!sizeCheck.valid) {
      alert(sizeCheck.message);
      return;
    }

    setIsGeneratingSinglePrompt(true);

    try {
      const response = await fetch('/api/generate-single-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: uploadedImages.map((img) => img.dataUrl),
          posterType: activeTab,
          promptApi: selectedPromptApi,
        }),
      });

      // Handle 413 error (payload too large)
      if (response.status === 413) {
        throw new Error('图片太大，请删除当前图片并重新上传');
      }

      // Try to parse JSON, handle non-JSON responses
      let data;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        console.error('Non-JSON response:', text);
        throw new Error('服务器响应错误，请稍后重试');
      }

      if (!response.ok) {
        console.error('API Error:', data);
        throw new Error(data.error || '生成提示词失败');
      }

      const newPrompt: PromptData = data.prompt;
      setPrompts({ ...prompts, [activeTab]: newPrompt });
      setEditedPrompts({ ...editedPrompts, [activeTab]: newPrompt.chinesePrompt });
      setTabsTriedGenerating({ ...tabsTriedGenerating, [activeTab]: true });
    } catch (error) {
      console.error('Error generating single prompt:', error);
      alert(`生成提示词失败：${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsGeneratingSinglePrompt(false);
    }
  };

  // Clear all prompts
  const clearAllPrompts = () => {
    if (Object.keys(prompts).length === 0) return;
    if (!confirm('确定要清空所有提示词吗？')) return;

    setPrompts({});
    setEditedPrompts({});
    setTabsTriedGenerating({});
  };

  // Module 2: Prompt & Generate Functions
  const currentPrompt = prompts[activeTab];
  const currentEditedPrompt = editedPrompts[activeTab] || '';

  const handlePromptChange = (value: string) => {
    setEditedPrompts({ ...editedPrompts, [activeTab]: value });
  };

  // Poll KIE task status
  const pollKieTaskStatus = async (taskId: string, promptText: string) => {
    const maxAttempts = 120; // Max 10 minutes (5 seconds interval)
    const interval = 5000; // 5 seconds

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(`/api/check-task-status?taskId=${taskId}`);
        if (!response.ok) {
          throw new Error('查询任务状态失败');
        }

        const data = await response.json();
        const { state, resultJson, failMsg } = data;

        console.log(`KIE Task Status (attempt ${attempt + 1}):`, state);

        if (state === 'success') {
          const result = JSON.parse(resultJson);
          const imageUrl = result.resultUrls?.[0];

          if (!imageUrl) {
            throw new Error('未收到图片URL');
          }

          // Display the generated image
          setCurrentGeneratedImage(imageUrl);
          setIsGeneratingImage(false);

          // Add to history
          const newHistoryItem: GeneratedImage = {
            id: Date.now().toString(),
            url: imageUrl,
            prompt: promptText,
            date: new Date().toLocaleString('zh-CN'),
            posterType: TABS.find((t) => t.id === activeTab)?.name || activeTab,
          };
          const newHistory = [newHistoryItem, ...history].slice(0, MAX_HISTORY_ITEMS);
          setHistory(newHistory);
          return;
        }

        if (state === 'fail') {
          throw new Error(failMsg || '图片生成失败');
        }

        // Still processing, wait before next poll
        await new Promise(resolve => setTimeout(resolve, interval));
      } catch (error) {
        console.error('Error polling KIE task status:', error);
        throw error;
      }
    }

    throw new Error('任务超时，请稍后重试');
  };

  const pollApimartTaskStatus = async (taskId: string, promptText: string) => {
    const maxAttempts = 120; // Max 10 minutes (5 seconds interval)
    const interval = 5000; // 5 seconds

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(`/api/check-task-status?taskId=${taskId}&provider=apimart`);
        if (!response.ok) {
          throw new Error('查询任务状态失败');
        }

        const data = await response.json();
        const { state, imageUrl, failMsg } = data;

        console.log(`Apimart Task Status (attempt ${attempt + 1}):`, state);

        if (state === 'success') {
          if (!imageUrl) {
            throw new Error('未收到图片URL');
          }

          // Display the generated image
          setCurrentGeneratedImage(imageUrl);
          setIsGeneratingImage(false);

          // Add to history
          const newHistoryItem: GeneratedImage = {
            id: Date.now().toString(),
            url: imageUrl,
            prompt: promptText,
            date: new Date().toLocaleString('zh-CN'),
            posterType: TABS.find((t) => t.id === activeTab)?.name || activeTab,
          };
          const newHistory = [newHistoryItem, ...history].slice(0, MAX_HISTORY_ITEMS);
          setHistory(newHistory);
          return;
        }

        if (state === 'fail') {
          throw new Error(failMsg || '图片生成失败');
        }

        // Still processing, wait before next poll
        await new Promise(resolve => setTimeout(resolve, interval));
      } catch (error) {
        console.error('Error polling Apimart task status:', error);
        throw error;
      }
    }

    throw new Error('任务超时，请稍后重试');
  };

  const generateImage = async () => {
    if (uploadedImages.length === 0) {
      alert('请先上传图片');
      return;
    }

    if (!currentEditedPrompt) {
      alert('请先生成或输入提示词');
      return;
    }

    // Set generating state first to immediately show loading, then clear previous states
    setIsGeneratingImage(true);
    setAllGeneratedImages([]);
    setCurrentGeneratedImage(null);

    // Get the constraint for current tab
    const currentPrompt = prompts[activeTab];
    const constraint = currentPrompt?.constraint || '';

    try {
      // For KIE mode, upload images to KIE first to bypass Vercel's 4.5MB limit
      let imagesToSend: string[];

      if (selectedMode === 'kie') {
        console.log('=== KIE Mode: Uploading images to KIE storage ===');
        const kieUrls: string[] = [];

        for (let i = 0; i < uploadedImages.length; i++) {
          const img = uploadedImages[i];
          console.log(`Uploading image ${i + 1}/${uploadedImages.length} to KIE...`);

          try {
            const uploadResponse = await fetch('/api/upload-to-kie', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                base64Data: img.dataUrl,
                fileName: `upload-${Date.now()}-${i}.png`,
              }),
            });

            if (!uploadResponse.ok) {
              const errorData = await uploadResponse.json();
              throw new Error(errorData.error || '上传到KIE失败');
            }

            const uploadData = await uploadResponse.json();
            kieUrls.push(uploadData.url);
            console.log(`Image ${i + 1} uploaded to KIE: ${uploadData.url}`);
          } catch (error) {
            console.error(`Failed to upload image ${i + 1} to KIE:`, error);
            throw new Error(`图片上传失败: ${error instanceof Error ? error.message : '未知错误'}`);
          }
        }

        imagesToSend = kieUrls;
        console.log('All images uploaded to KIE, URLs:', kieUrls);
      } else {
        // For other modes, send base64 data directly
        imagesToSend = uploadedImages.map((img) => img.dataUrl);
      }

      // Create timeout controller (5 minutes)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes

      // Generate image
      const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: imagesToSend,
          prompt: currentEditedPrompt,
          constraint: constraint, // Send constraint to backend
          ratio: selectedRatio,
          quality: selectedQuality,
          mode: selectedMode,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '生成图片失败');
      }

      const data = await response.json();

      // Handle KIE or Apimart mode (async task)
      if ((selectedMode === 'kie' || selectedMode === 'apimart') && data.taskId) {
        // Poll for task completion
        const pollFn = selectedMode === 'apimart' ? pollApimartTaskStatus : pollKieTaskStatus;
        await pollFn(data.taskId, currentEditedPrompt);
        return;
      }

      // Handle direct image URL response (official and proxy modes)
      if (!data.imageUrl) {
        throw new Error('未收到图片URL');
      }

      // Display the generated image
      setCurrentGeneratedImage(data.imageUrl);
      setIsGeneratingImage(false);

      // Add to history (limited to MAX_HISTORY_ITEMS)
      const newHistoryItem: GeneratedImage = {
        id: Date.now().toString(),
        url: data.imageUrl,
        prompt: currentEditedPrompt,
        date: new Date().toLocaleString('zh-CN'),
        posterType: TABS.find((t) => t.id === activeTab)?.name || activeTab,
      };
      console.log('Saving to history:', newHistoryItem);
      console.log('Prompt value:', currentEditedPrompt);
      console.log('Prompt length:', currentEditedPrompt?.length);
      const newHistory = [newHistoryItem, ...history].slice(0, MAX_HISTORY_ITEMS);
      setHistory(newHistory);
    } catch (error) {
      console.error('Error generating image:', error);

      // Handle specific error types
      let errorMessage = '未知错误';
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = '请求超时（超过5分钟），请尝试减少图片数量或降低图片质量';
        } else if (error.message.includes('Failed to fetch')) {
          errorMessage = '网络连接失败，请检查网络连接或稍后重试';
        } else {
          errorMessage = error.message;
        }
      }

      alert(`生成图片失败：${errorMessage}`);
      setIsGeneratingImage(false);
    }
  };

  const generateAllImages = async () => {
    if (uploadedImages.length === 0) {
      alert('请先上传图片');
      return;
    }

    // Find all tabs with prompts
    const tabsWithPrompts = TABS.filter(tab => {
      const prompt = editedPrompts[tab.id];
      return prompt && prompt.trim().length > 0;
    });

    if (tabsWithPrompts.length === 0) {
      alert('没有可用的提示词，请先生成提示词');
      return;
    }

    // Set generating state first to immediately show loading, then clear previous states
    setIsGeneratingAllImages(true);
    setAllGeneratedImages([]);
    setCurrentGeneratedImage(null);

    const results: Array<{ tabId: string; tabName: string; url: string; prompt: string }> = [];

    try {
      // For KIE mode, upload images to KIE first (once, reused for all prompts)
      let imagesToSend: string[];

      if (selectedMode === 'kie') {
        console.log('=== KIE Mode: Uploading images to KIE storage ===');
        const kieUrls: string[] = [];

        for (let i = 0; i < uploadedImages.length; i++) {
          const img = uploadedImages[i];
          console.log(`Uploading image ${i + 1}/${uploadedImages.length} to KIE...`);

          try {
            const uploadResponse = await fetch('/api/upload-to-kie', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                base64Data: img.dataUrl,
                fileName: `upload-${Date.now()}-${i}.png`,
              }),
            });

            if (!uploadResponse.ok) {
              const errorData = await uploadResponse.json();
              throw new Error(errorData.error || '上传到KIE失败');
            }

            const uploadData = await uploadResponse.json();
            kieUrls.push(uploadData.url);
            console.log(`Image ${i + 1} uploaded to KIE: ${uploadData.url}`);
          } catch (error) {
            console.error(`Failed to upload image ${i + 1} to KIE:`, error);
            throw new Error(`图片上传失败: ${error instanceof Error ? error.message : '未知错误'}`);
          }
        }

        imagesToSend = kieUrls;
        console.log('All images uploaded to KIE, URLs:', kieUrls);
      } else {
        // For other modes, send base64 data directly
        imagesToSend = uploadedImages.map((img) => img.dataUrl);
      }

      // Generate images concurrently using Promise.allSettled
      // This allows multiple images to be generated at the same time
      // to avoid net::ERR_CONNECTION_CLOSED errors from sequential requests
      console.log(`Starting concurrent generation for ${tabsWithPrompts.length} images...`);

      // Create generation promises for all tabs
      const generationPromises = tabsWithPrompts.map(async (tab) => {
        const prompt = editedPrompts[tab.id];
        const promptData = prompts[tab.id];
        const constraint = promptData?.constraint || '';

        console.log(`Starting generation for ${tab.name}...`);

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes per image

          const response = await fetch('/api/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              images: imagesToSend,
              prompt: prompt,
              constraint: constraint,
              ratio: selectedRatio,
              quality: selectedQuality,
              mode: selectedMode,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorData = await response.json();
            console.error(`Failed to generate ${tab.name}:`, errorData.error);

            // If rate limited (429), wait and retry once
            if (response.status === 429) {
              console.log(`Rate limited for ${tab.name}, waiting 40 seconds before retry...`);
              await new Promise(resolve => setTimeout(resolve, 40000));

              const retryController = new AbortController();
              const retryTimeoutId = setTimeout(() => retryController.abort(), 300000);

              const retryResponse = await fetch('/api/generate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  images: imagesToSend,
                  prompt: prompt,
                  constraint: constraint,
                  ratio: selectedRatio,
                  quality: selectedQuality,
                  mode: selectedMode,
                }),
                signal: retryController.signal,
              });

              clearTimeout(retryTimeoutId);

              if (retryResponse.ok) {
                const retryData = await retryResponse.json();

                if ((selectedMode === 'kie' || selectedMode === 'apimart') && retryData.taskId) {
                  const pollFn = selectedMode === 'apimart' ? pollApimartTaskStatusForResult : pollKieTaskStatusForResult;
                  const result = await pollFn(retryData.taskId, prompt);
                  if (result) {
                    results.push({
                      tabId: tab.id,
                      tabName: tab.name,
                      url: result,
                      prompt: prompt,
                    });
                    setAllGeneratedImages([...results]);
                  }
                  return { tab, success: true, url: result };
                } else if (retryData.imageUrl) {
                  results.push({
                    tabId: tab.id,
                    tabName: tab.name,
                    url: retryData.imageUrl,
                    prompt: prompt,
                  });
                  setAllGeneratedImages([...results]);
                  return { tab, success: true, url: retryData.imageUrl };
                }
              }
            }

            return { tab, success: false };
          }

          const data = await response.json();

          // Handle KIE or Apimart mode (async task)
          if ((selectedMode === 'kie' || selectedMode === 'apimart') && data.taskId) {
            // Poll for task completion
            const pollFn = selectedMode === 'apimart' ? pollApimartTaskStatusForResult : pollKieTaskStatusForResult;
            const result = await pollFn(data.taskId, prompt);
            if (result) {
              results.push({
                tabId: tab.id,
                tabName: tab.name,
                url: result,
                prompt: prompt,
              });
              setAllGeneratedImages([...results]);
              return { tab, success: true, url: result };
            }
          } else if (data.imageUrl) {
            // Handle direct image URL response
            results.push({
              tabId: tab.id,
              tabName: tab.name,
              url: data.imageUrl,
              prompt: prompt,
            });
            setAllGeneratedImages([...results]);
            return { tab, success: true, url: data.imageUrl };
          }

          return { tab, success: false };

        } catch (error) {
          console.error(`Error generating image for ${tab.name}:`, error);
          return { tab, success: false };
        }
      });

      // Wait for all generation promises to settle (either fulfilled or rejected)
      await Promise.allSettled(generationPromises);

      setIsGeneratingAllImages(false);

      if (results.length === 0) {
        alert('所有图片生成失败，请重试');
      } else {
        // Add batch results to history
        const newHistoryItem: GeneratedImage = {
          id: Date.now().toString(),
          url: results[0].url, // Use first image as thumbnail
          prompt: `批量 ${results.length} 张图片`,
          date: new Date().toLocaleString('zh-CN'),
          posterType: '批量',
          isBatch: true,
          batchImages: results,
        };
        console.log('Saving batch to history:', newHistoryItem);
        const newHistory = [newHistoryItem, ...history].slice(0, MAX_HISTORY_ITEMS);
        setHistory(newHistory);

        if (results.length < tabsWithPrompts.length) {
          alert(`部分图片生成成功 (${results.length}/${tabsWithPrompts.length})`);
        }
      }

    } catch (error) {
      console.error('Error in generateAllImages:', error);
      alert(`生成全部图片失败：${error instanceof Error ? error.message : '未知错误'}`);
      setIsGeneratingAllImages(false);
    }
  };

  // Poll KIE task status and return the image URL
  const pollKieTaskStatusForResult = async (taskId: string, prompt: string): Promise<string | null> => {
    const maxAttempts = 120; // Max 10 minutes (5 seconds interval)
    const interval = 5000; // 5 seconds

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(`/api/check-task-status?taskId=${taskId}`);

        if (!response.ok) {
          throw new Error('查询任务状态失败');
        }

        const data = await response.json();
        const { state, resultJson, failMsg } = data;

        console.log(`KIE Task Status (attempt ${attempt + 1}):`, state);

        if (state === 'success') {
          const result = JSON.parse(resultJson);
          const imageUrl = result.resultUrls?.[0];

          if (!imageUrl) {
            console.error('KIE completed but no URL found');
            return null;
          }

          console.log('KIE task completed, image URL:', imageUrl);
          return imageUrl;
        }

        if (state === 'fail') {
          console.error('KIE task failed:', failMsg);
          return null;
        }

        // Still processing, wait before next poll
        await new Promise(resolve => setTimeout(resolve, interval));
      } catch (error) {
        console.error('Error polling KIE task status:', error);
        // Continue polling
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }

    console.error('KIE task timeout');
    return null;
  };

  // Poll Apimart task status and return the image URL
  const pollApimartTaskStatusForResult = async (taskId: string, prompt: string): Promise<string | null> => {
    const maxAttempts = 120; // Max 10 minutes (5 seconds interval)
    const interval = 5000; // 5 seconds

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(`/api/check-task-status?taskId=${taskId}&provider=apimart`);

        if (!response.ok) {
          throw new Error('查询任务状态失败');
        }

        const data = await response.json();
        const { state, imageUrl, failMsg } = data;

        console.log(`Apimart Task Status (attempt ${attempt + 1}):`, state);

        if (state === 'success') {
          if (!imageUrl) {
            console.error('Apimart completed but no URL found');
            return null;
          }

          console.log('Apimart task completed, image URL:', imageUrl);
          return imageUrl;
        }

        if (state === 'fail') {
          console.error('Apimart task failed:', failMsg);
          return null;
        }

        // Still processing, wait before next poll
        await new Promise(resolve => setTimeout(resolve, interval));
      } catch (error) {
        console.error('Error polling Apimart task status:', error);
        // Continue polling
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }

    console.error('Apimart task timeout');
    return null;
  };

  const downloadImage = async (url: string, filename: string) => {
    try {
      let blobUrl: string;

      // Check if it's a base64 data URL
      if (url.startsWith('data:')) {
        // For base64 data URLs, use them directly
        blobUrl = url;
      } else {
        // Use our proxy API to download the image (avoids CORS issues)
        const proxyUrl = `/api/download-image?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);

        if (!response.ok) {
          throw new Error('Failed to download image');
        }

        const blob = await response.blob();
        blobUrl = URL.createObjectURL(blob);
      }

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();

      document.body.removeChild(link);
      // Only revoke if we created a blob URL
      if (!url.startsWith('data:')) {
        URL.revokeObjectURL(blobUrl);
      }
    } catch (error) {
      console.error('Error downloading image:', error);
      alert('下载图片失败，请稍后重试');
    }
  };

  // Download all batch images as a ZIP file
  const downloadBatchAsZip = async (batchImages: Array<{ tabId: string; tabName: string; url: string; prompt: string }>, batchName: string) => {
    try {
      const zip = new JSZip();
      const folder = zip.folder(batchName);

      for (let i = 0; i < batchImages.length; i++) {
        const img = batchImages[i];
        let blob: Blob;

        // Check if it's a base64 data URL
        if (img.url.startsWith('data:')) {
          // Convert base64 to blob
          const base64Data = img.url.split(',')[1];
          const binaryString = atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let j = 0; j < binaryString.length; j++) {
            bytes[j] = binaryString.charCodeAt(j);
          }
          blob = new Blob([bytes], { type: 'image/jpeg' });
        } else {
          // Use our proxy API to download the image (avoids CORS issues)
          const proxyUrl = `/api/download-image?url=${encodeURIComponent(img.url)}`;
          const response = await fetch(proxyUrl);

          if (!response.ok) {
            console.error(`Failed to download image ${img.tabName}`);
            continue;
          }

          blob = await response.blob();
        }

        // Add to ZIP
        folder!.file(`${img.tabName}.jpg`, blob);
      }

      // Generate ZIP and download
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipUrl = URL.createObjectURL(zipBlob);

      const link = document.createElement('a');
      link.href = zipUrl;
      link.download = `${batchName}.zip`;
      document.body.appendChild(link);
      link.click();

      document.body.removeChild(link);
      URL.revokeObjectURL(zipUrl);
    } catch (error) {
      console.error('Error downloading batch as ZIP:', error);
      alert('打包下载失败，请稍后重试');
    }
  };

  const openImageModal = (imageUrl: string) => {
    setModalImage(imageUrl);
  };

  const closeImageModal = () => {
    setModalImage(null);
  };

  return (
    <>
      <div className="container">
        <header className="header">
          <h1>Ai详情图</h1>
        </header>

        {/* Module 1: Image Upload */}
        <section className="module">
          <h2 className="module-title">1. 上传产品图片</h2>
          {/* Upload area with images displayed inside, centered */}
          <div
            className={`upload-area ${uploadedImages.length >= 5 ? 'disabled' : ''}`}
            onClick={(e) => {
              // Only trigger file input if clicking on the add button or empty area
              if ((e.target as HTMLElement).closest('.add-button') || uploadedImages.length < 5) {
                if (uploadedImages.length < 5) {
                  fileInputRef.current?.click();
                }
              }
            }}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            style={{
              position: 'relative',
              minHeight: uploadedImages.length > 0 ? '200px' : 'auto',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => handleFileSelect(e.target.files)}
            />

            {uploadedImages.length === 0 ? (
              <>
                {/* Blue Upload Icon */}
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginBottom: '16px' }}>
                  <path d="M12 15V3M12 15L8 11M12 15L16 11" stroke="var(--primary-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M3 15V18C3 19.1046 3.89543 20 5 20H19C20.1046 20 21 19.1046 21 18V15" stroke="var(--primary-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <p style={{ fontSize: '16px', fontWeight: 500, marginBottom: '8px' }}>
                  点击或拖拽上传图片
                </p>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  建议上传：<span style={{ color: 'var(--primary-color)', fontWeight: 'bold' }}>正面，产品细节，商品信息，logo</span>（最多5张，系统会智能压缩）
                </p>
              </>
            ) : (
              <>
                <div className="image-preview-grid" style={{ padding: '12px' }}>
                  {uploadedImages.map((img) => (
                    <div key={img.id} className="image-preview-item" onClick={(e) => e.stopPropagation()}>
                      <img
                        src={img.dataUrl}
                        alt="上传的图片"
                        onClick={() => openImageModal(img.dataUrl)}
                        style={{ cursor: 'pointer' }}
                      />
                      <button
                        className="remove-btn"
                        onClick={() => removeImage(img.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {uploadedImages.length < 5 && (
                    <div
                      className="image-preview-item add-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        backgroundColor: '#f3f4f6',
                        border: '2px dashed #d1d5db'
                      }}
                    >
                      <span style={{ fontSize: '32px', color: '#9ca3af' }}>+</span>
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'center', marginTop: '12px' }}>
                  <button
                    onClick={removeAllImages}
                    style={{
                      padding: '8px 16px',
                      fontSize: '14px',
                      backgroundColor: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: 500
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#dc2626';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#ef4444';
                    }}
                  >
                    删除全部
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Module 2: Prompt & Generate */}
        <section className="module">
          <h2 className="module-title">2. 生成海报</h2>

          {/* Tabs with Generate All button */}
          <div className="tabs" style={{ display: 'flex', alignItems: 'center' }}>
            {TABS.map((tab) => (
              <div
                key={tab.id}
                className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
                style={{ flex: '0 0 auto', fontSize: '18px' }}
              >
                {tab.name}
                {prompts[tab.id] && (
                  <span style={{
                    marginLeft: '6px',
                    fontSize: '10px',
                    background: '#10b981',
                    color: 'white',
                    padding: '2px 6px',
                    borderRadius: '4px'
                  }}>✓</span>
                )}
              </div>
            ))}
            {/* 自动生成全部提示词按钮 - 放在Tab右侧 */}
            <button
              className="btn btn-primary"
              onClick={generateAllPrompts}
              disabled={isGeneratingPrompts || uploadedImages.length === 0}
              style={{
                marginLeft: 'auto',
                padding: '8px 16px',
                fontSize: '14px',
                whiteSpace: 'nowrap',
                backgroundColor: uploadedImages.length === 0 ? '#94a3b8' : undefined,
                cursor: uploadedImages.length === 0 ? 'not-allowed' : undefined
              }}
            >
              {isGeneratingPrompts ? (
                <span className="loading">
                  <span className="spinner" style={{ width: 12, height: 12 }} />
                  生成中...
                </span>
              ) : (
                '生成全部提示词'
              )}
            </button>
            {/* 清空按钮 - 放在生成按钮右侧 */}
            <button
              className="btn"
              onClick={clearAllPrompts}
              disabled={Object.keys(prompts).length === 0}
              style={{
                marginLeft: '8px',
                padding: '8px 16px',
                fontSize: '14px',
                fontWeight: 'normal',
                whiteSpace: 'nowrap',
                backgroundColor: 'transparent',
                borderColor: 'transparent',
                color: Object.keys(prompts).length === 0 ? '#94a3b8' : '#5079FF',
                cursor: Object.keys(prompts).length === 0 ? 'not-allowed' : 'pointer'
              }}
              onMouseEnter={(e) => {
                if (Object.keys(prompts).length > 0) {
                  e.currentTarget.style.color = '#4366e0';
                }
              }}
              onMouseLeave={(e) => {
                if (Object.keys(prompts).length > 0) {
                  e.currentTarget.style.color = '#5079FF';
                }
              }}
            >
              清空
            </button>
          </div>

          {/* Prompt Section */}
          <div className="prompt-section">
            {/* Left: Controls */}
            <div className="prompt-controls">
              <div className="control-group">
                {/* Label with button on the right */}
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <label className="control-label" style={{ marginBottom: 0 }}>提示词（可编辑）</label>
                  {/* Prompt API selector dropdown - arrow icon */}
                  <span
                    style={{
                      position: 'relative',
                      cursor: 'pointer',
                      fontSize: '12px',
                      marginLeft: '4px',
                      userSelect: 'none',
                      display: 'inline-flex',
                      alignItems: 'center'
                    }}
                    onClick={() => setIsPromptApiExpanded(!isPromptApiExpanded)}
                  >
                    {isPromptApiExpanded ? '▼' : '▶'}
                    {/* Dropdown menu */}
                    {isPromptApiExpanded && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: '0',
                          marginTop: '4px',
                          backgroundColor: 'white',
                          border: '1px solid #e5e7eb',
                          borderRadius: '4px',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                          zIndex: 100,
                          minWidth: '60px'
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div
                          style={{ padding: '4px 8px', cursor: 'pointer' }}
                          onClick={() => {
                            setSelectedPromptApi('A');
                            setIsPromptApiExpanded(false);
                          }}
                        >
                          A
                        </div>
                        <div
                          style={{ padding: '4px 8px', cursor: 'pointer' }}
                          onClick={() => {
                            setSelectedPromptApi('C');
                            setIsPromptApiExpanded(false);
                          }}
                        >
                          C
                        </div>
                      </div>
                    )}
                  </span>
                  {/* 自动生成单个提示词按钮 - 放在label右侧 */}
                  <button
                    className="btn btn-primary"
                    onClick={generateSinglePrompt}
                    disabled={isGeneratingSinglePrompt || uploadedImages.length === 0}
                    style={{
                      marginLeft: 'auto',
                      padding: '4px 12px',
                      fontSize: '13px',
                      whiteSpace: 'nowrap',
                      backgroundColor: isGeneratingSinglePrompt || uploadedImages.length === 0 ? '#94a3b8' : '#8B5CF6',
                      borderColor: isGeneratingSinglePrompt || uploadedImages.length === 0 ? '#94a3b8' : '#8B5CF6',
                      color: 'white',
                      cursor: uploadedImages.length === 0 ? 'not-allowed' : 'pointer'
                    }}
                    onMouseEnter={(e) => {
                      if (!isGeneratingSinglePrompt && uploadedImages.length > 0) {
                        e.currentTarget.style.backgroundColor = '#4366e0';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isGeneratingSinglePrompt && uploadedImages.length > 0) {
                        e.currentTarget.style.backgroundColor = '#5079FF';
                      }
                    }}
                  >
                    {isGeneratingSinglePrompt ? (
                      <span className="loading">
                        <span className="spinner" style={{ width: 10, height: 10 }} />
                      </span>
                    ) : (
                      '生成单个提示词'
                    )}
                  </button>
                </div>

                <textarea
                  className="prompt-textarea"
                  value={currentEditedPrompt}
                  onChange={(e) => handlePromptChange(e.target.value)}
                  placeholder={
                    !tabsTriedGenerating[activeTab]
                      ? "请点击生成全部提示词或者生成单个提示词"
                      : (!currentEditedPrompt || currentEditedPrompt.trim().length === 0
                        ? "提示词生成失败或为空，请重新生成"
                        : "点击'生成全部提示词'或'生成单个提示词'按钮生成提示词，或手动输入...")
                  }
                  style={{
                    ...(tabsTriedGenerating[activeTab] && (!currentEditedPrompt || currentEditedPrompt.trim().length === 0)
                      ? { borderColor: '#ef4444', backgroundColor: '#fef2f2' }
                      : undefined
                    )
                  }}
                />
                {currentPrompt?.constraint && (
                  <div className="constraint-box">
                    <div className="constraint-label">
                      [CRITICAL CONSTRAINT]
                    </div>
                    <div>{currentPrompt.constraint}</div>
                  </div>
                )}
              </div>

              {/* Ratio and Quality - Side by side */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="control-group" style={{ flex: 1 }}>
                  <label className="control-label">图片比例</label>
                  <select
                    className="control-select"
                    value={selectedRatio}
                    onChange={(e) => setSelectedRatio(e.target.value)}
                  >
                    {RATIOS.map((ratio) => (
                      <option key={ratio} value={ratio}>
                        {ratio}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="control-group" style={{ flex: 1 }}>
                  <label className="control-label">画质</label>
                  <select
                    className="control-select"
                    value={selectedQuality}
                    onChange={(e) => setSelectedQuality(e.target.value)}
                  >
                    {QUALITIES.map((quality) => (
                      <option key={quality} value={quality}>
                        {quality}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="control-group" style={{ flex: 1 }}>
                  <label className="control-label">线路</label>
                  <select
                    className="control-select"
                    value={selectedMode}
                    onChange={(e) => setSelectedMode(e.target.value)}
                  >
                    {MODES.map((mode) => (
                      <option key={mode.id} value={mode.id}>
                        {mode.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn-primary"
                  onClick={generateImage}
                  disabled={isGeneratingImage || isGeneratingAllImages || !currentEditedPrompt}
                  style={{
                    flex: 1,
                    backgroundColor: isGeneratingImage || isGeneratingAllImages || !currentEditedPrompt ? '#94a3b8' : '#8B5CF6',
                    borderColor: isGeneratingImage || isGeneratingAllImages || !currentEditedPrompt ? '#94a3b8' : '#8B5CF6',
                    color: 'white',
                  }}
                  onMouseEnter={(e) => {
                    if (!isGeneratingImage && !isGeneratingAllImages && !currentEditedPrompt) {
                      e.currentTarget.style.backgroundColor = '#7C3AED';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isGeneratingImage && !isGeneratingAllImages && !currentEditedPrompt) {
                      e.currentTarget.style.backgroundColor = '#8B5CF6';
                    }
                  }}
                >
                  {isGeneratingImage ? (
                    <span className="loading">
                      <span className="spinner" />
                      生成中...
                    </span>
                  ) : (
                    '生成单个图片'
                  )}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={generateAllImages}
                  disabled={isGeneratingAllImages || isGeneratingImage || !hasAnyPrompts}
                  style={{
                    flex: 1,
                    backgroundColor: isGeneratingAllImages || !hasAnyPrompts ? '#94a3b8' : '#3B82F6',
                    borderColor: isGeneratingAllImages || !hasAnyPrompts ? '#94a3b8' : '#3B82F6',
                    color: 'white',
                  }}
                  onMouseEnter={(e) => {
                    if (!isGeneratingAllImages && hasAnyPrompts) {
                      e.currentTarget.style.backgroundColor = '#2563EB';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isGeneratingAllImages && hasAnyPrompts) {
                      e.currentTarget.style.backgroundColor = '#3B82F6';
                    }
                  }}
                >
                  {isGeneratingAllImages ? (
                    <span className="loading">
                      <span className="spinner" />
                      生成中...
                    </span>
                  ) : (
                    '生成全部图片'
                  )}
                </button>
              </div>
            </div>

            {/* Right: Image Display */}
            <div className="image-display">
              {allGeneratedImages.length > 0 ? (
                <div>
                  {/* Show progress info if still generating */}
                  {isGeneratingAllImages && (
                    <div style={{
                      padding: '12px',
                      marginBottom: '12px',
                      backgroundColor: '#f0f9ff',
                      border: '1px solid #bae6fd',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <span className="spinner" style={{ width: 20, height: 20 }} />
                      <span style={{ fontSize: '14px', color: '#0369a1' }}>
                        正在批量生成图片，已完成 {allGeneratedImages.length} 张...
                      </span>
                    </div>
                  )}
                  <div style={{ width: '100%', maxHeight: '500px', overflowY: 'auto', padding: '8px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
                    {allGeneratedImages.map((item, index) => (
                      <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{
                          position: 'relative',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          border: '1px solid #e5e7eb',
                          backgroundColor: '#f9fafb'
                        }}>
                          <img
                            src={item.url}
                            alt={item.tabName}
                            style={{ width: '100%', height: '200px', objectFit: 'cover', cursor: 'pointer' }}
                            onClick={() => openImageModal(item.url)}
                          />
                          <div style={{
                            position: 'absolute',
                            top: '0',
                            left: '0',
                            right: '0',
                            padding: '6px 8px',
                            backgroundColor: 'rgba(0, 0, 0, 0.6)',
                            color: 'white',
                            fontSize: '12px',
                            fontWeight: '500',
                            textAlign: 'center'
                          }}>
                            {item.tabName}
                          </div>
                        </div>
                        <button
                          className="btn btn-secondary"
                          onClick={() => downloadImage(item.url, `${item.tabName}-${Date.now()}.jpg`)}
                          style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            backgroundColor: '#f3f4f6',
                            borderColor: '#d1d5db',
                            color: '#374151',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#e5e7eb';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#f3f4f6';
                          }}
                        >
                          下载
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <button
                    className="btn btn-secondary"
                    onClick={() => setAllGeneratedImages([])}
                    style={{
                      marginTop: '16px',
                      width: '100%',
                      padding: '8px',
                      fontSize: '14px'
                    }}
                  >
                    清空批量显示
                  </button>
                </div>
              ) : isGeneratingAllImages ? (
                <div className="loading">
                  <span className="spinner" style={{ width: 32, height: 32 }} />
                  <span>正在批量生成图片，请稍候...</span>
                  <p style={{ marginTop: '8px', fontSize: '12px', color: '#6b7280' }}>
                    正在处理第一张图片...
                  </p>
                </div>
              ) : isGeneratingImage ? (
                <div className="loading">
                  <span className="spinner" style={{ width: 32, height: 32 }} />
                  <span>正在生成图片，请稍候...</span>
                  <p style={{ marginTop: '8px', fontSize: '12px', color: '#6b7280' }}>
                    （包含视觉分析，可能需要30-60秒）
                  </p>
                </div>
              ) : currentGeneratedImage ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <img
                    src={currentGeneratedImage}
                    alt="生成的海报"
                    style={{ maxHeight: '450px', cursor: 'pointer' }}
                    onClick={() => openImageModal(currentGeneratedImage!)}
                  />
                  <button
                    className="btn btn-secondary"
                    onClick={() => downloadImage(currentGeneratedImage!, `generated-${Date.now()}.jpg`)}
                    style={{
                      padding: '8px 24px',
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      backgroundColor: '#f3f4f6',
                      borderColor: '#d1d5db',
                      color: '#374151',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#e5e7eb';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#f3f4f6';
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    下载图片
                  </button>
                </div>
              ) : (
                <div className="placeholder">
                  <p>生成的海报将显示在这里</p>
                  <p style={{ marginTop: '8px', fontSize: '12px' }}>
                    选择提示词和参数后点击"生成图片"或"生成全部图片"
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Module 3: History */}
        <section className="module">
          <h2 className="module-title">3. 生成记录 <span style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 'normal' }}>(请尽快保存图片，缓存历史不稳定)</span></h2>
          {history.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px' }}>
              暂无生成记录
            </p>
          ) : (
            <div className="history-grid">
              {history.map((item, index) => (
                <div key={item.id} className="history-item">
                  {item.isBatch && item.batchImages ? (
                    // Batch item display - match single item structure
                    <>
                      {/* Show batch images thumbnails as main image area */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '4px',
                        padding: '4px',
                        backgroundColor: '#f9fafb',
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        flexShrink: 0
                      }}>
                        {item.batchImages.map((img, i) => (
                          <img
                            key={i}
                            src={img.url}
                            alt={img.tabName}
                            style={{
                              width: '100%',
                              aspectRatio: '1',
                              objectFit: 'cover',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              border: '1px solid #e5e7eb'
                            }}
                            onClick={() => openImageModal(img.url)}
                            title={img.tabName}
                          />
                        ))}
                      </div>
                      <div className="history-item-content">
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                          <div className="history-item-date">
                            {item.posterType} ({item.batchImages!.length} 张) · {item.date}
                          </div>
                          <button
                            className="btn btn-secondary btn-download"
                            onClick={() => downloadBatchAsZip(item.batchImages!, item.posterType)}
                            style={{ padding: '4px 10px', fontSize: '11px', backgroundColor: '#f3f4f6', borderColor: '#d1d5db', color: '#374151' }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#e5e7eb';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = '#f3f4f6';
                            }}
                          >
                            打包下载(ZIP)
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    // Single item display
                    <>
                      <img
                        src={item.url}
                        alt="生成的海报"
                        className="history-item-image"
                        style={{ cursor: 'pointer' }}
                        onClick={() => openImageModal(item.url)}
                      />
                      <div className="history-item-content">
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                          <div className="history-item-date">
                            {item.posterType} · {item.date}
                          </div>
                          <button
                            className="btn btn-secondary btn-download"
                            onClick={() =>
                              downloadImage(item.url, `poster-${item.id}.jpg`)
                            }
                            style={{ padding: '4px 10px', fontSize: '11px', backgroundColor: '#f3f4f6', borderColor: '#d1d5db', color: '#374151' }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#e5e7eb';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = '#f3f4f6';
                            }}
                          >
                            下载
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Image Modal */}
      {modalImage && (
        <div
          className="image-modal"
          onClick={closeImageModal}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            cursor: 'pointer',
          }}
        >
          <img
            src={modalImage}
            alt="放大查看"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              cursor: 'default',
            }}
          />
        </div>
      )}
    </>
  );
}
