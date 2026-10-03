import React from "react";
import WetPaintButton from "@/components/ui/wet-paint-button";

export default function DemoOne() {
  return (
    <div className="flex min-h-[200px] w-full items-center justify-center p-8 bg-gradient-to-r from-sky-50 to-emerald-50">
      <WetPaintButton variant="white-blue">
        Get Started
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="19" x2="12" y2="5"></line>
          <polyline points="5 12 12 5 19 12"></polyline>
        </svg>
      </WetPaintButton>
    </div>
  );
}
