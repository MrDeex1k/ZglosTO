export function imageTransitionDuration(reduceMotionEnabled: boolean): number {
  return reduceMotionEnabled ? 0 : 150;
}
