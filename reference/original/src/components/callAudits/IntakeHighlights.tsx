import { useAction, useMutation, useQuery } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import { Sparkles, ThumbsUp, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
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
import {
  HIGHLIGHT_CALL_CATEGORIES,
  HIGHLIGHT_SPECIALISTS,
  highlightCategoryBadgeClass,
  openAuthenticatedHighlightRecording,
  type IntakeHighlight,
} from "@/lib/intakeHighlightTypes";
import type { RecordingSession } from "@/lib/callAuditTypes";
import { friendlyErrorMessage } from "@/lib/convexError";
import { useHasRestrictedAccess } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const ACCEPTED_AUDIO = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/mp4", "audio/webm", "video/mp4", "video/webm", "video/quicktime"];

function PanelCard({
  title,
  subtitle,
  actions,
  children,
}: {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            {title && <p className="font-semibold">{title}</p>}
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

// Base44 shows the clip datetime as "M/D/YYYY, h:mm:ss AM/PM".
function formatSubmitted(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function HighlightAudio({ id }: { id: Id<"intakeHighlights"> }) {
  const authToken = useAuthToken();
  const [session, setSession] = useState<RecordingSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!authToken) return;
    let active = true;
    let opened: RecordingSession | null = null;
    setLoading(true);
    setError(false);
    void openAuthenticatedHighlightRecording(id, authToken)
      .then(result => {
        opened = result;
        if (!active) {
          result.dispose();
          return;
        }
        setSession(result);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      opened?.dispose();
      setSession(null);
    };
  }, [id, authToken]);

  if (loading) return <span className="text-xs text-muted-foreground">Loading…</span>;
  if (error || !session)
    return <span className="text-xs text-muted-foreground">Unavailable</span>;
  return <audio src={session.url} controls className="h-9 w-[210px]" />;
}

export function IntakeHighlights() {
  const highlights = useQuery(api.intakeHighlights.list) as
    | IntakeHighlight[]
    | undefined;
  const isAdmin = useHasRestrictedAccess();

  const generateUploadUrl = useMutation(api.intakeHighlights.generateUploadUrl);
  const createWithAudio = useAction(api.intakeHighlights.createWithAudio);
  const purge = useMutation(api.intakeHighlights.purge);
  const toggleReaction = useMutation(api.intakeHighlights.toggleReaction);

  // Create Highlight form
  const [specialist, setSpecialist] = useState("");
  const [category, setCategory] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Filters + sort + selection
  const [filterSpecialist, setFilterSpecialist] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [selected, setSelected] = useState<Set<Id<"intakeHighlights">>>(new Set());
  const [confirmPurge, setConfirmPurge] = useState(false);

  const rows = useMemo(() => {
    const list = (highlights ?? []).filter(h => {
      if (filterSpecialist !== "all" && h.intakeSpecialist !== filterSpecialist)
        return false;
      if (filterCategory !== "all" && h.callCategory !== filterCategory) return false;
      return true;
    });
    list.sort((a, b) =>
      sort === "newest" ? b.submittedAt - a.submittedAt : a.submittedAt - b.submittedAt,
    );
    return list;
  }, [highlights, filterSpecialist, filterCategory, sort]);

  async function handleSubmit() {
    if (!specialist || !category || !audioFile || submitting) {
      toast.error("Intake specialist, call category, and an audio file are required.");
      return;
    }
    if (!ACCEPTED_AUDIO.includes(audioFile.type) || audioFile.size > 750 * 1024 * 1024) {
      toast.error("Audio must be an MP3, WAV, MP4, WebM, or QuickTime file under 750 MB.");
      return;
    }
    setSubmitting(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": audioFile.type },
        body: audioFile,
      });
      if (!res.ok) throw new Error("Audio upload failed.");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await createWithAudio({
        intakeSpecialist: specialist,
        callCategory: category,
        storageId,
        contentType: audioFile.type,
        sizeBytes: audioFile.size,
      });
      toast.success("Highlight submitted.");
      setSpecialist("");
      setCategory("");
      setAudioFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      toast.error(friendlyErrorMessage(error, "Could not submit highlight"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReaction(id: Id<"intakeHighlights">) {
    try {
      await toggleReaction({ highlightId: id });
    } catch (error) {
      toast.error(friendlyErrorMessage(error, "Could not react"));
    }
  }

  function toggleSelect(id: Id<"intakeHighlights">) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handlePurge() {
    try {
      const { deleted } = await purge({ ids: [...selected] });
      toast.success(`Removed ${deleted} highlight${deleted === 1 ? "" : "s"}.`);
      setSelected(new Set());
    } catch (error) {
      toast.error(friendlyErrorMessage(error, "Could not remove highlights"));
    } finally {
      setConfirmPurge(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Sparkles className="size-6 text-amber-500" /> Highlights
          </h1>
          <p className="text-sm text-muted-foreground">
            Showcase great calls and learning moments.
          </p>
        </div>
      </div>

      {/* Create Highlight */}
      <PanelCard title="Create Highlight">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Intake Specialist *</Label>
            <Select value={specialist} onValueChange={setSpecialist}>
              <SelectTrigger>
                <SelectValue placeholder="— Select specialist —" />
              </SelectTrigger>
              <SelectContent>
                {HIGHLIGHT_SPECIALISTS.map(s => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Call Category *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="— Select category —" />
              </SelectTrigger>
              <SelectContent>
                {HIGHLIGHT_CALL_CATEGORIES.map(c => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Upload Audio File *</Label>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,video/mp4,video/webm,video/quicktime"
                className="hidden"
                onChange={e => setAudioFile(e.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 size-4" /> Upload
              </Button>
              <span className="truncate text-xs text-muted-foreground">
                {audioFile ? audioFile.name : "No file chosen"}
              </span>
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-start">
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit Highlight"}
          </Button>
        </div>
      </PanelCard>

      {/* Filters */}
      <PanelCard title="Filters">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Intake Specialist</Label>
            <Select value={filterSpecialist} onValueChange={setFilterSpecialist}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Specialists</SelectItem>
                {HIGHLIGHT_SPECIALISTS.map(s => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Call Category</Label>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {HIGHLIGHT_CALL_CATEGORIES.map(c => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </PanelCard>

      {/* Submitted Highlights */}
      <PanelCard
        title={`Submitted Highlights (${rows.length})`}
        actions={
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive"
                disabled={selected.size === 0}
                onClick={() => setConfirmPurge(true)}
              >
                <Trash2 className="mr-2 size-4" /> Purge Selected
                {selected.size > 0 ? ` (${selected.size})` : ""}
              </Button>
            )}
            <Label className="text-xs text-muted-foreground">Sort</Label>
            <Select value={sort} onValueChange={v => setSort(v as "newest" | "oldest")}>
              <SelectTrigger className="h-8 w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="oldest">Oldest</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              {isAdmin && <TableHead className="w-8" />}
              <TableHead>Submitted</TableHead>
              <TableHead>Call Category</TableHead>
              <TableHead>Audio</TableHead>
              <TableHead className="text-right">Reactions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {highlights === undefined && (
              <TableRow>
                <TableCell colSpan={isAdmin ? 5 : 4} className="py-8 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {highlights !== undefined && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={isAdmin ? 5 : 4} className="py-8 text-center text-muted-foreground">
                  No highlights found.
                </TableCell>
              </TableRow>
            )}
            {rows.map(h => (
              <TableRow key={h._id}>
                {isAdmin && (
                  <TableCell>
                    <Checkbox
                      checked={selected.has(h._id)}
                      onCheckedChange={() => toggleSelect(h._id)}
                      aria-label="Select highlight"
                    />
                  </TableCell>
                )}
                <TableCell className="whitespace-nowrap text-sm">
                  {formatSubmitted(h.submittedAt)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn(highlightCategoryBadgeClass(h.callCategory))}>
                    {h.callCategory}
                  </Badge>
                </TableCell>
                <TableCell>
                  {h.audioStorageId ? <HighlightAudio id={h._id} /> : <span className="text-xs text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant={h.reactedByMe ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5"
                    title={h.reactionNames.join(", ")}
                    onClick={() => handleReaction(h._id)}
                  >
                    <ThumbsUp className="size-4" />
                    {h.reactionCount > 0 ? h.reactionCount : ""}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PanelCard>

      <AlertDialog open={confirmPurge} onOpenChange={setConfirmPurge}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove selected highlights?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {selected.size} highlight
              {selected.size === 1 ? "" : "s"} and their audio clips. Only Tracker admins
              can do this. It cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePurge}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
