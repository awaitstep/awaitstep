/** Apple platforms use ⌘ as the primary modifier; everything else uses Ctrl. */
export function isMacPlatform(
  platform: string = typeof navigator === 'undefined' ? '' : navigator.platform,
): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform)
}
