import { EmptyState } from "@/components/EmptyState";
import { ShoppingCart } from "lucide-react";

export default function ProjectProcurement() {
  return (
    <EmptyState
      icon={ShoppingCart}
      title="Procurement"
      description="Material orders, supplier tracking, and purchase status will appear here."
      actionLabel="Add Item"
      onAction={() => {}}
    />
  );
}
