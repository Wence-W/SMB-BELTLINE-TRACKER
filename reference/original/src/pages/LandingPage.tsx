import { useConvexAuth } from "convex/react";
import { ArrowRight, ClipboardList, Database, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function LandingPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-16 bg-slate-950 min-h-screen">
      {/* Glow backdrop */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 size-[600px] bg-blue-600/10 rounded-full blur-3xl" />
      </div>

      <div className="text-center space-y-6 max-w-xl mx-auto">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-500/30 bg-blue-500/10 text-xs font-medium text-blue-300">
          <span className="size-1.5 bg-blue-400 rounded-full animate-pulse" />
          Healthcare Operations Platform
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white">
          Bariatric Operations
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
            Tracker
          </span>
        </h1>

        <p className="text-slate-400 text-base leading-relaxed">
          Manage urgent requests, consults, precerts, and staff workloads in one
          streamlined healthcare operations dashboard.
        </p>

        {!isLoading && (
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            {isAuthenticated ? (
              <Button
                size="lg"
                className="bg-blue-600 hover:bg-blue-500 text-white h-11 px-6"
                asChild
              >
                <Link to="/dashboard">
                  Open Dashboard
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button
                  size="lg"
                  className="bg-blue-600 hover:bg-blue-500 text-white h-11 px-6"
                  asChild
                >
                  <Link to="/signup">
                    Get Started
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-11 px-6 border-slate-600 text-slate-300 hover:bg-slate-800"
                  asChild
                >
                  <Link to="/login">Sign In</Link>
                </Button>
              </>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 pt-8">
          {[
            {
              icon: ClipboardList,
              label: "Full Case Tracking",
              desc: "Consults, precerts, reverification",
            },
            {
              icon: ShieldCheck,
              label: "Pre-Cert Management",
              desc: "New, in-progress, modified/urgent",
            },
            {
              icon: Database,
              label: "Local Persistence",
              desc: "Auto-saved to your browser",
            },
          ].map(f => (
            <div
              key={f.label}
              className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4 text-center"
            >
              <f.icon className="size-5 text-blue-400 mx-auto mb-2" />
              <div className="text-xs font-semibold text-white mb-1">
                {f.label}
              </div>
              <div className="text-[11px] text-slate-500">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
