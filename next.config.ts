import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  // 静态导出时把页面输出到 out/ 目录
  distDir: ".next",
};

export default nextConfig;
