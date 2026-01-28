import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '海报生成器 - Poster Generator',
  description: '使用AI生成产品海报',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
