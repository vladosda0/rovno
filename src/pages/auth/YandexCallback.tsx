import ExternalLoginCallback from "@/pages/auth/ExternalLoginCallback";

/** /auth/yandex/callback (epic external-login, slice 2). */
export default function YandexCallback() {
  return <ExternalLoginCallback provider="yandex" />;
}
