import { useEffect } from "react";

// Back from Yandex can restore the page as it was left, with its button still busy.
export function useResetOnBackFromYandex(reset: () => void) {
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) reset();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [reset]);
}
