import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@2.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BranchMetrics {
  branchId: string;
  branchName: string;
  branchCode: string;
  countryName: string;
  totalShipments: number;
  deliveredShipments: number;
  inProgressShipments: number;
  cancelledShipments: number;
  deliveryRate: number;
  slaCompliance: number;
  totalBreaches: number;
  activeExceptions: number;
  avgTransitHours: number;
  incomingTransfers: number;
  outgoingTransfers: number;
  topClients: { name: string; shipments: number }[];
  statusBreakdown: { status: string; count: number }[];
}

interface ManagerRecipient {
  email: string;
  name: string;
  branchIds: string[];
}

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

const STATUS_COLORS: Record<string, string> = {
  RECEIVED: '#6366f1',
  REGISTERED: '#8b5cf6',
  DOCS_VALIDATION: '#a855f7',
  PROCESSING: '#3b82f6',
  IN_TRANSIT: '#06b6d4',
  AT_TERMINAL: '#14b8a6',
  CLEARANCE: '#f59e0b',
  OUT_FOR_DELIVERY: '#84cc16',
  DELIVERED: '#22c55e',
  ON_HOLD_INCIDENT: '#ef4444',
  CANCELLED: '#6b7280',
};

function formatHours(hours: number): string {
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = Math.round(hours % 24);
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }
  if (hours >= 1) {
    return `${Math.round(hours)}h`;
  }
  return `${Math.round(hours * 60)}m`;
}

function getPerformanceColor(percent: number): string {
  if (percent >= 90) return '#16a34a';
  if (percent >= 70) return '#f59e0b';
  return '#dc2626';
}

function getPerformanceEmoji(percent: number): string {
  if (percent >= 90) return '🟢';
  if (percent >= 70) return '🟡';
  return '🔴';
}

async function calculateBranchMetrics(
  supabase: any,
  branchId: string,
  weekAgoISO: string
): Promise<BranchMetrics | null> {
  console.log(`[weekly-branch-performance] Calculating metrics for branch ${branchId}`);

  // Fetch branch info
  const { data: branch, error: branchError } = await supabase
    .from('branches')
    .select('id, name, code, country:countries(name)')
    .eq('id', branchId)
    .single();

  if (branchError || !branch) {
    console.error(`[weekly-branch-performance] Error fetching branch ${branchId}:`, branchError);
    return null;
  }

  // Fetch shipments for this branch in the last week
  const { data: shipments, error: shipmentsError } = await supabase
    .from('shipments')
    .select('id, current_status, created_at, client:clients(name)')
    .eq('branch_id', branchId)
    .gte('created_at', weekAgoISO);

  if (shipmentsError) {
    console.error(`[weekly-branch-performance] Error fetching shipments:`, shipmentsError);
    return null;
  }

  const allShipments = shipments || [];
  const totalShipments = allShipments.length;
  const deliveredShipments = allShipments.filter((s: any) => s.current_status === 'DELIVERED').length;
  const cancelledShipments = allShipments.filter((s: any) => s.current_status === 'CANCELLED').length;
  const inProgressShipments = totalShipments - deliveredShipments - cancelledShipments;

  // Status breakdown
  const statusCounts: Record<string, number> = {};
  allShipments.forEach((s: any) => {
    statusCounts[s.current_status] = (statusCounts[s.current_status] || 0) + 1;
  });
  const statusBreakdown = Object.entries(statusCounts)
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  // Top clients
  const clientCounts: Record<string, number> = {};
  allShipments.forEach((s: any) => {
    const clientName = s.client?.name || 'Unknown';
    clientCounts[clientName] = (clientCounts[clientName] || 0) + 1;
  });
  const topClients = Object.entries(clientCounts)
    .map(([name, shipments]) => ({ name, shipments }))
    .sort((a, b) => b.shipments - a.shipments)
    .slice(0, 5);

  // Fetch SLA records for this branch
  const shipmentIds = allShipments.map((s: any) => s.id);
  let slaCompliance = 100;
  let totalBreaches = 0;
  let avgTransitHours = 0;

  if (shipmentIds.length > 0) {
    const { data: slaRecords, error: slaError } = await supabase
      .from('shipment_sla')
      .select('breached, elapsed_hours')
      .in('shipment_id', shipmentIds)
      .not('exited_at', 'is', null);

    if (!slaError && slaRecords) {
      const totalRecords = slaRecords.length;
      totalBreaches = slaRecords.filter((r: any) => r.breached === true).length;
      slaCompliance = totalRecords > 0 
        ? Math.round(((totalRecords - totalBreaches) / totalRecords) * 100) 
        : 100;

      const totalHours = slaRecords.reduce((sum: number, r: any) => sum + (r.elapsed_hours || 0), 0);
      avgTransitHours = totalRecords > 0 ? totalHours / totalRecords : 0;
    }
  }

  // Fetch active exceptions for this branch
  const { data: exceptions, error: exceptionsError } = await supabase
    .from('shipment_exceptions')
    .select('id, shipment:shipments!inner(branch_id)')
    .eq('shipment.branch_id', branchId)
    .eq('status', 'OPEN');

  const activeExceptions = !exceptionsError && exceptions ? exceptions.length : 0;

  // Fetch branch transfers
  const { data: transfers, error: transfersError } = await supabase
    .from('audit_log')
    .select('metadata_json')
    .in('action', ['BRANCH_TRANSFER', 'BULK_BRANCH_TRANSFER'])
    .gte('timestamp', weekAgoISO);

  let incomingTransfers = 0;
  let outgoingTransfers = 0;

  if (!transfersError && transfers) {
    transfers.forEach((t: any) => {
      const metadata = t.metadata_json;
      if (metadata?.source_branch_id === branchId) {
        outgoingTransfers += metadata.shipment_count || 1;
      }
      if (metadata?.target_branch_id === branchId) {
        incomingTransfers += metadata.shipment_count || 1;
      }
    });
  }

  const deliveryRate = totalShipments > 0 
    ? Math.round((deliveredShipments / totalShipments) * 100) 
    : 0;

  return {
    branchId: branch.id,
    branchName: branch.name,
    branchCode: branch.code,
    countryName: (branch.country as any)?.name || 'Unknown',
    totalShipments,
    deliveredShipments,
    inProgressShipments,
    cancelledShipments,
    deliveryRate,
    slaCompliance,
    totalBreaches,
    activeExceptions,
    avgTransitHours,
    incomingTransfers,
    outgoingTransfers,
    topClients,
    statusBreakdown,
  };
}

