import { EmptyState } from "@/components/EmptyState";
import { User } from "lucide-react";

export default function Profile() {
  return (
    <div className="p-sp-3">
      <EmptyState
        icon={User}
        title="Profile"
        description="Your profile and account details will appear here."
      />
    </div>
  );
}
