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
import MyShipments from "./pages/portal/MyShipments";

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

            {/* Customer portal routes */}
            <Route path="/portal" element={
              <ProtectedRoute requireCustomer>
                <MyShipments />
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
