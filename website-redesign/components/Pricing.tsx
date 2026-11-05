import { ButtonLink } from './Button';
const plans=[
  {name:'Старт',href:'https://rovno.ai/auth/signup',description:'Познакомьтесь с системой и начните вести объекты в едином рабочем пространстве.',price:'0',features:['До 1 проекта','1 пользователь','Базовые функции управления','ИИ-помощник']},
  {name:'Бригада',href:'https://rovno.ai/auth/signup?next=%2Fbilling%2Fcheckout%3Fplan%3Dmaster',description:'Когда над объектом работают несколько человек и важно видеть общую картину проекта.',price:'990',features:['до 5 проектов','до 5 пользователей','Совместная работа','Аналитика','Расширенный ИИ']},
  {name:'Компания',href:'https://rovno.ai/auth/signup?next=%2Fbilling%2Fcheckout%3Fplan%3Dbrigade',description:'Когда одновременно ведется несколько объектов и работают разные команды.',price:'2990',features:['до 25 проектов','Неограниченные пользователи','Управление ролями','Общие документы','Расширенное планирование','Приоритетная поддержка']},
];
export function Pricing(){return <section className="pricing-section" id="pricing" aria-labelledby="pricing-title">
  <div className="pricing-copy"><h2 id="pricing-title">Выберите подходящий тариф</h2><p>Начните бесплатно и переходите на более функциональный тариф по мере роста вашей команды и количества проектов.</p></div>
  <div className="pricing-grid">{plans.map((plan,index)=><article className={`plan-card plan-card--${index}`} key={plan.name} aria-labelledby={`plan-${index}`}>
    <div className="plan-top"><div className="plan-intro"><div className="plan-title"><h3 id={`plan-${index}`}>{plan.name}</h3>{index===1&&<span className="plan-badge">Рекомендуем</span>}</div><p>{plan.description}</p></div><p className="plan-price"><span>{plan.price}</span><small>рублей / месяц</small></p></div>
    <div className="plan-rule" aria-hidden="true"/>
    <div className="plan-bottom"><ul>{plan.features.map(feature=><li key={feature}><img src="/images/pricing/fc4c2.svg" alt="" width="24" height="24"/><span>{feature}</span></li>)}</ul><ButtonLink href={plan.href} variant={index===1?'primary':'secondary'} size="responsive" aria-label={`Продолжить с тарифом «${plan.name}»`}>Продолжить</ButtonLink></div>
    <div className="plan-vertical" aria-hidden="true"><span/></div>
  </article>)}</div>
</section>}
