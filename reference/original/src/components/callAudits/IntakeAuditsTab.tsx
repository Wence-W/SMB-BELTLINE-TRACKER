import { useAction, useMutation, useQuery } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import { ArrowLeft, Pencil, Plus, Save, Star, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { inDateRange } from "@/components/DateRangeFilter";
import { AuditReactions } from "@/components/callAudits/AuditReactions";
import { StarRating } from "@/components/callAudits/StarRating";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  INTAKE_AUDITORS,
  INTAKE_AUDIT_STATUSES,
  INTAKE_CALL_CATEGORIES,
  INTAKE_SPECIALISTS,
  INTAKE_RESULTS,
  INTAKE_RISK_LEVELS,
  type IntakeCallAudit,
  type IntakeRecordingSession,
  type RubricKey,
  computeComplianceScorePreview,
  computeQaScorePreview,
  computeRiskLevelPreview,
  intakeScoreBadgeClass,
  intakeStatusBadgeClass,
  openAuthenticatedIntakeRecording,
  RUBRIC_SECTIONS,
  resultBadgeClass,
  resultTextClass,
  riskBadgeClass,
  riskTextClass,
  scoreTextClass,
} from "@/lib/intakeCallAuditTypes";
import { friendlyErrorMessage } from "@/lib/convexError";
import { cn } from "@/lib/utils";
import { useHasRestrictedAccess } from "@/lib/permissions";

// The whole module mirrors the Base44 `intake-call-audits` app layout Wence
// asked us to keep (2026-08-17): a filtered list, a read-only audit detail page
// with score tiles + star scorecard, and a sectioned New/Edit Call Audit form.

