# AI海报生成器 - Poster Generator

基于Next.js构建的AI海报生成工具，使用Gemini模型生成提示词，nano-banana模型生成海报图片。

## 功能特性

### 1. 图片上传模块
- 支持最多上传8张图片
- 自动压缩超过4.3MB的图片
- 拖拽上传支持
- 图片预览和删除功能

### 2. 提示词生成模块
- 7种海报类型Tab切换：
  - 主KV视觉
  - 使用场景
  - 工艺概念可视化
  - 细节特写
  - 质感特写
  - 功能细节
  - 配色灵感
- 使用Gemini模型自动生成中文提示词
- 支持手动编辑提示词
- 多种图片比例选择（1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9）
- 画质选择（1K, 2K, 4K）

### 3. 生成记录模块
- 展示所有生成的图片
- 显示生成日期和提示词
- 一键下载功能

## 环境变量配置

创建 `.env.local` 文件：

```env
NEXT_PUBLIC_API_URL=https://ai.comfly.chat
NEXT_PUBLIC_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-3-flash-preview
NANO_BANANA_MODEL=nano-banana-2
```

## 安装和运行

```bash
# 安装依赖
npm install

# 运行开发服务器
npm run dev

# 构建生产版本
npm run build

# 启动生产服务器
npm start
```

访问 [http://localhost:3000](http://localhost:3000) 查看应用。

## Vercel 部署

1. 将代码推送到 GitHub
2. 在 Vercel 中导入项目
3. 配置环境变量：
   - `NEXT_PUBLIC_API_URL`
   - `NEXT_PUBLIC_API_KEY`
   - `GEMINI_MODEL`
   - `NANO_BANANA_MODEL`
4. 部署

## 项目结构

```
├── app/
│   ├── api/
│   │   ├── compress-image/route.ts    # 图片压缩API
│   │   ├── generate-prompts/route.ts  # Gemini提示词生成API
│   │   └── generate-image/route.ts    # nano-banana图片生成API
│   ├── layout.tsx                      # 根布局
│   ├── page.tsx                        # 主页面
│   └── globals.css                     # 全局样式
├── public/                             # 静态资源
├── .env.local                          # 环境变量
├── next.config.js                      # Next.js配置
├── package.json                        # 项目配置
└── vercel.json                         # Vercel配置
```

## API参考

### Gemini API (提示词生成)
- 模型: `gemini-3-flash-preview`
- 端点: `/v1/chat/completions`

### nano-banana API (图片生成)
- 模型: `nano-banana-2`
- 端点: `/v1/images/edits`

## 注意事项

- API密钥请妥善保管，不要提交到代码仓库
- 图片压缩服务使用了 `sharp` 库
- 生成图片需要较长时间，请耐心等待
