/**
 * Guest marketing atmosphere — LayoutWrapper already mounts BrandAmbientBackground.
 * Kept as a no-op shell so existing `atmosphere` props stay valid without
 * painting a second, divergent wash over the app canvas.
 */
export function MarketingAtmosphere() {
  return null;
}
