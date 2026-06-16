/** City is required for registered users (map, geo ranking). GPS coords are optional. */

export function getPlayerCity(
  player: { city?: string | null; location?: { city?: string } | null } | null | undefined
): string {
  return (player?.city?.trim() || player?.location?.city?.trim() || '');
}

export function hasRequiredPlayerCity(
  player: { city?: string | null; location?: { city?: string } | null } | null | undefined
): boolean {
  return getPlayerCity(player).length > 0;
}
