import { Navigate, Outlet } from "react-router";
import { getToken } from "./token.ts";

export function RequireAuth() {
  if (getToken() === null) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
