import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ShipmentData {
  shipment_ref: string;
  client_ref: string;
  current_status: string;
  client_name: string;
  shipping_line: string;
  bl_reference: string;
  created_at: string;
  last_event?: {
    status: string;
    note: string;
    event_datetime: string;
    location?: string;
  };
  open_exceptions: Array<{
    rule_name: string;
    severity: string;
    detected_at: string;
    status: string;
  }>;
  sla_info?: {
    current_status: string;
    entered_at: string;
    max_hours?: number;
    elapsed_hours?: number;
    breached?: boolean;
  };
}

interface Suggestion {
  recommended_status: string | null;
  recommended_action: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  action_type: 'status_change' | 'escalate' | 'request_docs' | 'inform_client' | 'investigate' | 'wait';
}

// Status flow definition
const STATUS_FLOW: Record<string, string[]> = {
  'RECEIVED': ['REGISTERED'],
  'REGISTERED': ['DOCS_VALIDATION', 'ON_HOLD_INCIDENT'],
  'DOCS_VALIDATION': ['PROCESSING', 'ON_HOLD_INCIDENT'],
  'PROCESSING': ['IN_TRANSIT', 'ON_HOLD_INCIDENT'],
  'IN_TRANSIT': ['AT_TERMINAL', 'ON_HOLD_INCIDENT'],
  'AT_TERMINAL': ['CLEARANCE', 'ON_HOLD_INCIDENT'],
  'CLEARANCE': ['OUT_FOR_DELIVERY', 'ON_HOLD_INCIDENT'],
  'OUT_FOR_DELIVERY': ['DELIVERED', 'ON_HOLD_INCIDENT'],
  'DELIVERED': [],
  'ON_HOLD_INCIDENT': ['RECEIVED', 'REGISTERED', 'DOCS_VALIDATION', 'PROCESSING', 'IN_TRANSIT', 'AT_TERMINAL', 'CLEARANCE', 'OUT_FOR_DELIVERY', 'CANCELLED'],
  'CANCELLED': [],
};

const STATUS_LABELS: Record<string, string> = {
  'RECEIVED': 'Received',
  'REGISTERED': 'Registered',
  'DOCS_VALIDATION': 'Documents Validation',
  'PROCESSING': 'Processing',
  'IN_TRANSIT': 'In Transit',
  'AT_TERMINAL': 'At Terminal',
  'CLEARANCE': 'Clearance',
  'OUT_FOR_DELIVERY': 'Out for Delivery',
  'DELIVERED': 'Delivered',
  'ON_HOLD_INCIDENT': 'On Hold (Incident)',
  'CANCELLED': 'Cancelled',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { shipment_data } = await req.json() as { shipment_data: ShipmentData };
    
    if (!shipment_data) {
      return new Response(
        JSON.stringify({ error: 'Missing shipment_data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate time in current status
    const now = new Date();
    let hoursInStatus = 0;
    if (shipment_data.sla_info?.entered_at) {
      const entered = new Date(shipment_data.sla_info.entered_at);
      hoursInStatus = Math.round((now.getTime() - entered.getTime()) / (1000 * 60 * 60));
    }

    // Build context for AI
    const context = `
You are an operations assistant for a logistics company. Analyze the shipment data and suggest the next best action.

SHIPMENT INFORMATION:
- Reference: ${shipment_data.shipment_ref}
- Client Reference: ${shipment_data.client_ref}
- Client: ${shipment_data.client_name}
- Current Status: ${STATUS_LABELS[shipment_data.current_status] || shipment_data.current_status}
- Shipping Line: ${shipment_data.shipping_line}
- BL Reference: ${shipment_data.bl_reference}
- Created: ${shipment_data.created_at}
- Hours in current status: ${hoursInStatus}

${shipment_data.last_event ? `
LAST EVENT:
- Status: ${STATUS_LABELS[shipment_data.last_event.status] || shipment_data.last_event.status}
- Note: ${shipment_data.last_event.note}
- Date: ${shipment_data.last_event.event_datetime}
${shipment_data.last_event.location ? `- Location: ${shipment_data.last_event.location}` : ''}
` : 'No tracking events yet.'}

${shipment_data.open_exceptions.length > 0 ? `
OPEN EXCEPTIONS:
${shipment_data.open_exceptions.map(e => 
  `- ${e.rule_name} (Severity: ${e.severity}, Status: ${e.status}, Detected: ${e.detected_at})`
).join('\n')}
` : 'No open exceptions.'}

${shipment_data.sla_info ? `
SLA INFORMATION:
- Current SLA Status: ${shipment_data.sla_info.current_status}
- Entered at: ${shipment_data.sla_info.entered_at}
${shipment_data.sla_info.max_hours ? `- Max hours allowed: ${shipment_data.sla_info.max_hours}` : ''}
${shipment_data.sla_info.elapsed_hours !== undefined ? `- Elapsed hours: ${shipment_data.sla_info.elapsed_hours}` : ''}
${shipment_data.sla_info.breached ? '⚠️ SLA BREACHED!' : ''}
` : 'No SLA configuration.'}

POSSIBLE NEXT STATUSES: ${STATUS_FLOW[shipment_data.current_status]?.map(s => STATUS_LABELS[s]).join(', ') || 'None (terminal status)'}

Based on this information, provide ONE clear next action recommendation. Consider:
1. If there are open P1/P2 exceptions, prioritize resolving them
2. If SLA is breached or near breach, suggest escalation or expedited action
3. If stuck in a status too long, suggest investigation
4. If everything is normal, suggest the logical next status transition
5. Consider if documents need to be requested or client needs to be informed
`;

    console.log('Calling Lovable AI for suggestion...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: context },
          { role: 'user', content: 'Provide the next best action for this shipment.' }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'suggest_next_action',
              description: 'Provide a structured suggestion for the next operational action on this shipment.',
              parameters: {
                type: 'object',
                properties: {
                  recommended_status: {
                    type: 'string',
                    description: 'The recommended next status code (e.g., REGISTERED, DOCS_VALIDATION). Use null if no status change is recommended.',
                    enum: ['RECEIVED', 'REGISTERED', 'DOCS_VALIDATION', 'PROCESSING', 'IN_TRANSIT', 'AT_TERMINAL', 'CLEARANCE', 'OUT_FOR_DELIVERY', 'DELIVERED', 'ON_HOLD_INCIDENT', 'CANCELLED', null]
                  },
                  recommended_action: {
                    type: 'string',
                    description: 'A clear, actionable recommendation in 1-2 sentences. Be specific about what the operator should do.'
                  },
                  reason: {
                    type: 'string',
                    description: 'Explanation for why this action is recommended, citing specific data points from the shipment information.'
                  },
                  priority: {
                    type: 'string',
                    enum: ['high', 'medium', 'low'],
                    description: 'Priority level based on exceptions, SLA status, and urgency.'
                  },
                  action_type: {
                    type: 'string',
                    enum: ['status_change', 'escalate', 'request_docs', 'inform_client', 'investigate', 'wait'],
                    description: 'Category of the recommended action.'
                  }
                },
                required: ['recommended_action', 'reason', 'priority', 'action_type'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'suggest_next_action' } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add funds.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log('AI Response:', JSON.stringify(data, null, 2));

    // Extract tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error('No suggestion returned from AI');
    }

    const suggestion: Suggestion = JSON.parse(toolCall.function.arguments);
    
    console.log('Suggestion:', JSON.stringify(suggestion, null, 2));

    return new Response(
      JSON.stringify({ 
        suggestion,
        generated_at: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in suggest-next-action:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});