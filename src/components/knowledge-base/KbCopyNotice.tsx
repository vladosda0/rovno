// The notice of a text loaded from an unofficial copy (docs-library slice 9,
// frame 5 B, approved by Vlad 10.11): amber, on the spot of the «Документ не
// действует» plaque, in the document window and above the text.
// Mockup: rovno-docs/audit/mockups/docs-library-s9.html («copyban»).

export function KbCopyNotice({ text }: { text: string }) {
  return (
    <p className="rounded-panel border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-body-sm text-foreground">
      {text}
    </p>
  );
}
