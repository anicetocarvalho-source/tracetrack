import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, FileBarChart, Download, Mail, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2, Clock, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
  top_issues: TopIssue[];
  trend_data: TrendDataPoint[];
  generated_at: string;
  clients?: { name: string };
}

export default function ClientScorecards() {
  const { t } = useTranslation();
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const isManager = role === "MANAGER";
  
  const currentDate = new Date();
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.getMonth() + 1);
  const [selectedScorecard, setSelectedScorecard] = useState<Scorecard | null>(null);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [customEmails, setCustomEmails] = useState("");

  // Fetch clients
  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch existing scorecards
  const { data: scorecards = [], isLoading: scorecardsLoading } = useQuery({
    queryKey: ["scorecards", selectedClient],
    queryFn: async () => {
      let query = supabase
        .from("client_scorecards")
        .select(`
          *,
          clients:client_id(name)
        `)
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false });
      
      if (selectedClient) {
        query = query.eq("client_id", selectedClient);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as Scorecard[];
    },
  });

  // Generate scorecard mutation
  const generateMutation = useMutation({
    mutationFn: async ({ clientId, year, month }: { clientId: string; year: number; month: number }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke("generate-scorecard", {
        body: { clientId, year, month },
      });
      
      if (response.error) throw new Error(response.error.message);
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(t("scorecards.generated", "Scorecard generated successfully"));
      queryClient.invalidateQueries({ queryKey: ["scorecards"] });
      setSelectedScorecard(data.scorecard);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Export mutation
  const exportMutation = useMutation({
    mutationFn: async ({ scorecardId, exportType, recipientEmails }: { 
      scorecardId: string; 
      exportType: "PDF" | "EMAIL";
      recipientEmails?: string[];
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke("export-scorecard", {
        body: { scorecardId, exportType, recipientEmails },
      });
      
      if (response.error) throw new Error(response.error.message);
      return response.data;
    },
    onSuccess: (data, variables) => {
      if (variables.exportType === "PDF" && data.html) {
        // Open print dialog with the HTML
        const printWindow = window.open("", "_blank");
        if (printWindow) {
          printWindow.document.write(data.html);
          printWindow.document.close();
          printWindow.print();
        }
        toast.success(t("scorecards.pdfExported", "PDF ready for download"));
      } else if (variables.exportType === "EMAIL") {
        toast.success(t("scorecards.emailSent", "Scorecard emailed successfully"));
        setEmailDialogOpen(false);
        setCustomEmails("");
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleGenerate = () => {
    if (!selectedClient) {
      toast.error(t("scorecards.selectClient", "Please select a client"));
      return;
    }
    generateMutation.mutate({ clientId: selectedClient, year: selectedYear, month: selectedMonth });
  };

  const handleExportPDF = (scorecard: Scorecard) => {
    exportMutation.mutate({ scorecardId: scorecard.id, exportType: "PDF" });
  };

  const handleSendEmail = () => {
    if (!selectedScorecard) return;
    const emails = customEmails.split(",").map(e => e.trim()).filter(Boolean);
    exportMutation.mutate({ 
      scorecardId: selectedScorecard.id, 
      exportType: "EMAIL",
      recipientEmails: emails.length > 0 ? emails : undefined,
    });
  };

  const years = Array.from({ length: 5 }, (_, i) => currentDate.getFullYear() - i);

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

  const getTrendIcon = (current: number, previous: number) => {
    if (current > previous) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (current < previous) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-gray-400" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("scorecards.title", "Client Scorecards")}</h1>
          <p className="text-muted-foreground">
            {t("scorecards.description", "Generate and view monthly performance summaries for clients")}
          </p>
        </div>
      </div>

      {/* Generator Section - Manager Only */}
      {isManager && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileBarChart className="h-5 w-5" />
              {t("scorecards.generator", "Scorecard Generator")}
            </CardTitle>
            <CardDescription>
              {t("scorecards.generatorDesc", "Select a client and period to generate a performance scorecard")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>{t("scorecards.client", "Client")}</Label>
                <Select value={selectedClient} onValueChange={setSelectedClient}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("scorecards.selectClient", "Select client")} />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("scorecards.year", "Year")}</Label>
                <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("scorecards.month", "Month")}</Label>
                <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((month) => (
                      <SelectItem key={month.value} value={month.value.toString()}>
                        {month.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button 
                  onClick={handleGenerate} 
                  disabled={generateMutation.isPending || !selectedClient}
                  className="w-full"
                >
                  {generateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <FileBarChart className="h-4 w-4 mr-2" />
                  )}
                  {t("scorecards.generate", "Generate")}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scorecards List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {scorecardsLoading ? (
          <div className="col-span-2 flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : scorecards.length === 0 ? (
          <div className="col-span-2">
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <FileBarChart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t("scorecards.noScorecards", "No scorecards generated yet")}</p>
                {isManager && (
                  <p className="text-sm mt-2">
                    {t("scorecards.generateFirst", "Use the generator above to create your first scorecard")}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          scorecards.map((scorecard) => (
            <Card 
              key={scorecard.id} 
              className={`cursor-pointer transition-all hover:shadow-md ${
                selectedScorecard?.id === scorecard.id ? "ring-2 ring-primary" : ""
              }`}
              onClick={() => setSelectedScorecard(scorecard)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{(scorecard.clients as any)?.name}</CardTitle>
                    <CardDescription>
                      {MONTHS.find(m => m.value === scorecard.period_month)?.label} {scorecard.period_year}
                    </CardDescription>
                  </div>
                  <Badge 
                    variant="outline" 
                    className={getComplianceBg(scorecard.sla_compliance_rate)}
                  >
                    <span className={getComplianceColor(scorecard.sla_compliance_rate)}>
                      {scorecard.sla_compliance_rate}% SLA
                    </span>
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-primary">{scorecard.total_shipments}</div>
                    <div className="text-xs text-muted-foreground">Shipments</div>
                  </div>
                  <div>
                    <div className={`text-2xl font-bold ${getComplianceColor(scorecard.on_time_delivery_rate)}`}>
                      {scorecard.on_time_delivery_rate}%
                    </div>
                    <div className="text-xs text-muted-foreground">On-Time</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-purple-600">{formatHours(scorecard.avg_transit_hours)}</div>
                    <div className="text-xs text-muted-foreground">Avg Transit</div>
                  </div>
                  <div>
                    <div className={`text-2xl font-bold ${scorecard.total_incidents > 0 ? "text-red-600" : "text-green-600"}`}>
                      {scorecard.total_incidents}
                    </div>
                    <div className="text-xs text-muted-foreground">Incidents</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Detailed View */}
      {selectedScorecard && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileBarChart className="h-5 w-5" />
                  {(selectedScorecard.clients as any)?.name} - {MONTHS.find(m => m.value === selectedScorecard.period_month)?.label} {selectedScorecard.period_year}
                </CardTitle>
                <CardDescription>
                  Generated on {new Date(selectedScorecard.generated_at).toLocaleDateString()}
                </CardDescription>
              </div>
              {isManager && (
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => handleExportPDF(selectedScorecard)}
                    disabled={exportMutation.isPending}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {t("scorecards.exportPdf", "Export PDF")}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setEmailDialogOpen(true)}
                    disabled={exportMutation.isPending}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    {t("scorecards.sendEmail", "Send Email")}
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                <Package className="h-5 w-5 mx-auto text-blue-600 mb-1" />
                <div className="text-2xl font-bold text-blue-700">{selectedScorecard.total_shipments}</div>
                <div className="text-xs text-blue-600">Total Shipments</div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <CheckCircle2 className="h-5 w-5 mx-auto text-green-600 mb-1" />
                <div className="text-2xl font-bold text-green-700">{selectedScorecard.delivered_shipments}</div>
                <div className="text-xs text-green-600">Delivered</div>
              </div>
              <div className={`rounded-lg p-4 text-center ${getComplianceBg(selectedScorecard.on_time_delivery_rate)}`}>
                <TrendingUp className={`h-5 w-5 mx-auto mb-1 ${getComplianceColor(selectedScorecard.on_time_delivery_rate)}`} />
                <div className={`text-2xl font-bold ${getComplianceColor(selectedScorecard.on_time_delivery_rate)}`}>
                  {selectedScorecard.on_time_delivery_rate}%
                </div>
                <div className="text-xs text-muted-foreground">On-Time Rate</div>
              </div>
              <div className={`rounded-lg p-4 text-center ${getComplianceBg(selectedScorecard.sla_compliance_rate)}`}>
                <CheckCircle2 className={`h-5 w-5 mx-auto mb-1 ${getComplianceColor(selectedScorecard.sla_compliance_rate)}`} />
                <div className={`text-2xl font-bold ${getComplianceColor(selectedScorecard.sla_compliance_rate)}`}>
                  {selectedScorecard.sla_compliance_rate}%
                </div>
                <div className="text-xs text-muted-foreground">SLA Compliance</div>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-center">
                <Clock className="h-5 w-5 mx-auto text-purple-600 mb-1" />
                <div className="text-2xl font-bold text-purple-700">{formatHours(selectedScorecard.avg_transit_hours)}</div>
                <div className="text-xs text-purple-600">Avg Transit</div>
              </div>
              <div className={`rounded-lg p-4 text-center ${selectedScorecard.total_incidents > 0 ? "bg-red-50 border border-red-200" : "bg-green-50 border border-green-200"}`}>
                <AlertTriangle className={`h-5 w-5 mx-auto mb-1 ${selectedScorecard.total_incidents > 0 ? "text-red-600" : "text-green-600"}`} />
                <div className={`text-2xl font-bold ${selectedScorecard.total_incidents > 0 ? "text-red-700" : "text-green-700"}`}>
                  {selectedScorecard.total_incidents}
                </div>
                <div className="text-xs text-muted-foreground">Incidents</div>
              </div>
            </div>

            {/* Exceptions Breakdown */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-red-700">{selectedScorecard.exceptions_p1}</div>
                <Badge variant="destructive" className="mt-1">P1 Critical</Badge>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-yellow-700">{selectedScorecard.exceptions_p2}</div>
                <Badge variant="outline" className="mt-1 bg-yellow-100 text-yellow-800 border-yellow-300">P2 High</Badge>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-blue-700">{selectedScorecard.exceptions_p3}</div>
                <Badge variant="outline" className="mt-1 bg-blue-100 text-blue-800 border-blue-300">P3 Medium</Badge>
              </div>
            </div>

            {/* Trend Chart */}
            {selectedScorecard.trend_data && selectedScorecard.trend_data.length > 0 && (
              <div>
                <h3 className="font-semibold mb-4">6-Month Trend</h3>
                <div className="flex items-end gap-2 h-32 bg-muted/30 rounded-lg p-4">
                  {selectedScorecard.trend_data.map((point, i) => {
                    const maxShipments = Math.max(...selectedScorecard.trend_data.map(p => p.shipments), 1);
                    const height = (point.shipments / maxShipments) * 100;
                    const prevPoint = selectedScorecard.trend_data[i - 1];
                    
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

            {/* Status Breakdown & Top Issues */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-4">Status Breakdown</h3>
                <div className="space-y-2">
                  {Object.entries(selectedScorecard.status_breakdown || {})
                    .sort((a, b) => b[1] - a[1])
                    .map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between py-2 border-b">
                        <span className="text-sm">{STATUS_LABELS[status] || status}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{count}</span>
                          <span className="text-xs text-muted-foreground">
                            ({selectedScorecard.total_shipments > 0 
                              ? Math.round((count / selectedScorecard.total_shipments) * 100) 
                              : 0}%)
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-4">Top Issues</h3>
                {selectedScorecard.top_issues && selectedScorecard.top_issues.length > 0 ? (
                  <div className="space-y-2">
                    {selectedScorecard.top_issues.map((issue, i) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b">
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant="outline" 
                            className={
                              issue.severity === "P1" ? "bg-red-100 text-red-800 border-red-200" :
                              issue.severity === "P2" ? "bg-yellow-100 text-yellow-800 border-yellow-200" :
                              "bg-blue-100 text-blue-800 border-blue-200"
                            }
                          >
                            {issue.severity}
                          </Badge>
                          <span className="text-sm">{issue.issue}</span>
                        </div>
                        <span className="font-semibold">{issue.count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    <p>No issues this period!</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Email Dialog */}
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("scorecards.sendScorecard", "Send Scorecard")}</DialogTitle>
            <DialogDescription>
              {t("scorecards.emailDesc", "Send this scorecard to client contacts or custom email addresses")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("scorecards.customEmails", "Custom Email Addresses (optional)")}</Label>
              <Textarea
                placeholder="email1@example.com, email2@example.com"
                value={customEmails}
                onChange={(e) => setCustomEmails(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t("scorecards.emailHint", "Leave empty to use client's configured notification emails")}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDialogOpen(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button onClick={handleSendEmail} disabled={exportMutation.isPending}>
              {exportMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Mail className="h-4 w-4 mr-2" />
              )}
              {t("scorecards.send", "Send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
