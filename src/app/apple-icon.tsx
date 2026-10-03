import { ImageResponse } from 'next/og';
import { BrandMark } from '@/components/BrandMark';

// iPhone home-screen icon: the rosette on an ink square (iOS rounds the corners)
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(<BrandMark size={180} ink="#1d1b16" paper="#f6f2ea" square />, size);
}
