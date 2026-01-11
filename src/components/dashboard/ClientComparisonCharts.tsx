import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, BarChart3, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  ComposedChart,
  Line,
  Cell,
} from "recharts";

interface ClientScorecard {
  id: string;
  client_id: string;
  period_year: number;
  period_month: number;
  total_shipments: number;
  delivered_shipments: number;
  on_time_delivery_rate: number;
  sla_compliance_rate: number;
  total_incidents: number;
  exceptions_p1: number;
  exceptions_p2: number;
  exceptions_p3: number;
  avg_transit_hours: number;
  clients: { name: string } | null;
}

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "#6366f1",
  "#ec4899",
  "#14b8a6",
];

const getBarColor = (value: number, isRate: boolean = true) => {
  if (isRate) {
    if (value >= 90) return "#22c55e";
    if (value >= 70) return "#f59e0b";
    return "#ef4444";
  }
  return "hsl(var(--primary))";
};

export function ClientComparisonCharts() {
  const { t } = useTranslation();

  // Fetch latest scorecards for each client
  const { data: scorecards, isLoading } = useQuery({
    queryKey: ["client-comparison-scorecards"],
    queryFn: async () => {
      // Get all clients first
      const { data: clients } = await supabase
        .from("clients")
        .select("id, name")
        .order("name");

      if (!clients || clients.length === 0) return [];

      // Get latest scorecard for each client
      const latestScorecards: ClientScorecard[] = [];

      for (const client of clients) {
        const { data } = await supabase
          .from("client_scorecards")
          .select(`
            id,
            client_id,
            period_year,
            period_month,
            total_shipments,
            delivered_shipments,
            on_time_delivery_rate,
            sla_compliance_rate,
            total_incidents,
            exceptions_p1,
            exceptions_p2,
            exceptions_p3,
            avg_transit_hours
          `)
          .eq("client_id", client.id)
          .order("period_year", { ascending: false })
          .order("period_month", { ascending: false })
          .limit(1)
          .single();

        if (data) {
          latestScorecards.push({
            ...data,
            clients: { name: client.name },
          } as ClientScorecard);
        }
      }

      return latestScorecards;
    },
  });

  // Prepare comparison data
  const comparisonData = scorecards?.map((sc) => ({
    name: sc.clients?.name?.slice(0, 12) || "Unknown",
    fullName: sc.clients?.name || "Unknown",
    slaCompliance: sc.sla_compliance_rate,
    onTimeDelivery: sc.on_time_delivery_rate,
    totalShipments: sc.total_shipments,
    deliveredShipments: sc.delivered_shipments,
    incidents: sc.total_incidents,
    p1: sc.exceptions_p1,
    p2: sc.exceptions_p2,
    p3: sc.exceptions_p3,
    avgTransitHours: Math.round(sc.avg_transit_hours),
  })) || [];

  // Radar chart data for overall performance
  const radarData = scorecards?.length ? [
    { metric: t("dashboard.slaCompliance", "SLA"), fullMetric: t("dashboard.slaCompliance", "SLA Compliance"), ...Object.fromEntries(scorecards.map(sc => [sc.clients?.name || "Unknown", sc.sla_compliance_rate])) },
    { metric: t("dashboard.onTime", "On-Time"), fullMetric: t("dashboard.onTimeDelivery", "On-Time Delivery"), ...Object.fromEntries(scorecards.map(sc => [sc.clients?.name || "Unknown", sc.on_time_delivery_rate])) },
    { metric: t("dashboard.volume", "Volume"), fullMetric: t("dashboard.shipmentVolume", "Shipment Volume (normalized)"), ...Object.fromEntries(scorecards.map(sc => {
      const maxShipments = Math.max(...scorecards.map(s => s.total_shipments));
      return [sc.clients?.name || "Unknown", Math.round((sc.total_shipments / maxShipments) * 100)];
    })) },
    { metric: t("dashboard.quality", "Quality"), fullMetric: t("dashboard.qualityScore", "Quality (100 - incident rate)"), ...Object.fromEntries(scorecards.map(sc => {
      const incidentRate = sc.total_shipments > 0 ? (sc.total_incidents / sc.total_shipments) * 100 : 0;
      return [sc.clients?.name || "Unknown", Math.max(0, Math.round(100 - incidentRate))];
    })) },
  ] : [];

  // Calculate rankings
  const rankings = scorecards?.length ? {
    bestSLA: [...scorecards].sort((a, b) => b.sla_compliance_rate - a.sla_compliance_rate)[0],
    bestOnTime: [...scorecards].sort((a, b) => b.on_time_delivery_rate - a.on_time_delivery_rate)[0],
    mostVolume: [...scorecards].sort((a, b) => b.total_shipments - a.total_shipments)[0],
    fewestIncidents: [...scorecards].filter(s => s.total_shipments > 0).sort((a, b) => 
      (a.total_incidents / a.total_shipments) - (b.total_incidents / b.total_shipments)
    )[0],
  } : null;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            {t("dashboard.clientComparison", "Client Comparison")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!scorecards || scorecards.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            {t("dashboard.clientComparison", "Client Comparison")}
          </CardTitle>
          <CardDescription>
            {t("dashboard.compareClientPerformance", "Compare performance across clients")}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center py-12 text-muted-foreground">
          <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">{t("dashboard.noDataAvailable", "No scorecard data available")}</p>
          <p className="text-xs mt-1">
            {t("dashboard.generateScorecardsFirst", "Generate client scorecards to see comparisons")}
          </p>
        </CardContent>
      </Card>
    );
  }

  const clientNames = scorecards.map(sc => sc.clients?.name || "Unknown");

  return (
    <div className="space-y-6">
      {/* Top Performers Cards */}
      {rankings && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/30 dark:to-green-900/20 border-green-200 dark:border-green-800">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400 mb-1">
                <TrendingUp className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wide">
                  {t("dashboard.bestSLA", "Best SLA")}
                </span>
              </div>
              <p className="font-semibold text-sm truncate" title={rankings.bestSLA?.clients?.name}>
                {rankings.bestSLA?.clients?.name?.slice(0, 15) || "N/A"}
              </p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {rankings.bestSLA?.sla_compliance_rate || 0}%
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 border-blue-200 dark:border-blue-800">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 mb-1">
                <TrendingUp className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wide">
                  {t("dashboard.bestOnTime", "Best On-Time")}
                </span>
              </div>
              <p className="font-semibold text-sm truncate" title={rankings.bestOnTime?.clients?.name}>
                {rankings.bestOnTime?.clients?.name?.slice(0, 15) || "N/A"}
              </p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {rankings.bestOnTime?.on_time_delivery_rate || 0}%
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/30 dark:to-purple-900/20 border-purple-200 dark:border-purple-800">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400 mb-1">
                <BarChart3 className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wide">
                  {t("dashboard.mostVolume", "Most Volume")}
                </span>
              </div>
              <p className="font-semibold text-sm truncate" title={rankings.mostVolume?.clients?.name}>
                {rankings.mostVolume?.clients?.name?.slice(0, 15) || "N/A"}
              </p>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {rankings.mostVolume?.total_shipments || 0}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/20 border-amber-200 dark:border-amber-800">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 mb-1">
                <Minus className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wide">
                  {t("dashboard.fewestIncidents", "Fewest Issues")}
                </span>
              </div>
              <p className="font-semibold text-sm truncate" title={rankings.fewestIncidents?.clients?.name}>
                {rankings.fewestIncidents?.clients?.name?.slice(0, 15) || "N/A"}
              </p>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {rankings.fewestIncidents?.total_incidents || 0}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SLA Compliance Comparison */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              {t("dashboard.slaComplianceComparison", "SLA Compliance by Client")}
            </CardTitle>
            <CardDescription className="text-xs">
              {t("dashboard.percentWithinSLA", "Percentage of shipments within SLA targets")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} className="text-xs" />
                  <YAxis type="category" dataKey="name" width={80} className="text-xs" />
                  <Tooltip
                    formatter={(value: number) => [`${value}%`, t("dashboard.slaCompliance", "SLA Compliance")]}
                    labelFormatter={(label) => comparisonData.find(d => d.name === label)?.fullName || label}
                    contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                  />
                  <Bar dataKey="slaCompliance" radius={[0, 4, 4, 0]}>
                    {comparisonData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getBarColor(entry.slaCompliance)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* On-Time Delivery Comparison */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              {t("dashboard.onTimeDeliveryComparison", "On-Time Delivery by Client")}
            </CardTitle>
            <CardDescription className="text-xs">
              {t("dashboard.percentDeliveredOnTime", "Percentage of shipments delivered on time")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} className="text-xs" />
                  <YAxis type="category" dataKey="name" width={80} className="text-xs" />
                  <Tooltip
                    formatter={(value: number) => [`${value}%`, t("dashboard.onTimeDelivery", "On-Time Delivery")]}
                    labelFormatter={(label) => comparisonData.find(d => d.name === label)?.fullName || label}
                    contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                  />
                  <Bar dataKey="onTimeDelivery" radius={[0, 4, 4, 0]}>
                    {comparisonData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getBarColor(entry.onTimeDelivery)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Shipment Volume & Incidents */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              {t("dashboard.volumeVsIncidents", "Volume vs Incidents")}
            </CardTitle>
            <CardDescription className="text-xs">
              {t("dashboard.shipmentsAndIssues", "Total shipments compared to incidents")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={comparisonData} margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis yAxisId="left" className="text-xs" />
                  <YAxis yAxisId="right" orientation="right" className="text-xs" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                    labelFormatter={(label) => comparisonData.find(d => d.name === label)?.fullName || label}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Bar 
                    yAxisId="left" 
                    dataKey="totalShipments" 
                    name={t("dashboard.shipments", "Shipments")} 
                    fill="hsl(var(--primary))" 
                    radius={[4, 4, 0, 0]} 
                  />
                  <Line 
                    yAxisId="right" 
                    type="monotone" 
                    dataKey="incidents" 
                    name={t("dashboard.incidents", "Incidents")} 
                    stroke="#ef4444" 
                    strokeWidth={2}
                    dot={{ fill: "#ef4444", strokeWidth: 2 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Performance Radar */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              {t("dashboard.performanceRadar", "Performance Radar")}
            </CardTitle>
            <CardDescription className="text-xs">
              {t("dashboard.overallPerformanceComparison", "Overall performance comparison across metrics")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid className="stroke-muted" />
                  <PolarAngleAxis dataKey="metric" className="text-xs" />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} className="text-xs" />
                  {clientNames.slice(0, 5).map((name, index) => (
                    <Radar
                      key={name}
                      name={name.slice(0, 12)}
                      dataKey={name}
                      stroke={CHART_COLORS[index % CHART_COLORS.length]}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                  ))}
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                    formatter={(value: number, name: string) => [`${value}%`, name]}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Exception Breakdown by Client */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              {t("dashboard.exceptionBreakdown", "Exception Breakdown by Client")}
            </CardTitle>
            <CardDescription className="text-xs">
              {t("dashboard.exceptionsDistribution", "Distribution of exceptions by severity level")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData} margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                    labelFormatter={(label) => comparisonData.find(d => d.name === label)?.fullName || label}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Bar dataKey="p1" name="P1 (Critical)" stackId="exceptions" fill="#ef4444" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="p2" name="P2 (High)" stackId="exceptions" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="p3" name="P3 (Medium)" stackId="exceptions" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
