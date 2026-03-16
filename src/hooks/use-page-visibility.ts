"use client";

import { useEffect, useState } from "react";

export function usePageVisibility(defaultVisible = true): boolean {
  const [isPageVisible, setIsPageVisible] = useState(defaultVisible);

  useEffect(() => {
    const updateVisibility = () => {
      setIsPageVisible(typeof document === "undefined" ? true : document.visibilityState === "visible");
    };

    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  return isPageVisible;
}

