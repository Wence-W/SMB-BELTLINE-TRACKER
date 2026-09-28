import { Plus } from "lucide-react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { friendlyErrorMessage } from "@/lib/convexError";
import { AUDIT_REACTIONS, type AuditReactionEmoji, type IntakeCallAudit } from "@/lib/intakeCallAuditTypes";
import { cn } from "@/lib/utils";

// Emoji reactions on the Intake Audits list, copied from Base44 (2026-08-18,
// Wence). One reaction per user per audit — clicking your own emoji again
// removes it, picking a different one swaps it. Hover a badge to see who
// reacted; the 💡 badge is the "Learning Point" callout Wence asked for.
export function AuditReactions({
  audit,
  canReact = true,
}: {
  audit: IntakeCallAudit;
  canReact?: boolean;
}) {
  const setReaction = useMutation(api.intakeCallAudits.setReaction);

  const handlePick = async (auditId: Id<"intakeCallAudits">, emoji: AuditReactionEmoji) => {
    try {
      await setReaction({ auditId, emoji });
    } catch (error) {
      toast.error(friendlyErrorMessage(error, "Could not update reaction"));
    }
  };

  const active = AUDIT_REACTIONS.filter(r => (audit.reactions?.[r.key]?.count ?? 0) > 0);

  return (
    <TooltipProvider>
      <div className="flex flex-wrap items-center gap-1">
        {active.map(r => {
          const bucket = audit.reactions?.[r.key];
          const mine = audit.myReaction === r.key;
          return (
            <Tooltip key={r.key}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={!canReact}
                  onClick={() => handlePick(audit._id, r.key)}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                    mine
                      ? "border-cyan-400 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                      : "border-border bg-muted/40 text-muted-foreground",
                  )}
                >
                  <span>{r.emoji}</span>
                  <span>{bucket?.count ?? 0}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="font-medium">{r.label}</div>
                <div className="text-xs">{bucket?.names.join(", ")}</div>
              </TooltipContent>
            </Tooltip>
          );
        })}
        {canReact && <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-6 rounded-full border border-dashed"
            >
              <Plus className="size-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="flex w-auto gap-1 p-1" align="start">
            {AUDIT_REACTIONS.map(r => (
              <Tooltip key={r.key}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => handlePick(audit._id, r.key)}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-md border text-base",
                      audit.myReaction === r.key
                        ? "border-cyan-400 bg-cyan-500/10"
                        : "border-transparent hover:bg-muted",
                    )}
                  >
                    {r.emoji}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{r.label}</TooltipContent>
              </Tooltip>
            ))}
          </PopoverContent>
        </Popover>}
      </div>
    </TooltipProvider>
  );
}
