'use client';
import { useState } from 'react';
import './preview.css';
const effects=[
 ['Подъём по очереди','Буквы поднимаются снизу и мягко встают на место.','rise'],
 ['Волна','По надписи проходит одна небольшая волна.','wave'],
 ['Перекат вверх','Старая надпись уходит вверх, новая появляется снизу.','roll'],
 ['Переворот','Каждая буква делает короткий объёмный поворот.','flip'],
 ['Проявление','Буквы по очереди пригасают и снова становятся чёткими.','fade'],
 ['Из центра','Буквы слегка расходятся из центра и возвращаются в строку.','spread'],
 ['Лёгкий наклон','Буквы по очереди наклоняются и выпрямляются.','tilt'],
 ['Перекат целиком','Надпись меняется одним плавным движением, без волны букв.','whole'],
];
const text='Начать бесплатно';
export default function ButtonEffects(){const [chosen,setChosen]=useState<number|null>(null);return <main className="effects-page"><a href="/">← Вернуться к лендингу</a><h1>Выбираем движение надписи</h1><p>Наведи на кнопку. На телефоне — нажми. Цвет остаётся прежним; это отдельные пробы для обсуждения.</p><div className="effects-grid">{effects.map(([name,description,effect],index)=><article className={`effect-card ${chosen===index?'effect-chosen':''}`} key={effect}><span className="effect-number">{String(index+1).padStart(2,'0')}</span><h2>{name}</h2><p>{description}</p><button className={`hover-sample effect-${effect}`} aria-label={text} onClick={event=>{const el=event.currentTarget;el.classList.remove('effect-play');void el.offsetWidth;el.classList.add('effect-play')}}><span className="effect-line" aria-hidden="true">{Array.from(text).map((letter,i)=><span className="effect-letter" style={{'--i':i,'--offset':`${(i-(text.length-1)/2)*.7}px`,'--delay':`${i*12}ms` } as React.CSSProperties} key={i}><span>{letter}</span>{(effect==='roll'||effect==='whole')&&<span className="effect-letter-copy">{letter}</span>}</span>)}</span></button><button className="effect-select" aria-pressed={chosen===index} onClick={()=>setChosen(index)}>{chosen===index?'Выбран ✓':`Выбрать №${index+1}`}</button></article>)}</div><p className="effect-choice" role="status">{chosen===null?'Можно сравнить несколько раз, а потом написать мне номер.':`Выбран вариант №${chosen+1} — «${effects[chosen][0]}». Напиши мне номер, и я применю его к лендингу.`}</p></main>}
