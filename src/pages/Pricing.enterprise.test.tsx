import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Pricing from "@/pages/Pricing";

function renderPricing() {
  return render(
    <MemoryRouter initialEntries={["/pricing"]}>
      <Pricing />
    </MemoryRouter>,
  );
}

describe("Pricing enterprise inquiry form", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the enterprise inquiry to formsubmit and clears the fields on success", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });

    renderPricing();

    const name = screen.getByLabelText(/name/i) as HTMLInputElement;
    const email = screen.getByLabelText(/email/i) as HTMLInputElement;
    const message = screen.getByLabelText(/message/i) as HTMLTextAreaElement;

    fireEvent.change(name, { target: { value: "Jane Doe" } });
    fireEvent.change(email, { target: { value: "jane@builder.co" } });
    fireEvent.change(message, { target: { value: "We need a pilot for 40 sites." } });

    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://formsubmit.co/ajax/vlad@rovno.ai");
    const body = JSON.parse((init as RequestInit).body as string) as {
      name: string;
      email: string;
      message: string;
      _subject: string;
    };
    expect(body.name).toBe("Jane Doe");
    expect(body.email).toBe("jane@builder.co");
    expect(body.message).toBe("We need a pilot for 40 sites.");
    expect(body._subject).toBe("Rovno: enterprise inquiry");

    await waitFor(() => {
      expect(name.value).toBe("");
      expect(email.value).toBe("");
      expect(message.value).toBe("");
    });
  });

  it("keeps form values and does not clear inputs when submit fails", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });

    renderPricing();

    const name = screen.getByLabelText(/name/i) as HTMLInputElement;
    const email = screen.getByLabelText(/email/i) as HTMLInputElement;
    const message = screen.getByLabelText(/message/i) as HTMLTextAreaElement;

    fireEvent.change(name, { target: { value: "Jane Doe" } });
    fireEvent.change(email, { target: { value: "jane@builder.co" } });
    fireEvent.change(message, { target: { value: "Let's talk." } });

    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(name.value).toBe("Jane Doe");
      expect(email.value).toBe("jane@builder.co");
      expect(message.value).toBe("Let's talk.");
    });
  });
});
