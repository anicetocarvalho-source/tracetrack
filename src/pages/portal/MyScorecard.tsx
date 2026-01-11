import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileBarChart, TrendingUp, Clock, Package, CheckCircle2, AlertTriangle } from "lucide-react";
import { CustomerLayout } from "@/components/layouts/CustomerLayout";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
} from "recharts";

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

const STATUS_COLORS: Record<string, string> = {
  DELIVERED: "#10b981",
  IN_TRANSIT: "#3b82f6",
  PROCESSING: "#0ea5e9",
  AT_TERMINAL: "#f59e0b",
  CLEARANCE: "#6366f1",
  OUT_FOR_DELIVERY: "#8b5cf6",
  RECEIVED: "#14b8a6",
  REGISTERED: "#06b6d4",
  DOCS_VALIDATION: "#84cc16",
  ON_HOLD_INCIDENT: "#ef4444",
  CANCELLED: "#6b7280",
};

const PIE_COLORS = ["#D40511", "#FC0", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#6366f1", "#14b8a6"];

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

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
        <p className="font-semibold mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }}>
            {entry.name}: {entry.value}{entry.name.includes('%') || entry.name === 'Compliance' ? '%' : ''}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const PieTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
        <p className="font-semibold">{payload[0].name}</p>
        <p className="text-muted-foreground">{payload[0].value} shipments</p>
      </div>
    );
  }
  return null;
};

export default function MyScorecard() {
  const { t } = useTranslation();
  const { user } = useAuth();

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
    if (rate >= 90) return "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800";
    if (rate >= 70) return "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800";
    return "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800";
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

  // Prepare trend data for chart
  const trendChartData = (latestScorecard.trend_data || []).map((point) => ({
    month: point.month.split(" ")[0],
    Shipments: point.shipments,
    "On-Time %": point.onTime,
    Compliance: point.compliance,
  }));

  // Prepare status breakdown for pie chart
  const statusPieData = Object.entries(latestScorecard.status_breakdown || {})
    .filter(([_, count]) => count > 0)
    .map(([status, count]) => ({
      name: STATUS_LABELS[status] || status,
      value: count,
      color: STATUS_COLORS[status] || "#6b7280",
    }))
    .sort((a, b) => b.value - a.value);

  // Prepare exceptions data for bar chart
  const exceptionsData = [
    { name: "P1 - Critical", value: latestScorecard.exceptions_p1, fill: "#ef4444" },
    { name: "P2 - Major", value: latestScorecard.exceptions_p2, fill: "#f59e0b" },
    { name: "P3 - Minor", value: latestScorecard.exceptions_p3, fill: "#3b82f6" },
  ].filter(d => d.value > 0);

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
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-center">
                <Package className="h-5 w-5 mx-auto text-blue-600 dark:text-blue-400 mb-1" />
                <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{latestScorecard.total_shipments}</div>
                <div className="text-xs text-blue-600 dark:text-blue-400">Total Shipments</div>
              </div>
              <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center">
                <CheckCircle2 className="h-5 w-5 mx-auto text-green-600 dark:text-green-400 mb-1" />
                <div className="text-2xl font-bold text-green-700 dark:text-green-300">{latestScorecard.delivered_shipments}</div>
                <div className="text-xs text-green-600 dark:text-green-400">Delivered</div>
              </div>
              <div className={`rounded-lg p-4 text-center border ${getComplianceBg(latestScorecard.on_time_delivery_rate)}`}>
                <TrendingUp className={`h-5 w-5 mx-auto mb-1 ${getComplianceColor(latestScorecard.on_time_delivery_rate)}`} />
                <div className={`text-2xl font-bold ${getComplianceColor(latestScorecard.on_time_delivery_rate)}`}>
                  {latestScorecard.on_time_delivery_rate}%
                </div>
                <div className="text-xs text-muted-foreground">On-Time Rate</div>
              </div>
              <div className={`rounded-lg p-4 text-center border ${getComplianceBg(latestScorecard.sla_compliance_rate)}`}>
                <CheckCircle2 className={`h-5 w-5 mx-auto mb-1 ${getComplianceColor(latestScorecard.sla_compliance_rate)}`} />
                <div className={`text-2xl font-bold ${getComplianceColor(latestScorecard.sla_compliance_rate)}`}>
                  {latestScorecard.sla_compliance_rate}%
                </div>
                <div className="text-xs text-muted-foreground">SLA Compliance</div>
              </div>
              <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg p-4 text-center">
                <Clock className="h-5 w-5 mx-auto text-purple-600 dark:text-purple-400 mb-1" />
                <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">{formatHours(latestScorecard.avg_transit_hours)}</div>
                <div className="text-xs text-purple-600 dark:text-purple-400">Avg Transit</div>
              </div>
              <div className={`rounded-lg p-4 text-center border ${latestScorecard.total_incidents > 0 ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800" : "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"}`}>
                <AlertTriangle className={`h-5 w-5 mx-auto mb-1 ${latestScorecard.total_incidents > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`} />
                <div className={`text-2xl font-bold ${latestScorecard.total_incidents > 0 ? "text-red-700 dark:text-red-300" : "text-green-700 dark:text-green-300"}`}>
                  {latestScorecard.total_incidents}
                </div>
                <div className="text-xs text-muted-foreground">Incidents</div>
              </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Trend Chart */}
              {trendChartData.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      6-Month Trend
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <AreaChart data={trendChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorShipments" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#D40511" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#D40511" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorCompliance" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          dataKey="month" 
                          tick={{ fontSize: 12 }} 
                          className="text-muted-foreground"
                        />
                        <YAxis 
                          yAxisId="left"
                          tick={{ fontSize: 12 }} 
                          className="text-muted-foreground"
                        />
                        <YAxis 
                          yAxisId="right" 
                          orientation="right"
                          domain={[0, 100]}
                          tick={{ fontSize: 12 }} 
                          className="text-muted-foreground"
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Area
                          yAxisId="left"
                          type="monotone"
                          dataKey="Shipments"
                          stroke="#D40511"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#colorShipments)"
                        />
                        <Area
                          yAxisId="right"
                          type="monotone"
                          dataKey="Compliance"
                          stroke="#10b981"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#colorCompliance)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                    <div className="flex justify-center gap-6 mt-2 text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-[#D40511]" />
                        <span className="text-muted-foreground">Shipments</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-[#10b981]" />
                        <span className="text-muted-foreground">Compliance %</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Status Breakdown Pie Chart */}
              {statusPieData.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Status Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={statusPieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {statusPieData.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={entry.color}
                              className="stroke-background"
                              strokeWidth={2}
                            />
                          ))}
                        </Pie>
                        <Tooltip content={<PieTooltip />} />
                        <Legend 
                          layout="vertical" 
                          align="right" 
                          verticalAlign="middle"
                          formatter={(value) => <span className="text-xs text-foreground">{value}</span>}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Exceptions Bar Chart */}
            {exceptionsData.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Exceptions by Severity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={exceptionsData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                      <YAxis 
                        type="category" 
                        dataKey="name" 
                        tick={{ fontSize: 12 }} 
                        width={80}
                        className="text-muted-foreground"
                      />
                      <Tooltip 
                        cursor={{ fill: 'hsl(var(--muted))' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
                                <p className="font-semibold">{payload[0].payload.name}</p>
                                <p className="text-muted-foreground">{payload[0].value} exceptions</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {exceptionsData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      </div>
    </CustomerLayout>
  );
}
