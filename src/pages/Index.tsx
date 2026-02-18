import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background grain">
      <div className="relative z-10 text-center space-y-sp-3">
        <h1 className="text-h1">StroyAgent</h1>
        <p className="text-body text-muted-foreground max-w-md mx-auto">
          Construction management platform — UI Component Library
        </p>
        <button
          onClick={() => navigate("/theme")}
          className="mt-sp-2 px-sp-4 py-sp-1 rounded-pill glass text-body font-medium hover:scale-[1.02] transition-transform duration-150"
        >
          View Design System →
        </button>
      </div>
    </div>
  );
};

export default Index;
