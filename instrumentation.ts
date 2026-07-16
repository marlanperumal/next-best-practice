// Server startup hook (stable in Next 15+): the place to register
// OpenTelemetry. Next then emits spans for rendering, fetches, and cache
// operations, plus any custom spans (see lib/auth.ts).
//
// Two modes, both opt-in so plain `pnpm dev` stays quiet:
//   OTEL_CONSOLE=1 pnpm dev            -> spans printed to the server console
//   OTEL_EXPORTER_OTLP_ENDPOINT=...    -> standard OTLP export (collector,
//                                         Jaeger, Grafana, Datadog, ...)
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (process.env.OTEL_CONSOLE === "1") {
    const { registerOTel } = await import("@vercel/otel");
    const { ConsoleSpanExporter } =
      await import("@opentelemetry/sdk-trace-base");
    registerOTel({
      serviceName: "next-best-practice",
      traceExporter: new ConsoleSpanExporter(),
    });
  } else if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    const { registerOTel } = await import("@vercel/otel");
    registerOTel({ serviceName: "next-best-practice" });
  }
}
