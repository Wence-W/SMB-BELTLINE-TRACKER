import { useAction, useMutation, useQuery } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import {
  AlertTriangle,
  BarChart3,
  FileVideo,
  GraduationCap,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2,
  Video,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DateRangeFilter, inDateRange } from "@/components/DateRangeFilter";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { CallAuditRosterManager } from "@/components/callAudits/CallAuditRosterManager";
import { IntakeAuditsTab } from "@/components/callAudits/IntakeAuditsTab";
import { IntakeHighlights } from "@/components/callAudits/IntakeHighlights";
import { StarRating } from "@/components/callAudits/StarRating";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  AUDIT_STATUSES,
  CALL_CATEGORIES,
  type CallAudit,
  type RecordingSession,
  normalizeCriterionForCallCategory,
  openAuthenticatedRecording,
  qualityRubricForCallCategory,
  scoreBadgeClass,
  statusBadgeClass,
} from "@/lib/callAuditTypes";
import { useHasRestrictedAccess } from "@/lib/permissions";
import { useVerificationCallAuditSummary } from "@/lib/verificationCallAudits";

type View =
  | "dashboard"
  | "list"
  | "form"
  | "highlights"
  | "reports"
  | "storage"
  | "verification"
  | "intake"
  | "intakeHighlights";
type RatingsMap = Record<string, number>;

