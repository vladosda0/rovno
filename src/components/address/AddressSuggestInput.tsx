import { useTranslation } from "react-i18next";
import { RequisitesSuggestInput } from "@/components/estimate-v2/RequisitesSuggestInput";
import { lookupAddresses, type AddressSuggestion } from "@/data/requisites-lookup-source";
import { PROJECT_ADDRESS_MAX_LENGTH } from "@/data/workspace-source";
import type { ComponentProps } from "react";

type BaseProps = ComponentProps<typeof RequisitesSuggestInput<AddressSuggestion>>;

type AddressSuggestInputProps = Omit<BaseProps, "search" | "view" | "notFoundText" | "unavailableText" | "onPick"> & {
  onPick: (address: string) => void;
  /** Where Enter saves the typed text (the dashboard row), the hint says so. */
  enterSavesTyped?: boolean;
};

const addressView = (item: AddressSuggestion) => ({
  key: `${item.value}|${item.postalCode ?? ""}`,
  primary: item.value,
  secondary: item.postalCode ?? undefined,
});

/** DaData address hints (rovno#236): helps, never forces; free text stays valid. */
export function AddressSuggestInput({ onPick, maxLength, enterSavesTyped, ...props }: AddressSuggestInputProps) {
  const { t } = useTranslation();
  return (
    <RequisitesSuggestInput<AddressSuggestion>
      {...props}
      maxLength={maxLength ?? PROJECT_ADDRESS_MAX_LENGTH}
      search={lookupAddresses}
      view={addressView}
      onPick={(item) => onPick(item.value)}
      notFoundText={t(enterSavesTyped ? "address.lookup.notFound" : "address.lookup.notFoundPlain")}
      unavailableText={t("address.lookup.unavailable")}
    />
  );
}
