'use client';
import { useLayoutEffect, useRef } from 'react';
import { ButtonLink } from './Button';
const asset = '/images/shurik/';
function Bubble({ kind, children }: {kind: 'chat' | 'project' | 'learn'; children: React.ReactNode}) {
  const files = {chat:['f3a28','c2c6f','bec87','f1b39'],project:['422c8','7821e','26136','dc99c'],learn:['14ecd','d8330','d4745','a3242']}[kind];
  return <div className={`shurik-bubble shurik-bubble--${kind}`}><p>{children}</p>
    <span className="shurik-icon"><picture><source media="(max-width:1279px)" srcSet={`${asset}${files[1]}.svg`} /><img src={`${asset}${files[0]}.svg`} alt="" /></picture></span>
    <picture className="shurik-tail"><source media="(max-width:1279px)" srcSet={`${asset}${files[3]}.svg`} /><img src={`${asset}${files[2]}.svg`} alt="" /></picture>
  </div>;
}
export function Shurik() {
  const sceneRef=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    const scene=sceneRef.current;
    if(!scene) return;
    const reduce=matchMedia('(prefers-reduced-motion: reduce)');
    const bubbles=Array.from(scene.querySelectorAll<HTMLElement>('.shurik-bubble'));
    let animations: Animation[]=[];
    let frame=0;
    function paint(){
      frame=0;
      if(!scene || reduce.matches) return;
      const top=scene.getBoundingClientRect().top;
      const distance=Math.max(100,Math.min(140,innerHeight*.14));
      const entered=innerHeight*.78-top;
      const order=[...bubbles].sort((a,b)=>a.offsetTop-b.offsetTop);
      bubbles.forEach((bubble,index)=>{
        const rank=order.indexOf(bubble);
        const progress=Math.max(0,Math.min(1,(entered-rank*(distance+24))/distance));
        if(animations[index]) animations[index].currentTime=progress*1000;
      });
    }
    function schedule(){if(!frame) frame=requestAnimationFrame(paint)}
    function setup(){
      animations.forEach(animation=>animation.cancel());
      animations=[];
      if(!reduce.matches){
        animations=bubbles.map(bubble=>{
          const fromRight=bubble.classList.contains('shurik-bubble--project');
          const animation=bubble.animate([{opacity:0,translate:`${fromRight?88:-88}px 0px`,filter:'blur(10px)'},{opacity:1,translate:'0px 0px',filter:'blur(0px)'}],{duration:1000,fill:'both',easing:'cubic-bezier(.77,0,.175,1)'});
          animation.pause();
          return animation;
        });
        paint();
      }
    }
    setup();
    addEventListener('scroll',schedule,{passive:true});
    addEventListener('resize',schedule);
    reduce.addEventListener('change',setup);
    const observer=new ResizeObserver(schedule);observer.observe(scene);
    return ()=>{cancelAnimationFrame(frame);animations.forEach(animation=>animation.cancel());observer.disconnect();removeEventListener('scroll',schedule);removeEventListener('resize',schedule);reduce.removeEventListener('change',setup)};
  },[]);

  return <section className="shurik-section" id="shurik" aria-labelledby="shurik-title">
    <div className="shurik-copy"><h2 id="shurik-title">Познакомьтесь с Шуриком</h2><div className="shurik-description"><p>Шурик помогает разобраться с Rovno, отвечает на вопросы и постепенно берет на себя всё больше задач по вашему проекту.</p><ButtonLink variant="tertiary" size="responsive" href="https://rovno.ai/home">Познакомиться с Шуриком</ButtonLink></div></div>
    <div className="shurik-scene" ref={sceneRef}><img className="shurik-character" src={`${asset}character.png`} alt="Шурик — помощник Rovno в строительной каске, с чертежом и поднятым большим пальцем." loading="lazy" />
      <Bubble kind="chat">Задайте мне вопрос <strong>в личных сообщениях</strong>. В Telegram или MAX.</Bubble>
      <Bubble kind="project">Я помогу прямо <strong>внутри проекта</strong>!</Bubble>
      <Bubble kind="learn">Дальше - больше. Я <strong>учусь помогать</strong> с ежедневным управлением стройки.</Bubble>
    </div>
  </section>;
}
