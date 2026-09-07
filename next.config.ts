import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export', // สั่งให้ build เป็น static files (โฟลเดอร์ out)
  basePath: '/payroll-management-system', // สำคัญมาก: ใส่ชื่อ repo เพื่อให้ path url และ css โหลดถูกโฟลเดอร์
  images: {
    unoptimized: true, // ปิด image optimization ของ Next.js server
  },
};

export default nextConfig;