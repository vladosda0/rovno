import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { seedProjects } from "@/data/seed";
import { enterDemoSession } from "@/lib/auth-state";

/**
 * Direct demo entry (`/demo`) — a linkable marketing URL that starts the same
 * sandboxed demo session as the landing's "Посмотреть демо" CTA and opens the
 * showcase project. The demo is a mockup, never an account: it used to bounce
 * through the simulated-auth check here, which misread fresh visitors as
 * signed-in owners.
 */
export default function Demo() {
  const navigate = useNavigate();

  useEffect(() => {
    const demoProjectId = seedProjects[0]?.id;
    if (!demoProjectId) {
      navigate("/", { replace: true });
      return;
    }
    enterDemoSession(demoProjectId);
    navigate(`/project/${demoProjectId}/dashboard`, { replace: true });
  }, [navigate]);

  return null;
}
