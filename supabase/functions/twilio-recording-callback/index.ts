// Twilio hits this URL when a call recording becomes available.
// We store the recording URL back on the communications row via CallSid match.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

Deno.serve(async (req) => {
  try {
    const text = await req.text();
    const params = new URLSearchParams(text);

    const callSid        = params.get("CallSid") ?? "";
    const recordingSid   = params.get("RecordingSid") ?? "";
    const recordingUrl   = params.get("RecordingUrl") ?? "";
    const recordingStatus = params.get("RecordingStatus") ?? "";
    const durationStr    = params.get("RecordingDuration") ?? "";

    // Only process completed recordings
    if (recordingStatus !== "completed" || !recordingSid) {
      return new Response("ok", { status: 200 });
    }

    // Build the full MP3 URL (Twilio appends .mp3)
    const fullUrl = recordingUrl
      ? `${recordingUrl}.mp3`
      : `https://api.twilio.com/2010-04-01/Accounts/${Deno.env.get("TWILIO_ACCOUNT_SID")}/Recordings/${recordingSid}.mp3`;

    const duration = durationStr ? parseInt(durationStr, 10) : null;

    // Find the communication row by CallSid (twilio_sid)
    const { data: rows } = await supabase
      .from("communications")
      .select("id, duration_seconds")
      .eq("twilio_sid", callSid)
      .limit(1);

    if (rows && rows.length > 0) {
      const row = rows[0] as { id: string; duration_seconds: number | null };
      await supabase
        .from("communications")
        .update({
          recording_url: fullUrl,
          status: "completed",
          duration_seconds: duration ?? row.duration_seconds,
        })
        .eq("id", row.id);

      console.log(`[twilio-recording-callback] ✅ Recording saved for CallSid=${callSid} → ${fullUrl}`);
    } else {
      console.warn(`[twilio-recording-callback] No communication row found for CallSid=${callSid}`);
    }

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("twilio-recording-callback error:", err);
    return new Response("error", { status: 500 });
  }
});
