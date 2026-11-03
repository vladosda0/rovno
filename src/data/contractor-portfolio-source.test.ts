import { beforeEach, describe, expect, it, vi } from "vitest";

const orderMock = vi.fn();
const rpcMock = vi.fn();
const removeMock = vi.fn();
const getSessionMock = vi.fn();
const deleteSelectMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ order: (...args: unknown[]) => orderMock(...args) }) }),
      delete: () => ({ eq: () => ({ select: () => deleteSelectMock() }) }),
    }),
    rpc: (...args: unknown[]) => rpcMock(...args),
    auth: { getSession: () => getSessionMock() },
    storage: { from: () => ({ remove: (paths: string[]) => removeMock(paths) }) },
  },
}));

import {
  deletePortfolioObject,
  fetchPortfolioObjects,
  ownPhotoPaths,
  removeOwnPhotos,
  reorderPortfolioObjects,
} from "@/data/contractor-portfolio-source";

const BASE = "https://aaycwobhdkrrgfxwcfxg.supabase.co/storage/v1/object/public/avatars";

describe("contractor portfolio source", () => {
  beforeEach(() => {
    orderMock.mockReset();
    rpcMock.mockReset().mockResolvedValue({ error: null });
    removeMock.mockReset().mockResolvedValue({ data: [], error: null });
    getSessionMock.mockReset().mockResolvedValue({ data: { session: { user: { id: "me" } } } });
  });

  it("reads objects in position order and keeps only string photos", async () => {
    orderMock.mockResolvedValue({
      data: [{ id: "a", org_id: "o", title: "Кухня", photos: [`${BASE}/me/1.jpg`, 42, null], position: 0 }],
      error: null,
    });
    const out = await fetchPortfolioObjects("o");
    expect(orderMock).toHaveBeenCalledWith("position", { ascending: true });
    expect(out).toEqual([{ id: "a", org_id: "o", title: "Кухня", photos: [`${BASE}/me/1.jpg`], position: 0 }]);
  });

  it("sends the whole order in one call", async () => {
    await reorderPortfolioObjects("o", ["b", "a"]);
    expect(rpcMock).toHaveBeenCalledWith("reorder_contractor_portfolio_objects", { p_org_id: "o", p_ids: ["b", "a"] });
  });

  it("treats a delete that removed no row as a failure", async () => {
    deleteSelectMock.mockResolvedValueOnce({ data: [], error: null });
    await expect(deletePortfolioObject("a")).rejects.toThrow();
    deleteSelectMock.mockResolvedValueOnce({ data: [{ id: "a" }], error: null });
    await expect(deletePortfolioObject("a")).resolves.toBeUndefined();
  });

  it("a malformed address does not hide the caller's other files", () => {
    expect(ownPhotoPaths([`${BASE}/me/%E0%A4%A.jpg`, `${BASE}/me/1.jpg`], "me")).toEqual(["me/1.jpg"]);
  });

  it("finds only the caller's own files", () => {
    expect(
      ownPhotoPaths(
        [`${BASE}/me/1.jpg`, `${BASE}/other/2.jpg`, "https://example.test/me/3.jpg", "not a url", `${BASE}/me/../other/4.jpg`],
        "me",
      ),
    ).toEqual(["me/1.jpg"]);
  });

  it("removes own files and leaves another admin's file alone", async () => {
    await removeOwnPhotos([`${BASE}/me/1.jpg`, `${BASE}/other/2.jpg`]);
    expect(removeMock).toHaveBeenCalledWith(["me/1.jpg"]);
  });

  it("does not call storage when nothing is the caller's", async () => {
    await removeOwnPhotos([`${BASE}/other/2.jpg`]);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("never throws when storage refuses", async () => {
    removeMock.mockRejectedValue(new Error("denied"));
    await expect(removeOwnPhotos([`${BASE}/me/1.jpg`])).resolves.toBeUndefined();
  });
});
