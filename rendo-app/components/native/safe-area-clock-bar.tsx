/** Solid strip under the iOS clock so time never sits on a recipe photo. */
export function SafeAreaClockBar() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[env(safe-area-inset-top)] bg-bg-primary print:hidden"
    />
  );
}
