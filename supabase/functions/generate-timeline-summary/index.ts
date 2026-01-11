import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SummaryRequest {
  shipment_id: string;
  mode: "internal" | "customer";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { shipment_id, mode }: SummaryRequest = await req.json();
    console.log(`Generating ${mode} summary for shipment:`, shipment_id);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch shipment data
    const { data: shipment, error: shipmentError } = await supabase
      .from("shipments")
      .select(`
        *,
        client:clients(name)
      `)
      .eq("id", shipment_id)
      .single();

    if (shipmentError || !shipment) {
      console.error("Error fetching shipment:", shipmentError);
      throw new Error("Shipment not found");
    }

    // Fetch tracking events
    const trackingQuery = supabase
      .from("tracking_events")
      .select("*")
      .eq("shipment_id", shipment_id)
      .order("event_datetime", { ascending: true });

    // For customer mode, only show visible events
    if (mode === "customer") {
      trackingQuery.eq("visible_to_client", true);
    }

    const { data: trackingEvents, error: eventsError } = await trackingQuery;
    if (eventsError) {
      console.error("Error fetching events:", eventsError);
    }

    // Fetch exceptions (only for internal mode)
    let exceptions = [];
    if (mode === "internal") {
      const { data: exceptionsData, error: exceptionsError } = await supabase
        .from("shipment_exceptions")
        .select(`
          *,
          exception_rule:exception_rules(name, description)
        `)
        .eq("shipment_id", shipment_id)
        .order("detected_at", { ascending: true });

      if (exceptionsError) {
        console.error("Error fetching exceptions:", exceptionsError);
      } else {
        exceptions = exceptionsData || [];
      }
    }

    // Fetch SLA breaches
    const { data: slaRecords, error: slaError } = await supabase
      .from("shipment_sla")
      .select(`
        *,
        sla_config:sla_config(max_hours)
      `)
      .eq("shipment_id", shipment_id)
      .order("entered_at", { ascending: true });

    if (slaError) {
      console.error("Error fetching SLA records:", slaError);
    }

    const slaBreaches = slaRecords?.filter((s) => s.breached === true) || [];

    // Build context for AI
    const shipmentContext = {
      reference: shipment.shipment_ref,
      clientRef: shipment.client_ref,
      client: shipment.client?.name,
      status: shipment.current_status,
      shippingLine: shipment.shipping_line,
      blReference: shipment.bl_reference,
      createdAt: shipment.created_at,
      forecastTerminal: shipment.forecast_terminal,
      forecastShippingLine: shipment.forecast_shipping_line,
      dischargeDate: shipment.discharge_date,
    };

    const eventsContext = (trackingEvents || []).map((e) => ({
      status: e.status,
      datetime: e.event_datetime,
      location: e.location,
      note: e.note,
      visibleToClient: e.visible_to_client,
    }));

    const exceptionsContext = exceptions.map((e: any) => ({
      severity: e.severity,
      status: e.status,
      ruleName: e.exception_rule?.name,
      description: e.exception_rule?.description,
      detectedAt: e.detected_at,
      resolvedAt: e.resolved_at,
      resolutionNote: e.resolution_note,
    }));

    const slaContext = slaBreaches.map((s: any) => ({
      status: s.shipment_status,
      maxHours: s.sla_config?.max_hours,
      elapsedHours: s.elapsed_hours,
      enteredAt: s.entered_at,
      exitedAt: s.exited_at,
    }));

    // Build system prompt based on mode
    const systemPrompt = mode === "internal"
      ? `You are a logistics operations assistant generating internal shipment timeline summaries for DHL staff.
Your summaries should be concise yet comprehensive, covering:
1. What happened - key events in the shipment journey
2. Current status - where things stand now
3. Delays or incidents - any exceptions, SLA breaches, or issues
4. Next steps - what is expected to happen next

Include all relevant details including internal statuses and exception information.
Be factual and precise. Never invent data. If information is uncertain or missing, explicitly state that.
Keep the summary under 200 words.`
      : `You are a customer service assistant generating shipment tracking summaries for customers.
Your summaries should be friendly, clear, and reassuring, covering:
1. Current status - where their shipment is now
2. Journey so far - key milestones completed
3. Next steps - what the customer should expect

Do NOT include internal operational details, exception codes, or SLA metrics.
Use customer-friendly language. Be helpful and professional.
If there are delays, acknowledge them briefly without excessive detail.
Keep the summary under 150 words.`;

    const userPrompt = `Generate a ${mode} summary for this shipment:

SHIPMENT DATA:
${JSON.stringify(shipmentContext, null, 2)}

TRACKING EVENTS (${eventsContext.length} events, oldest to newest):
${JSON.stringify(eventsContext, null, 2)}

${mode === "internal" ? `EXCEPTIONS (${exceptionsContext.length}):
${JSON.stringify(exceptionsContext, null, 2)}

SLA BREACHES (${slaContext.length}):
${JSON.stringify(slaContext, null, 2)}` : ""}

Provide a clear, concise summary. Do not include any JSON formatting - just plain text.`;

    // Call Lovable AI
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const summary = aiResponse.choices?.[0]?.message?.content || "Unable to generate summary.";

    console.log(`Generated ${mode} summary successfully`);

    // Log to audit log (only for internal summaries to reduce noise)
    if (mode === "internal") {
      const authHeader = req.headers.get("authorization");
      let userId = null;
      
      if (authHeader) {
        const token = authHeader.replace("Bearer ", "");
        const { data: { user } } = await supabase.auth.getUser(token);
        userId = user?.id;
      }

      await supabase.from("audit_log").insert({
        entity_type: "shipment",
        entity_id: shipment_id,
        action: "AI_SUMMARY_GENERATED",
        actor_user_id: userId,
        metadata_json: {
          mode,
          shipment_ref: shipment.shipment_ref,
          events_count: eventsContext.length,
          exceptions_count: exceptionsContext.length,
          sla_breaches_count: slaContext.length,
        },
      });
    }

    return new Response(
      JSON.stringify({
        summary,
        mode,
        generated_at: new Date().toISOString(),
        data_points: {
          events_count: eventsContext.length,
          exceptions_count: exceptionsContext.length,
          sla_breaches_count: slaContext.length,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in generate-timeline-summary:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
