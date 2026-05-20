import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Mail, Phone, MapPin, Clock, FileText } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import LegalLayout from "./LegalLayout";

// Контактная страница: ФИО ИП, реквизиты, email, телефон, адрес, часы работы.
// Покрывает требование банка 1.4 (email + телефон поддержки) и 1.7 (юр. адрес).
//
// TODO(vlad): подтвердить часы работы поддержки (сейчас стоит «10:00–19:00 МСК
// по будням»). Если канал поддержки 24/7 или иной, поправить.

export default function Contacts() {
  useEffect(() => {
    trackEvent("legal_contacts_viewed");
  }, []);

  return (
    <LegalLayout title="Контакты">
      <p className="text-body-sm text-muted-foreground">
        Если у вас есть вопросы по работе сервиса «ровно», подписке, оплате или
        возврату средств, свяжитесь с нами любым удобным способом ниже.
      </p>

      <section className="space-y-3">
        <h2 className="text-h2 text-foreground">Служба поддержки</h2>
        <ul className="space-y-3">
          <li className="flex items-start gap-3">
            <Mail className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <div className="text-body-sm text-muted-foreground">Электронная почта</div>
              <a href="mailto:vlad@rovno.ai" className="text-body font-medium text-foreground hover:underline">
                vlad@rovno.ai
              </a>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <Phone className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <div className="text-body-sm text-muted-foreground">Телефон</div>
              <a href="tel:+79215599969" className="text-body font-medium text-foreground hover:underline">
                +7 (921) 559-99-69
              </a>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <div className="text-body-sm text-muted-foreground">Часы работы</div>
              <div className="text-body text-foreground">
                Понедельник — пятница, 10:00–19:00 (МСК)
              </div>
            </div>
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-h2 text-foreground">Реквизиты</h2>
        <ul className="space-y-2">
          <li className="flex items-start gap-3">
            <FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="text-body text-foreground">
              <div className="font-medium">Индивидуальный предприниматель Горлов Владислав Алексеевич</div>
              <div className="text-body-sm text-muted-foreground">ИНН 575309671587</div>
              <div className="text-body-sm text-muted-foreground">ОГРНИП 326470400066950</div>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <div className="text-body-sm text-muted-foreground">Юридический адрес</div>
              <div className="text-body text-foreground">
                188824, Россия, Ленинградская обл., Выборгский р-н, п. Поляны,
                ул. Харалужная, д. 1
              </div>
            </div>
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-h2 text-foreground">Юридические документы</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>
            <Link to="/offer" className="underline hover:text-foreground">
              Публичная оферта
            </Link>
          </li>
          <li>
            <Link to="/privacy" className="underline hover:text-foreground">
              Политика конфиденциальности
            </Link>
          </li>
          <li>
            <Link to="/refund" className="underline hover:text-foreground">
              Политика возврата средств
            </Link>
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-h2 text-foreground">Платежи</h2>
        <p>
          Приём платежей на сайте осуществляется через сервис интернет-эквайринга{" "}
          <a
            href="https://www.tbank.ru"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            АО «ТБанк»
          </a>
          . Принимаются карты Visa, Mastercard, МИР, оплата через Систему быстрых
          платежей (СБП) и T-Pay. Кассовые чеки направляются на электронную почту в
          соответствии с Федеральным законом № 54-ФЗ.
        </p>
      </section>
    </LegalLayout>
  );
}
