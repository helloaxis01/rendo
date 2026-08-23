import type { Metadata } from "next";
import { Suspense } from "react";
import { ShoppingScreen } from "@/components/shopping/shopping-screen";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function ShoppingPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-dvh max-w-3xl items-center justify-center text-sm text-text-secondary">
          Loading list…
        </div>
      }
    >
      <ShoppingScreen />
    </Suspense>
  );
}
