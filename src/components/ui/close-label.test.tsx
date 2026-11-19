import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

describe("dialog and sheet close button label", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("announces the dialog close button in the UI language", async () => {
    await i18n.changeLanguage("ru");
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>T</DialogTitle>
          <DialogDescription>D</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole("button", { name: "Закрыть" })).toBeInTheDocument();
  });

  it("announces the sheet close button in the UI language", async () => {
    await i18n.changeLanguage("ru");
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>T</SheetTitle>
          <SheetDescription>D</SheetDescription>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByRole("button", { name: "Закрыть" })).toBeInTheDocument();
  });
});
