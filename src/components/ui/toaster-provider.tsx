"use client";

import { Toaster } from "sonner";

export function ToasterProvider() {
  return (
    <Toaster
      richColors
      position="top-right"
      toastOptions={{
        style: {
          borderRadius: "18px",
          border: "1px solid rgba(22, 36, 51, 0.12)",
          background: "rgba(255,255,255,0.96)",
          color: "#162433",
        },
      }}
    />
  );
}
