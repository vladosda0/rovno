const problems = [
  { icon: 'telephone', title: 'Чтобы узнать статус объекта', description: '...приходится звонить.' },
  { icon: 'chat', title: 'Чтобы найти документ', description: '...нужно открыть несколько чатов или папок.' },
  { icon: 'image', title: 'Фотографии объекта', description: '...хранятся отдельно от замечаний.' },
  { icon: 'table', title: 'Перед планёркой', description: '...информацию приходится собирать вручную.' },
];
export function Problem() {
  return <section className="problem" id="problem" aria-labelledby="problem-title">
    <h2 id="problem-title">Большинство строительных компаний работают именно так</h2>
    <div className="problem-content">
      <ul className="problem-cards">{problems.map(({icon,title,description}) => <li className="problem-card" key={icon}>
        <div className="problem-card-content">
          <div className="problem-icon"><img src={`/images/problem/${icon}.svg`} width="24" height="24" alt="" /></div>
          <div className="problem-text"><h3>{title}</h3><p>{description}</p></div>
        </div>
        <span className="problem-divider" aria-hidden="true" />
      </li>)}</ul>
      <p className="problem-caption">И это нормально. <strong>До тех пор</strong>,<br className="problem-caption-break" /> пока проект не начинает расти.</p>
    </div>
  </section>;
}
