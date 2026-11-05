'use client';
import { useLayoutEffect } from 'react';
type RevealKind='heading'|'copy'|'image'|'card';
export function PageMotion(){
 useLayoutEffect(()=>{
  const root=document.getElementById('top');if(!root)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const records=new Map<HTMLElement,Animation>();
  const completed=new Set<HTMLElement>();
  let observer:IntersectionObserver|undefined;
  let disposed=false;
  const ease='cubic-bezier(.23,1,.32,1)';
  function show(element:HTMLElement){
   const animation=records.get(element);if(!animation)return;
   animation.onfinish=null;animation.cancel();records.delete(element);completed.add(element);observer?.unobserve(element);
  }
  function setup(){
   observer?.disconnect();records.forEach(a=>{a.onfinish=null;a.cancel()});records.clear();
   if(reduced.matches||disposed)return;
   observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
     const element=entry.target as HTMLElement;
     if(!entry.isIntersecting)return;
     const animation=records.get(element);if(!animation)return;
     animation.play();observer?.unobserve(element);
    });
   },{rootMargin:'0px 0px -6% 0px',threshold:0});
   function add(selector:string,kind:RevealKind,stagger=0){
    root!.querySelectorAll<HTMLElement>(selector).forEach((element,index)=>{
     if(completed.has(element))return;
     let frames:Keyframe[];
     if(kind==='heading')frames=[{opacity:0,translate:'0 20px',clipPath:'inset(0 0 100% 0)'},{opacity:1,translate:'0 0',clipPath:'inset(-8px -8px -8px -8px)'}];
     else if(kind==='image')frames=[{opacity:0,translate:'0 36px',scale:'.975'},{opacity:1,translate:'0 0',scale:'1'}];
     else frames=[{opacity:0,translate:`0 ${kind==='card'?28:16}px`},{opacity:1,translate:'0 0'}];
     const animation=element.animate(frames,{duration:kind==='heading'?720:kind==='image'?850:kind==='card'?650:480,delay:stagger?index%3*stagger:0,fill:'both',easing:ease});
     animation.pause();animation.currentTime=0;
     animation.onfinish=()=>show(element);
     records.set(element,animation);observer!.observe(element);
    });
   }
   add('.legal-title-row h1,.legal-section h2','heading');
   add('.legal-date,.legal-caption','copy',60);
   add('.legal-prose>p,.legal-prose>ul>li,.legal-prose>ol>li,p.legal-prose','copy');
   add('.contact-data','copy',60);
   add('.blog-index-heading h1,.article-intro h1,.article-body h2,.article-body h3,.article-related-heading h2','heading');
   add('.blog-breadcrumbs,.blog-index-heading>p,.article-intro>p,.article-labels,.article-related-heading>.button','copy',60);
   add('.article-body>p,.article-body>div:not(.article-body-headings):not(.article-body-subsection):not(.article-body-image)>p,.article-body-subsection p','copy');
   add('.article-body li','copy',60);
   add('.article-cover,.article-body-image','image');
   add('.hero h1,.problem>h2,.workspace-copy h2,.audience-section>h2,.pricing-copy h2,.faq-heading h2,.blog-heading h2,.final-cta-copy h2','heading');
   add('.hero-description>p,.hero-actions,.problem-caption,.workspace-copy>p,.pricing-copy>p,.faq-contact,.blog-intro,.final-cta-copy>p,.final-cta-buttons','copy',60);
   add('.hero-screen,.workspace-screen','image');
   add('.problem-card','card',70);
   add('.audience-card','card',70);
   add('.plan-card','card',70);
   add('.faq-item','card');
   add('.blog-card','card',70);
   add('.final-cta-shurik,.final-cta-bricks','image',70);
   add('.footer-column','card',60);
   add('.footer-payments,.footer-bottom','copy',60);
  }
  function onFocus(event:FocusEvent){const target=event.target as Node;records.forEach((_,element)=>{if(element.contains(target))show(element)})}
  setup();reduced.addEventListener('change',setup);root.addEventListener('focusin',onFocus);
  return()=>{disposed=true;observer?.disconnect();records.forEach(a=>{a.onfinish=null;a.cancel()});records.clear();reduced.removeEventListener('change',setup);root.removeEventListener('focusin',onFocus)};
 },[]);
 return null;
}
