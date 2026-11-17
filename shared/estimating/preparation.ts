export interface PreparedSheet {
  page: number; title: string; sheetNumber: string; scaleText: string[];
  vector: boolean; width: number; height: number;
  textPath: string; vectorsPath: string; thumbnailPath: string;
}
export interface PreparationManifest {
  pageCount: number;
  pages: PreparedSheet[];
  sha256: string;
  peakRssMiB: number;
}