function ratingKey(group: string, criterion: string) {
  return `${group}::${criterion}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function AuditStat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: typeof FileVideo;
  tone: string;
}) {
  return (
    <Card padding="compact">
      <CardContent className="flex items-center justify-between px-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
        </div>
        <div className={`flex size-10 items-center justify-center rounded-lg ${tone}`}>
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function CallAuditDashboard({ onNavigate }: { onNavigate: (view: View) => void }) {
  const audits = useQuery(api.callAudits.list) as CallAudit[] | undefined;
  const stats = useMemo(() => {
    const rows = audits ?? [];
    const scored = rows.filter(audit => audit.score > 0);
    const score = scored.length
      ? Math.round(scored.reduce((sum, audit) => sum + audit.score, 0) / scored.length)
      : 0;
    const coaching = scored.filter(audit => audit.score < 75).length;
    const active = rows.filter(audit => audit.status !== "Completed").length;
    const recent = [...rows].sort((a, b) => b.callDate.localeCompare(a.callDate)).slice(0, 5);
    return { score, coaching, active, recent };
  }, [audits]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Call Audits</h1>
          <p className="text-sm text-muted-foreground">
            Verification call quality review — secured inside SMB Beltline Tracker
          </p>
        </div>
        <Button onClick={() => onNavigate("form")}>
          <Plus /> New Audit
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AuditStat label="Total audits" value={audits?.length ?? 0} icon={FileVideo} tone="bg-cyan-500/15 text-cyan-700 dark:text-cyan-300" />
        <AuditStat label="Average score" value={`${stats.score}%`} icon={BarChart3} tone="bg-violet-500/15 text-violet-700 dark:text-violet-300" />
        <AuditStat label="Needs coaching" value={stats.coaching} icon={GraduationCap} tone="bg-amber-500/15 text-amber-800 dark:text-amber-300" />
        <AuditStat label="Active audits" value={stats.active} icon={AlertTriangle} tone="bg-rose-500/15 text-rose-800 dark:text-rose-300" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent audits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {audits === undefined && (
            <p className="text-sm text-muted-foreground">Loading audits…</p>
          )}
          {audits !== undefined && stats.recent.length === 0 && (
            <p className="text-sm text-muted-foreground">No audits yet.</p>
          )}
          {stats.recent.map(audit => (
            <button
              type="button"
              key={audit._id}
              onClick={() => onNavigate("list")}
              className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/50"
            >
              <span>
                <span className="block text-sm font-medium">{audit.verifierName}</span>
                <span className="block text-xs text-muted-foreground">
                  {audit.callDate} · audited by {audit.auditorName}
                </span>
              </span>
              <Badge variant="outline" className={scoreBadgeClass(audit.score)}>
                {audit.score}%
              </Badge>
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function AuditList({
  onCreate,
  onEdit,
}: {
  onCreate: () => void;
  onEdit: (audit: CallAudit) => void;
}) {
  const audits = useQuery(api.callAudits.list) as CallAudit[] | undefined;
  const roster = useQuery(api.callAudits.listRoster);
  const removeAudit = useMutation(api.callAudits.remove);
  const isAdmin = useHasRestrictedAccess();
  const authToken = useAuthToken();
  const [search, setSearch] = useState("");
  const [verifierFilter, setVerifierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  // Date From / Date To on Call Audits, by Call date (Gretchen, 2026-08-13).
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CallAudit | null>(null);
  const [playback, setPlayback] = useState<{ audit: CallAudit; session: RecordingSession | null; loading: boolean } | null>(null);

  // Recordings download in several sequential range-fetch chunks (see
  // openAuthenticatedRecording, needed because Convex caps a single HTTP
  // action response at 20 MiB while recordings run 40-750 MB). Chrome blocks
  // navigating a separately-opened tab to a blob: URL created in another
  // browsing context, so playback happens in an in-page dialog instead of a
  // new tab — it also sidesteps the popup-blocker/user-gesture timing issue
  // a multi-second download would otherwise hit.
  async function openRecording(audit: CallAudit) {
    setPlayback({ audit, session: null, loading: true });
    try {
      const session = await openAuthenticatedRecording(audit._id, authToken);
      setPlayback({ audit, session, loading: false });
    } catch (error) {
      setPlayback(null);
      toast.error(error instanceof Error ? error.message : "Could not open recording");
    }
  }

  function closePlayback() {
    playback?.session?.dispose();
    setPlayback(null);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (audits ?? []).filter(audit => {
      if (verifierFilter !== "all" && audit.verifierName !== verifierFilter) return false;
      if (statusFilter !== "all" && audit.status !== statusFilter) return false;
      if (!inDateRange(audit.callDate, auditFrom, auditTo)) return false;
      return !q || `${audit.verifierName} ${audit.auditorName} ${audit.patientId ?? ""} ${audit.callCategory}`.toLowerCase().includes(q);
    });
  }, [audits, search, statusFilter, verifierFilter, auditFrom, auditTo]);

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await removeAudit({ id: deleteTarget._id });
      toast.success("Call Audit deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete audit");
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">All Call Audits</h1>
          <p className="text-sm text-muted-foreground">
            {audits === undefined
              ? "Loading audits…"
              : `${filtered.length} of ${audits.length} audit${audits.length === 1 ? "" : "s"} shown.`} Search, filter, open, and review audits.
          </p>
        </div>
        <Button onClick={onCreate}><Plus /> New Audit</Button>
      </div>
      <div className="flex flex-wrap gap-3">
        <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search verifier, auditor, or patient ID…" className="max-w-xs" />
        <Select value={verifierFilter} onValueChange={setVerifierFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All verifiers" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All verifiers</SelectItem>
            {(roster ?? []).filter(member => member.active).map(member => <SelectItem key={member._id} value={member.name}>{member.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <DateRangeFilter
          label="Call Date"
          idPrefix="call-audits"
          from={auditFrom}
          to={auditTo}
          onChange={({ from, to }) => {
            setAuditFrom(from);
            setAuditTo(to);
          }}
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {AUDIT_STATUSES.map(status => <SelectItem key={status} value={status}>{status}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader><TableRow><TableHead>Call date</TableHead><TableHead>Patient ID</TableHead><TableHead>Verifier</TableHead><TableHead>Auditor</TableHead><TableHead>Status</TableHead><TableHead>Score</TableHead><TableHead>Recording</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {audits === undefined && <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Loading audits…</TableCell></TableRow>}
            {audits !== undefined && filtered.length === 0 && <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No audits found.</TableCell></TableRow>}
            {filtered.map(audit => (
              <TableRow key={audit._id} className="cursor-pointer" onClick={() => onEdit(audit)}>
                <TableCell>{audit.callDate}</TableCell><TableCell>{audit.patientId || "—"}</TableCell><TableCell>{audit.verifierName}</TableCell><TableCell>{audit.auditorName}</TableCell>
                <TableCell><Badge variant="outline" className={statusBadgeClass(audit.status)}>{audit.status}</Badge></TableCell>
                <TableCell><Badge variant="outline" className={scoreBadgeClass(audit.score)}>{audit.score}%</Badge></TableCell>
                <TableCell onClick={event => event.stopPropagation()}>{audit.videoStorageId ? <Button size="icon" variant="ghost" className="size-7 text-primary" onClick={() => void openRecording(audit)} aria-label="Open recording"><Video className="size-4" /></Button> : "—"}</TableCell>
                <TableCell className="text-right" onClick={event => event.stopPropagation()}><div className="flex justify-end gap-1"><Button size="icon" variant="ghost" onClick={() => onEdit(audit)} aria-label="Edit audit"><Pencil /></Button>{isAdmin && <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(audit)} aria-label="Delete audit"><Trash2 className="text-destructive" /></Button>}</div></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this Call Audit?</AlertDialogTitle><AlertDialogDescription>This removes the audit and its Tracker recording. Only Tracker admins can do this. It cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmDelete}>Delete audit</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
      <Dialog open={!!playback} onOpenChange={open => !open && closePlayback()}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {playback ? `${playback.audit.verifierName} · ${playback.audit.callDate}${playback.audit.patientId ? ` · ${playback.audit.patientId}` : ""}` : "Recording"}
            </DialogTitle>
          </DialogHeader>
          {playback?.loading && <p className="py-8 text-center text-sm text-muted-foreground">Loading recording…</p>}
          {playback?.session && <video src={playback.session.url} controls autoPlay className="w-full rounded-lg bg-slate-800" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AuditForm({
  audit,
  onClose,
}: {
  audit: CallAudit | null;
  onClose: () => void;
}) {
  const roster = useQuery(api.callAudits.listRoster);
  const myRosterIdentity = useQuery(api.callAudits.getMyRosterIdentity);
  const createAudit = useMutation(api.callAudits.create);
  const updateAudit = useMutation(api.callAudits.update);
  const generateUploadUrl = useMutation(api.callAudits.generateUploadUrl);
  const attachUploadedVideo = useAction(api.callAudits.attachUploadedVideo);
  const authToken = useAuthToken();
  const [dateReviewed, setDateReviewed] = useState(audit?.dateReviewed ?? todayIso());
  const [callDate, setCallDate] = useState(audit?.callDate ?? todayIso());
  const [verifierName, setVerifierName] = useState(audit?.verifierName ?? "");
  const [auditorName, setAuditorName] = useState(audit?.auditorName ?? "");
  const [callDuration, setCallDuration] = useState(audit?.callDuration ?? "");
  const [patientId, setPatientId] = useState(audit?.patientId ?? "");
  const [callCategory, setCallCategory] = useState(audit?.callCategory ?? CALL_CATEGORIES[0]);
  const [status, setStatus] = useState(audit?.status ?? "Not Started");
  // "Audit notes" field removed from the UI (2026-08-14, Wence) but the value
  // is preserved as-is on save so any pre-existing data isn't wiped out.
  const notes = audit?.notes ?? "";
  const [coachingStrengths, setCoachingStrengths] = useState(audit?.coachingStrengths ?? "");
  const [coachingImprovements, setCoachingImprovements] = useState(audit?.coachingImprovements ?? "");
  const [coachingRecommendation, setCoachingRecommendation] = useState(audit?.coachingRecommendation ?? "");
  const [docNotesIncomplete, setDocNotesIncomplete] = useState(audit?.docNotesIncomplete ?? false);
  const [docNotesComplete, setDocNotesComplete] = useState(audit?.docNotesComplete ?? false);
  const [docMissingIssues, setDocMissingIssues] = useState(audit?.docMissingIssues ?? "");
  const [ratings, setRatings] = useState<RatingsMap>(() =>
    Object.fromEntries(
      (audit?.ratings ?? []).map(rating => [
        ratingKey(
          rating.group,
          normalizeCriterionForCallCategory(
            audit?.callCategory ?? CALL_CATEGORIES[0],
            rating.criterion,
          ),
        ),
        rating.rating,
      ]),
    ),
  );
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [recordingSession, setRecordingSession] = useState<RecordingSession | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isEdit = !!audit;
  const canEditRestricted = !isEdit || (myRosterIdentity?.active && myRosterIdentity.name.trim().toLowerCase() === audit.auditorName.trim().toLowerCase());
  const activeRoster = (roster ?? []).filter(member => member.active);
  const qualityRubric = qualityRubricForCallCategory(callCategory);

  const ratingsArray = qualityRubric.flatMap(group => group.criteria.map(criterion => ({
    group: group.group,
    criterion,
    rating: ratings[ratingKey(group.group, criterion)] ?? 0,
  })));

  function updateCallCategory(nextCategory: string) {
    setRatings(current =>
      Object.fromEntries(
        Object.entries(current).map(([key, rating]) => {
          const [group, ...criterionParts] = key.split("::");
          return [
            ratingKey(
              group,
              normalizeCriterionForCallCategory(
                nextCategory,
                criterionParts.join("::"),
              ),
            ),
            rating,
          ];
        }),
      ),
    );
    setCallCategory(nextCategory);
  }

  function updateRating(group: string, criterion: string, rating: number) {
    setRatings(current => ({ ...current, [ratingKey(group, criterion)]: rating }));
    if (status === "Not Started" || status === "Recording Downloaded") setStatus("In Progress");
  }

  async function uploadVideo(id: Id<"callAudits">) {
    if (!videoFile) return;
    if (!["video/mp4", "video/webm", "video/quicktime"].includes(videoFile.type) || videoFile.size > 750 * 1024 * 1024) {
      throw new Error("Recording must be MP4, WebM, or QuickTime and no larger than 750 MB.");
    }
    const uploadUrl = await generateUploadUrl();
    const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": videoFile.type }, body: videoFile });
    if (!response.ok) throw new Error("Recording upload failed.");
    const uploaded = await response.json() as { storageId: Id<"_storage"> };
    await attachUploadedVideo({ id, storageId: uploaded.storageId, contentType: videoFile.type, sizeBytes: videoFile.size });
  }

  async function loadExistingRecording() {
    if (!audit?.videoStorageId) return;
    try {
      recordingSession?.dispose();
      setRecordingSession(await openAuthenticatedRecording(audit._id, authToken));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load recording");
    }
  }

  async function handleSave() {
    if (!verifierName || !auditorName || !callDate || saving) {
      toast.error("Verifier, Auditor, and Call Date are required.");
      return;
    }
    setSaving(true);
    try {
      const payload = { dateReviewed, callDate, verifierName, auditorName, callDuration: callDuration || undefined, patientId: patientId || undefined, callCategory, status, videoStorageId: audit?.videoStorageId, ratings: ratingsArray, notes: notes || undefined, coachingStrengths: coachingStrengths || undefined, coachingImprovements: coachingImprovements || undefined, coachingRecommendation: coachingRecommendation || undefined, docNotesIncomplete, docNotesComplete, docMissingIssues: docMissingIssues || undefined };
      const id = audit ? (await updateAudit({ id: audit._id, ...payload }), audit._id) : await createAudit(payload);
      await uploadVideo(id);
      toast.success(audit ? "Call Audit updated" : "Call Audit created");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save Call Audit");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-tight">{isEdit ? "Edit Call Audit" : "New Call Audit"}</h1><p className="text-sm text-muted-foreground">Score verification call quality and HIPAA compliance.</p></div><Button variant="outline" onClick={onClose}>Back to audits</Button></div>
      <Card><CardHeader><CardTitle className="text-base">Call information</CardTitle></CardHeader><CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Date reviewed"><Input type="date" value={dateReviewed} onChange={event => setDateReviewed(event.target.value)} /></Field>
        <Field label="Call date *"><Input type="date" value={callDate} onChange={event => setCallDate(event.target.value)} /></Field>
        <Field label="Verifier *"><Select value={verifierName} onValueChange={setVerifierName}><SelectTrigger><SelectValue placeholder="Select verifier" /></SelectTrigger><SelectContent>{activeRoster.map(member => <SelectItem key={member._id} value={member.name}>{member.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Auditor *"><Select value={auditorName} onValueChange={setAuditorName}><SelectTrigger><SelectValue placeholder="Select auditor" /></SelectTrigger><SelectContent>{activeRoster.map(member => <SelectItem key={member._id} value={member.name}>{member.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Call duration"><Input placeholder="e.g. 4:32" value={callDuration} onChange={event => setCallDuration(event.target.value)} /></Field>
        <Field label="Patient ID"><Input value={patientId} onChange={event => setPatientId(event.target.value)} /></Field>
        <Field label="Call category"><Select value={callCategory} onValueChange={updateCallCategory}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CALL_CATEGORIES.map(category => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Status"><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{AUDIT_STATUSES.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Recording upload"><Input ref={inputRef} type="file" accept="video/mp4,video/webm,video/quicktime" onChange={event => setVideoFile(event.target.files?.[0] ?? null)} />{videoFile && <p className="text-xs text-muted-foreground">Selected: {videoFile.name}</p>}{audit?.videoStorageId && !recordingSession && <Button type="button" size="sm" variant="link" className="h-auto px-0 text-xs" onClick={() => void loadExistingRecording()}>Load existing recording</Button>}{recordingSession && <video src={recordingSession.url} controls className="mt-2 w-full rounded-lg bg-slate-800" onEnded={() => { recordingSession.dispose(); setRecordingSession(null); }} />}</Field>
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Call quality assessment</CardTitle><p className="text-sm text-muted-foreground">Rate all 16 required criteria, 0–5 stars.</p></CardHeader><CardContent className="space-y-6">{qualityRubric.map(group => <section key={group.group} className="space-y-2"><h2 className="text-sm font-semibold text-primary">{group.group}</h2>{group.criteria.map(criterion => <div key={criterion} className="flex flex-col justify-between gap-2 border-b border-border/60 pb-2 last:border-0 sm:flex-row sm:items-center"><span className="text-sm">{criterion}</span><StarRating value={ratings[ratingKey(group.group, criterion)] ?? 0} onChange={value => updateRating(group.group, criterion, value)} /></div>)}</section>)}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Coaching notes</CardTitle>{isEdit && !canEditRestricted && <p className="text-xs text-muted-foreground">Only the assigned Auditor may edit coaching and Missing Documentation fields.</p>}</CardHeader><CardContent className="space-y-4"><Field label="Strengths observed"><Textarea value={coachingStrengths} onChange={event => setCoachingStrengths(event.target.value)} readOnly={!canEditRestricted} rows={3} /></Field><Field label="Areas of improvement"><Textarea value={coachingImprovements} onChange={event => setCoachingImprovements(event.target.value)} readOnly={!canEditRestricted} rows={3} /></Field><Field label="Coaching recommendation"><Textarea value={coachingRecommendation} onChange={event => setCoachingRecommendation(event.target.value)} readOnly={!canEditRestricted} rows={3} /></Field></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Documentation review</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex flex-wrap gap-6"><label className="flex items-center gap-2 text-sm"><Checkbox checked={docNotesIncomplete} onCheckedChange={value => setDocNotesIncomplete(value === true)} /> Notes incomplete</label><label className="flex items-center gap-2 text-sm"><Checkbox checked={docNotesComplete} onCheckedChange={value => setDocNotesComplete(value === true)} /> Notes complete</label></div><Field label="Missing documentation issues"><Textarea value={docMissingIssues} onChange={event => setDocMissingIssues(event.target.value)} readOnly={!canEditRestricted} rows={3} /></Field></CardContent></Card>
      <div className="flex justify-end gap-2 pb-6"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : isEdit ? "Save changes" : "Create audit"}</Button></div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function Highlights({ onOpenList }: { onOpenList: () => void }) {
  const audits = useQuery(api.callAudits.list) as CallAudit[] | undefined;
  const data = useMemo(() => {
    const rows = audits ?? [];
    const scored = rows.filter(audit => audit.score > 0);
    return {
      top: [...scored].sort((a, b) => b.score - a.score).slice(0, 5),
      coaching: [...scored].sort((a, b) => a.score - b.score).slice(0, 5),
      hipaa: rows.filter(audit => audit.ratings.some(rating => rating.criterion === "Maintained HIPAA compliance" && rating.rating > 0 && rating.rating <= 2)),
    };
  }, [audits]);
  return <div className="space-y-6"><div><h1 className="text-2xl font-semibold tracking-tight">Highlights</h1><p className="text-sm text-muted-foreground">High performers, coaching opportunities, and HIPAA flags.</p></div><div className="grid gap-4 lg:grid-cols-3"><HighlightCard title="Top scores" icon={<BarChart3 className="text-emerald-600" />} audits={data.top} onOpen={onOpenList} /><HighlightCard title="Needs coaching" icon={<GraduationCap className="text-amber-600" />} audits={data.coaching} onOpen={onOpenList} /><HighlightCard title="HIPAA flags" icon={<ShieldAlert className="text-rose-600" />} audits={data.hipaa} onOpen={onOpenList} /></div></div>;
}

function HighlightCard({ title, icon, audits, onOpen }: { title: string; icon: React.ReactNode; audits: CallAudit[]; onOpen: () => void }) {
  return <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base">{icon}{title}</CardTitle></CardHeader><CardContent className="space-y-2">{audits.length === 0 && <p className="text-sm text-muted-foreground">No audits to show.</p>}{audits.map(audit => <button type="button" onClick={onOpen} className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left hover:bg-muted/50" key={audit._id}><span><span className="block text-sm font-medium">{audit.verifierName}</span><span className="block text-xs text-muted-foreground">{audit.callDate} · {audit.auditorName}</span></span><Badge variant="outline" className={scoreBadgeClass(audit.score)}>{audit.score}%</Badge></button>)}</CardContent></Card>;
}

function Reports() {
  const audits = useQuery(api.callAudits.list) as CallAudit[] | undefined;
  const byVerifier = useMemo(() => {
    const scores = new Map<string, { total: number; count: number }>();
    for (const audit of audits ?? []) if (audit.score > 0) {
      const row = scores.get(audit.verifierName) ?? { total: 0, count: 0 };
      row.total += audit.score; row.count += 1; scores.set(audit.verifierName, row);
    }
    return [...scores.entries()].map(([name, data]) => ({ name, count: data.count, score: Math.round(data.total / data.count) })).sort((a, b) => b.score - a.score);
  }, [audits]);
  return <div className="space-y-6"><div><h1 className="text-2xl font-semibold tracking-tight">Call Audit Reports</h1><p className="text-sm text-muted-foreground">Verifier scorecard across completed quality ratings.</p></div><Card><CardHeader><CardTitle className="text-base">Verifier scorecard</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Verifier</TableHead><TableHead>Scored audits</TableHead><TableHead>Average score</TableHead></TableRow></TableHeader><TableBody>{byVerifier.length === 0 && <TableRow><TableCell colSpan={3} className="py-8 text-center text-muted-foreground">No scored audits yet.</TableCell></TableRow>}{byVerifier.map(row => <TableRow key={row.name}><TableCell>{row.name}</TableCell><TableCell>{row.count}</TableCell><TableCell><Badge variant="outline" className={scoreBadgeClass(row.score)}>{row.score}%</Badge></TableCell></TableRow>)}</TableBody></Table></CardContent></Card></div>;
}

function Storage({ onOpenAudit }: { onOpenAudit: (audit: CallAudit) => void }) {
  const audits = useQuery(api.callAudits.list) as CallAudit[] | undefined;
  const videos = (audits ?? []).filter(audit => audit.videoStorageId);
  return <div className="space-y-6"><div><h1 className="text-2xl font-semibold tracking-tight">Recording Storage</h1><p className="text-sm text-muted-foreground">Call recordings are protected by your Tracker sign-in and opened from the audit record.</p></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{videos.map(audit => <Card key={audit._id}><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><FileVideo className="text-primary" />{audit.verifierName} · {audit.callDate}</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">Protected recording attached</p><div className="flex items-center justify-between"><Badge variant="outline" className={statusBadgeClass(audit.status)}>{audit.status}</Badge><Button size="sm" variant="ghost" onClick={() => onOpenAudit(audit)}>Open audit</Button></div></CardContent></Card>)}{audits !== undefined && videos.length === 0 && <Card className="md:col-span-2 xl:col-span-3"><CardContent className="p-8 text-center text-sm text-muted-foreground">No recordings are attached yet.</CardContent></Card>}</div></div>;
}


// Verification Summary tab (Gretchen, 2026-08-13): replaces the sidebar count
// badge. Same read-only, aggregate-only feed from the standalone Verification
// Call Audits deployment — no patient or audit detail crosses over.
function VerificationSummary() {
  const summary = useVerificationCallAuditSummary();
  const loading = summary === null;
  const rows: { label: string; value: number; tone: string; icon: typeof FileVideo }[] = [
    { label: "Not Started", value: summary?.notStarted ?? 0, tone: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", icon: AlertTriangle },
    { label: "Recording Downloaded", value: summary?.recordingDownloaded ?? 0, tone: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300", icon: FileVideo },
    { label: "In Progress", value: summary?.inProgress ?? 0, tone: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300", icon: GraduationCap },
    { label: "Completed", value: summary?.completed ?? 0, tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300", icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Verification Summary</h1>
        <p className="text-sm text-muted-foreground">
          Live workload counts from the Verification Call Audits app. Refreshes every 30 seconds.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <AuditStat
          label="Active audits"
          value={loading ? "…" : summary.active}
          icon={Video}
          tone="bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300"
        />
        <AuditStat
          label="Total audits"
          value={loading ? "…" : summary.total}
          icon={FileVideo}
          tone="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Verification Call Audits by status</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Audits</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => (
                <TableRow key={row.label}>
                  <TableCell className="flex items-center gap-2">
                    <row.icon className={`size-4 rounded ${row.tone} p-0.5`} />
                    {row.label}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {loading ? "…" : row.value}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <a
            href="https://preview-verification-call-audits-77930b17.viktor.space/dashboard"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex text-sm font-medium text-primary hover:underline"
          >
            Open Audit Dashboard
          </a>
        </CardContent>
      </Card>
    </div>
  );
}

export function CallAuditsPage() {
  const [view, setView] = useState<View>("dashboard");
  const [editingAudit, setEditingAudit] = useState<CallAudit | null>(null);
  const isAdmin = useHasRestrictedAccess();
  const navItems: { id: View; label: string }[] = [
    { id: "dashboard", label: "Dashboard" }, { id: "list", label: "Verification Audits" },
    { id: "intake", label: "Intake Audits" },
    { id: "intakeHighlights", label: "Intake Highlights" },
    { id: "highlights", label: "Highlights" }, { id: "reports", label: "Reports" }, { id: "storage", label: "Storage" },
    { id: "verification", label: "Verification Summary" },
  ];
  function openForm(audit: CallAudit | null = null) { setEditingAudit(audit); setView("form"); }
  return <div className="max-w-7xl space-y-6 px-4 py-6 sm:px-6"><div className="flex flex-wrap gap-2 border-b pb-4">{navItems.map(item => <Button key={item.id} size="sm" variant={view === item.id ? "default" : "outline"} onClick={() => setView(item.id)}>{item.label}</Button>)}</div>{view === "dashboard" && <CallAuditDashboard onNavigate={setView} />}{view === "list" && <AuditList onCreate={() => openForm()} onEdit={openForm} />}{view === "form" && <AuditForm audit={editingAudit} onClose={() => setView("list")} />}{view === "highlights" && <Highlights onOpenList={() => setView("list")} />}{view === "reports" && <Reports />}{view === "storage" && <Storage onOpenAudit={openForm} />}{view === "verification" && <VerificationSummary />}{view === "intake" && <IntakeAuditsTab />}{view === "intakeHighlights" && <IntakeHighlights />}{isAdmin && view === "dashboard" && <CallAuditRosterManager />}</div>;
}
