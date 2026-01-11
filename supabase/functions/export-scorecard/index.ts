import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@2.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STATUS_LABELS: Record<string, string> = {
  RECEIVED: 'Received',
  REGISTERED: 'Registered',
  DOCS_VALIDATION: 'Docs Validation',
  PROCESSING: 'Processing',
  IN_TRANSIT: 'In Transit',
  AT_TERMINAL: 'At Terminal',
  CLEARANCE: 'Clearance',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  ON_HOLD_INCIDENT: 'On Hold - Incident',
  CANCELLED: 'Cancelled',
};

function getMonthName(month: number): string {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return months[month - 1] || '';
}

function formatHours(hours: number): string {
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = Math.round(hours % 24);
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}`;
  }
  return `${Math.round(hours)}h`;
}

function getComplianceColor(rate: number): string {
  if (rate >= 90) return '#16a34a';
  if (rate >= 70) return '#f59e0b';
  return '#dc2626';
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'P1': return '#dc2626';
    case 'P2': return '#f59e0b';
    case 'P3': return '#3b82f6';
    default: return '#6b7280';
  }
}

interface Scorecard {
  id: string;
  client_id: string;
  period_year: number;
  period_month: number;
  total_shipments: number;
  delivered_shipments: number;
  on_time_delivery_rate: number;
  sla_compliance_rate: number;
  total_incidents: number;
  avg_transit_hours: number;
  exceptions_p1: number;
  exceptions_p2: number;
  exceptions_p3: number;
  status_breakdown: Record<string, number>;
  top_issues: { issue: string; count: number; severity: string }[];
  trend_data: { month: string; shipments: number; onTime: number; compliance: number }[];
  generated_at: string;
  clients?: { name: string; notification_emails?: string[] };
}

function generateScorecardHtml(scorecard: Scorecard, clientName: string): string {
  const periodLabel = `${getMonthName(scorecard.period_month)} ${scorecard.period_year}`;
  const complianceColor = getComplianceColor(scorecard.sla_compliance_rate);
  const onTimeColor = getComplianceColor(scorecard.on_time_delivery_rate);
  
  // Status breakdown rows
  const statusRows = Object.entries(scorecard.status_breakdown || {})
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${STATUS_LABELS[status] || status}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600;">${count}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #6b7280;">
          ${scorecard.total_shipments > 0 ? Math.round((count / scorecard.total_shipments) * 100) : 0}%
        </td>
      </tr>
    `).join('');

  // Top issues rows
  const issueRows = (scorecard.top_issues || []).map(issue => `
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">
        <span style="display: inline-block; padding: 2px 8px; background: ${getSeverityColor(issue.severity)}20; color: ${getSeverityColor(issue.severity)}; border-radius: 4px; font-size: 11px; font-weight: 600; margin-right: 8px;">${issue.severity}</span>
        ${issue.issue}
      </td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600;">${issue.count}</td>
    </tr>
  `).join('') || '<tr><td colspan="2" style="padding: 16px; text-align: center; color: #22c55e;">✅ No issues this period!</td></tr>';

  // Trend chart using simple HTML bars
  const maxShipments = Math.max(...(scorecard.trend_data || []).map(t => t.shipments), 1);
  const trendBars = (scorecard.trend_data || []).map(t => `
    <div style="flex: 1; text-align: center; padding: 0 4px;">
      <div style="height: 80px; display: flex; flex-direction: column; justify-content: flex-end; align-items: center;">
        <div style="width: 100%; max-width: 40px; background: linear-gradient(180deg, #3b82f6, #1e40af); border-radius: 4px 4px 0 0; height: ${Math.max((t.shipments / maxShipments) * 100, 5)}%;"></div>
      </div>
      <div style="font-size: 11px; color: #6b7280; margin-top: 4px;">${t.month.split(' ')[0]}</div>
      <div style="font-size: 12px; font-weight: 600; color: #374151;">${t.shipments}</div>
      <div style="font-size: 10px; color: ${getComplianceColor(t.compliance)};">${t.compliance}%</div>
    </div>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Performance Scorecard - ${clientName}</title>
        <style>
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f3f4f6;">
        <div style="max-width: 800px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #1e40af 0%, #7c3aed 100%); padding: 32px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">📊 Performance Scorecard</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 12px 0 0 0; font-size: 20px; font-weight: 600;">${clientName}</p>
            <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0 0; font-size: 16px;">${periodLabel}</p>
          </div>

          <!-- Key Metrics -->
          <div style="padding: 24px;">
            <h2 style="color: #374151; font-size: 18px; margin: 0 0 16px 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
              📈 Key Performance Indicators
            </h2>
            
            <table style="width: 100%; border-collapse: separate; border-spacing: 8px;">
              <tr>
                <td style="background: #eff6ff; border-radius: 8px; padding: 16px; text-align: center; width: 16.66%;">
                  <div style="font-size: 32px; font-weight: bold; color: #1e40af;">${scorecard.total_shipments}</div>
                  <div style="font-size: 12px; color: #3b82f6; margin-top: 4px;">Total Shipments</div>
                </td>
                <td style="background: #f0fdf4; border-radius: 8px; padding: 16px; text-align: center; width: 16.66%;">
                  <div style="font-size: 32px; font-weight: bold; color: #16a34a;">${scorecard.delivered_shipments}</div>
                  <div style="font-size: 12px; color: #22c55e; margin-top: 4px;">Delivered</div>
                </td>
                <td style="background: ${scorecard.on_time_delivery_rate >= 90 ? '#f0fdf4' : scorecard.on_time_delivery_rate >= 70 ? '#fffbeb' : '#fef2f2'}; border-radius: 8px; padding: 16px; text-align: center; width: 16.66%;">
                  <div style="font-size: 32px; font-weight: bold; color: ${onTimeColor};">${scorecard.on_time_delivery_rate}%</div>
                  <div style="font-size: 12px; color: ${onTimeColor}; margin-top: 4px;">On-Time Rate</div>
                </td>
                <td style="background: ${scorecard.sla_compliance_rate >= 90 ? '#f0fdf4' : scorecard.sla_compliance_rate >= 70 ? '#fffbeb' : '#fef2f2'}; border-radius: 8px; padding: 16px; text-align: center; width: 16.66%;">
                  <div style="font-size: 32px; font-weight: bold; color: ${complianceColor};">${scorecard.sla_compliance_rate}%</div>
                  <div style="font-size: 12px; color: ${complianceColor}; margin-top: 4px;">SLA Compliance</div>
                </td>
                <td style="background: #faf5ff; border-radius: 8px; padding: 16px; text-align: center; width: 16.66%;">
                  <div style="font-size: 32px; font-weight: bold; color: #7c3aed;">${formatHours(scorecard.avg_transit_hours)}</div>
                  <div style="font-size: 12px; color: #8b5cf6; margin-top: 4px;">Avg Transit</div>
                </td>
                <td style="background: ${scorecard.total_incidents > 0 ? '#fef2f2' : '#f0fdf4'}; border-radius: 8px; padding: 16px; text-align: center; width: 16.66%;">
                  <div style="font-size: 32px; font-weight: bold; color: ${scorecard.total_incidents > 0 ? '#dc2626' : '#16a34a'};">${scorecard.total_incidents}</div>
                  <div style="font-size: 12px; color: ${scorecard.total_incidents > 0 ? '#ef4444' : '#22c55e'}; margin-top: 4px;">Incidents</div>
                </td>
              </tr>
            </table>
          </div>

          <!-- Exception Breakdown -->
          <div style="padding: 0 24px 24px 24px;">
            <h2 style="color: #374151; font-size: 18px; margin: 0 0 16px 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
              ⚠️ Exception Summary
            </h2>
            
            <div style="display: flex; gap: 12px;">
              <div style="flex: 1; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; text-align: center;">
                <div style="font-size: 28px; font-weight: bold; color: #dc2626;">${scorecard.exceptions_p1}</div>
                <div style="font-size: 12px; color: #991b1b;">P1 Critical</div>
              </div>
              <div style="flex: 1; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; text-align: center;">
                <div style="font-size: 28px; font-weight: bold; color: #f59e0b;">${scorecard.exceptions_p2}</div>
                <div style="font-size: 12px; color: #92400e;">P2 High</div>
              </div>
              <div style="flex: 1; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; text-align: center;">
                <div style="font-size: 28px; font-weight: bold; color: #3b82f6;">${scorecard.exceptions_p3}</div>
                <div style="font-size: 12px; color: #1e40af;">P3 Medium</div>
              </div>
            </div>
          </div>

          <!-- 6-Month Trend -->
          <div style="padding: 0 24px 24px 24px;">
            <h2 style="color: #374151; font-size: 18px; margin: 0 0 16px 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
              📊 6-Month Trend
            </h2>
            
            <div style="display: flex; align-items: flex-end; background: #f9fafb; border-radius: 8px; padding: 16px;">
              ${trendBars}
            </div>
            <div style="text-align: center; margin-top: 8px; font-size: 11px; color: #6b7280;">
              Shipment Volume & SLA Compliance %
            </div>
          </div>

          <!-- Status Breakdown -->
          <div style="padding: 0 24px 24px 24px;">
            <h2 style="color: #374151; font-size: 18px; margin: 0 0 16px 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
              📋 Status Breakdown
            </h2>
            
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <thead>
                <tr style="background: #f9fafb;">
                  <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Status</th>
                  <th style="padding: 10px 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Count</th>
                  <th style="padding: 10px 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">%</th>
                </tr>
              </thead>
              <tbody>
                ${statusRows || '<tr><td colspan="3" style="padding: 16px; text-align: center; color: #6b7280;">No shipments this period</td></tr>'}
              </tbody>
            </table>
          </div>

          <!-- Top Issues -->
          <div style="padding: 0 24px 24px 24px;">
            <h2 style="color: #374151; font-size: 18px; margin: 0 0 16px 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
              🔍 Top Issues
            </h2>
            
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <thead>
                <tr style="background: #f9fafb;">
                  <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Issue</th>
                  <th style="padding: 10px 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Occurrences</th>
                </tr>
              </thead>
              <tbody>
                ${issueRows}
              </tbody>
            </table>
          </div>

          <!-- Footer -->
          <div style="background: #f9fafb; padding: 20px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0; color: #6b7280; font-size: 13px;">
              Generated on ${new Date(scorecard.generated_at).toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
            <p style="margin: 8px 0 0 0; color: #9ca3af; font-size: 12px;">
              DHL Express Customs Tracking System
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user
    const supabaseClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is internal
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!roleData || !['MANAGER', 'SUPERVISOR', 'TECHNICIAN'].includes(roleData.role)) {
      return new Response(
        JSON.stringify({ error: 'Only internal users can export scorecards' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { scorecardId, exportType, recipientEmails } = await req.json();
    
    if (!scorecardId || !exportType) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: scorecardId, exportType' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[export-scorecard] Exporting scorecard ${scorecardId} as ${exportType}`);

    // Fetch scorecard with client info
    const { data: scorecard, error: scorecardError } = await supabase
      .from('client_scorecards')
      .select(`
        *,
        clients:client_id(name, notification_emails)
      `)
      .eq('id', scorecardId)
      .single();

    if (scorecardError || !scorecard) {
      return new Response(
        JSON.stringify({ error: 'Scorecard not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const clientName = (scorecard.clients as any)?.name || 'Unknown Client';
    const html = generateScorecardHtml(scorecard as Scorecard, clientName);

    if (exportType === 'PDF') {
      // Record export
      await supabase.from('scorecard_exports').insert({
        scorecard_id: scorecardId,
        export_type: 'PDF',
        exported_by: user.id,
      });

      // Audit log
      await supabase.from('audit_log').insert({
        entity_type: 'client_scorecard',
        entity_id: scorecardId,
        action: 'SCORECARD_EXPORTED_PDF',
        actor_user_id: user.id,
        metadata_json: {
          client_name: clientName,
          period: `${scorecard.period_year}-${scorecard.period_month}`,
        },
      });

      return new Response(
        JSON.stringify({ success: true, html }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (exportType === 'EMAIL') {
      const resendApiKey = Deno.env.get('RESEND_API_KEY');
      if (!resendApiKey) {
        return new Response(
          JSON.stringify({ error: 'Email service not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const resend = new Resend(resendApiKey);
      
      // Use provided emails or client's notification emails
      const emails = recipientEmails && recipientEmails.length > 0 
        ? recipientEmails 
        : (scorecard.clients as any)?.notification_emails || [];

      if (emails.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No recipient emails provided or configured for this client' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const periodLabel = `${getMonthName(scorecard.period_month)} ${scorecard.period_year}`;

      console.log(`[export-scorecard] Sending email to ${emails.length} recipients`);

      const emailResponse = await resend.emails.send({
        from: 'Performance Reports <onboarding@resend.dev>',
        to: emails,
        subject: `📊 ${clientName} - Performance Scorecard for ${periodLabel}`,
        html,
      });

      // Record export
      await supabase.from('scorecard_exports').insert({
        scorecard_id: scorecardId,
        export_type: 'EMAIL',
        exported_by: user.id,
        recipient_emails: emails,
      });

      // Audit log
      await supabase.from('audit_log').insert({
        entity_type: 'client_scorecard',
        entity_id: scorecardId,
        action: 'SCORECARD_EMAILED',
        actor_user_id: user.id,
        metadata_json: {
          client_name: clientName,
          period: `${scorecard.period_year}-${scorecard.period_month}`,
          recipient_count: emails.length,
          email_id: emailResponse.data?.id,
        },
      });

      console.log('[export-scorecard] Email sent successfully:', emailResponse.data?.id);

      return new Response(
        JSON.stringify({ 
          success: true, 
          emailId: emailResponse.data?.id,
          recipientCount: emails.length,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid export type. Use PDF or EMAIL' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[export-scorecard] Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
