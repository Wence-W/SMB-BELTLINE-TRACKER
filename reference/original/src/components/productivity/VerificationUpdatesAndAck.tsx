/**
 * Shared "Updates" log + "I acknowledge" checkbox, embedded at the bottom of
 * the Verification Workflow Process and Verification Guidelines tabs
 * (Wence, 2026-09-23):
 *   - Updates: any signed-in staff can post a text note and/or a screenshot
 *     (paste from clipboard or choose a file), shown newest-first with
 *     who/when.
 *   - Acknowledge: one "I acknowledge" click per verifier per tab, logged
 *     with their name/email + timestamp. Track-only — never gates the tab
 *     or the rest of the Tracker — and the full list of who acknowledged is
 *     visible to everyone.
 */
import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, ImagePlus, Loader2, ShieldCheck, X } from "lucide-react";
import { type ClipboardEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Page = "process" | "guidelines";

function friendlyError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function UpdatesLog({ page }: { page: Page }) {
  const updates = useQuery(api.verificationPages.listUpdates, { page });
  const generateUploadUrl = useMutation(api.verificationPages.generateUpdateUploadUrl);
  const addUpdate = useMutation(api.verificationPages.addUpdate);

  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function setImage(next: File | null) {
    setFile(next);
    setPreview(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return next ? URL.createObjectURL(next) : null;
    });
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith("image/"));
    if (!item) return;
    const blob = item.getAsFile();
    if (!blob) return;
    e.preventDefault();
    setImage(new File([blob], `pasted-${Date.now()}.png`, { type: blob.type }));
  }

  async function handleSubmit() {
    if (!text.trim() && !file) {
      toast.error("Add a note or a screenshot first.");
      return;
    }
    setSubmitting(true);
    try {
      let screenshotStorageId: Id<"_storage"> | undefined;
      if (file) {
        const uploadUrl = await generateUploadUrl();
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!res.ok) throw new Error("Screenshot upload failed.");
        const json = (await res.json()) as { storageId: Id<"_storage"> };
        screenshotStorageId = json.storageId;
      }
      await addUpdate({ page, text: text.trim() || undefined, screenshotStorageId });
      setText("");
      setImage(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.success("Update posted.");
    } catch (error) {
      toast.error(friendlyError(error, "Could not post update"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <Textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onPaste={handlePaste}
          placeholder="Post an update… paste a screenshot (Ctrl/Cmd+V) or attach one below."
          className="min-h-[70px] text-sm"
        />
        {preview && (
          <div className="relative inline-block">
            <img src={preview} alt="Attached screenshot preview" className="max-h-40 rounded-md border border-border" />
            <button
              type="button"
              onClick={() => setImage(null)}
              className="absolute -top-2 -right-2 rounded-full bg-background border border-border p-0.5 shadow"
              aria-label="Remove screenshot"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => setImage(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus className="h-4 w-4 mr-1.5" />
              Attach screenshot
            </Button>
          </div>
          <Button type="button" size="sm" onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Post update
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {updates === undefined && (
          <p className="text-sm text-muted-foreground">Loading updates…</p>
        )}
        {updates && updates.length === 0 && (
          <p className="text-sm text-muted-foreground">No updates posted yet.</p>
        )}
        {updates?.map(u => (
          <div key={u._id} className="rounded-lg border border-border bg-card p-3 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {u.createdByName ?? u.createdByEmail ?? "Unknown"}
              </span>
              <span>{formatWhen(u.createdAt)}</span>
            </div>
            {u.text && <p className="text-sm text-foreground whitespace-pre-wrap">{u.text}</p>}
            {u.screenshotUrl && (
              <img
                src={u.screenshotUrl}
                alt="Update screenshot"
                className="max-h-64 rounded-md border border-border"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AcknowledgePanel({ page }: { page: Page }) {
  const mine = useQuery(api.verificationPages.myAcknowledgement, { page });
  const all = useQuery(api.verificationPages.listAcknowledgements, { page });
  const acknowledge = useMutation(api.verificationPages.acknowledge);
  const [submitting, setSubmitting] = useState(false);

  async function handleClick() {
    setSubmitting(true);
    try {
      await acknowledge({ page });
      toast.success("Acknowledged.");
    } catch (error) {
      toast.error(friendlyError(error, "Could not record acknowledgement"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-foreground">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <span>
            {mine
              ? `You acknowledged this on ${formatWhen(mine.acknowledgedAt)}.`
              : "Have you read this? Click to acknowledge."}
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant={mine ? "outline" : "default"}
          disabled={!!mine || submitting}
          onClick={handleClick}
        >
          {mine ? (
            <>
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Acknowledged
            </>
          ) : submitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              Acknowledging…
            </>
          ) : (
            "I acknowledge"
          )}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Track-only — you can keep using this tab and the Tracker whether or not you've
        acknowledged. Everyone can see who has acknowledged below.
      </p>
      <div className="border-t border-border pt-2 space-y-1 max-h-40 overflow-y-auto">
        {all === undefined && <p className="text-xs text-muted-foreground">Loading…</p>}
        {all && all.length === 0 && (
          <p className="text-xs text-muted-foreground">No one has acknowledged yet.</p>
        )}
        {all?.map(a => (
          <div key={a._id} className="flex items-center justify-between text-xs">
            <span className="text-foreground">{a.name ?? a.email ?? "Unknown"}</span>
            <span className="text-muted-foreground">{formatWhen(a.acknowledgedAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function VerificationUpdatesAndAck({ page }: { page: Page }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-2">Acknowledgement</h3>
        <AcknowledgePanel page={page} />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-2">Updates</h3>
        <UpdatesLog page={page} />
      </div>
    </div>
  );
}
