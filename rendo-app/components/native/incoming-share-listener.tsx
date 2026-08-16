"use client";

import { useEffect } from "react";
import {
  installShareBridge,
  listenForIncomingShares,
} from "@/lib/native/incoming-share";

export function IncomingShareListener() {
  useEffect(() => {
    installShareBridge();
    return listenForIncomingShares();
  }, []);
  return null;
}
