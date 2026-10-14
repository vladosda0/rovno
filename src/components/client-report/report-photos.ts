/**
 * Photos under `node` that ClientReportView shows through its CORS request
 * (`data-report-photo="cors"`) and that have loaded: the ones a canvas may read.
 */
export function countCanvasReadablePhotos(node: HTMLElement): number {
  return Array.from(node.querySelectorAll<HTMLImageElement>('[data-report-photo="cors"] img'))
    .filter((image) => image.complete && image.naturalWidth > 0)
    .length;
}
