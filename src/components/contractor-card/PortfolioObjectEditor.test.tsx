import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const createMock = vi.fn();
const updateMock = vi.fn();
const deleteMock = vi.fn();
const removeOwnMock = vi.fn();
const uploadMock = vi.fn();

vi.mock("@/data/contractor-portfolio-source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/contractor-portfolio-source")>()),
  fetchPortfolioObjects: () => Promise.resolve([]),
  createPortfolioObject: (...args: unknown[]) => createMock(...args),
  updatePortfolioObject: (...args: unknown[]) => updateMock(...args),
  deletePortfolioObject: (...args: unknown[]) => deleteMock(...args),
  removeOwnPhotos: (...args: unknown[]) => removeOwnMock(...args),
}));
vi.mock("@/hooks/use-avatar-upload", () => ({
  useAvatarUpload: () => ({ uploadAvatar: (...args: unknown[]) => uploadMock(...args) }),
}));

import { PortfolioObjectEditor } from "@/components/contractor-card/PortfolioObjectEditor";

const url = (n: number) => `https://cdn.test/storage/v1/object/public/avatars/me/${n}.jpg`;
const existing = { id: "obj-1", org_id: "o1", title: "Кухня, Мурино", photos: [url(1), url(2), url(3)], position: 0 };

function renderEditor(object: typeof existing | null, onOpenChange = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <PortfolioObjectEditor orgId="o1" object={object} open onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  return { editor: screen.getByTestId("portfolio-editor"), onOpenChange };
}

function addFiles(count: number) {
  const input = screen.getByTestId("portfolio-file-input") as HTMLInputElement;
  const files = Array.from({ length: count }, (_, i) => new File(["x"], `IMG_${i}.HEIC`, { type: "image/heic" }));
  fireEvent.change(input, { target: { files } });
}

function footerSave(editor: HTMLElement) {
  return within(editor).getAllByRole("button", { name: "Save" }).at(-1) as HTMLElement;
}

