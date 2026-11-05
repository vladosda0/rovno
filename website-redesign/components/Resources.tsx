'use client';
import { useEffect, useRef } from 'react';
const resources = [
 {id:'tasks',label:'Задачи',ratio:341/338,crop:[513.78,345.56,-204.11,-123.08]},
 {id:'documents',label:'Документы',ratio:321/360,crop:[545.79,324.44,-7.83,-10.13]},
 {id:'estimate',label:'Смета',ratio:308/350,crop:[568.83,333.71,-459.06,-116.9]},
 {id:'photos',label:'Фото',ratio:316/356,crop:[554.43,328.09,-121.1,-214.73]},
 {id:'team',label:'Команда',ratio:349/329,crop:[502.01,355.02,-4.92,-239.42]},
 {id:'contractors',label:'Подрядчики',ratio:337/351,crop:[519.88,332.76,-313.78,-117.11]},
];
function ResourceCard({resource}: {resource: typeof resources[number]}) {
 const {id,label,ratio,crop:[width,height,left,top]}=resource;
 return <div className={`resource-card resource-card--${id}`}>
  <div className="resource-image"><div className="resource-art"><div className="resource-art-crop" style={{width:82*ratio}}><img src={`/images/resources/${id}.png`} alt="" style={{width:`${width}%`,height:`${height}%`,left:`${left}%`,top:`${top}%`}} /></div></div></div>
  <div className="resource-label"><picture><source media="(max-width:1279px)" srcSet={`/images/resources/${id}-small.svg`} /><img src={`/images/resources/${id}.svg`} alt="" /></picture><span>{label}</span></div>
 </div>;
}
export function Resources() {
 const stripRef = useRef<HTMLDivElement>(null);
 const rootRef = useRef<HTMLElement>(null);
 useEffect(() => {
  const root = rootRef.current;
  const strip = stripRef.current;
  if (!root || !strip) return;
  const stage = root.querySelector<HTMLElement>('.resources-stage')!;
  const before = root.querySelector<HTMLElement>('.resources-explanation')!;
  const after = root.querySelector<HTMLElement>('.resources-summary')!;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  let animations: Animation[] = [];
  let frame = 0;
  let lastWidth = -1;
  const progress = () => {
   const distance = root.offsetHeight - window.innerHeight;
   return reduce.matches ? 1 : Math.max(0, Math.min(1, -root.getBoundingClientRect().top / Math.max(1,distance)));
  };
  const paint = () => {
   frame = 0;
   const p = progress();
   const rowAligned = p >= .86;
   root.querySelectorAll<HTMLElement>('.resource-connector').forEach(el => {
    el.style.transition = rowAligned && !reduce.matches ? 'opacity 160ms cubic-bezier(0.23, 1, 0.32, 1)' : 'none';
    el.style.opacity = rowAligned ? '1' : '0';
   });
   for (const animation of animations) animation.currentTime = p * 1000;
   before.setAttribute('aria-hidden',String(p >= .5));
   after.setAttribute('aria-hidden',String(p < .5));
   strip.style.pointerEvents = p >= .9 ? 'auto' : 'none';
   strip.tabIndex = p >= .9 ? 0 : -1;
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
  const measure = () => {
   animations.forEach(a => a.cancel()); animations = [];
   root.dataset.reduced = String(reduce.matches);
   const width = stage.clientWidth;
   const designHeight = window.innerWidth >= 1280 ? 876 : window.innerWidth < 351 ? 900 : 800;
   const scale = Math.min(1,window.innerHeight / designHeight);
   stage.style.height = `${designHeight}px`;
   stage.style.transform = `translateY(-50%) scale(${scale})`;
   if (strip.clientWidth !== lastWidth) {
    lastWidth = strip.clientWidth;
    strip.scrollLeft = width >= 696 && width < 1232 ? (strip.scrollWidth-strip.clientWidth)/2 : 0;
   }
   const items = [...root.querySelectorAll<HTMLElement>('.scattered-item')];
   const slots = [...root.querySelectorAll<HTMLElement>('.resource-slot')];
   const angles = [15,-15,30,-30,60,-15];
   const animate = (el: HTMLElement, keys: Keyframe[]) => {
    const animation = el.animate(keys,{duration:1000,fill:'both',easing:'linear'});
    animation.pause(); animations.push(animation);
   };
   items.forEach((item,i) => {
    const card = item.querySelector<HTMLElement>('.resource-card')!;
    const start = item.getBoundingClientRect();
    const end = slots[i].getBoundingClientRect();
    const x = (end.left-start.left)/scale - ((start.width / scale - card.offsetWidth) / 2);
    const y = (end.top-start.top)/scale - ((start.height / scale - card.offsetHeight) / 2);
    const transform = `translate(${x}px,${y}px)`;
    animate(item,[{transform:'translate(0px,0px)',offset:0},{transform:'translate(0px,0px)',offset:.12},{transform,offset:.86},{transform,offset:1}]);
    animate(card,[{transform:`rotate(${angles[i]}deg)`,offset:0},{transform:`rotate(${angles[i]}deg)`,offset:.12},{transform:'rotate(0deg)',offset:.86},{transform:'rotate(0deg)',offset:1}]);
   });
   animate(before,[{opacity:1,offset:0},{opacity:1,offset:.3},{opacity:0,offset:.48},{opacity:0,offset:1}]);
   animate(after,[{opacity:0,offset:0},{opacity:0,offset:.76},{opacity:1,offset:.92},{opacity:1,offset:1}]);
   root.dataset.ready = 'true';
   paint();
  };
  measure();
  const observer = new ResizeObserver(measure);
  observer.observe(root);
  window.addEventListener('scroll',schedule,{passive:true});
  window.addEventListener('resize',measure);
  reduce.addEventListener('change',measure);
  strip.addEventListener('scroll',measure,{passive:true});
  return () => {
   observer.disconnect(); cancelAnimationFrame(frame); animations.forEach(a=>a.cancel());
   window.removeEventListener('scroll',schedule);window.removeEventListener('resize',measure);
   reduce.removeEventListener('change',measure);strip.removeEventListener('scroll',measure);
  };
 }, []);
 return <section ref={rootRef} className="resources-block" id="resources" aria-label="Вся информация о проекте в одной системе"><div className="resources-pin"><div className="resources-stage">
  <div className="resources-scattered">
   <h2 id="resources-scattered-title" className="resources-explanation"><span>Когда информация о проекте </span><strong>хранится в разных местах</strong><span>, команда тратит время не на управление строительством, а на </span><strong>поиск актуальных данных.</strong></h2>
   <ul className="scattered-cards" aria-label="Данные проекта">{resources.map(resource=><li key={resource.id} className={`scattered-item scattered-item--${resource.id}`}><ResourceCard resource={resource} /></li>)}</ul>
  </div>
  <div className="resources-unified">
   <h2 id="resources-unified-title" className="resources-summary"><span className="summary-desktop"><strong>Rovno</strong><span> объединяет всё, что связано с объектом, </span><strong>в одной системе.</strong></span><span className="summary-mobile"><span>Rovno </span><strong>объединяет всё, что связано с объектом,</strong><span> в одной системе.</span></span></h2>
   <div ref={stripRef} className="resource-strip" tabIndex={0} role="region" aria-label="Данные в Rovno: пролистайте карточки по горизонтали"><ul className="resource-row">{resources.map((resource,index)=><li key={resource.id}><div className={`resource-slot resource-card resource-card--${resource.id}`} aria-hidden="true" />{index<resources.length-1&&<img className="resource-connector" src="/images/resources/connector.svg" alt="" />}</li>)}</ul></div>
  </div>
 </div></div></section>;
}
