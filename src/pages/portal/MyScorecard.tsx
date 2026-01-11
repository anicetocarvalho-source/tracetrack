import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileBarChart, TrendingUp, Clock, Package, CheckCircle2, AlertTriangle } from "lucide-react";
import { CustomerLayout } from "@/components/layouts/CustomerLayout";
const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

const STATUS_LABELS: Record<string, string> = {
  RECEIVED: "Received",
  REGISTERED: "Registered",
  DOCS_VALIDATION: "Docs Validation",
  PROCESSING: "Processing",
  IN_TRANSIT: "In Transit",
  AT_TERMINAL: "At Terminal",
  CLEARANCE: "Clearance",
  OUT_FOR_DELIVERY: "Out for Delivery",
  DELIVERED: "Delivered",
  ON_HOLD_INCIDENT: "On Hold - Incident",
  CANCELLED: "Cancelled",
};

interface TrendDataPoint {
  month: string;
  shipments: number;
  onTime: number;
  compliance: number;
}

interface TopIssue {
  issue: string;
  count: number;
  severity: string;
}

interface Scorecard {
  id: string;
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
  top_issues: TopIssue[];
  trend_data: TrendDataPoint[];
  generated_at: string;
}

export default function MyScorecard() {
  const { t } = useTranslation();
  const { user } = useAuth();

  // Fetch customer's scorecards
  const { data: scorecards = [], isLoading } = useQuery({
    queryKey: ["my-scorecards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_scorecards")
        .select("*")
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Scorecard[];
    },
  });

  const formatHours = (hours: number): string => {
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const remainingHours = Math.round(hours % 24);
      return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
    }
    return `${Math.round(hours)}h`;
  };

  const getComplianceColor = (rate: number) => {
    if (rate >= 90) return "text-green-600";
    if (rate >= 70) return "text-yellow-600";
    return "text-red-600";
  };

  const getComplianceBg = (rate: number) => {
    if (rate >= 90) return "bg-green-50 border-green-200";
    if (rate >= 70) return "bg-yellow-50 border-yellow-200";
    return "bg-red-50 border-red-200";
  };

  if (isLoading) {
    return (
      <CustomerLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </CustomerLayout>
    );
  }

  if (scorecards.length === 0) {
    return (
      <CustomerLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">{t("portal.scorecard", "Performance Scorecard")}</h1>
            <p className="text-muted-foreground">
              {t("portal.scorecardDesc", "View your monthly performance summaries")}
            </p>
          </div>
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <FileBarChart className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t("portal.noScorecards", "No scorecards available yet")}</p>
              <p className="text-sm mt-2">
                {t("portal.scorecardsSoon", "Performance scorecards will appear here once generated")}
              </p>
            </CardContent>
          </Card>
        </div>
      </CustomerLayout>
    );
  }

  const latestScorecard = scorecards[0];

  return (
    <CustomerLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("portal.scorecard", "Performance Scorecard")}</h1>
          <p className="text-muted-foreground">
            {t("portal.scorecardDesc", "View your monthly performance summaries")}
          </p>
        </div>

      {/* Scorecard Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {scorecards.slice(0, 6).map((scorecard) => (
          <Card 
            key={scorecard.id}
            className={`cursor-pointer transition-all hover:shadow-md ${
              latestScorecard.id === scorecard.id ? "ring-2 ring-primary" : ""
            }`}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  {MONTHS.find(m => m.value === scorecard.period_month)?.label} {scorecard.period_year}
                </CardTitle>
                <Badge 
                  variant="outline" 
                  className={getComplianceBg(scorecard.sla_compliance_rate)}
                >
                  <span className={getComplianceColor(scorecard.sla_compliance_rate)}>
                    {scorecard.sla_compliance_rate}%
                  </span>
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <div className="text-xl font-bold text-primary">{scorecard.total_shipments}</div>
                  <div className="text-xs text-muted-foreground">Shipments</div>
                </div>
                <div>
                  <div className={`text-xl font-bold ${getComplianceColor(scorecard.on_time_delivery_rate)}`}>
                    {scorecard.on_time_delivery_rate}%
                  </div>
                  <div className="text-xs text-muted-foreground">On-Time</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Latest Scorecard Detail */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileBarChart className="h-5 w-5" />
            {MONTHS.find(m => m.value === latestScorecard.period_month)?.label} {latestScorecard.period_year}
          </CardTitle>
          <CardDescription>
            Generated on {new Date(latestScorecard.generated_at).toLocaleDateString()}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
              <Package className="h-5 w-5 mx-auto text-blue-600 mb-1" />
              <div className="text-2xl font-bold text-blue-700">{latestScorecard.total_shipments}</div>
              <div className="text-xs text-blue-600">Total Shipments</div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <CheckCircle2 className="h-5 w-5 mx-auto text-green-600 mb-1" />
              <div className="text-2xl font-bold text-green-700">{latestScorecard.delivered_shipments}</div>
              <div className="text-xs text-green-600">Delivered</div>
            </div>
            <div className={`rounded-lg p-4 text-center ${getComplianceBg(latestScorecard.on_time_delivery_rate)}`}>
              <TrendingUp className={`h-5 w-5 mx-auto mb-1 ${getComplianceColor(latestScorecard.on_time_delivery_rate)}`} />
              <div className={`text-2xl font-bold ${getComplianceColor(latestScorecard.on_time_delivery_rate)}`}>
                {latestScorecard.on_time_delivery_rate}%
              </div>
              <div className="text-xs text-muted-foreground">On-Time Rate</div>
            </div>
            <div className={`rounded-lg p-4 text-center ${getComplianceBg(latestScorecard.sla_compliance_rate)}`}>
              <CheckCircle2 className={`h-5 w-5 mx-auto mb-1 ${getComplianceColor(latestScorecard.sla_compliance_rate)}`} />
              <div className={`text-2xl font-bold ${getComplianceColor(latestScorecard.sla_compliance_rate)}`}>
                {latestScorecard.sla_compliance_rate}%
              </div>
              <div className="text-xs text-muted-foreground">SLA Compliance</div>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-center">
              <Clock className="h-5 w-5 mx-auto text-purple-600 mb-1" />
              <div className="text-2xl font-bold text-purple-700">{formatHours(latestScorecard.avg_transit_hours)}</div>
              <div className="text-xs text-purple-600">Avg Transit</div>
            </div>
            <div className={`rounded-lg p-4 text-center ${latestScorecard.total_incidents > 0 ? "bg-red-50 border border-red-200" : "bg-green-50 border border-green-200"}`}>
              <AlertTriangle className={`h-5 w-5 mx-auto mb-1 ${latestScorecard.total_incidents > 0 ? "text-red-600" : "text-green-600"}`} />
              <div className={`text-2xl font-bold ${latestScorecard.total_incidents > 0 ? "text-red-700" : "text-green-700"}`}>
                {latestScorecard.total_incidents}
              </div>
              <div className="text-xs text-muted-foreground">Incidents</div>
            </div>
          </div>

          {/* Trend Chart */}
          {latestScorecard.trend_data && latestScorecard.trend_data.length > 0 && (
            <div>
              <h3 className="font-semibold mb-4">6-Month Trend</h3>
              <div className="flex items-end gap-2 h-32 bg-muted/30 rounded-lg p-4">
                {latestScorecard.trend_data.map((point) => {
                  const maxShipments = Math.max(...latestScorecard.trend_data.map(p => p.shipments), 1);
                  const height = (point.shipments / maxShipments) * 100;
                  
                  return (
                    <div key={point.month} className="flex-1 flex flex-col items-center">
                      <div className="text-xs text-muted-foreground mb-1">{point.shipments}</div>
                      <div 
                        className="w-full max-w-[40px] bg-gradient-to-t from-primary to-primary/60 rounded-t"
                        style={{ height: `${Math.max(height, 5)}%` }}
                      />
                      <div className="text-xs text-muted-foreground mt-2">{point.month.split(" ")[0]}</div>
                      <div className={`text-xs font-medium ${getComplianceColor(point.compliance)}`}>
                        {point.compliance}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Status Breakdown */}
          <div>
            <h3 className="font-semibold mb-4">Status Breakdown</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(latestScorecard.status_breakdown || {})
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <span className="text-sm">{STATUS_LABELS[status] || status}</span>
                    <span className="font-semibold">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
    </CustomerLayout>
  );
}
