import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeFileUploader } from "@/components/NativeFileUploader";
afterEach(() => vi.restoreAllMocks());

describe("Native uploader registration and retry", () => {
  it("waits for metadata, leaves successful files alone, and retries registration without another storage upload", async () => {
    let resolveFirst!: () => void;
    const firstRegistration = new Promise<void>(resolve => { resolveFirst = resolve; });
    const complete = vi.fn().mockReturnValueOnce(firstRegistration).mockRejectedValueOnce(new Error("Registration failed")).mockResolvedValue(undefined);
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
      if (input === "/api/uploads/request-url") return new Response(JSON.stringify({ uploadURL: "https://storage.example/upload", objectPath: `/objects/${fetch.mock.calls.length}` }), { status: 200 });
      return new Response(null, { status: 200 });
    });
    const user = userEvent.setup();
    render(<NativeFileUploader registrationMode="per-file" maxNumberOfFiles={2} uploadTarget="object-storage" onUploadComplete={complete}>Upload documents</NativeFileUploader>);
    await user.click(screen.getByRole("button", { name: "Upload documents" }));
    fireEvent.change(screen.getByTestId("input-file-native"), { target: { files: [new File(["a"], "a.pdf", { type: "application/pdf" }), new File(["b"], "b.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(screen.getByTestId("button-start-upload")).toHaveTextContent("Upload 2 Files"));
    await user.click(screen.getByTestId("button-start-upload"));
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("button-cancel-upload")).toBeDisabled();
    expect(screen.getByTestId("button-start-upload")).toBeDisabled();
    resolveFirst();
    await screen.findByText("Registration failed");
    await user.click(screen.getByRole("button", { name: "Retry Failed" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument());
    expect(complete).toHaveBeenCalledTimes(3);
    expect(complete.mock.calls.map(([files]) => files[0].name)).toEqual(["a.pdf", "b.pdf", "b.pdf"]);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls[0][1]).toEqual(expect.objectContaining({ credentials: "include" }));
  });
});
