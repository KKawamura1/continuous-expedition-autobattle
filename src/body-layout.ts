/** One camera translation for terrain, creature, enemies and combat feedback. */
export function battleHead(height: number, speed: number): number {
  return height * .60 + (speed < 0 ? Math.min(15, -speed * 4) : 0);
}
export function bodyOffset(height: number): number { return -height * .38; }
export function bodyHead(height: number, speed: number): number {
  return battleHead(height, speed) + bodyOffset(height);
}
/** Surface markers stay on visible sections of the long neck, back and skin. Art stays at 1×. */
export function bodySurfaceY(height: number, y: number): number {
  return y <= 10 ? y : y * Math.min(1, height / 1000);
}
