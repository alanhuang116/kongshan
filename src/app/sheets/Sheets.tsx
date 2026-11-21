import { Suspense } from 'react';
import { ui, useStore } from '../store';
import About from './About';
import BagSheet from './BagSheet';
import Journal from './Journal';
import MapSheet from './MapSheet';
import SkySheet from './SkySheet';
import SoundSheet from './SoundSheet';
import XiangSheet from './XiangSheet';
import { EXTRA } from './extra';

/** 开着的那一页册子（村图、天时、行囊、村人簿、星图、观象册、声音、起居注、关于） */
export default function Sheets() {
  const sheet = useStore(ui, (s) => s.sheet);
  if (sheet === 'map') return <MapSheet />;
  if (sheet === 'sky') return <SkySheet />;
  if (sheet === 'bag') return <BagSheet />;
  if (sheet === 'xiang') return <XiangSheet />;
  if (sheet === 'sound') return <SoundSheet />;
  if (sheet === 'journal') return <Journal />;
  if (sheet === 'about') return <About />;
  if (sheet === 'folk' || sheet === 'stars') {
    const Page = EXTRA[sheet];
    return Page ? <Suspense fallback={null}><Page /></Suspense> : null;
  }
  return null;
}
