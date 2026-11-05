'use client';
import { useEffect, useRef, useState } from 'react';
import './preview.css';
const variants=[["\u0422\u043e\u0447\u043a\u0430 \u0438 \u043a\u043e\u043b\u044c\u0446\u043e", ""], ["\u0422\u043e\u043d\u043a\u043e\u0435 \u043a\u043e\u043b\u044c\u0446\u043e", ""], ["\u041a\u043e\u043d\u0442\u0435\u043a\u0441\u0442\u043d\u044b\u0439", ""], ["\u041c\u0430\u0433\u043d\u0438\u0442\u043d\u044b\u0439", ""], ["\u041f\u0440\u0438\u0446\u0435\u043b", ""], ["\u0421\u0442\u0440\u0435\u043b\u043a\u0430", ""], ["\u0420\u043e\u043c\u0431", ""], ["\u0423\u0433\u043e\u043b\u043a\u0438", ""], ["\u041c\u044f\u0433\u043a\u0438\u0439 \u043a\u0432\u0430\u0434\u0440\u0430\u0442", ""], ["\u041c\u0438\u043d\u0438-\u0442\u043e\u0447\u043a\u0430", ""], ["CodePen", ""]];
export default function CursorEffects(){
 const [variant,setVariant]=useState(10),[clicked,setClicked]=useState(false);
 const area=useRef<HTMLDivElement>(null),cursor=useRef<HTMLDivElement>(null),dot=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const stage=area.current,ring=cursor.current,point=dot.current;if(!stage||!ring||!point)return;
  const fine=matchMedia('(hover:hover) and (pointer:fine)'),reduce=matchMedia('(prefers-reduced-motion:reduce)');
  let frame=0,x=0,y=0,rx=0,ry=0,inside=false,target:HTMLElement|null=null;
  function draw(){
   if(!inside)return;
   if(variant===10){
    let node=document.elementFromPoint(x,y) as HTMLElement|null;
    let color='var(--blue)';
    while(node&&stage!.contains(node)){
     const rgba=getComputedStyle(node).backgroundColor.match(/[\d.]+/g)?.map(Number);
     if(rgba&&rgba.length>=3&&(rgba.length<4||rgba[3]>.5)){
      const [r,g,b]=rgba;
      if((b>r*1.4&&b>g*1.3)||(g>=r*.95&&g>b*1.05&&r<200))color='var(--white)';
      break;
     }
     node=node.parentElement;
    }
    ring!.style.backgroundColor=color;point!.style.backgroundColor=color;
   }else{ring!.style.removeProperty('background-color');point!.style.removeProperty('background-color')}
   const bounds=stage!.getBoundingClientRect();let tx=x-bounds.left,ty=y-bounds.top;
   let w=variant===10?20:variant===1?28:40,h=w;
   if(variant===3&&target?.matches('button')){const r=target.getBoundingClientRect();tx=r.left-bounds.left+r.width/2;ty=r.top-bounds.top+r.height/2;w=r.width+12;h=r.height+12;}
   const ease=reduce.matches?1:variant===10?1/9:variant===1||variant>=5?1:variant===4?.32:.2;rx+=(tx-rx)*ease;ry+=(ty-ry)*ease;
   if(variant===10){ring!.style.transform='none';ring!.style.translate=`${rx}px ${ry}px`}
   else{ring!.style.removeProperty('translate');ring!.style.transform=`translate3d(${rx}px,${ry}px,0)`}ring!.style.width=`${w}px`;ring!.style.height=`${h}px`;
   if(variant===10){point!.style.transform='none';point!.style.translate=`${x-bounds.left}px ${y-bounds.top}px`}
   else{point!.style.removeProperty('translate');point!.style.transform=`translate3d(${x-bounds.left}px,${y-bounds.top}px,0)`}
   frame=requestAnimationFrame(draw);
  }
  function move(e:PointerEvent){if(!fine.matches||e.pointerType==='touch')return;x=e.clientX;y=e.clientY;target=(e.target as HTMLElement).closest<HTMLElement>('[data-cursor]');const text=(e.target as HTMLElement).closest('p');stage!.dataset.text=variant!==10&&text&&!target?'true':'false';ring!.dataset.hover=target?'true':'false';ring!.dataset.label=target?.dataset.cursor==='read'?'Читать ↗':target?'↗':'';if(!inside){const r=stage!.getBoundingClientRect();rx=x-r.left;ry=y-r.top;inside=true;stage!.dataset.active='true';draw();}}
  function leave(){inside=false;stage!.dataset.active='false';cancelAnimationFrame(frame)}
  function down(){stage!.dataset.pressed='true'}function up(){stage!.dataset.pressed='false'}
  stage.addEventListener('pointermove',move);stage.addEventListener('pointerleave',leave);stage.addEventListener('pointerdown',down);window.addEventListener('pointerup',up);window.addEventListener('blur',leave);
  return()=>{cancelAnimationFrame(frame);stage.removeEventListener('pointermove',move);stage.removeEventListener('pointerleave',leave);stage.removeEventListener('pointerdown',down);window.removeEventListener('pointerup',up);window.removeEventListener('blur',leave);stage.dataset.active='false'};
 },[variant]);
 return <main className="cursor-preview">
  <a href="/">← На главную</a><h1>Выбираем курсор для Rovno</h1><p>Пробы для обсуждения. Выбери вариант и поводи мышью по области ниже. На основном сайте пока ничего не меняется.</p>
  <div className="cursor-choices" aria-label="Варианты курсора">{variants.map(([name],i)=><button key={name} aria-pressed={variant===i} onClick={()=>setVariant(i)}>{i+1}. {name}</button>)}</div>
  <p className="cursor-description" role="status">{variants[variant][1]}</p>

  <div className={`cursor-stage cursor-variant-${variant}`} ref={area}>
   <div className="cursor-stage-heading"><span>ROVNO / ПРОБА {variant+1}</span><h2>Всё встаёт<br/>на свои места.</h2><p>Попробуй провести курсором по тексту, кнопкам и карточке ниже.</p></div>
   <div className="cursor-test-buttons"><button data-cursor="button" onClick={()=>setClicked(v=>!v)}>Начать бесплатно</button><button data-cursor="button" onClick={()=>setClicked(v=>!v)}>Посмотреть демо ↗</button></div>
   <div className="cursor-sample-grid"><a data-cursor="read" href="#cursor-note" onClick={e=>{e.preventDefault();setClicked(v=>!v)}}><div className="cursor-sample-cover"><span>R</span></div><h3>Что нового в Rovno?</h3><p>Наведи на карточку, чтобы увидеть реакцию курсора.</p></a><div className="cursor-blue"><h3>Бюджет<br/>перед глазами.</h3><button data-cursor="button" onClick={()=>setClicked(v=>!v)}>Попробовать</button></div></div>
   <div className="cursor-green"><h3>Познакомьтесь с Шуриком</h3><p>На зелёном фоне круг становится бежевым.</p></div>
   <div className="cursor-pointer-dot" ref={dot} aria-hidden="true"/><div className="cursor-pointer-ring" ref={cursor} aria-hidden="true"><span/><i/><b/></div>
  </div><p id="cursor-note" className="cursor-note" role="status">{clicked?'Нажатие работает ✓ Можно попробовать другой вариант.':'Проверь движение, наведение и нажатие. Потом напиши номер понравившегося варианта.'}</p><p className="cursor-touch-note">Для сравнения нужен компьютер с мышью или трекпадом. На сенсорном экране курсор не показывается.</p>
 </main>;
}
