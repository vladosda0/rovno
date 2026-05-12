/**
 * Render an HTML fragment in a hidden iframe and trigger the browser print dialog.
 * The user can save as PDF or send to a real printer from there.
 *
 * The iframe is removed automatically after printing (or after a safety timeout
 * if the browser does not fire `afterprint`).
 */
export function printHtmlDocument(htmlDocument: string, options?: { titleForDownload?: string }) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.visibility = "hidden";
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("title", options?.titleForDownload ?? "Document");
  document.body.appendChild(iframe);

  const cleanup = () => {
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  };

  const triggerPrint = () => {
    try {
      const win = iframe.contentWindow;
      if (!win) {
        cleanup();
        return;
      }
      const onAfter = () => {
        win.removeEventListener("afterprint", onAfter);
        setTimeout(cleanup, 200);
      };
      win.addEventListener("afterprint", onAfter);
      win.focus();
      win.print();
      // Safety net in case afterprint never fires (some browsers).
      setTimeout(cleanup, 60_000);
    } catch {
      cleanup();
    }
  };

  iframe.onload = triggerPrint;

  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(htmlDocument);
    doc.close();
    if (doc.readyState === "complete") {
      triggerPrint();
    }
  } else {
    cleanup();
  }
}
