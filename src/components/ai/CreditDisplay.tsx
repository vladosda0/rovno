import { Coins, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCurrentUser } from "@/hooks/use-mock-data";

export function CreditDisplay({ onLimitReached }: { onLimitReached: () => void }) {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const total = user.credits_free + user.credits_paid;
  const maxCredits = 300;
  const freePct = Math.min((user.credits_free / maxCredits) * 100, 100);
  const paidPct = Math.min((user.credits_paid / maxCredits) * 100, 100);
  const isLow = total < 10;
  const isEmpty = total <= 0;

  const handleClick = () => {
    if (isEmpty) {
      onLimitReached();
    } else {
      navigate("/pricing");
    }
  };

  return (
    <button onClick={handleClick} className="w-full glass rounded-card p-2 text-left hover:bg-accent/5 transition-colors">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <Coins className={`h-3.5 w-3.5 ${isLow ? "text-warning" : "text-accent"}`} />
          <span className="text-caption font-semibold text-foreground">Credits</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={`text-body-sm font-bold ${isLow ? "text-warning" : "text-foreground"}`}>{total}</span>
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden flex">
        <div className="h-full bg-info rounded-l-full transition-all" style={{ width: `${paidPct}%` }} />
        <div className="h-full bg-info/50 transition-all" style={{ width: `${freePct}%` }} />
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-caption text-muted-foreground">
          {user.credits_free > 0 ? "Using daily credits" : "Using paid credits"}
        </span>
      </div>
    </button>
  );
}
