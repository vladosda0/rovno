'use client';
import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
export function FeatureStack({children}:{children:ReactNode}){
 const rootRef=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const root=rootRef.current;if(!root)return;
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const cards=Array.from(root.querySelectorAll<HTMLElement>('.workspace-feature'));
  let frame=0;
  function measure(){
   frame=0;if(!root)return;
   const enabled=!motion.matches&&innerHeight>=650;
   root.dataset.stacking=String(enabled);
   cards.forEach(card=>{
    if(!enabled){card.style.removeProperty('--stack-screen-width');return;}
    const copy=card.querySelector<HTMLElement>('.workspace-copy');
    if(!copy)return;
    const css=getComputedStyle(card);
    const width=card.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight);
    const height=card.clientHeight-parseFloat(css.paddingTop)-parseFloat(css.paddingBottom)-copy.getBoundingClientRect().height-parseFloat(css.rowGap)-8;
    card.style.setProperty('--stack-screen-width',`${Math.max(0,Math.min(width,height*1206/677))}px`);
   });
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(measure)}
  const observer=new ResizeObserver(schedule);observer.observe(root);cards.forEach(card=>{const copy=card.querySelector('.workspace-copy');if(copy)observer.observe(copy)});
  addEventListener('resize',schedule);motion.addEventListener('change',schedule);document.fonts.ready.then(schedule);measure();
  return()=>{cancelAnimationFrame(frame);observer.disconnect();removeEventListener('resize',schedule);motion.removeEventListener('change',schedule);delete root.dataset.stacking;cards.forEach(card=>card.style.removeProperty('--stack-screen-width'))};
 },[]);
 return <div className="feature-stack" ref={rootRef}>{children}</div>;
}
