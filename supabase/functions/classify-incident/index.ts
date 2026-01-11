import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Incident categories for logistics
const INCIDENT_CATEGORIES = [
  'DOCUMENTATION_ISSUE',
  'CUSTOMS_DELAY',
  'CARRIER_DELAY',
  'DAMAGE_LOSS',
  'ADDRESS_ISSUE',
  'WEATHER_DELAY',
  'PORT_CONGESTION',
  'PAYMENT_ISSUE',
  'CLIENT_REQUEST',
  'OTHER'
] as const;

const LIKELY_CAUSES = [
  'docs',      // Documentation issues
  'carrier',   // Carrier/shipping line issues
  'customs',   // Customs/clearance issues
  'client',    // Client-related issues
  'terminal',  // Terminal/port issues
  'weather',   // Weather/force majeure
  'other'      // Other causes
] as const;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, context } = await req.json();

    if (!text || typeof text !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Text is required for classification' }),
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

    const systemPrompt = `You are an expert logistics incident classifier for a freight forwarding company. 
Analyze the provided text and classify the incident.

Available categories: ${INCIDENT_CATEGORIES.join(', ')}

Severity levels:
- P1 (Critical): Shipment blocked, immediate action required, SLA breach imminent
- P2 (High): Significant delay or issue, needs attention within hours
- P3 (Medium): Minor issue, can be resolved in normal workflow

Likely causes: ${LIKELY_CAUSES.join(', ')}

Respond ONLY with a JSON object (no markdown, no explanation) containing:
{
  "category": "one of the categories",
  "severity": "P1" or "P2" or "P3",
  "likely_cause": "one of the likely causes",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation"
}`;

    const userPrompt = context 
      ? `Classify this logistics incident:\n\nText: "${text}"\n\nContext: ${context}`
      : `Classify this logistics incident:\n\nText: "${text}"`;

    console.log('Calling AI gateway for classification...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.error('AI rate limit exceeded');
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        console.error('AI payment required');
        return new Response(
          JSON.stringify({ error: 'AI service payment required.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to classify incident' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error('No content in AI response');
      return new Response(
        JSON.stringify({ error: 'No classification result' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('AI raw response:', content);

    // Parse the JSON response
    let classification;
    try {
      // Remove any markdown code blocks if present
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      classification = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError, content);
      // Return a default classification if parsing fails
      classification = {
        category: 'OTHER',
        severity: 'P3',
        likely_cause: 'other',
        confidence: 0.5,
        reasoning: 'Could not parse AI response'
      };
    }

    // Validate and sanitize the response
    const validatedClassification = {
      category: INCIDENT_CATEGORIES.includes(classification.category) 
        ? classification.category 
        : 'OTHER',
      severity: ['P1', 'P2', 'P3'].includes(classification.severity) 
        ? classification.severity 
        : 'P3',
      likely_cause: LIKELY_CAUSES.includes(classification.likely_cause) 
        ? classification.likely_cause 
        : 'other',
      confidence: typeof classification.confidence === 'number' 
        ? Math.min(1, Math.max(0, classification.confidence)) 
        : 0.5,
      reasoning: classification.reasoning || 'No reasoning provided'
    };

    console.log('Classification result:', validatedClassification);

    return new Response(
      JSON.stringify({ classification: validatedClassification }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in classify-incident:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
