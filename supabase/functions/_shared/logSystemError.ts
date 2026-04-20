import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function logSystemError({
  supabaseUrl,
  serviceRoleKey,
  error,
  context = {},
}: {
  supabaseUrl: string;
  serviceRoleKey: string;
  error: any;
  context?: any;
}) {
  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const fingerprint = `${context.function_name || "unknown"}-${error?.message || "unknown"}`;

    await supabase.from("system_errors").insert({
      severity: context.severity || "error",
      category: context.category || "unknown",
      service_name: context.service_name || "edge_function",
      function_name: context.function_name || "unknown",
      source_type: context.source_type || "edge_function",

      order_id: context.order_id || null,
      confirmation_id: context.confirmation_id || null,

      external_system: context.external_system || null,

      error_message: error?.message || "Unknown error",
      error_details: {
        stack: error?.stack || null,
      },

      fingerprint,
    });
  } catch (loggingError) {
    console.error("Failed to log system error:", loggingError);
  }
}