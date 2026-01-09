import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { AppRole } from '@/lib/constants';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: AppRole[];
  requireInternal?: boolean;
  requireCustomer?: boolean;
}

export function ProtectedRoute({ 
  children, 
  allowedRoles, 
  requireInternal,
  requireCustomer 
}: ProtectedRouteProps) {
  const { user, role, isLoading, isInternalUser, isCustomer } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md p-6">
          <h2 className="text-xl font-semibold mb-2">Account Pending</h2>
          <p className="text-muted-foreground">
            Your account is pending role assignment. Please contact an administrator.
          </p>
        </div>
      </div>
    );
  }

  if (requireInternal && !isInternalUser) {
    return <Navigate to="/portal" replace />;
  }

  if (requireCustomer && !isCustomer) {
    return <Navigate to="/backoffice" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to={isInternalUser ? '/backoffice' : '/portal'} replace />;
  }

  return <>{children}</>;
}
