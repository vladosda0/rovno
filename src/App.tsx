import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import AppLayout from "@/layouts/AppLayout";
import AuthLayout from "@/layouts/AuthLayout";
import ProjectLayout from "@/layouts/ProjectLayout";

import Landing from "@/pages/Landing";
import Demo from "@/pages/Demo";
import Login from "@/pages/auth/Login";
import Signup from "@/pages/auth/Signup";
import ForgotPassword from "@/pages/auth/ForgotPassword";
import Onboarding from "@/pages/Onboarding";
import Home from "@/pages/Home";
import Pricing from "@/pages/Pricing";
import Profile from "@/pages/Profile";
import Settings from "@/pages/Settings";
import ProjectDashboard from "@/pages/project/ProjectDashboard";
import ProjectTasks from "@/pages/project/ProjectTasks";
import ProjectEstimate from "@/pages/project/ProjectEstimate";
import ProjectProcurement from "@/pages/project/ProjectProcurement";
import ProjectGallery from "@/pages/project/ProjectGallery";
import ProjectDocuments from "@/pages/project/ProjectDocuments";
import ProjectActivity from "@/pages/project/ProjectActivity";
import ProjectParticipants from "@/pages/project/ProjectParticipants";
import ThemeDemo from "@/pages/ThemeDemo";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Standalone pages */}
          <Route path="/" element={<Landing />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/theme" element={<ThemeDemo />} />

          {/* Auth layout */}
          <Route element={<AuthLayout />}>
            <Route path="/auth/login" element={<Login />} />
            <Route path="/auth/signup" element={<Signup />} />
            <Route path="/auth/forgot" element={<ForgotPassword />} />
          </Route>

          {/* App layout (sidebar + topbar) */}
          <Route element={<AppLayout />}>
            <Route path="/home" element={<Home />} />
            <Route path="/demo" element={<Demo />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/settings" element={<Settings />} />

            {/* Project with nested tabs */}
            <Route path="/project/:id" element={<ProjectLayout />}>
              <Route path="dashboard" element={<ProjectDashboard />} />
              <Route path="tasks" element={<ProjectTasks />} />
              <Route path="estimate" element={<ProjectEstimate />} />
              <Route path="procurement" element={<ProjectProcurement />} />
              <Route path="gallery" element={<ProjectGallery />} />
              <Route path="documents" element={<ProjectDocuments />} />
              <Route path="activity" element={<ProjectActivity />} />
              <Route path="participants" element={<ProjectParticipants />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
