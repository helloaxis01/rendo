"use client";

import { useEffect } from "react";
import { listenForIncomingShares } from "@/lib/native/incoming-share";

export function IncomingShareListener() {
  useEffect(() => listenForIncomingShares(), []);
  return null;
}
