"use client";

import { useEffect, useState } from "react";
import { pickTimeAwareGreeting } from "@/lib/library/home-header-line";

export function LibraryStatusLine() {
  const [text, setText] = useState("");

  useEffect(() => {
    setText(pickTimeAwareGreeting());
  }, []);

  return (
    <p className="mt-0.5 min-h-[1.125rem] text-[12px] font-normal leading-snug text-text-secondary">
      {text}
    </p>
  );
}
