// Globals from Skosmos 3 that widget.js uses (type check only)
interface Window {
  SKOSMOS: { vocab: string };
  bibbiKatalogWidget: (data: { pageType: string; uri?: string; prefLabels?: unknown }) => void;
}