function generateBranchReportHtml(metrics: BranchMetrics, reportPeriod: string): string {
  const performanceEmoji = getPerformanceEmoji(metrics.slaCompliance);
  const complianceColor = getPerformanceColor(metrics.slaCompliance);
  const deliveryColor = getPerformanceColor(metrics.deliveryRate);

  const statusRows = metrics.statusBreakdown.length > 0
    ? metrics.statusBreakdown.map(s => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">
            <span style="display: inline-block; padding: 2px 10px; background: ${STATUS_COLORS[s.status] || '#6b7280'}20; color: ${STATUS_COLORS[s.status] || '#6b7280'}; border-radius: 4px; font-size: 12px; font-weight: 600;">
              ${STATUS_LABELS[s.status] || s.status}
            </span>
          </td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: bold;">${s.count}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="2" style="padding: 12px; text-align: center; color: #6b7280;">No shipments this week</td></tr>';

  const clientRows = metrics.topClients.length > 0
    ? metrics.topClients.map((c, i) => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">#${i + 1}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${c.name}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${c.shipments}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="3" style="padding: 12px; text-align: center; color: #6b7280;">No client data</td></tr>';

  return `
    <div style="background: white; border-radius: 12px; margin-bottom: 24px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.05); border: 1px solid #e5e7eb;">
      <!-- Branch Header -->
      <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); padding: 20px; color: white;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h2 style="margin: 0; font-size: 22px;">${performanceEmoji} ${metrics.branchName}</h2>
            <p style="margin: 6px 0 0 0; opacity: 0.9; font-size: 14px;">${metrics.branchCode} • ${metrics.countryName}</p>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 32px; font-weight: bold;">${metrics.slaCompliance}%</div>
            <div style="font-size: 12px; opacity: 0.9;">SLA Compliance</div>
          </div>
        </div>
      </div>

      <!-- Key Metrics Grid -->
      <div style="padding: 20px;">
        <table style="width: 100%; border-collapse: separate; border-spacing: 8px;">
          <tr>
            <td style="background: #eff6ff; border-radius: 8px; padding: 16px; text-align: center; width: 16.66%;">
              <div style="font-size: 28px; font-weight: bold; color: #1e40af;">${metrics.totalShipments}</div>
              <div style="font-size: 11px; color: #3b82f6; margin-top: 4px;">Total Shipments</div>
            </td>
            <td style="background: #f0fdf4; border-radius: 8px; padding: 16px; text-align: center; width: 16.66%;">
              <div style="font-size: 28px; font-weight: bold; color: #16a34a;">${metrics.deliveredShipments}</div>
              <div style="font-size: 11px; color: #22c55e; margin-top: 4px;">Delivered</div>
            </td>
            <td style="background: #fefce8; border-radius: 8px; padding: 16px; text-align: center; width: 16.66%;">
              <div style="font-size: 28px; font-weight: bold; color: #ca8a04;">${metrics.inProgressShipments}</div>
              <div style="font-size: 11px; color: #eab308; margin-top: 4px;">In Progress</div>
            </td>
            <td style="background: #fef2f2; border-radius: 8px; padding: 16px; text-align: center; width: 16.66%;">
              <div style="font-size: 28px; font-weight: bold; color: #dc2626;">${metrics.totalBreaches}</div>
              <div style="font-size: 11px; color: #ef4444; margin-top: 4px;">SLA Breaches</div>
            </td>
            <td style="background: #fdf4ff; border-radius: 8px; padding: 16px; text-align: center; width: 16.66%;">
              <div style="font-size: 28px; font-weight: bold; color: #a855f7;">${metrics.activeExceptions}</div>
              <div style="font-size: 11px; color: #c084fc; margin-top: 4px;">Active Exceptions</div>
            </td>
            <td style="background: #f0fdfa; border-radius: 8px; padding: 16px; text-align: center; width: 16.66%;">
              <div style="font-size: 28px; font-weight: bold; color: #0d9488;">${formatHours(metrics.avgTransitHours)}</div>
              <div style="font-size: 11px; color: #14b8a6; margin-top: 4px;">Avg Transit</div>
            </td>
          </tr>
        </table>

        <!-- Performance Indicators -->
        <div style="display: flex; gap: 16px; margin-top: 16px;">
          <div style="flex: 1; background: #f9fafb; border-radius: 8px; padding: 12px;">
            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Delivery Rate</div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <div style="flex: 1; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden;">
                <div style="width: ${metrics.deliveryRate}%; height: 100%; background: ${deliveryColor}; border-radius: 4px;"></div>
              </div>
              <span style="font-weight: bold; color: ${deliveryColor};">${metrics.deliveryRate}%</span>
            </div>
          </div>
          <div style="flex: 1; background: #f9fafb; border-radius: 8px; padding: 12px;">
            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">SLA Compliance</div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <div style="flex: 1; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden;">
                <div style="width: ${metrics.slaCompliance}%; height: 100%; background: ${complianceColor}; border-radius: 4px;"></div>
              </div>
              <span style="font-weight: bold; color: ${complianceColor};">${metrics.slaCompliance}%</span>
            </div>
          </div>
        </div>

        <!-- Transfers -->
        ${metrics.incomingTransfers > 0 || metrics.outgoingTransfers > 0 ? `
          <div style="display: flex; gap: 16px; margin-top: 16px;">
            <div style="flex: 1; background: #ecfdf5; border-radius: 8px; padding: 12px; display: flex; align-items: center; gap: 12px;">
              <span style="font-size: 24px;">📥</span>
              <div>
                <div style="font-size: 20px; font-weight: bold; color: #16a34a;">${metrics.incomingTransfers}</div>
                <div style="font-size: 11px; color: #22c55e;">Incoming Transfers</div>
              </div>
            </div>
            <div style="flex: 1; background: #fff7ed; border-radius: 8px; padding: 12px; display: flex; align-items: center; gap: 12px;">
              <span style="font-size: 24px;">📤</span>
              <div>
                <div style="font-size: 20px; font-weight: bold; color: #ea580c;">${metrics.outgoingTransfers}</div>
                <div style="font-size: 11px; color: #f97316;">Outgoing Transfers</div>
              </div>
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Status Breakdown & Top Clients -->
      <div style="padding: 0 20px 20px 20px; display: flex; gap: 20px;">
        <div style="flex: 1;">
          <h3 style="color: #374151; font-size: 14px; margin: 0 0 12px 0; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;">
            📊 Status Breakdown
          </h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tbody>
              ${statusRows}
            </tbody>
          </table>
        </div>
        <div style="flex: 1;">
          <h3 style="color: #374151; font-size: 14px; margin: 0 0 12px 0; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;">
            🏢 Top Clients
          </h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tbody>
              ${clientRows}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[weekly-branch-performance] Starting weekly branch performance report generation');

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('[weekly-branch-performance] RESEND_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Email service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const resend = new Resend(resendApiKey);
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Calculate date range for last 7 days
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekAgoISO = weekAgo.toISOString();

    const weekStart = weekAgo.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const weekEnd = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const reportPeriod = `${weekStart} - ${weekEnd}`;

    console.log(`[weekly-branch-performance] Report period: ${reportPeriod}`);

    // Fetch all active branches
    const { data: branches, error: branchesError } = await supabase
      .from('branches')
      .select('id')
      .eq('is_active', true);

    if (branchesError) {
      console.error('[weekly-branch-performance] Error fetching branches:', branchesError);
      throw branchesError;
    }

    if (!branches || branches.length === 0) {
      console.log('[weekly-branch-performance] No active branches found');
      return new Response(
        JSON.stringify({ success: true, message: 'No active branches' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate metrics for all branches
    const branchMetrics: BranchMetrics[] = [];
    for (const branch of branches) {
      const metrics = await calculateBranchMetrics(supabase, branch.id, weekAgoISO);
      if (metrics) {
        branchMetrics.push(metrics);
      }
    }

    console.log(`[weekly-branch-performance] Calculated metrics for ${branchMetrics.length} branches`);

    // Fetch managers and supervisors with their branch assignments
    const { data: managerRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .in('role', ['MANAGER', 'SUPERVISOR']);

    if (rolesError) {
      console.error('[weekly-branch-performance] Error fetching roles:', rolesError);
      throw rolesError;
    }

    if (!managerRoles || managerRoles.length === 0) {
      console.log('[weekly-branch-performance] No managers/supervisors to notify');
      return new Response(
        JSON.stringify({ success: true, message: 'No managers configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userIds = managerRoles.map(r => r.user_id);

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, name, branch_id, allowed_branch_ids')
      .in('id', userIds)
      .eq('is_active', true);

    if (profilesError) {
      console.error('[weekly-branch-performance] Error fetching profiles:', profilesError);
      throw profilesError;
    }

    // Build recipient list with their relevant branches
    const recipients: ManagerRecipient[] = [];
    for (const profile of profiles || []) {
      if (!profile.email) continue;

      const userRole = managerRoles.find(r => r.user_id === profile.id);
      let relevantBranchIds: string[] = [];

      if (userRole?.role === 'MANAGER') {
        // Managers see all branches they have access to
        if (profile.allowed_branch_ids && profile.allowed_branch_ids.length > 0) {
          relevantBranchIds = profile.allowed_branch_ids;
        } else if (profile.branch_id) {
          relevantBranchIds = [profile.branch_id];
        } else {
          // Global manager sees all branches
          relevantBranchIds = branches.map(b => b.id);
        }
      } else {
        // Supervisors see only their assigned branch
        if (profile.branch_id) {
          relevantBranchIds = [profile.branch_id];
        }
      }

      if (relevantBranchIds.length > 0) {
        recipients.push({
          email: profile.email,
          name: profile.name || 'Manager',
          branchIds: relevantBranchIds,
        });
      }
    }

    console.log(`[weekly-branch-performance] Sending reports to ${recipients.length} recipients`);

    // Send personalized emails to each manager
    let sentCount = 0;
    for (const recipient of recipients) {
      const relevantMetrics = branchMetrics.filter(m => 
        recipient.branchIds.includes(m.branchId)
      );

      if (relevantMetrics.length === 0) continue;

      // Calculate overall summary
      const totalShipments = relevantMetrics.reduce((sum, m) => sum + m.totalShipments, 0);
      const totalDelivered = relevantMetrics.reduce((sum, m) => sum + m.deliveredShipments, 0);
      const totalBreaches = relevantMetrics.reduce((sum, m) => sum + m.totalBreaches, 0);
      const avgCompliance = relevantMetrics.length > 0
        ? Math.round(relevantMetrics.reduce((sum, m) => sum + m.slaCompliance, 0) / relevantMetrics.length)
        : 0;

      const overallEmoji = avgCompliance >= 90 ? '✅' : avgCompliance >= 70 ? '⚠️' : '🚨';

      // Generate branch sections
      const branchSections = relevantMetrics
        .sort((a, b) => b.totalShipments - a.totalShipments)
        .map(m => generateBranchReportHtml(m, reportPeriod))
        .join('');

      const emailHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Weekly Branch Performance Report</title>
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f3f4f6;">
            <div style="max-width: 800px; margin: 0 auto;">
              <!-- Header -->
              <div style="background: linear-gradient(135deg, #1e3a5f 0%, #3b82f6 100%); border-radius: 12px; padding: 32px; text-align: center; margin-bottom: 24px;">
                <h1 style="color: white; margin: 0; font-size: 28px;">📊 Weekly Branch Performance Report</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 12px 0 0 0; font-size: 16px;">${reportPeriod}</p>
                <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0 0; font-size: 14px;">Hello ${recipient.name}, here's your weekly summary</p>
              </div>

              <!-- Overall Summary -->
              <div style="background: white; border-radius: 12px; padding: 24px; margin-bottom: 24px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); border: 1px solid #e5e7eb;">
                <h2 style="color: #374151; font-size: 18px; margin: 0 0 16px 0;">
                  ${overallEmoji} Overall Summary (${relevantMetrics.length} Branch${relevantMetrics.length > 1 ? 'es' : ''})
                </h2>
                
                <table style="width: 100%; border-collapse: separate; border-spacing: 12px;">
                  <tr>
                    <td style="background: #eff6ff; border-radius: 8px; padding: 20px; text-align: center; width: 25%;">
                      <div style="font-size: 36px; font-weight: bold; color: #1e40af;">${totalShipments}</div>
                      <div style="font-size: 13px; color: #3b82f6; margin-top: 4px;">Total Shipments</div>
                    </td>
                    <td style="background: #f0fdf4; border-radius: 8px; padding: 20px; text-align: center; width: 25%;">
                      <div style="font-size: 36px; font-weight: bold; color: #16a34a;">${totalDelivered}</div>
                      <div style="font-size: 13px; color: #22c55e; margin-top: 4px;">Delivered</div>
                    </td>
                    <td style="background: #fef2f2; border-radius: 8px; padding: 20px; text-align: center; width: 25%;">
                      <div style="font-size: 36px; font-weight: bold; color: #dc2626;">${totalBreaches}</div>
                      <div style="font-size: 13px; color: #ef4444; margin-top: 4px;">SLA Breaches</div>
                    </td>
                    <td style="background: ${avgCompliance >= 90 ? '#f0fdf4' : avgCompliance >= 70 ? '#fffbeb' : '#fef2f2'}; border-radius: 8px; padding: 20px; text-align: center; width: 25%;">
                      <div style="font-size: 36px; font-weight: bold; color: ${getPerformanceColor(avgCompliance)};">${avgCompliance}%</div>
                      <div style="font-size: 13px; color: ${getPerformanceColor(avgCompliance)}; margin-top: 4px;">Avg Compliance</div>
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Branch Sections -->
              ${branchSections}

              <!-- Footer -->
              <div style="text-align: center; padding: 24px; color: #6b7280; font-size: 13px;">
                <p style="margin: 0;">This is an automated weekly report generated by your logistics platform.</p>
                <p style="margin: 8px 0 0 0;">Log in to view detailed analytics and take action on any issues.</p>
              </div>
            </div>
          </body>
        </html>
      `;

      try {
        const { error: emailError } = await resend.emails.send({
          from: 'Logistics Platform <onboarding@resend.dev>',
          to: [recipient.email],
          subject: `📊 Weekly Branch Performance Report - ${reportPeriod}`,
          html: emailHtml,
        });

        if (emailError) {
          console.error(`[weekly-branch-performance] Error sending email to ${recipient.email}:`, emailError);
        } else {
          console.log(`[weekly-branch-performance] Email sent to ${recipient.email}`);
          sentCount++;
        }
      } catch (emailErr) {
        console.error(`[weekly-branch-performance] Failed to send email to ${recipient.email}:`, emailErr);
      }
    }

    console.log(`[weekly-branch-performance] Completed: sent ${sentCount} emails`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        branchCount: branchMetrics.length,
        recipientCount: recipients.length,
        emailsSent: sentCount 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[weekly-branch-performance] Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
