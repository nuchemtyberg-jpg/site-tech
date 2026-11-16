/** Remove imported outline numbers for display without changing saved descriptions. */
export function coverTitle(title: string) {
  return title.replace(/^\s*\d+(?:\.\d+)*(?:[.)]\s+|\s*[-–—:]\s+)/, "").replace(/^\s*\d+(?:\.\d+)+\s+/, "");
}
