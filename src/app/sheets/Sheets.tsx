import { ui, useStore } from '../store';
import About from './About';
import Journal from './Journal';
import MapSheet from './MapSheet';
import SkySheet from './SkySheet';
import SoundSheet from './SoundSheet';
import XiangSheet from './XiangSheet';

/** 开着的那一页册子（村图、天时、观象册、声音、起居注、关于） */
export default function Sheets() {
  const sheet = useStore(ui, (s) => s.sheet);
  if (sheet === 'map') return <MapSheet />;
  if (sheet === 'sky') return <SkySheet />;
  if (sheet === 'xiang') return <XiangSheet />;
  if (sheet === 'sound') return <SoundSheet />;
  if (sheet === 'journal') return <Journal />;
  if (sheet === 'about') return <About />;
  return null;
}
