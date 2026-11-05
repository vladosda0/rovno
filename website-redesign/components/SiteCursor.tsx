'use client';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

export function SiteCursor(){
 const ref=useRef<HTMLDivElement>(null);
 const pathname=usePathname();
 useEffect(()=>{
  const root=ref.current;if(!root||pathname==='/cursor-effects')return;
  const dot=root.querySelector<HTMLElement>('.site-cursor-dot')!,ring=root.querySelector<HTMLElement>('.site-cursor-ring')!;
  const fine=matchMedia('(hover:hover) and (pointer:fine)'),reduce=matchMedia('(prefers-reduced-motion:reduce)');
  let frame=0,x=0,y=0,rx=0,ry=0,visible=false,lastTime=0;
  function hide(){visible=false;root!.dataset.visible='false';delete document.documentElement.dataset.customCursor;cancelAnimationFrame(frame);frame=0;lastTime=0}
  function surface(){
   const hit=document.elementFromPoint(x,y);
   const interactive=hit?.closest('a[href],button,[role="button"],summary,input,select,textarea');
   root!.dataset.hover=interactive&&!interactive.matches(':disabled,[aria-disabled="true"]')?'true':'false';
   // Use only the brand's blue and cream, choosing contrast against the nearest opaque surface.
   let element=hit instanceof HTMLElement?hit:null,color='var(--blue)';
   while(element){
    const rgba=getComputedStyle(element).backgroundColor.match(/[\d.]+/g)?.map(Number);
    if(rgba&&rgba.length>=3&&(rgba.length<4||rgba[3]>.5)){
     const [r,g,b]=rgba;
     if((b>r*1.4&&b>g*1.3)||(g>=r*.95&&g>b*1.05&&r<200))color='var(--white)';
     break;
    }
    element=element.parentElement;
   }
   root!.style.setProperty('--cursor-color',color);
  }
  function draw(time:number){
   frame=0;if(!visible)return;
   const dt=lastTime?Math.min(64,time-lastTime):16.67;lastTime=time;
   const ease=reduce.matches?1:1-Math.pow(8/9,dt/16.67);
   rx+=(x-rx)*ease;ry+=(y-ry)*ease;
   dot.style.translate=`${x}px ${y}px`;ring.style.translate=`${rx}px ${ry}px`;
   if(Math.abs(rx-x)+Math.abs(ry-y)>.05)frame=requestAnimationFrame(draw);else lastTime=0;
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(draw)}
  function move(event:PointerEvent){
   if(!fine.matches||event.pointerType==='touch'){hide();return}
   x=event.clientX;y=event.clientY;
   if(!visible){rx=x;ry=y;visible=true;root!.dataset.visible='true';document.documentElement.dataset.customCursor='true'}
   surface();schedule();
  }
  function scroll(){if(visible){surface();schedule()}}
  function leave(event:PointerEvent){if(!event.relatedTarget)hide()}
  function key(event:KeyboardEvent){if(event.key==='Tab')hide()}
  document.addEventListener('pointermove',move,{passive:true});document.addEventListener('pointerout',leave);document.addEventListener('keydown',key);window.addEventListener('scroll',scroll,{passive:true,capture:true});window.addEventListener('blur',hide);fine.addEventListener('change',hide);
  return()=>{hide();document.removeEventListener('pointermove',move);document.removeEventListener('pointerout',leave);document.removeEventListener('keydown',key);window.removeEventListener('scroll',scroll,true);window.removeEventListener('blur',hide);fine.removeEventListener('change',hide)};
 },[pathname]);
 return <div className="site-cursor" ref={ref} aria-hidden="true"><div className="site-cursor-dot"/><div className="site-cursor-ring"/></div>;
}
