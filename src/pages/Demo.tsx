import { Navigate } from "react-router-dom";
import { isAuthenticated } from "@/lib/auth-state";

export default function Demo() {
  return <Navigate to={isAuthenticated() ? "/home" : "/#demos"} replace />;
}
