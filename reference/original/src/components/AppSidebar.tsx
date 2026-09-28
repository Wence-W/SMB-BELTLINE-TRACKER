import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  DollarSign,
  History,
  Inbox,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Moon,
  ShieldCheck,
  Sun,
  Users,
  Video,
} from "lucide-react";
import { useMemo } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useTheme } from "@/contexts/ThemeContext";
import { APP_NAME } from "@/lib/constants";
import { isDosPastDue, needsAuthStatusUpdate } from "@/lib/computations";
import type { BariCase } from "@/lib/types";
import { api } from "../../convex/_generated/api";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "./ui/sidebar";

// Every entry navigates to /dashboard with a `tab` (and optional `sub`)
// search param that OperationsPage / BariTrackerPage read to pick the
// active view. Sidebar replaces the old top tab row (2026-07-17 per Wence).
const CASES_GROUP = [
  { tab: "cases", sub: "all_cases", label: "Cases", icon: ListChecks },
  { tab: "urgent", label: "Urgent", icon: AlertTriangle },
  { tab: "priority", label: "Priority", icon: Clock },
  { tab: "expiring", label: "Expiring", icon: Clock },
  { tab: "completed", label: "Completed", icon: CheckCircle2 },
  // Two reference/SOP tabs nested here per Wence, 2026-09-23 ("kasama ng
  // Cases/Urgent/Priority/Expiring/Complete"). No badges, no case data.
  { tab: "verification-process", label: "Verification Workflow Process", icon: ClipboardList },
  { tab: "verification-guidelines", label: "Verification Guidelines", icon: ClipboardList },
] as const;

const OPEN_CASE_STATUSES = new Set<BariCase["status"]>([
  "new",
  "in_progress",
  "on_hold",
  "reassigned",
]);