describe("PortfolioObjectEditor", () => {
  beforeEach(() => {
    createMock.mockReset().mockImplementation(async (_org: string, input: { title: string; photos: string[] }) => ({
      id: "new", org_id: "o1", position: 0, ...input,
    }));
    updateMock.mockReset().mockImplementation(async (id: string, input: { title: string; photos: string[] }) => ({
      id, org_id: "o1", position: 0, ...input,
    }));
    deleteMock.mockReset().mockResolvedValue(undefined);
    removeOwnMock.mockReset().mockResolvedValue(undefined);
    let n = 10;
    uploadMock.mockReset().mockImplementation(async () => ({ url: url(n++), path: "me/x.jpg" }));
  });

  it("starts a new object with its name selected", () => {
    const { editor } = renderEditor(null);
    const input = within(editor).getByRole("textbox", { name: "Project name" }) as HTMLInputElement;
    expect(input).toHaveValue("Project name");
    expect(input).toHaveFocus();
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, "Project name".length]);
    expect(within(editor).getByText("Up to 10 photos, from the camera or gallery")).toBeInTheDocument();
  });

  it("refuses the default name and an object without photos", async () => {
    const { editor } = renderEditor(null);
    fireEvent.click(footerSave(editor));
    expect(await within(editor).findByRole("alert")).toHaveTextContent("Name the project");
    fireEvent.change(within(editor).getByRole("textbox"), { target: { value: "Баня" } });
    fireEvent.click(footerSave(editor));
    expect(await within(editor).findByRole("alert")).toHaveTextContent("Add at least one photo");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("uploads photos at 2048 px, the first one is the cover, and saves the object", async () => {
    const { editor, onOpenChange } = renderEditor(null);
    fireEvent.change(within(editor).getByRole("textbox"), { target: { value: " Баня под ключ " } });
    addFiles(3);
    await waitFor(() => expect(within(editor).getByTestId("portfolio-photo-count")).toHaveTextContent("3 of 10"));
    expect(uploadMock).toHaveBeenCalledWith(expect.any(File), { maxDimension: 2048 });
    expect(within(editor).getByText("Cover")).toBeInTheDocument();

    fireEvent.click(within(editor).getAllByRole("button", { name: "Make cover" })[1]);
    fireEvent.click(footerSave(editor));
    await waitFor(() => expect(createMock).toHaveBeenCalledWith("o1", { title: "Баня под ключ", photos: [url(12), url(10), url(11)] }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("takes no more than 10 photos and hides the add tile at 10", async () => {
    const { editor } = renderEditor(null);
    addFiles(12);
    await waitFor(() => expect(within(editor).getByTestId("portfolio-photo-count")).toHaveTextContent("10 of 10"));
    expect(uploadMock).toHaveBeenCalledTimes(10);
    expect(within(editor).queryByRole("button", { name: "Add photos" })).not.toBeInTheDocument();
  });

  it("edits: removing a photo saves the rest and the dropped file is cleaned up", async () => {
    const { editor } = renderEditor(existing);
    expect(within(editor).getByRole("textbox")).not.toHaveFocus();
    fireEvent.click(within(editor).getAllByRole("button", { name: "Remove photo" })[0]);
    fireEvent.click(footerSave(editor));
    await waitFor(() => expect(updateMock).toHaveBeenCalledWith("obj-1", { title: "Кухня, Мурино", photos: [url(2), url(3)] }));
    await waitFor(() => expect(removeOwnMock).toHaveBeenCalledWith([url(1)]));
  });

  it("deletes the object only after the confirmation", async () => {
    const { editor, onOpenChange } = renderEditor(existing);
    fireEvent.click(within(editor).getAllByRole("button", { name: "Delete project" }).at(-1) as HTMLElement);
    const confirm = await screen.findByRole("alertdialog");
    expect(deleteMock).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith("obj-1"));
    await waitFor(() => expect(removeOwnMock).toHaveBeenCalledWith(existing.photos));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("asks before leaving with changes and drops the photos uploaded here", async () => {
    const { editor, onOpenChange } = renderEditor(null);
    addFiles(1);
    await waitFor(() => expect(within(editor).getByTestId("portfolio-photo-count")).toHaveTextContent("1 of 10"));
    fireEvent.click(within(editor).getByRole("button", { name: "Cancel" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText("Leave without saving?")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole("button", { name: "Leave" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(removeOwnMock).toHaveBeenCalledWith([url(10)]);
  });

  it("drops a photo whose upload finishes after the window moved on to another object", async () => {
    let finish: (value: { url: string; path: string }) => void = () => {};
    uploadMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = (object: typeof existing | null, open: boolean) => (
      <QueryClientProvider client={queryClient}>
        <PortfolioObjectEditor orgId="o1" object={object} open={open} onOpenChange={vi.fn()} />
      </QueryClientProvider>
    );
    const { rerender } = render(view(null, true));
    addFiles(1);
    rerender(view(null, false));
    rerender(view(existing, true));
    finish({ url: url(99), path: "me/99.jpg" });
    const editor = screen.getByTestId("portfolio-editor");
    await waitFor(() => expect(removeOwnMock).toHaveBeenCalledWith([url(99)]));
    expect(within(editor).getByTestId("portfolio-photo-count")).toHaveTextContent("3 of 10");
    fireEvent.click(footerSave(editor));
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("cleans up a photo uploaded and removed before saving", async () => {
    const { editor } = renderEditor(existing);
    addFiles(1);
    await waitFor(() => expect(within(editor).getByTestId("portfolio-photo-count")).toHaveTextContent("4 of 10"));
    fireEvent.click(within(editor).getAllByRole("button", { name: "Remove photo" }).at(-1) as HTMLElement);
    fireEvent.change(within(editor).getByRole("textbox"), { target: { value: "Кухня" } });
    fireEvent.click(footerSave(editor));
    await waitFor(() => expect(updateMock).toHaveBeenCalledWith("obj-1", { title: "Кухня", photos: existing.photos }));
    await waitFor(() => expect(removeOwnMock).toHaveBeenCalledWith([url(10)]));
  });

  it("deleting cleans up a photo uploaded in this window and never saved", async () => {
    const { editor } = renderEditor(existing);
    addFiles(1);
    await waitFor(() => expect(within(editor).getByTestId("portfolio-photo-count")).toHaveTextContent("4 of 10"));
    fireEvent.click(within(editor).getAllByRole("button", { name: "Delete project" }).at(-1) as HTMLElement);
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith("obj-1"));
    await waitFor(() => expect(removeOwnMock).toHaveBeenCalledWith([url(10)]));
  });

  it("closes at once without changes", () => {
    const { editor, onOpenChange } = renderEditor(existing);
    fireEvent.click(within(editor).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
