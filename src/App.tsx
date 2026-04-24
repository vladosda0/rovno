import { Suspense, lazy, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";

const AppLayout = lazy(() => import("@/layouts/AppLayout"));
const AuthLayout = lazy(() => import("@/layouts/AuthLayout"));
const ProjectLayout = lazy(() => import("@/layouts/ProjectLayout"));

const Landing = lazy(() => import("@/pages/Landing"));
const Demo = lazy(() => import("@/pages/Demo"));
const Login = lazy(() => import("@/pages/auth/Login"));
const Signup = lazy(() => import("@/pages/auth/Signup"));
const ForgotPassword = lazy(() => import("@/pages/auth/ForgotPassword"));
const AuthResetPassword = lazy(() => import("@/pages/auth/AuthResetPassword"));
const AuthConfirm = lazy(() => import("@/pages/auth/AuthConfirm"));
const EmailSent = lazy(() => import("@/pages/auth/EmailSent"));
const AuthCallback = lazy(() => import("@/pages/auth/AuthCallback"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const Home = lazy(() => import("@/pages/Home"));
const Pricing = lazy(() => import("@/pages/Pricing"));
const Profile = lazy(() => import("@/pages/Profile"));
const Settings = lazy(() => import("@/pages/Settings"));
const ProjectDashboard = lazy(() => import("@/pages/project/ProjectDashboard"));
const ProjectTasks = lazy(() => import("@/pages/project/ProjectTasks"));
const ProjectEstimate = lazy(() => import("@/pages/project/ProjectEstimate"));
const ProjectProcurement = lazy(() => import("@/pages/project/ProjectProcurement"));
const ProjectHR = lazy(() => import("@/pages/project/ProjectHR"));
const ProjectGallery = lazy(() => import("@/pages/project/ProjectGallery"));
const ProjectDocuments = lazy(() => import("@/pages/project/ProjectDocuments"));
const ProjectActivity = lazy(() => import("@/pages/project/ProjectActivity"));
const ProjectParticipants = lazy(() => import("@/pages/project/ProjectParticipants"));
const ShareEstimate = lazy(() => import("@/pages/share/ShareEstimate"));
const InviteAccept = lazy(() => import("@/pages/invite/InviteAccept"));
const ThemeDemo = lazy(() => import("@/pages/ThemeDemo"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const queryClient = new QueryClient();

const RouteFallback = () => {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
      {t("app.loading")}
    </div>
  );
};

function routeElement(element: ReactElement): ReactElement {
  return <Suspense fallback={<RouteFallback />}>{element}</Suspense>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Standalone pages */}
          <Route path="/" element={routeElement(<Landing />)} />
          <Route path="/onboarding" element={routeElement(<Onboarding />)} />
          <Route path="/pricing" element={routeElement(<Pricing />)} />
          <Route path="/theme" element={routeElement(<ThemeDemo />)} />
          <Route path="/share/estimate/:shareId" element={routeElement(<ShareEstimate />)} />
          <Route path="/invite/accept/:inviteToken" element={routeElement(<InviteAccept />)} />

          {/* Auth layout */}
          <Route element={routeElement(<AuthLayout />)}>
            <Route path="/auth/login" element={routeElement(<Login />)} />
            <Route path="/auth/signup" element={routeElement(<Signup />)} />
            <Route path="/auth/forgot" element={routeElement(<ForgotPassword />)} />
            <Route path="/auth/reset-password" element={routeElement(<AuthResetPassword />)} />
            <Route path="/auth/confirm" element={routeElement(<AuthConfirm />)} />
            <Route path="/auth/email-sent" element={routeElement(<EmailSent />)} />
            <Route path="/auth/callback" element={routeElement(<AuthCallback />)} />
          </Route>

          {/* App layout (sidebar + topbar) */}
          <Route element={routeElement(<AppLayout />)}>
            <Route path="/home" element={routeElement(<Home />)} />
            <Route path="/demo" element={routeElement(<Demo />)} />
            <Route path="/profile" element={routeElement(<Profile />)} />
            <Route path="/profile/upgrade" element={routeElement(<Navigate to="/settings?tab=billing" replace />)} />
            <Route path="/settings" element={routeElement(<Settings />)} />

            {/* Project with nested tabs */}
            <Route path="/project/:id" element={routeElement(<ProjectLayout />)}>
              <Route path="dashboard" element={routeElement(<ProjectDashboard />)} />
              <Route path="tasks" element={routeElement(<ProjectTasks />)} />
              <Route path="estimate" element={routeElement(<ProjectEstimate />)} />
              <Route path="procurement" element={routeElement(<ProjectProcurement />)} />
              <Route path="procurement/order/:orderId" element={routeElement(<ProjectProcurement />)} />
              <Route path="procurement/:itemId" element={routeElement(<ProjectProcurement />)} />
              <Route path="hr" element={routeElement(<ProjectHR />)} />
              <Route path="gallery" element={routeElement(<ProjectGallery />)} />
              <Route path="documents" element={routeElement(<ProjectDocuments />)} />
              <Route path="activity" element={routeElement(<ProjectActivity />)} />
              <Route path="participants" element={routeElement(<ProjectParticipants />)} />
            </Route>
          </Route>

          <Route path="*" element={routeElement(<NotFound />)} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
