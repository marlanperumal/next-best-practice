"use client";

import { useReportWebVitals } from "next/web-vitals";

// Core Web Vitals (LCP, CLS, INP, TTFB, FCP) as the user actually
// experienced them. Logged in this demo; in production, beacon them to your
// analytics endpoint instead — sendBeacon survives page unload:
//   navigator.sendBeacon("/analytics", JSON.stringify(metric));
export function WebVitals() {
  useReportWebVitals((metric) => {
    console.debug(
      `[web-vitals] ${metric.name}: ${Math.round(metric.value * 100) / 100} (${metric.rating})`,
    );
  });
  return null;
}
