import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Landing from "@/pages/Landing";

function renderLanding() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Landing />
    </MemoryRouter>,
  );
}

describe("Landing newsletter subscribe form", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the email to formsubmit and clears the input on success", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });

    renderLanding();

    const input = screen.getByPlaceholderText("you@company.com") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "builder@example.com" } });

    const subscribeButton = screen.getByRole("button", { name: /subscribe/i });
    fireEvent.click(subscribeButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://formsubmit.co/ajax/vlad@rovno.ai");
    const body = JSON.parse((init as RequestInit).body as string) as {
      email: string;
      _subject: string;
    };
    expect(body.email).toBe("builder@example.com");
    expect(body._subject).toBe("Rovno: newsletter subscription");

    await waitFor(() => {
      expect(input.value).toBe("");
    });
  });

  it("keeps the email and does not clear the input when formsubmit returns an error", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });

    renderLanding();

    const input = screen.getByPlaceholderText("you@company.com") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "builder@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /subscribe/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(input.value).toBe("builder@example.com");
    });
  });
});
