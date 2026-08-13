"use client";

import { ViewTransition } from "react";
import type { ReactNode } from "react";

export function recipeCoverName(id: string) {
  return `recipe-cover-${id}`;
}

export function NavTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition
      enter={{
        "nav-forward": "nav-forward",
        "nav-back": "nav-back",
        default: "none",
      }}
      exit={{
        "nav-forward": "nav-forward",
        "nav-back": "nav-back",
        default: "none",
      }}
      default="none"
    >
      {children}
    </ViewTransition>
  );
}
