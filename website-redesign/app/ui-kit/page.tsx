'use client';
import { useState, type CSSProperties } from 'react';
import { Button, type ButtonVariant, type PreviewState } from '../../components/Button';
const colors = [ ['White', '#EDEBD7'], ['Black', '#0E0D06'], ['Orange Main', '#EE7A53'], ['Olive Main', '#8E9174'], ['Blue Main', '#1C55AB'], ['Blue 6%', '#1C55AB0F'], ['White 6%', '#EDEBD70F'], ['Olive 6%', '#8E91740F'], ['Blue 32%', '#1C55AB52'] ];
const variants: ButtonVariant[] = ['primary','secondary','tertiary','transparent','white'];
const states: PreviewState[] = ['default','hover','focus','disabled'];

type TypeStyle = [name: string, family: string, size: number, leading: number, weight: number, tracking: number];
const typeScales: Record<string, TypeStyle[]> = {
 Desktop: [
  ['H1','Rostov',48,48,400,0], ['H2','Rostov',40,40,400,0], ['H2 Involve','Involve',40,40,400,0],
  ['H3','Rostov',32,32,400,0], ['H4','Rostov',24,24,400,0],
  ['B18','Involve',18,24,400,0], ['B18 Bold','Involve',18,24,700,0],
  ['B16','Involve',16,24,400,0], ['B16 Bold','Involve',16,24,700,0],
  ['C14','Involve',14,18,400,0], ['C12','Involve',12,16,400,0],
 ],
 Mobile: [
  ['H1','Rostov',32,32,400,-.02], ['H1 Involve','Involve',32,32,400,-.02],
  ['H2','Rostov',28,32,400,-.015], ['H3','Rostov',24,24,400,-.01], ['H4','Rostov',20,24,400,0],
  ['B16','Involve',16,24,400,0], ['B16 Bold','Involve',16,24,700,0],
  ['C14','Involve',14,18,400,0], ['C14 Bold','Involve',14,18,700,0], ['C12','Involve',12,16,400,0],
 ],
};

export default function Kit() {
 const [size,setSize] = useState<'desktop'|'mobile'>('desktop');
 const [message,setMessage] = useState('Нажми на кнопку, чтобы проверить отклик.');
 return <main>
  <header className="kit-header"><a href="#top" className="brand">Rovno</a><nav aria-label="Разделы кита"><a href="#colors">Цвета</a><a href="#buttons">Кнопки</a><a href="#fonts">Шрифты</a></nav><span>Рабочий UI-кит</span></header>
  <div id="top" className="intro"><h1>Основа Rovno</h1><p>Цвета, кнопки и шрифты из Figma.<br/>Первая версия для обсуждения.</p></div>
  <section id="colors"><div className="section-heading"><h2>Цвета</h2><p>Базовая палитра и прозрачные оттенки</p></div><div className="palette">{colors.map(([name,value])=><div className="color" key={name}><div className="swatch" style={{backgroundColor:value}}/><div className="color-caption"><strong>{name}</strong><span>{value}</span></div></div>)}</div></section>
  <section id="buttons"><div className="section-heading"><div><h2>Кнопки</h2><p>Пять вариантов · четыре состояния</p></div><div className="size-picker" role="group" aria-label="Размер кнопок"><button aria-pressed={size==='desktop'} onClick={()=>setSize('desktop')}>Десктоп · 48 px</button><button aria-pressed={size==='mobile'} onClick={()=>setSize('mobile')}>Мобильный · 40 px</button></div></div>
  <p className="hint">Hover и Focus показаны постоянно для сравнения. В колонке Default можно проверить наведение и фокус клавишей Tab.</p>
  <div className="button-matrix">{variants.map(variant=><div className={`variant-row ${variant==='tertiary'||variant==='white'?'on-blue':''}`} key={variant}><h3>{variant==='tertiary'?'Tertiary':variant[0].toUpperCase()+variant.slice(1)}</h3><div className="state-grid">{states.map(state=><div className="state" key={state}><span>{state[0].toUpperCase()+state.slice(1)}</span><Button variant={variant} size={size} previewState={state} onClick={()=>setMessage(`Кнопка ${variant} работает.`)}>Начать проект</Button></div>)}</div></div>)}</div><p className="feedback" role="status">{message}</p></section>
  <section id="fonts"><div className="section-heading"><h2>Типографика</h2><p>Все стили Desktop и Mobile из Figma</p></div>
  <div className="type-columns">{Object.entries(typeScales).map(([platform, styles])=><div key={platform}><h3 className="type-platform">{platform}</h3>{styles.map(([name, family, size, leading, weight, tracking])=><article className="type-sample" key={name}><p className="type-example" style={{fontFamily: family === 'Rostov' ? 'var(--font-display)' : 'var(--font-body)', fontSize:size, lineHeight:`${leading}px`, fontWeight:weight, letterSpacing:`${tracking}em`} as CSSProperties}>{name} — Съешь ещё этих мягких французских булок</p><p className="type-description">{family} {weight === 700 ? 'Bold' : 'Regular'} · {size} / {leading} px{tracking ? ` · трекинг ${tracking * 100}%` : ''}</p></article>)}</div>)}</div>
  <div className="section-heading font-files-heading"><h3>Все загруженные начертания Involve</h3><p>Образцы файлов, отдельно от стилей Figma</p></div><div className="font-files">{[400,500,600,700].flatMap(weight=>[false,true].map(italic=><article className="type-sample" key={`${weight}-${italic}`}><p className="type-description">Involve · {weight}{italic ? ' · Oblique' : ''}</p><p className="file-example" style={{fontWeight:weight,fontStyle:italic?'italic':'normal'}}>Всё для управления стройкой в одном месте.</p></article>))}</div>
  </section>
  <footer><span>Rovno · основа интерфейса</span><a href="https://www.figma.com/design/PjFvatzCtfTI3vKtP5Jlb4/Rovno?node-id=333-9037" target="_blank" rel="noreferrer">Компоненты в Figma ↗</a></footer>
 </main>;
}
