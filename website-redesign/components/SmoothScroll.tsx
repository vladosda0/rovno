'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Lenis from 'lenis';

export function SmoothScroll(){
 const pathname=usePathname();
 useEffect(()=>{
  const fine=matchMedia('(hover:hover) and (pointer:fine)');
  const reduced=matchMedia('(prefers-reduced-motion:reduce)');
  let lenis:Lenis|undefined,observer:MutationObserver|undefined;
  function dispose(){observer?.disconnect();observer=undefined;lenis?.destroy();lenis=undefined}
  function setup(){
   dispose();
   if(!fine.matches||reduced.matches)return;
   lenis=new Lenis({autoRaf:true,lerp:.12,smoothWheel:true,syncTouch:false,anchors:{offset:-104},stopInertiaOnNavigate:true,prevent:node=>node.closest('.mobile-menu-layer,.blog-posts,.resource-strip')!==null});
   function syncMenu(){
    const open=document.querySelector('.site-header[data-menu-open=true]');
    if(open&&!lenis?.isStopped)lenis?.stop();
    else if(!open&&lenis?.isStopped)lenis?.start();
   }
   observer=new MutationObserver(syncMenu);
   observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['data-menu-open']});
   syncMenu();
  }
  setup();fine.addEventListener('change',setup);reduced.addEventListener('change',setup);
  return()=>{dispose();fine.removeEventListener('change',setup);reduced.removeEventListener('change',setup)};
 },[pathname]);
 return null;
}
