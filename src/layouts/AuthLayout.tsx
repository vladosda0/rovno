import { Outlet } from "react-router-dom";
import { Link } from "react-router-dom";

export default function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-sp-2">
      <div className="w-full max-w-md">
        <div className="mb-sp-4 text-center">
          <Link to="/" className="text-h2 font-bold text-foreground">СтройАгент</Link>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
