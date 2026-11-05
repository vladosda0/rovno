const payments=[['169ff','Visa',74],['d2ae7','Mastercard',39],['8cdfb','МИР',80],['8cd0b','СБП',48],['f6dfd','T-Pay',58],['f3a08','SberPay',51],['90f53','Альфа Pay',112]] as const;
function Logo(){return <a className="footer-logo" href="/" aria-label="Rovno — на главную"><span><img src="/images/footer/dfec3.png" alt=""/></span></a>}
export function Footer({onLanding=true}:{onLanding?:boolean}){return <footer className="landing-footer" id="footer">
 <div className="footer-top"><nav className="footer-navigation" aria-label="Навигация в подвале"><div className="footer-column"><h2>Продукт</h2><ul>{[['Возможности','features'],['Для кого','audience'],['Тарифы','pricing'],['FAQ','faq'],['Блог','blog']].map(([label,id])=><li key={id}><a href={id==='blog'?'/blog':onLanding?`#${id}`:`/#${id}`}>{label}</a></li>)}</ul></div>
 <div className="footer-column"><h2>Социальные сети</h2><ul><li><a href="https://t.me/stroyrovno">Telegram</a></li><li><button type="button" disabled>Вконтакте</button></li><li><button type="button" disabled>Max</button></li></ul></div>
 <div className="footer-column footer-legal"><h2>Правовая информация</h2><ul>{[['Публичная оферта','/offer'],['Политика конфиденциальности','/privacy'],['Возврат средств','/refund'],['Контакты','/contacts']].map(([label,href])=><li key={href}><a href={href}>{label}</a></li>)}</ul></div></nav><div className="footer-top-logo"><Logo/></div></div>
 <div className="footer-rule" aria-hidden="true"/>
 <div className="footer-payments"><div className="footer-payment-logos">{payments.map(([file,name,width])=><img key={file} src={`/images/footer/${file}.png`} alt={name} width={width} height="24" loading="lazy"/>)}</div><div className="footer-processor"><span>Платежи обрабатывает</span><img src="/images/footer/23450.png" alt="Т-Банк" width="67" height="24" loading="lazy"/></div></div>
 <div className="footer-rule" aria-hidden="true"/>
 <div className="footer-bottom"><div className="footer-copyright"><div className="footer-bottom-logo"><Logo/></div><p>© 2026 ровно</p></div><div className="footer-requisites" id="footer-requisites"><p>ИП Горлов В. А.</p><p>ИНН 575309671587</p></div></div>

 </footer>}
