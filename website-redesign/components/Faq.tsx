import { ButtonLink } from './Button';
const questions=[
 {question:'Нужно ли заставлять всю команду переходить в Rovno сразу?',answer:'Нет. Начните с одного объекта или одного процесса, например, постановки задач или работы с документами. Команда сможет постепенно перейти на единое рабочее пространство без резких изменений привычных процессов.'},
 {question:'Мы уже используем другую систему. Есть ли смысл переходить?',answer:'Если текущая система действительно закрывает все ваши процессы, менять её нет необходимости. Но если часть работы по-прежнему ведётся в чатах, таблицах или по телефону, Rovno поможет собрать всё в одном месте и сократить количество ручной работы.'},
 {question:'Подходит ли Rovno для нескольких объектов одновременно?',answer:'Да. Вы можете вести несколько объектов, переключаться между ними и контролировать каждый проект из единой системы.'},
 {question:'Можно ли пригласить заказчика или подрядчика?',answer:'Да. Вы сами определяете, кто имеет доступ к проекту и какую информацию видит каждый участник.'},
];
export function Faq(){return <section className="faq-section" id="faq" aria-labelledby="faq-title">
 <div className="faq-heading"><h2 id="faq-title">Часто задаваемые вопросы</h2><div className="faq-contact"><p>Если вы не нашли ответ на свой вопрос — напишите нам, мы поможем.</p><ButtonLink variant="secondary" size="responsive" href="mailto:vlad@rovno.ai">Написать нам</ButtonLink></div></div>
 <div className="faq-list">{questions.map((item,index)=><article className="faq-item" key={item.question} aria-labelledby={`faq-question-${index}`}><span className="faq-number" aria-hidden="true">{String(index+1).padStart(2,'0')}</span><div className="faq-answer"><h3 id={`faq-question-${index}`}>{item.question}</h3><p>{item.answer}</p></div></article>)}</div>
 </section>}
