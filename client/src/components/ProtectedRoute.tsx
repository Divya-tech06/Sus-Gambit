import { Navigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((state) => state.accessToken);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}
