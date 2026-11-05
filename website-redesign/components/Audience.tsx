const audiences = [
  {title:'Генподрядчики',text:'Контролируйте несколько объектов, подрядчиков и сроки в одной системе.',image:'a3d99',alt:'Шурик с планшетом руководит строительством объекта.'},
  {title:'Подрядчики',text:'Организуйте работу команды, фиксируйте выполнение задач и ведите документацию без лишней рутины.',image:'08784',alt:'Два помощника Шурика несут материалы рядом со списком задач.'},
  {title:'Девелоперы',text:'Следите за ходом строительства, бюджетом и качеством выполнения работ в режиме реального времени.',image:'d5c2e',alt:'Шурик анализирует показатели строительства на экране.'},
  {title:'Технический надзор',text:'Контролируйте замечания, проверки и историю изменений по каждому объекту.',image:'6ea77',alt:'Шурик с лупой проверяет трещину в стене.'},
];
export function Audience(){
  return <section className="audience-section" id="audience" aria-labelledby="audience-title">
    <h2 id="audience-title">Создано для тех, кто управляет строительством</h2>
    <div className="audience-grid">{audiences.map((item,index)=><article className="audience-card" key={item.image}>
      <div className={`audience-image${index===3?' audience-image--supervision':''}`}><img src={`/images/audience/${item.image}.png`} loading="lazy" alt={item.alt}/></div>
      <div className="audience-copy"><h3>{item.title}</h3><p>{item.text}</p></div>
    </article>)}</div>
  </section>;
}
