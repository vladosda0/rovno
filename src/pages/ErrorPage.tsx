import { EmptyState } from "@/components/EmptyState";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export default function ErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <EmptyState
          icon={AlertTriangle}
          title="Something went wrong"
          description="An unexpected error occurred. Please try again."
        />
        <Button asChild variant="outline" className="mt-sp-2">
          <Link to="/">Go Home</Link>
        </Button>
      </div>
    </div>
  );
}