// Intake recordings are usually call audio (MP3 from Base44); screen recordings
// are still allowed for teams that capture video.
const ACCEPTED_RECORDING_TYPES = [
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Base44 card grammar: title strip, hairline divider, padded body. */
function PanelCard({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            {title && <p className="font-semibold">{title}</p>}
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

function StatTile({
  label,
  value,
  valueClass,
  compact = false,
}: {
  label: string;
  value: string | number;
  valueClass?: string;
  /** Tighter padding/text so 4 tiles fit in one row on narrow viewports. */
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card",
        compact ? "px-2.5 py-2.5 sm:px-5 sm:py-4" : "px-5 py-4",
      )}
    >
      <p
        className={cn(
          "font-medium uppercase tracking-wide text-muted-foreground",
          compact ? "text-[9px] sm:text-xs" : "text-xs",
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-semibold tabular-nums",
          compact ? "text-base sm:text-2xl" : "text-2xl",
          valueClass,
        )}
      >
        {value}
      </p>
    </div>
  );
}

function InfoField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-normal text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function InlineStatusSelect({
  status,
  saving,
  onChange,
}: {
  status: string;
  saving: boolean;
  onChange: (nextStatus: string) => void;
}) {
  return (
    <Select value={status} onValueChange={onChange} disabled={saving}>
      <SelectTrigger
        aria-label={`Status: ${status}`}
        className={cn(
          "h-8 w-[112px] rounded-md border px-2 text-[11px] font-medium shadow-none focus-visible:ring-1 focus-visible:ring-cyan-500/40",
          intakeStatusBadgeClass(status),
        )}
        onClick={event => event.stopPropagation()}
        onKeyDown={event => event.stopPropagation()}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        className="min-w-[112px] rounded-md border border-emerald-300/70 bg-emerald-50 p-0 text-emerald-700 shadow-xl dark:border-emerald-700/70 dark:bg-emerald-950 dark:text-emerald-300"
        position="popper"
        align="start"
        sideOffset={2}
      >
        {INTAKE_AUDIT_STATUSES.map(value => (
          <SelectItem
            key={value}
            value={value}
            className="rounded-none px-3 py-2 text-xs text-emerald-700 focus:bg-blue-600 focus:text-white dark:text-emerald-300"
          >
            {value}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="pt-2 text-sm font-semibold text-green-600 dark:text-green-400">
      {children}
    </p>
  );
}

/** Read-only 5-star row, same shape as the Base44 scorecard. */
function StarsDisplay({ value }: { value?: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(star => (
        <Star
          key={star}
          className={cn(
            "size-4",
            value !== undefined && star <= value
              ? "fill-green-500 text-green-600"
              : "fill-transparent text-muted-foreground/50",
          )}
        />
      ))}
      <span className="ml-2 w-8 text-right text-xs text-muted-foreground">
        {value !== undefined ? `${value}/5` : "—"}
      </span>
    </div>
  );
}

function CriterionRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-2 last:border-b-0">
      <span className="text-sm">{label}</span>
      {children}
    </div>
  );
}

function TextBlock({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="whitespace-pre-wrap text-sm">{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ detail */

function IntakeAuditDetail({
  audit,
  onBack,
  onEdit,
  onDelete,
  isAdmin,
}: {
  audit: IntakeCallAudit;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isAdmin: boolean;
}) {
  const authToken = useAuthToken();
  const [session, setSession] = useState<IntakeRecordingSession | null>(null);
  const [loadingRecording, setLoadingRecording] = useState(false);

  // The recording is protected media: stream it through the authenticated HTTP
  // action, then hand the blob URL to the inline player Base44 shows here.
  useEffect(() => {
    if (!isAdmin || !audit.videoStorageId || !authToken) return;
    let active = true;
    let opened: IntakeRecordingSession | null = null;
    setLoadingRecording(true);
    void openAuthenticatedIntakeRecording(audit._id, authToken)
      .then(result => {
        opened = result;
        if (!active) {
          result.dispose();
          return;
        }
        setSession(result);
      })
      .catch((error: unknown) => {
        if (active) {
          toast.error(friendlyErrorMessage(error, "Could not open recording"));
        }
      })
      .finally(() => {
        if (active) setLoadingRecording(false);
      });
    return () => {
      active = false;
      opened?.dispose();
      setSession(null);
    };
  }, [audit._id, audit.videoStorageId, authToken, isAdmin]);

  const documentation = audit.documentation;
  const coaching = audit.coaching;
  const hasCoaching = Boolean(
    coaching?.strengths ||
      coaching?.improvements ||
      coaching?.recommendation ||
      coaching?.notes ||
      audit.notes,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to audits">
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {audit.intakeSpecialist}
            </h1>
            <p className="text-sm text-muted-foreground">
              Audit · {audit.callDate}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button variant="outline" onClick={onEdit}>
              <Pencil className="size-4" /> Edit
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="outline"
              onClick={onDelete}
              className="text-rose-600 hover:text-rose-600"
            >
              <Trash2 className="size-4" /> Delete
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 sm:gap-4">
        <StatTile
          compact
          label="QA score"
          value={`${audit.qaScore}%`}
          valueClass={scoreTextClass(audit.qaScore)}
        />
        <StatTile
          compact
          label="Compliance"
          value={`${audit.complianceScore}%`}
          valueClass={scoreTextClass(audit.complianceScore)}
        />
        <StatTile
          compact
          label="Result"
          value={audit.finalResult}
          valueClass={resultTextClass(audit.finalResult)}
        />
        <StatTile
          compact
          label="Risk"
          value={audit.riskLevel}
          valueClass={riskTextClass(audit.riskLevel)}
        />
      </div>

      <PanelCard title="Call Information">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoField label="Date Reviewed">{audit.dateReviewed || "—"}</InfoField>
          <InfoField label="Call Date">{audit.callDate}</InfoField>
          <InfoField label="Intake Specialist">{audit.intakeSpecialist}</InfoField>
          <InfoField label="Auditor">{audit.auditor}</InfoField>
          <InfoField label="Duration">{audit.duration || "—"}</InfoField>
          <InfoField label="Chart">{audit.chart || "—"}</InfoField>
          <InfoField label="Category">{audit.callCategory}</InfoField>
          <InfoField label="Status">
            <Badge variant="outline" className={intakeStatusBadgeClass(audit.status)}>
              {audit.status}
            </Badge>
          </InfoField>
        </div>
        {isAdmin && <div className="mt-5">
          {!audit.videoStorageId && (
            <p className="text-sm text-muted-foreground">No recording attached.</p>
          )}
          {audit.videoStorageId && loadingRecording && (
            <p className="text-sm text-muted-foreground">
              Downloading protected recording…
            </p>
          )}
          {session &&
            (session.isAudio ? (
              <audio
                src={session.url}
                controls
                className="h-10 w-full max-w-sm"
              />
            ) : (
              <video
                src={session.url}
                controls
                className="w-full rounded-lg bg-slate-900"
              />
            ))}
        </div>}
      </PanelCard>

      <PanelCard title="Call Quality Assessment">
        <div className="space-y-1">
          {RUBRIC_SECTIONS.map(section => (
            <div key={section.title} className="space-y-1">
              <SectionHeading>{section.title}</SectionHeading>
              {section.items.map(([key, label]) => (
                <CriterionRow key={key} label={label}>
                  <StarsDisplay value={audit.scores?.[key as RubricKey]} />
                </CriterionRow>
              ))}
            </div>
          ))}
        </div>
      </PanelCard>

      <PanelCard title="Documentation Review">
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ["Chart updated", documentation?.chartUpdated],
              ["Notes complete", documentation?.notesComplete],
              ["Follow-up documented", documentation?.followupDocumented],
            ] as [string, boolean | undefined][]
          ).map(([label, value]) => (
            <div
              key={label}
              className={cn(
                "rounded-lg border px-4 py-3 text-sm",
                value === undefined
                  ? "border-border text-muted-foreground"
                  : value
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
              )}
            >
              {label}: {value === undefined ? "—" : value ? "Yes" : "No"}
            </div>
          ))}
        </div>
        {documentation?.missingIssues && (
          <p className="mt-4 whitespace-pre-wrap text-sm">
            <span className="text-muted-foreground">Missing issues: </span>
            {documentation.missingIssues}
          </p>
        )}
      </PanelCard>

      {hasCoaching && (
        <PanelCard title="Coaching Notes">
          <div className="space-y-4">
            <TextBlock label="Strengths Observed" value={coaching?.strengths} />
            <TextBlock label="Areas of Improvement" value={coaching?.improvements} />
            <TextBlock
              label="Coaching Recommendation"
              value={coaching?.recommendation}
            />
            <TextBlock label="Additional Notes" value={coaching?.notes} />
            <TextBlock label="Notes" value={audit.notes} />
          </div>
        </PanelCard>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- form */

function IntakeAuditForm({
  audit,
  onCancel,
  onSaved,
}: {
  audit: IntakeCallAudit | null;
  onCancel: () => void;
  onSaved: (id: Id<"intakeCallAudits">) => void;
}) {
  const createAudit = useMutation(api.intakeCallAudits.create);
  const updateAudit = useMutation(api.intakeCallAudits.update);
  const generateUploadUrl = useMutation(api.intakeCallAudits.generateUploadUrl);
  const attachUploadedVideo = useAction(api.intakeCallAudits.attachUploadedVideo);

  const [dateReviewed, setDateReviewed] = useState(audit?.dateReviewed ?? todayIso());
  const [callDate, setCallDate] = useState(audit?.callDate ?? todayIso());
  const [intakeSpecialist, setIntakeSpecialist] = useState(audit?.intakeSpecialist ?? "");
  const [auditor, setAuditor] = useState(audit?.auditor ?? "");
  // Fixed lists per Wence (2026-08-20); a legacy value on an existing record
  // (e.g. "Katrina B.") stays selectable so editing never blanks it out.
  const specialistOptions = useMemo(() => {
    const options: string[] = [...INTAKE_SPECIALISTS];
    const current = (audit?.intakeSpecialist ?? "").trim();
    if (current && !options.includes(current)) options.unshift(current);
    return options;
  }, [audit?.intakeSpecialist]);
  const auditorOptions = useMemo(() => {
    const options: string[] = [...INTAKE_AUDITORS];
    const current = (audit?.auditor ?? "").trim();
    if (current && !options.includes(current)) options.unshift(current);
    return options;
  }, [audit?.auditor]);
  const [callCategory, setCallCategory] = useState(
    audit?.callCategory ?? INTAKE_CALL_CATEGORIES[0],
  );
  const [duration, setDuration] = useState(audit?.duration ?? "");
  const [chart, setChart] = useState(audit?.chart ?? "");
  const [status, setStatus] = useState(audit?.status ?? "Open");
  const [scores, setScores] = useState<Partial<Record<RubricKey, number>>>(
    audit?.scores ?? {},
  );
  // QA/Compliance are derived live from the star rubric — same formula the
  // server recomputes on save (Base44 parity, fixed 2026-08-20 after these
  // were stuck at 0% when left as blank manual inputs).
  const qaScore = computeQaScorePreview(scores);
  const complianceScore = computeComplianceScorePreview(scores);
  const finalResult = qaScore >= 85 && complianceScore === 100 ? "Pass" : "Fail";
  // Risk Level is derived live from Compliance % — same formula the server
  // recomputes on save (Base44 parity, added 2026-08-20 per Wence).
  const riskLevel = computeRiskLevelPreview(complianceScore);
  const [chartUpdated, setChartUpdated] = useState(
    audit?.documentation?.chartUpdated ?? true,
  );
  const [notesComplete, setNotesComplete] = useState(
    audit?.documentation?.notesComplete ?? true,
  );
  const [followupDocumented, setFollowupDocumented] = useState(
    audit?.documentation?.followupDocumented ?? true,
  );
  const [missingIssues, setMissingIssues] = useState(
    audit?.documentation?.missingIssues ?? "",
  );
  const [strengths, setStrengths] = useState(audit?.coaching?.strengths ?? "");
  const [improvements, setImprovements] = useState(audit?.coaching?.improvements ?? "");
  const [recommendation, setRecommendation] = useState(
    audit?.coaching?.recommendation ?? "",
  );
  const [coachingNotes, setCoachingNotes] = useState(audit?.coaching?.notes ?? "");
  const [notes, setNotes] = useState(audit?.notes ?? "");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function uploadVideo(id: Id<"intakeCallAudits">) {
    if (!videoFile) return;
    if (
      !ACCEPTED_RECORDING_TYPES.includes(videoFile.type) ||
      videoFile.size > 750 * 1024 * 1024
    ) {
      throw new Error(
        "Recording must be an MP3, WAV, MP4, WebM, or QuickTime file no larger than 750 MB.",
      );
    }
    const uploadUrl = await generateUploadUrl();
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": videoFile.type },
      body: videoFile,
    });
    if (!response.ok) throw new Error("Recording upload failed.");
    const uploaded = (await response.json()) as { storageId: Id<"_storage"> };
    await attachUploadedVideo({
      id,
      storageId: uploaded.storageId,
      contentType: videoFile.type,
      sizeBytes: videoFile.size,
    });
  }

  async function handleSave() {
    if (!intakeSpecialist.trim() || !auditor.trim() || !callDate || saving) {
      toast.error("Intake specialist, Auditor, and Call date are required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        callDate,
        dateReviewed: dateReviewed || undefined,
        intakeSpecialist: intakeSpecialist.trim(),
        auditor: auditor.trim(),
        callCategory,
        duration: duration.trim() || undefined,
        chart: chart.trim() || undefined,
        qaScore,
        complianceScore,
        finalResult,
        riskLevel,
        status,
        notes: notes.trim() || undefined,
        scores,
        documentation: {
          chartUpdated,
          notesComplete,
          followupDocumented,
          missingIssues: missingIssues.trim() || undefined,
        },
        coaching: {
          strengths: strengths.trim() || undefined,
          improvements: improvements.trim() || undefined,
          recommendation: recommendation.trim() || undefined,
          notes: coachingNotes.trim() || undefined,
        },
      };
      let id: Id<"intakeCallAudits">;
      if (audit) {
        await updateAudit({ id: audit._id, ...payload });
        id = audit._id;
      } else {
        id = await createAudit(payload);
      }
      await uploadVideo(id);
      toast.success(audit ? "Intake audit updated" : "Intake audit created");
      onSaved(id);
    } catch (error) {
      toast.error(friendlyErrorMessage(error, "Could not save intake audit"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={onCancel} aria-label="Back">
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {audit ? "Edit Call Audit" : "New Call Audit"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Score intake call quality and HIPAA compliance
          </p>
        </div>
      </div>

      <PanelCard title="Call Information">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label="Date Reviewed">
            <Input
              type="date"
              value={dateReviewed}
              onChange={e => setDateReviewed(e.target.value)}
            />
          </FormField>
          <FormField label="Call Date *">
            <Input
              type="date"
              value={callDate}
              onChange={e => setCallDate(e.target.value)}
            />
          </FormField>
          <FormField label="Intake Specialist *">
            <Select value={intakeSpecialist} onValueChange={setIntakeSpecialist}>
              <SelectTrigger>
                <SelectValue placeholder="Select specialist" />
              </SelectTrigger>
              <SelectContent>
                {specialistOptions.map(name => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Auditor *">
            <Select value={auditor} onValueChange={setAuditor}>
              <SelectTrigger>
                <SelectValue placeholder="Select auditor" />
              </SelectTrigger>
              <SelectContent>
                {auditorOptions.map(name => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Call Duration">
            <Input
              placeholder="e.g. 4:32"
              value={duration}
              onChange={e => setDuration(e.target.value)}
            />
          </FormField>
          <FormField label="Chart">
            <Input
              placeholder="Patient chart number"
              value={chart}
              onChange={e => setChart(e.target.value)}
            />
          </FormField>
          <FormField label="Call Category">
            <Select value={callCategory} onValueChange={setCallCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INTAKE_CALL_CATEGORIES.map(category => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Status">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INTAKE_AUDIT_STATUSES.map(value => (
                  <SelectItem key={value} value={value}>{value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Audio Recording Upload">
            <Input
              type="file"
              accept={ACCEPTED_RECORDING_TYPES.join(",")}
              onChange={e => setVideoFile(e.target.files?.[0] ?? null)}
            />
          </FormField>
        </div>
        {videoFile && (
          <p className="mt-2 text-xs text-muted-foreground">
            Selected: {videoFile.name}
          </p>
        )}
      </PanelCard>

      <PanelCard
        title="Call Quality Assessment"
        subtitle="Rate each criterion 1–5 stars"
      >
        <div className="space-y-1">
          {RUBRIC_SECTIONS.map(section => (
            <div key={section.title} className="space-y-1">
              <SectionHeading>{section.title}</SectionHeading>
              {section.items.map(([key, label]) => {
                const rubricKey = key as RubricKey;
                const value = scores[rubricKey];
                return (
                  <CriterionRow key={key} label={label}>
                    <div className="flex items-center gap-2">
                      <StarRating
                        tone="green"
                        value={value ?? 0}
                        onChange={next =>
                          setScores(prev => {
                            const updated = { ...prev };
                            if (next === 0) delete updated[rubricKey];
                            else updated[rubricKey] = next;
                            return updated;
                          })
                        }
                      />
                      <span className="w-8 text-right text-xs text-muted-foreground">
                        {value !== undefined ? `${value}/5` : "—"}
                      </span>
                    </div>
                  </CriterionRow>
                );
              })}
            </div>
          ))}
        </div>
      </PanelCard>

      <PanelCard title="Documentation Review">
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ["Chart updated correctly", chartUpdated, setChartUpdated],
              ["Notes complete", notesComplete, setNotesComplete],
              ["Follow-up actions documented", followupDocumented, setFollowupDocumented],
            ] as [string, boolean, (value: boolean) => void][]
          ).map(([label, value, setValue]) => (
            <label
              key={label}
              className="flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm"
            >
              <Checkbox
                checked={value}
                onCheckedChange={checked => setValue(checked === true)}
              />
              {label}
            </label>
          ))}
        </div>
        <div className="mt-4">
          <FormField label="Missing documentation issues">
            <Textarea
              rows={3}
              value={missingIssues}
              onChange={e => setMissingIssues(e.target.value)}
            />
          </FormField>
        </div>
      </PanelCard>

      <PanelCard
        title="Coaching Notes"
        subtitle="Strengths, improvement areas, and recommendation"
      >
        <div className="space-y-4">
          <FormField label="Strengths Observed">
            <Textarea
              rows={3}
              placeholder="What the specialist did well on this call…"
              value={strengths}
              onChange={e => setStrengths(e.target.value)}
            />
          </FormField>
          <FormField label="Areas of Improvement">
            <Textarea
              rows={3}
              placeholder="Where the specialist can improve…"
              value={improvements}
              onChange={e => setImprovements(e.target.value)}
            />
          </FormField>
          <FormField label="Coaching Recommendation">
            <Textarea
              rows={4}
              placeholder="Recommended action plan / next steps…"
              value={recommendation}
              onChange={e => setRecommendation(e.target.value)}
            />
          </FormField>
          <FormField label="Additional Notes">
            <Textarea
              rows={3}
              placeholder="Any other coaching feedback…"
              value={coachingNotes}
              onChange={e => setCoachingNotes(e.target.value)}
            />
          </FormField>
          <FormField label="Notes">
            <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </FormField>
        </div>
      </PanelCard>

      <PanelCard title="Audit Results">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <FormField label="Overall QA score (%)">
            <Input
              aria-label="Overall QA score"
              readOnly
              value={`${qaScore}%`}
              className={cn("font-medium", scoreTextClass(qaScore))}
            />
          </FormField>
          <FormField label="Compliance score (%)">
            <Input
              aria-label="Compliance score"
              readOnly
              value={`${complianceScore}%`}
              className={cn("font-medium", scoreTextClass(complianceScore))}
            />
          </FormField>
          <FormField label="Final result">
            <Input
              aria-label="Final result"
              readOnly
              value={finalResult}
              className={cn(
                "font-medium",
                finalResult === "Pass"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                  : "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300",
              )}
            />
          </FormField>
          <FormField label="Risk level">
            <Input
              aria-label="Risk level"
              readOnly
              value={riskLevel}
              className={cn("font-medium", riskTextClass(riskLevel))}
            />
          </FormField>
        </div>
      </PanelCard>

      <div className="flex justify-end gap-2 pb-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => void handleSave()} disabled={saving}>
          <Save className="size-4" />
          {saving ? "Saving…" : "Save Audit"}
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- list */

type View =
  | { mode: "list" }
  | { mode: "detail"; id: Id<"intakeCallAudits"> }
  | { mode: "form"; id: Id<"intakeCallAudits"> | null };

export function IntakeAuditsTab() {
  const audits = useQuery(api.intakeCallAudits.list) as IntakeCallAudit[] | undefined;
  const updateAuditStatus = useMutation(api.intakeCallAudits.updateStatus);
  const removeAudit = useMutation(api.intakeCallAudits.remove);
  const purgeSelected = useMutation(api.intakeCallAudits.purgeSelected);
  const isAdmin = useHasRestrictedAccess();

  const [view, setView] = useState<View>({ mode: "list" });
  const [specialistFilter, setSpecialistFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [callDateFilter, setCallDateFilter] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<IntakeCallAudit | null>(null);
  const [savingStatusId, setSavingStatusId] = useState<Id<"intakeCallAudits"> | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<Id<"intakeCallAudits">>>(new Set());
  const [purgeArea, setPurgeArea] = useState<"reactions" | "audits" | "both" | null>(null);
  const [purging, setPurging] = useState(false);

  const specialists = useMemo(
    () => [...new Set((audits ?? []).map(a => a.intakeSpecialist))].sort(),
    [audits],
  );

  const filtered = useMemo(() => {
    // Newest call first — imported rows all share one createdAt, so the
    // table must sort on callDate rather than insertion order.
    const sorted = [...(audits ?? [])].sort((a, b) => b.callDate.localeCompare(a.callDate));
    return sorted.filter(audit => {
      if (specialistFilter !== "all" && audit.intakeSpecialist !== specialistFilter) return false;
      if (categoryFilter !== "all" && audit.callCategory !== categoryFilter) return false;
      if (statusFilter !== "all" && audit.status !== statusFilter) return false;
      if (resultFilter !== "all" && audit.finalResult !== resultFilter) return false;
      if (riskFilter !== "all" && audit.riskLevel !== riskFilter) return false;
      return inDateRange(audit.callDate, callDateFilter, callDateFilter);
    });
  }, [
    audits,
    specialistFilter,
    categoryFilter,
    statusFilter,
    resultFilter,
    riskFilter,
    callDateFilter,
  ]);

  const stats = useMemo(() => {
    const rows = filtered;
    const scored = rows.filter(r => r.qaScore > 0);
    return {
      total: rows.length,
      avgQa: scored.length
        ? Math.round(scored.reduce((sum, r) => sum + r.qaScore, 0) / scored.length)
        : 0,
      passRate: rows.length
        ? Math.round((rows.filter(r => r.finalResult === "Pass").length / rows.length) * 100)
        : 0,
      flagged: rows.filter(r => r.riskLevel !== "Low Risk").length,
    };
  }, [filtered]);

  const selected =
    view.mode === "list" || view.id === null
      ? null
      : ((audits ?? []).find(audit => audit._id === view.id) ?? null);

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await removeAudit({ id: deleteTarget._id });
      toast.success("Intake audit deleted");
      setView({ mode: "list" });
    } catch (error) {
      toast.error(friendlyErrorMessage(error, "Could not delete audit"));
    } finally {
      setDeleteTarget(null);
    }
  }

  async function changeStatus(audit: IntakeCallAudit, status: string) {
    if (status === audit.status || savingStatusId) return;
    setSavingStatusId(audit._id);
    try {
      await updateAuditStatus({ id: audit._id, status });
      toast.success(`Status updated to ${status}`);
    } catch (error) {
      toast.error(friendlyErrorMessage(error, "Could not update status"));
    } finally {
      setSavingStatusId(null);
    }
  }

  function toggleSelected(id: Id<"intakeCallAudits">, checked: boolean) {
    setSelectedIds(current => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function confirmPurge() {
    if (!purgeArea || selectedIds.size === 0 || purging) return;
    setPurging(true);
    try {
      const result = await purgeSelected({
        ids: [...selectedIds],
        area: purgeArea,
      });
      toast.success(
        `Purge complete: ${result.auditsDeleted} audit(s), ${result.reactionsDeleted} reaction(s) removed`,
      );
      setSelectedIds(new Set());
      setPurgeArea(null);
      setView({ mode: "list" });
    } catch (error) {
      toast.error(friendlyErrorMessage(error, "Could not purge selected data"));
    } finally {
      setPurging(false);
    }
  }

  const deleteDialog = (
    <AlertDialog
      open={deleteTarget !== null}
      onOpenChange={open => { if (!open) setDeleteTarget(null); }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this intake audit?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the audit
            {deleteTarget?.videoStorageId ? " and its recording" : ""}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => void confirmDelete()}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const purgeDialog = (
    <AlertDialog
      open={purgeArea !== null}
      onOpenChange={open => { if (!open && !purging) setPurgeArea(null); }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm permanent purge</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove{" "}
            {purgeArea === "reactions"
              ? "all reactions from"
              : purgeArea === "audits"
                ? "the"
                : "the audits, recordings, and reactions for"}{" "}
            {selectedIds.size} selected audit{selectedIds.size === 1 ? "" : "s"}.
            This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={purging}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={purging}
            onClick={event => {
              event.preventDefault();
              void confirmPurge();
            }}
            className="bg-rose-600 text-white hover:bg-rose-700"
          >
            {purging ? "Purging…" : "Purge permanently"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (view.mode === "form") {
    return (
      <>
        <IntakeAuditForm
          key={view.id ?? "new"}
          audit={selected}
          onCancel={() =>
            setView(view.id ? { mode: "detail", id: view.id } : { mode: "list" })
          }
          onSaved={id => setView({ mode: "detail", id })}
        />
        {deleteDialog}
      </>
    );
  }

  if (view.mode === "detail" && selected) {
    return (
      <>
        <IntakeAuditDetail
          audit={selected}
          isAdmin={isAdmin}
          onBack={() => setView({ mode: "list" })}
          onEdit={() => setView({ mode: "form", id: selected._id })}
          onDelete={() => setDeleteTarget(selected)}
        />
        {deleteDialog}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Call Audits</h1>
          <p className="text-sm text-muted-foreground">
            {audits === undefined
              ? "Loading audits…"
              : "All audited intake calls"}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setView({ mode: "form", id: null })}>
            <Plus /> New Audit
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total calls audited" value={stats.total} />
        <StatTile label="Average QA score" value={`${stats.avgQa}%`} />
        <StatTile label="Pass rate" value={`${stats.passRate}%`} />
        <StatTile label="Risk flags" value={stats.flagged} />
      </div>

      <PanelCard title="Filters">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="min-w-0 space-y-1.5">
            <Label
              className="text-xs font-normal text-muted-foreground"
              htmlFor="intake-call-audits-date"
            >
              Call Date
            </Label>
            <Input
              id="intake-call-audits-date"
              type="date"
              value={callDateFilter}
              onChange={event => setCallDateFilter(event.target.value)}
              className="h-8 w-full min-w-0 px-2 text-xs"
            />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label className="text-xs font-normal text-muted-foreground">
              Intake Specialist
            </Label>
            <Select value={specialistFilter} onValueChange={setSpecialistFilter}>
              <SelectTrigger className="h-8 w-full min-w-0 px-2 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Specialists</SelectItem>
                {specialists.map(name => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label className="text-xs font-normal text-muted-foreground">Category</Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-8 w-full min-w-0 px-2 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {INTAKE_CALL_CATEGORIES.map(value => (
                  <SelectItem key={value} value={value}>{value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label className="text-xs font-normal text-muted-foreground">Result</Label>
            <Select value={resultFilter} onValueChange={setResultFilter}>
              <SelectTrigger className="h-8 w-full min-w-0 px-2 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Results</SelectItem>
                {INTAKE_RESULTS.map(value => (
                  <SelectItem key={value} value={value}>{value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label className="text-xs font-normal text-muted-foreground">Risk</Label>
            <Select value={riskFilter} onValueChange={setRiskFilter}>
              <SelectTrigger className="h-8 w-full min-w-0 px-2 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Risk Levels</SelectItem>
                {INTAKE_RISK_LEVELS.map(value => (
                  <SelectItem key={value} value={value}>{value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label className="text-xs font-normal text-muted-foreground">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-full min-w-0 px-2 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {INTAKE_AUDIT_STATUSES.map(value => (
                  <SelectItem key={value} value={value}>{value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </PanelCard>

      <PanelCard
        title={`Audits (${filtered.length})`}
        actions={
          isAdmin ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {selectedIds.size} selected
              </span>
              <Select
                onValueChange={value =>
                  setPurgeArea(value as "reactions" | "audits" | "both")
                }
                disabled={selectedIds.size === 0}
              >
                <SelectTrigger
                  aria-label="Purge selected"
                  className="h-8 w-[190px] text-xs"
                >
                  <SelectValue placeholder="Purge selected…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reactions">Reactions only</SelectItem>
                  <SelectItem value="audits">Audits + recordings</SelectItem>
                  <SelectItem value="both">Audits + reactions + recordings</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : undefined
        }
        className="[&>div:last-child]:p-0"
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {isAdmin && (
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label="Select all visible audits"
                      checked={
                        filtered.length > 0 &&
                        filtered.every(audit => selectedIds.has(audit._id))
                      }
                      onCheckedChange={checked =>
                        setSelectedIds(current => {
                          const next = new Set(current);
                          for (const audit of filtered) {
                            if (checked === true) next.add(audit._id);
                            else next.delete(audit._id);
                          }
                          return next;
                        })
                      }
                    />
                  </TableHead>
                )}
                <TableHead>Specialist</TableHead>
                <TableHead>Auditor</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>QA</TableHead>
                <TableHead>Compliance</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reactions</TableHead>
                {isAdmin && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {audits === undefined && (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 11 : 9} className="py-8 text-center text-muted-foreground">
                    Loading audits…
                  </TableCell>
                </TableRow>
              )}
              {audits !== undefined && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 11 : 9} className="py-8 text-center text-muted-foreground">
                    No intake audits found.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map(audit => (
                <TableRow
                  key={audit._id}
                  className="cursor-pointer"
                  onClick={() => setView({ mode: "detail", id: audit._id })}
                >
                  {isAdmin && (
                    <TableCell onClick={event => event.stopPropagation()}>
                      <Checkbox
                        aria-label={`Select ${audit.intakeSpecialist} audit from ${audit.callDate}`}
                        checked={selectedIds.has(audit._id)}
                        onCheckedChange={checked =>
                          toggleSelected(audit._id, checked === true)
                        }
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-medium text-cyan-700 dark:text-cyan-400">
                    {audit.intakeSpecialist}
                  </TableCell>
                  <TableCell>{audit.auditor}</TableCell>
                  <TableCell className="max-w-[190px] truncate" title={audit.callCategory}>
                    {audit.callCategory}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={intakeScoreBadgeClass(audit.qaScore)}>
                      {audit.qaScore}%
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={intakeScoreBadgeClass(audit.complianceScore)}
                    >
                      {audit.complianceScore}%
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={resultBadgeClass(audit.finalResult)}>
                      {audit.finalResult}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={riskBadgeClass(audit.riskLevel)}>
                      {audit.riskLevel}
                    </Badge>
                  </TableCell>
                  <TableCell className="w-[128px]" onClick={event => event.stopPropagation()}>
                    {isAdmin ? (
                      <InlineStatusSelect
                        status={audit.status}
                        saving={savingStatusId === audit._id}
                        onChange={status => void changeStatus(audit, status)}
                      />
                    ) : (
                      <Badge variant="outline" className={intakeStatusBadgeClass(audit.status)}>
                        {audit.status}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell onClick={event => event.stopPropagation()}>
                    <AuditReactions audit={audit} />
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right" onClick={event => event.stopPropagation()}>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(audit)}>
                        <Trash2 className="size-4 text-rose-600" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </PanelCard>

      {deleteDialog}
      {purgeDialog}
    </div>
  );
}