const TOP_ITEMS = [
  { tab: "cases", sub: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { tab: "staff-productivity", label: "Staff Daily Productivity", icon: Users },
  { tab: "intake", label: "Intake", icon: Inbox },
  { tab: "billing", label: "Billing", icon: DollarSign },
  {
    tab: "cases",
    sub: "verification_team",
    label: "Ins Verifiers",
    icon: ShieldCheck,
  },
  { tab: "reports", label: "Reports", icon: LayoutDashboard },
] as const;

function isActiveLink(
  pathname: string,
  searchParams: URLSearchParams,
  tab: string,
  sub?: string,
) {
  if (pathname !== "/dashboard") return false;
  const currentTab = searchParams.get("tab") ?? "cases";
  if (currentTab !== tab) return false;
  if (!sub) return true;
  const currentSub = searchParams.get("sub") ?? "dashboard";
  return currentSub === sub;
}

function navLink(tab: string, sub?: string) {
  const params = new URLSearchParams({ tab });
  if (sub) params.set("sub", sub);
  return `/dashboard?${params.toString()}`;
}

function SidebarNav() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { setOpenMobile } = useSidebar();

  // Ins Verifiers Urgent/Expiring past-due badges (Wence, 2026-08-04):
  // Urgent = open Urgent-priority cases still needing an Auth Status
  // update; Expiring = cases whose DOS has already passed but still
  // needing an Auth Status update. Recomputed live off the same cases
  // query the Ins Verifiers pages use.
  const rawCases = useQuery(api.cases.listAll);
  // Priority badge (Wence, 2026-08-12, option 2): open High/Urgent Cases +
  // open High/Urgent Tasks combined — i.e. exactly what the Priority tab
  // lists (see OperationsPage `casesPriorityOpen` + `priorityTasks`).
  const rawTasks = useQuery(api.tasks.listAll);
  const badgeCounts = useMemo(() => {
    const cases = rawCases ?? [];
    const tasks = rawTasks ?? [];
    const priorityCases = cases.filter(
      c =>
        (c.priority === "urgent" || c.priority === "high") &&
        OPEN_CASE_STATUSES.has(c.status as BariCase["status"]),
    ).length;
    const priorityTasks = tasks.filter(
      t =>
        (t.priority === "high" || t.priority === "urgent") &&
        t.status !== "completed" &&
        t.status !== "cancelled",
    ).length;
    const priority = priorityCases + priorityTasks;
    const urgent = cases.filter(
      c =>
        c.priority === "urgent" &&
        OPEN_CASE_STATUSES.has(c.status as BariCase["status"]) &&
        needsAuthStatusUpdate(c as unknown as BariCase),
    ).length;
    const expiring = cases.filter(
      c =>
        isDosPastDue(c as unknown as BariCase) &&
        needsAuthStatusUpdate(c as unknown as BariCase),
    ).length;
    return { priority, urgent, expiring };
  }, [rawCases, rawTasks]);

  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {TOP_ITEMS.slice(0, 1).map(item => (
              <SidebarMenuItem key={item.label}>
                <SidebarMenuButton
                  asChild
                  isActive={isActiveLink(
                    location.pathname,
                    searchParams,
                    item.tab,
                    "sub" in item ? item.sub : undefined,
                  )}
                >
                  <Link
                    to={navLink(item.tab, "sub" in item ? item.sub : undefined)}
                    onClick={() => setOpenMobile(false)}
                  >
                    <item.icon />
                    <span className="font-bold">{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}

            {/* Call Audits is a top-level item directly below Dashboard
                (Wence, 2026-08-18). */}
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={isActiveLink(location.pathname, searchParams, "call-audits")}
              >
                <Link to={navLink("call-audits")} onClick={() => setOpenMobile(false)}>
                  <Video />
                  <span className="font-bold">Call Audits</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {/* Staff Daily Productivity */}
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={isActiveLink(
                  location.pathname,
                  searchParams,
                  "staff-productivity",
                )}
              >
                <Link
                  to={navLink("staff-productivity")}
                  onClick={() => setOpenMobile(false)}
                >
                  <Users />
                  <span className="font-bold">Staff Daily Productivity</span>
                </Link>
              </SidebarMenuButton>
              <SidebarMenuSub>
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton
                    asChild
                    isActive={isActiveLink(location.pathname, searchParams, "reports")}
                  >
                    <Link to={navLink("reports")} onClick={() => setOpenMobile(false)}>
                      Reports
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              </SidebarMenuSub>
            </SidebarMenuItem>

            {/* Historical Activity — read-only archive of team-wide activity
                by category, imported from the pre-app spreadsheet tracker
                (Corbin, 2026-08-27). Team-level trends only, no per-person
                data. */}
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={isActiveLink(location.pathname, searchParams, "historical")}
              >
                <Link to={navLink("historical")} onClick={() => setOpenMobile(false)}>
                  <History />
                  <span className="font-bold">Historical Activity</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {/* Intake, with three nested sub-views, in order per Wence
                (2026-08-04): "Intake Directory" (renamed from "Beltline
                Directory" and moved under Intake, from its own top-level
                tab, positioned first), "Activity Log" (renamed from
                "Reports" 2026-08-03, added 2026-07-24 — same pattern as
                Staff Daily Productivity's Reports), and "Booked Tracker"
                (added 2026-08-03). */}
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={isActiveLink(location.pathname, searchParams, "intake")}
              >
                <Link to={navLink("intake")} onClick={() => setOpenMobile(false)}>
                  <Inbox />
                  <span className="font-bold">Intake</span>
                </Link>
              </SidebarMenuButton>
              <SidebarMenuSub>
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton
                    asChild
                    isActive={isActiveLink(location.pathname, searchParams, "directory")}
                  >
                    <Link to={navLink("directory")} onClick={() => setOpenMobile(false)}>
                      Intake Directory
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton
                    asChild
                    isActive={isActiveLink(
                      location.pathname,
                      searchParams,
                      "intake-reports",
                    )}
                  >
                    <Link
                      to={navLink("intake-reports")}
                      onClick={() => setOpenMobile(false)}
                    >
                      Activity Log
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton
                    asChild
                    isActive={isActiveLink(
                      location.pathname,
                      searchParams,
                      "intake-booked",
                    )}
                  >
                    <Link
                      to={navLink("intake-booked")}
                      onClick={() => setOpenMobile(false)}
                    >
                      Booked Tracker
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              </SidebarMenuSub>
            </SidebarMenuItem>

            {/* Billing */}
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={isActiveLink(location.pathname, searchParams, "billing")}
              >
                <Link to={navLink("billing")} onClick={() => setOpenMobile(false)}>
                  <DollarSign />
                  <span className="font-bold">Billing</span>
                </Link>
              </SidebarMenuButton>
              <SidebarMenuSub>
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton
                    asChild
                    isActive={isActiveLink(
                      location.pathname,
                      searchParams,
                      "billing-activity",
                    )}
                  >
                    <Link
                      to={navLink("billing-activity")}
                      onClick={() => setOpenMobile(false)}
                    >
                      Activity Log
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              </SidebarMenuSub>
            </SidebarMenuItem>

            {/* Ins Verifiers, with the Cases/Urgent/Priority/Expiring/Completed
                group nested underneath it. */}
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={isActiveLink(
                  location.pathname,
                  searchParams,
                  "cases",
                  "verification_team",
                )}
              >
                <Link
                  to={navLink("cases", "verification_team")}
                  onClick={() => setOpenMobile(false)}
                >
                  <ShieldCheck />
                  <span className="font-bold">Ins Verifiers</span>
                </Link>
              </SidebarMenuButton>
              <SidebarMenuSub>
                {CASES_GROUP.map(item => (
                  <SidebarMenuSubItem key={item.label}>
                    <SidebarMenuSubButton
                      asChild
                      isActive={isActiveLink(
                        location.pathname,
                        searchParams,
                        item.tab,
                        "sub" in item ? item.sub : undefined,
                      )}
                    >
                      <Link
                        to={navLink(item.tab, "sub" in item ? item.sub : undefined)}
                        onClick={() => setOpenMobile(false)}
                      >
                        <span className="flex-1">{item.label}</span>
                        {item.tab === "priority" && badgeCounts.priority > 0 && (
                          <span
                            title="Open High/Urgent priority Cases + Tasks"
                            className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500/90 text-white text-[10px] font-semibold leading-none"
                          >
                            {badgeCounts.priority}
                          </span>
                        )}
                        {item.tab === "urgent" && badgeCounts.urgent > 0 && (
                          <span
                            title="Open Urgent cases past due for an Auth Status update"
                            className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500/90 text-white text-[10px] font-semibold leading-none"
                          >
                            {badgeCounts.urgent}
                          </span>
                        )}
                        {item.tab === "expiring" && badgeCounts.expiring > 0 && (
                          <span
                            title="Cases past their DOS still needing an Auth Status update"
                            className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500/90 text-white text-[10px] font-semibold leading-none"
                          >
                            {badgeCounts.expiring}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ))}
              </SidebarMenuSub>
            </SidebarMenuItem>

          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  );
}


function SidebarUserMenu() {
  const user = useQuery(api.auth.currentUser);
  const { signOut } = useAuthActions();
  const { theme, toggleTheme, switchable } = useTheme();
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarFooter className="border-t border-sidebar-border">
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton size="lg">
                <Avatar className="size-8">
                  {user?.image && <AvatarImage src={user.image} alt={user?.name || "User"} />}
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
                    {user?.name?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col items-start text-left">
                  <span className="text-sm font-medium truncate">
                    {user?.name || "User"}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">
                    {user?.email}
                  </span>
                </div>
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="start"
              className="w-[--radix-dropdown-menu-trigger-width]"
            >
              <DropdownMenuItem asChild>
                <Link to="/settings" onClick={() => setOpenMobile(false)}>
                  <ShieldCheck className="size-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              {switchable && (
                <DropdownMenuItem onClick={toggleTheme}>
                  {theme === "light" ? (
                    <Moon className="size-4" />
                  ) : (
                    <Sun className="size-4" />
                  )}
                  {theme === "light" ? "Dark mode" : "Light mode"}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => signOut()}
                className="text-destructive focus:text-destructive focus:bg-destructive/10"
              >
                <LogOut className="size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}

function SidebarHeaderContent() {
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarHeader className="border-b border-sidebar-border">
      <Link
        to="/"
        onClick={() => setOpenMobile(false)}
        className="flex items-center gap-2.5 px-2 py-1 font-semibold text-lg"
      >
        <div className="size-8 rounded-lg bg-primary flex items-center justify-center">
          <span className="text-primary-foreground font-bold text-sm">M</span>
        </div>
        <span>{APP_NAME}</span>
      </Link>
    </SidebarHeader>
  );
}

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeaderContent />
      <SidebarNav />
      <SidebarUserMenu />
    </Sidebar>
  );
}
