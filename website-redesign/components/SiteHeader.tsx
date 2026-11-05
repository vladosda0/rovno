'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ButtonLink } from './Button';
const navigation = ['Возможности', 'Для кого', 'Тарифы', 'FAQ', 'Блог'];
export function SiteHeader({onLanding=true}:{onLanding?:boolean}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [headerLight, setHeaderLight] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    const header=headerRef.current;
    if(!header)return;
    const panels=Array.from(document.querySelectorAll<HTMLElement>('.shurik-section,.final-cta'));
    let frame=0;
    function update(){
      frame=0;
      if(!header)return;
      const rect=header.getBoundingClientRect();
      const x=rect.left+rect.width/2,y=rect.top+rect.height/2;
      const light=panels.some(panel=>{const r=panel.getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom});
      setHeaderLight(previous=>previous===light?previous:light);
    }
    function schedule(){if(!frame)frame=requestAnimationFrame(update)}
    const observer=new ResizeObserver(schedule);observer.observe(document.documentElement);panels.forEach(panel=>observer.observe(panel));
    addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule);addEventListener('pageshow',schedule);update();
    return()=>{cancelAnimationFrame(frame);observer.disconnect();removeEventListener('scroll',schedule);removeEventListener('resize',schedule);removeEventListener('pageshow',schedule)};
  },[]);
  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow=document.documentElement.style.overflow;
    const previousBodyOverflow=document.body.style.overflow;
    document.documentElement.style.overflow='hidden';document.body.style.overflow='hidden';
    const background=Array.from(document.querySelectorAll<HTMLElement>('main,.landing-footer'));
    const inertBefore=background.map(element=>element.inert);
    background.forEach(element=>{element.inert=true});
    function close(){setMenuOpen(false);menuButtonRef.current?.focus({preventScroll:true})}
    function onKey(event: KeyboardEvent) {
      if(event.key==='Escape'){event.preventDefault();close();return}
      if(event.key==='Tab'){
        const controls=Array.from(document.querySelectorAll<HTMLElement>('.site-header a,.site-header button,#mobile-navigation button')).filter(element=>element.getClientRects().length>0);
        const first=controls[0],last=controls[controls.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
      }
    }
    function onOutside(event: PointerEvent) {
      if(event.target instanceof Node&&!headerRef.current?.contains(event.target)&&!document.getElementById('mobile-navigation')?.contains(event.target))close();
    }
    function onResize(){if(innerWidth>=744)close()}
    menuButtonRef.current?.focus({preventScroll:true});
    document.addEventListener('keydown',onKey);document.addEventListener('pointerdown',onOutside);addEventListener('resize',onResize);
    return()=>{document.documentElement.style.overflow=previousOverflow;document.body.style.overflow=previousBodyOverflow;background.forEach((element,index)=>{element.inert=inertBefore[index]});document.removeEventListener('keydown',onKey);document.removeEventListener('pointerdown',onOutside);removeEventListener('resize',onResize)};
  }, [menuOpen]);
  function pendingSection(label: string) {
    if (label === 'Возможности' || label === 'Для кого' || label === 'Тарифы' || label === 'FAQ' || label === 'Блог') {
      setMenuOpen(false);
      const id=label === 'Возможности' ? 'features' : label === 'Для кого' ? 'audience' : label === 'Тарифы' ? 'pricing' : label === 'FAQ' ? 'faq' : 'blog';
      if(label === 'Блог') window.location.href='/blog';
      else if(onLanding) requestAnimationFrame(()=>document.getElementById(id)?.scrollIntoView());
      else window.location.href=`/#${id}`;
      return;
    }
    setMenuOpen(false);

  }
  const light=headerLight&&!menuOpen;
  return <>{menuOpen && <div className="mobile-header-placeholder" aria-hidden="true"/>}<header className="site-header" data-menu-open={menuOpen} ref={headerRef} data-surface={light ? 'light' : 'blue'}>
      <div className="header-start">
        <button ref={menuButtonRef} type="button" className="menu-toggle" aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen(!menuOpen)}>
          <img src={menuOpen ? '/images/hero/menu-close.svg' : light ? '/images/hero/menu-light.svg' : '/images/hero/menu.svg'} width="24" height="24" alt="" />
        </button>
        <a className="site-logo" href="/" aria-label="Rovno — на главную"><span className="logo-window"><img src="/images/hero/brand-mark.png" width="2048" height="2048" alt="" /></span></a>
      </div>
      <nav className="desktop-navigation" aria-label="Основная навигация">{navigation.map(label => <button type="button" key={label} onClick={() => pendingSection(label)}>{label}</button>)}</nav>
      <div className="header-actions">
        <ButtonLink variant={light ? 'tertiary' : 'secondary'} size="responsive" href="https://rovno.ai/home">Войти</ButtonLink>
        <ButtonLink variant={light ? 'white' : 'primary'} size="responsive" href="https://rovno.ai/project/project-1/dashboard"><span className="desktop-copy">Посмотреть демо</span><span className="compact-copy">Демо</span></ButtonLink>
      </div>
      {menuOpen && createPortal(<div className="mobile-menu-layer"><nav id="mobile-navigation" className="mobile-navigation" aria-label="Мобильная навигация">{navigation.map(label => <button type="button" key={label} onClick={() => pendingSection(label)}>{label}</button>)}</nav></div>,document.body)}
    </header></>;
}
