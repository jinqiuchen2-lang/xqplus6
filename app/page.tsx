'use client';

import { useState, useRef, useEffect } from 'react';

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

// Storage keys
const HISTORY_STORAGE_KEY = 'poster-generator-history';

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
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [currentGeneratedImage, setCurrentGeneratedImage] = useState<string | null>(null);

  // Module 3: History State - Load from localStorage on mount
  const [history, setHistory] = useState<GeneratedImage[]>([]);

  // Load history from localStorage on client side only
  useEffect(() => {
    const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setHistory(parsed);
      } catch {
        // Invalid data, ignore
      }
    }
  }, []);

  // Save history to localStorage whenever it changes
  useEffect(() => {
    if (history.length > 0) {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    }
  }, [history]);

  // Module 1: Image Upload Functions
  const handleFileSelect = async (files: FileList | null) => {
    if (!files) return;

    const newImages: UploadedImage[] = [];
    const remainingSlots = 8 - uploadedImages.length;

    for (let i = 0; i < Math.min(files.length, remainingSlots); i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;

      // Check if compression is needed (> 4.3MB)
      const maxSize = 4.3 * 1024 * 1024;
      let dataUrl: string;

      if (file.size > maxSize) {
        // Compress image via API
        const formData = new FormData();
        formData.append('file', file);

        try {
          const response = await fetch('/api/compress-image', {
            method: 'POST',
            body: formData,
          });

          if (response.ok) {
            const data = await response.json();
            dataUrl = data.dataUrl;
          } else {
            // Fallback to client-side compression
            dataUrl = await compressImageClient(file, maxSize);
          }
        } catch {
          dataUrl = await compressImageClient(file, maxSize);
        }
      } else {
        dataUrl = await fileToDataUrl(file);
      }

      newImages.push({
        id: `${Date.now()}-${i}`,
        dataUrl,
        file,
      });
    }

    setUploadedImages([...uploadedImages, ...newImages]);
  };

  const compressImageClient = (file: File, maxSize: number): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      img.onload = () => {
        let width = img.width;
        let height = img.height;
        let quality = 0.9;

        const doCompress = () => {
          canvas.width = width;
          canvas.height = height;
          ctx?.drawImage(img, 0, 0, width, height);

          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          const size = dataUrl.length * 0.75;

          if (size > maxSize && quality > 0.1) {
            quality -= 0.1;
            if (quality < 0.5) {
              width = Math.round(width * 0.9);
              height = Math.round(height * 0.9);
            }
            doCompress();
          } else {
            resolve(dataUrl);
          }
        };

        doCompress();
      };

      img.src = URL.createObjectURL(file);
    });
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

    setIsGeneratingPrompts(true);

    try {
      const response = await fetch('/api/generate-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: uploadedImages.map((img) => img.dataUrl),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('API Error:', data);
        throw new Error(data.error || '生成提示词失败');
      }

      console.log('API Response:', data);

      if (!data.prompts || !Array.isArray(data.prompts)) {
        console.error('Invalid response format:', data);
        throw new Error('返回数据格式错误');
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

    setIsGeneratingSinglePrompt(true);

    try {
      const response = await fetch('/api/generate-single-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: uploadedImages.map((img) => img.dataUrl),
          posterType: activeTab,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('API Error:', data);
        throw new Error(data.error || '生成提示词失败');
      }

      const newPrompt: PromptData = data.prompt;
      setPrompts({ ...prompts, [activeTab]: newPrompt });
      setEditedPrompts({ ...editedPrompts, [activeTab]: newPrompt.chinesePrompt });
    } catch (error) {
      console.error('Error generating single prompt:', error);
      alert(`生成提示词失败：${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsGeneratingSinglePrompt(false);
    }
  };

  // Module 2: Prompt & Generate Functions
  const currentPrompt = prompts[activeTab];
  const currentEditedPrompt = editedPrompts[activeTab] || '';

  const handlePromptChange = (value: string) => {
    setEditedPrompts({ ...editedPrompts, [activeTab]: value });
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

    setIsGeneratingImage(true);
    setCurrentGeneratedImage(null);

    try {
      // Use the first uploaded image as base
      const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: uploadedImages[0].dataUrl,
          prompt: currentEditedPrompt,
          ratio: selectedRatio,
          quality: selectedQuality,
        }),
      });

      if (!response.ok) throw new Error('生成图片失败');

      const data = await response.json();
      setCurrentGeneratedImage(data.imageUrl);

      // Add to history
      const newHistoryItem: GeneratedImage = {
        id: Date.now().toString(),
        url: data.imageUrl,
        prompt: currentEditedPrompt,
        date: new Date().toLocaleString('zh-CN'),
        posterType: TABS.find((t) => t.id === activeTab)?.name || activeTab,
      };
      setHistory([newHistoryItem, ...history]);
    } catch (error) {
      console.error('Error generating image:', error);
      alert('生成图片失败，请重试');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const downloadImage = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
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
          <h1>AI棉品详情图</h1>
        </header>

        {/* Module 1: Image Upload */}
        <section className="module">
          <h2 className="module-title">1. 上传产品图片</h2>
          {/* Upload area with images displayed inside, centered */}
          <div
            className={`upload-area ${uploadedImages.length >= 8 ? 'disabled' : ''}`}
            onClick={(e) => {
              // Only trigger file input if clicking on the add button or empty area
              if ((e.target as HTMLElement).closest('.add-button') || uploadedImages.length < 8) {
                if (uploadedImages.length < 8) {
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
                <p style={{ fontSize: '16px', fontWeight: 500, marginBottom: '8px' }}>
                  点击或拖拽上传图片
                </p>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  建议上传：<span style={{ color: 'var(--primary-color)', fontWeight: 'bold' }}>正面，产品细节，商品详情，logo</span>（最多8张）
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
                  {uploadedImages.length < 8 && (
                    <div
                      className="image-preview-item add-button"
                      onClick={() => fileInputRef.current?.click()}
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
                style={{ flex: '0 0 auto', fontSize: '15px' }}
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
                '自动生成全部提示词'
              )}
            </button>
          </div>

          {/* Prompt Section */}
          <div className="prompt-section">
            {/* Left: Controls */}
            <div className="prompt-controls">
              <div className="control-group">
                {/* Label with button on the right */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label className="control-label" style={{ marginBottom: 0 }}>提示词（可编辑）</label>
                  {/* 单独生成提示词按钮 - 放在label右侧 */}
                  <button
                    className="btn btn-secondary"
                    onClick={generateSinglePrompt}
                    disabled={isGeneratingSinglePrompt || uploadedImages.length === 0}
                    style={{
                      padding: '4px 12px',
                      fontSize: '13px',
                      whiteSpace: 'nowrap',
                      backgroundColor: isGeneratingSinglePrompt || uploadedImages.length === 0 ? '#94a3b8' : '#5079FF',
                      borderColor: isGeneratingSinglePrompt || uploadedImages.length === 0 ? '#94a3b8' : '#5079FF',
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
                      '单独生成提示词'
                    )}
                  </button>
                </div>
                <textarea
                  className="prompt-textarea"
                  value={currentEditedPrompt}
                  onChange={(e) => handlePromptChange(e.target.value)}
                  placeholder="点击'自动生成全部提示词'或'单独生成提示词'按钮生成提示词，或手动输入..."
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
              </div>

              <button
                className="btn btn-primary"
                onClick={generateImage}
                disabled={isGeneratingImage || !currentEditedPrompt}
              >
                {isGeneratingImage ? (
                  <span className="loading">
                    <span className="spinner" />
                    生成中...
                  </span>
                ) : (
                  '生成图片'
                )}
              </button>
            </div>

            {/* Right: Image Display */}
            <div className="image-display">
              {isGeneratingImage ? (
                <div className="loading">
                  <span className="spinner" style={{ width: 32, height: 32 }} />
                  <span>正在生成海报...</span>
                </div>
              ) : currentGeneratedImage ? (
                <img
                  src={currentGeneratedImage}
                  alt="生成的海报"
                  style={{ maxHeight: '450px', cursor: 'pointer' }}
                  onClick={() => openImageModal(currentGeneratedImage!)}
                />
              ) : (
                <div className="placeholder">
                  <p>生成的海报将显示在这里</p>
                  <p style={{ marginTop: '8px', fontSize: '12px' }}>
                    选择提示词和参数后点击"生成图片"
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Module 3: History */}
        <section className="module">
          <h2 className="module-title">3. 生成记录</h2>
          {history.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px' }}>
              暂无生成记录
            </p>
          ) : (
            <div className="history-grid">
              {history.map((item) => (
                <div key={item.id} className="history-item">
                  <img
                    src={item.url}
                    alt="生成的海报"
                    className="history-item-image"
                    style={{ cursor: 'pointer' }}
                    onClick={() => openImageModal(item.url)}
                  />
                  <div className="history-item-content">
                    <div className="history-item-date">
                      {item.posterType} · {item.date}
                    </div>
                    <div className="history-item-prompt">{item.prompt}</div>
                    <div className="history-item-actions">
                      <button
                        className="btn btn-secondary btn-download"
                        onClick={() =>
                          downloadImage(item.url, `poster-${item.id}.jpg`)
                        }
                      >
                        下载
                      </button>
                    </div>
                  </div>
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
