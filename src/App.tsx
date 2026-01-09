import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Dashboard from "./pages/backoffice/Dashboard";
import Shipments from "./pages/backoffice/Shipments";
import ShipmentDetail from "./pages/backoffice/ShipmentDetail";
import CreateShipment from "./pages/backoffice/CreateShipment";
import Clients from "./pages/backoffice/Clients";
import Users from "./pages/backoffice/Users";
import MyShipments from "./pages/portal/MyShipments";
import ShipmentTracking from "./pages/portal/ShipmentTracking";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
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

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
