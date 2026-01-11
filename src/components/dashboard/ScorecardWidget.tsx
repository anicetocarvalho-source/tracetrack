import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileBarChart, TrendingUp, TrendingDown, ArrowRight, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

interface ScorecardSummary {
  id: string;
  client_id: string;
  period_year: number;
  period_month: number;
  total_shipments: number;
  on_time_delivery_rate: number;
  sla_compliance_rate: number;
  total_incidents: number;
  clients: { name: string } | null;
}

const MONTH_ABBREV = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function ScorecardWidget() {
  const { t } = useTranslation();

  const { data: scorecards, isLoading } = useQuery({
    queryKey: ["dashboard-scorecards-widget"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_scorecards")
        .select(`
          id,
          client_id,
          period_year,
          period_month,
          total_shipments,
          on_time_delivery_rate,
          sla_compliance_rate,
          total_incidents,
          clients:client_id(name)
        `)
        .order("generated_at", { ascending: false })
        .limit(6);

      if (error) throw error;
      return (data || []) as unknown as ScorecardSummary[];
    },
  });

  // Calculate aggregate stats
  const stats = scorecards?.length
    ? {
        totalScorecards: scorecards.length,
        avgCompliance: Math.round(
          scorecards.reduce((sum, s) => sum + s.sla_compliance_rate, 0) / scorecards.length
        ),
        avgOnTime: Math.round(
          scorecards.reduce((sum, s) => sum + s.on_time_delivery_rate, 0) / scorecards.length
        ),
        totalIncidents: scorecards.reduce((sum, s) => sum + s.total_incidents, 0),
      }
    : null;

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
      <Card className="border-primary/20">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <FileBarChart className="w-5 h-5 text-primary" />
              {t("dashboard.clientScorecards", "Client Scorecards")}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!scorecards || scorecards.length === 0) {
    return (
      <Card className="border-primary/20">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <FileBarChart className="w-5 h-5 text-primary" />
              {t("dashboard.clientScorecards", "Client Scorecards")}
            </CardTitle>
            <CardDescription>
              {t("dashboard.performanceSummaries", "Monthly performance summaries")}
            </CardDescription>
          </div>
          <Link to="/backoffice/scorecards">
            <Button variant="outline" size="sm">
              {t("dashboard.generateScorecard", "Generate")}
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="text-center py-8 text-muted-foreground">
          <FileBarChart className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{t("dashboard.noScorecards", "No scorecards generated yet")}</p>
          <p className="text-xs mt-1">
            {t("dashboard.generateFirst", "Generate scorecards to see client performance")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <FileBarChart className="w-5 h-5 text-primary" />
            {t("dashboard.clientScorecards", "Client Scorecards")}
          </CardTitle>
          <CardDescription>
            {t("dashboard.recentPerformance", "Recent client performance summaries")}
          </CardDescription>
        </div>
        <Link to="/backoffice/scorecards">
          <Button variant="outline" size="sm" className="gap-1">
            {t("shipments.viewAll", "View All")}
            <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Aggregate Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <div className={`text-xl font-bold ${getComplianceColor(stats.avgCompliance)}`}>
                {stats.avgCompliance}%
              </div>
              <div className="text-xs text-muted-foreground">
                {t("dashboard.avgSlaCompliance", "Avg SLA")}
              </div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <div className={`text-xl font-bold ${getComplianceColor(stats.avgOnTime)}`}>
                {stats.avgOnTime}%
              </div>
              <div className="text-xs text-muted-foreground">
                {t("dashboard.avgOnTime", "Avg On-Time")}
              </div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <div className={`text-xl font-bold ${stats.totalIncidents > 0 ? "text-red-600" : "text-green-600"}`}>
                {stats.totalIncidents}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("dashboard.totalIncidents", "Incidents")}
              </div>
            </div>
          </div>
        )}

        {/* Recent Scorecards List */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t("dashboard.recentScorecards", "Recent Scorecards")}
          </p>
          {scorecards.slice(0, 4).map((scorecard) => (
            <Link
              key={scorecard.id}
              to="/backoffice/scorecards"
              className="flex items-center justify-between p-3 rounded-lg bg-background hover:bg-muted/50 transition-colors border"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-xs font-bold text-primary">
                    {MONTH_ABBREV[scorecard.period_month - 1]}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {(scorecard.clients as any)?.name || "Unknown Client"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {MONTH_ABBREV[scorecard.period_month - 1]} {scorecard.period_year} • {scorecard.total_shipments} shipments
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge 
                  variant="outline" 
                  className={`text-xs ${getComplianceBg(scorecard.sla_compliance_rate)}`}
                >
                  <span className={getComplianceColor(scorecard.sla_compliance_rate)}>
                    {scorecard.sla_compliance_rate}%
                  </span>
                </Badge>
                {scorecard.total_incidents > 0 ? (
                  <Badge variant="destructive" className="text-xs">
                    {scorecard.total_incidents} {t("dashboard.issues", "issues")}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs bg-green-50 text-green-600 border-green-200">
                    ✓
                  </Badge>
                )}
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
