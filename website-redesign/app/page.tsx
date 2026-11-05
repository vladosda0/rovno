import type { Metadata } from 'next';
import { Landing } from '../components/Landing';
import './landing.css';
export const metadata: Metadata = {
  title: 'Rovno — управляйте стройкой, а не хаосом',
  description: 'Задачи, смета, документы, подрядчики и ход работ в одном рабочем пространстве Rovno.',
};
export default function Page() { return <Landing />; }
