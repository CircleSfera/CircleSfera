/**
 * Build a place sheet subtitle without repeating the place name
 * (e.g. title "Madrid" + "Madrid, Madrid, Spain" → "Spain").
 */
export function formatPlaceAreaParts(
  name: string,
  parts: Array<string | null | undefined>,
): string {
  const normalizedName = name.trim().toLocaleLowerCase();
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const part of parts) {
    const trimmed = part?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase();
    if (key === normalizedName) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }

  return unique.join(', ');
}

export function buildPlaceDetailSubtitle(input: {
  name: string;
  locality?: string | null;
  region?: string | null;
  country?: string | null;
  fullName?: string | null;
  postCount: number;
  postsLabel: string;
}): string {
  const fromParts = formatPlaceAreaParts(input.name, [
    input.locality,
    input.region,
    input.country,
  ]);

  if (fromParts) {
    return `${fromParts} · ${input.postsLabel}`;
  }

  // fullName often repeats the place name as the first segment.
  if (input.fullName?.trim()) {
    const segments = input.fullName.split(',').map((s) => s.trim());
    const cleaned = formatPlaceAreaParts(input.name, segments);
    if (cleaned) {
      return `${cleaned} · ${input.postsLabel}`;
    }
  }

  return input.postsLabel;
}
