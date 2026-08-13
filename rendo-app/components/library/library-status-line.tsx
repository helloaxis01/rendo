"use client";

function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function libraryStatusText(
  cookedThisWeek: number,
  now = new Date()
): string {
  if (cookedThisWeek > 0) {
    return `${cookedThisWeek} cooked this week`;
  }
  return greetingForHour(now.getHours());
}

export function LibraryStatusLine({
  cookedThisWeek,
}: {
  cookedThisWeek: number;
}) {
  return (
    <p className="mt-0.5 text-[12px] font-normal leading-snug text-text-secondary">
      {libraryStatusText(cookedThisWeek)}
    </p>
  );
}
