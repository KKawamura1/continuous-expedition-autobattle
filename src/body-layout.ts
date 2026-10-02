/** Canvas and HTML hotspots use one anatomical coordinate system (390 logical pixels). */
export function bodyPose(height: number, detail: boolean): { head: number; scale: number } {
  return { head: height * (detail ? .16 : .22), scale: Math.min(detail ? .30 : .62, (height * (detail ? .31 : .72) - 45) / 940) };
}
