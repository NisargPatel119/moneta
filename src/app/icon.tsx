import { ImageResponse } from 'next/og';
import { BrandMark } from '@/components/BrandMark';

// Browser tab icon
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(<BrandMark size={32} ink="#1d1b16" paper="#f6f2ea" />, size);
}
