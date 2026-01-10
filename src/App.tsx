import '@/i18n';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { SLANotificationManager } from "@/components/notifications/SLANotificationManager";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Dashboard from "./pages/backoffice/Dashboard";
import Shipments from "./pages/backoffice/Shipments";
import ShipmentDetail from "./pages/backoffice/ShipmentDetail";
import CreateShipment from "./pages/backoffice/CreateShipment";
import Clients from "./pages/backoffice/Clients";
import Users from "./pages/backoffice/Users";
import AuditLogs from "./pages/backoffice/AuditLogs";
import Settings from "./pages/backoffice/Settings";
import ActionRequired from "./pages/backoffice/ActionRequired";
import ExceptionRules from "./pages/backoffice/ExceptionRules";
import SLAManagement from "./pages/backoffice/SLAManagement";
import SLABreachReport from "./pages/backoffice/SLABreachReport";
import NotificationSettings from "./pages/backoffice/NotificationSettings";
import SLAHeatmap from "./pages/backoffice/SLAHeatmap";
import MyShipments from "./pages/portal/MyShipments";
import ShipmentTracking from "./pages/portal/ShipmentTracking";
import Profile from "./pages/portal/Profile";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <SLANotificationManager />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            
            {/* Backoffice routes */}
            <Route path="/backoffice" element={
              <ProtectedRoute requireInternal>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/backoffice/shipments" element={
              <ProtectedRoute requireInternal>
                <Shipments />
              </ProtectedRoute>
            } />
            <Route path="/backoffice/shipments/new" element={
              <ProtectedRoute requireInternal>
                <CreateShipment />
              </ProtectedRoute>
            } />
            <Route path="/backoffice/shipments/:id" element={
              <ProtectedRoute requireInternal>
                <ShipmentDetail />
              </ProtectedRoute>
            } />
            <Route path="/backoffice/clients" element={
              <ProtectedRoute requireInternal>
                <Clients />
              </ProtectedRoute>
            } />
            <Route path="/backoffice/users" element={
              <ProtectedRoute requireInternal>
                <Users />
              </ProtectedRoute>
            } />
            <Route path="/backoffice/audit-logs" element={
              <ProtectedRoute requireInternal>
                <AuditLogs />
              </ProtectedRoute>
            } />
            <Route path="/backoffice/settings" element={
              <ProtectedRoute requireInternal>
                <Settings />
              </ProtectedRoute>
            } />
            <Route path="/backoffice/action-required" element={
              <ProtectedRoute requireInternal>
                <ActionRequired />
              </ProtectedRoute>
            } />
            <Route path="/backoffice/exception-rules" element={
              <ProtectedRoute requireInternal>
                <ExceptionRules />
              </ProtectedRoute>
            } />
            <Route path="/backoffice/sla-management" element={
              <ProtectedRoute requireInternal>
                <SLAManagement />
              </ProtectedRoute>
            } />
            <Route path="/backoffice/sla-breach-report" element={
              <ProtectedRoute requireInternal>
                <SLABreachReport />
              </ProtectedRoute>
            } />
            <Route path="/backoffice/notification-settings" element={
              <ProtectedRoute requireInternal>
                <NotificationSettings />
              </ProtectedRoute>
            } />
            <Route path="/backoffice/sla-heatmap" element={
              <ProtectedRoute requireInternal>
                <SLAHeatmap />
              </ProtectedRoute>
            } />

            {/* Customer portal routes */}
            <Route path="/portal" element={
              <ProtectedRoute requireCustomer>
                <MyShipments />
              </ProtectedRoute>
            } />
            <Route path="/portal/shipments/:id" element={
              <ProtectedRoute requireCustomer>
                <ShipmentTracking />
              </ProtectedRoute>
            } />
            <Route path="/portal/profile" element={
              <ProtectedRoute requireCustomer>
                <Profile />
              </ProtectedRoute>
            } />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
