import { Suspense } from "react";
import { SettingsScreen } from "@/components/settings/settings-screen";

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-dvh max-w-3xl items-center justify-center text-sm text-text-secondary">
          Loading settings…
        </div>
      }
    >
      <SettingsScreen />
    </Suspense>
  );
}
