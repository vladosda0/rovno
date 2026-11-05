import { ButtonLink } from './Button';
export function FinalCta(){return <section className="final-cta" id="start" aria-labelledby="final-cta-title">
 <div className="final-cta-content"><div className="final-cta-copy"><h2 id="final-cta-title">Попробуйте Rovno бесплатно</h2><p>Создайте первый объект за несколько минут и посмотрите, насколько проще управлять строительством, когда вся информация находится в одном месте.</p></div><div className="final-cta-buttons"><ButtonLink href="https://rovno.ai/auth/signup" variant="tertiary" size="responsive">Начать бесплатно</ButtonLink><ButtonLink href="https://rovno.ai/project/project-1/dashboard" variant="white" size="responsive">Посмотреть демо</ButtonLink></div></div>
 <img className="final-cta-bricks" src="/images/cta/bricks.png" loading="lazy" alt=""/>
 <img className="final-cta-shurik" src="/images/cta/shurik.png" loading="lazy" alt="Шурик с планшетом."/>
 </section>}
