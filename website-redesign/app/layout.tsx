import type { Metadata } from 'next';
import 'lenis/dist/lenis.css';
import './globals.css';
import { SmoothScroll } from '../components/SmoothScroll';
import { SiteCursor } from '../components/SiteCursor';
export const metadata: Metadata = { title: 'Rovno — UI-кит', description: 'Рабочая страница компонентов Rovno по макету Figma', robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ru"><body>{children}<SmoothScroll/><SiteCursor/></body></html>; }
