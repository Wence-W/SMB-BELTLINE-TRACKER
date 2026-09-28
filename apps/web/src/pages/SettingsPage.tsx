// Settings: account name, profile photo (round crop, uploaded as JPEG, as in
// the original), and password change by emailed code. The original's
// leftover template placeholders and unused theme/animation settings are not
// carried over (Inventory section 5.12).

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAuthActions } from "@convex-dev/auth/react";
import { useAction, useMutation } from "convex/react";
import { useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMe } from "@/lib/access";
import { getCroppedImageBlob } from "@/lib/cropImage";
import { errorMessage } from "@/lib/errors";

function ProfileCard() {
  const me = useMe();
  const updateName = useMutation(api.settings.updateMyName);
  const generateUploadUrl = useMutation(api.settings.generatePhotoUploadUrl);
  const setProfilePhoto = useAction(api.settings.setProfilePhoto);
  const removeProfilePhoto = useMutation(api.settings.removeProfilePhoto);
  const [name, setName] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  if (!me) return null;
  const shownName = name ?? me.accountName ?? me.displayName;

  async function saveCrop() {
    if (!cropSrc || !area) return;
    setBusy(true);
    try {
      const blob = await getCroppedImageBlob(cropSrc, area);
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob });
      const { storageId } = (await result.json()) as { storageId: Id<"_storage"> };
      await setProfilePhoto({ storageId });
      toast.success("Profile photo updated");
      setCropSrc(null);
    } catch (err) {
      toast.error(errorMessage(err, "Failed to update photo"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            {me.photoUrl && <AvatarImage src={me.photoUrl} alt="" />}
            <AvatarFallback>{shownName.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
              Change photo
            </Button>
            {me.photoUrl && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void removeProfilePhoto({}).catch(err => toast.error(errorMessage(err, "Failed to remove photo")))
                }
              >
                Remove
              </Button>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (!file.type.startsWith("image/")) {
                toast.error("Please choose an image file");
                return;
              }
              setCropSrc(URL.createObjectURL(file));
            }}
          />
        </div>

        {cropSrc && (
          <div className="space-y-3">
            <div className="relative h-72 w-full overflow-hidden rounded-lg bg-muted">
              <Cropper
                image={cropSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, pixels) => setArea(pixels)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setCropSrc(null)}>
                Cancel
              </Button>
              <Button size="sm" disabled={busy} onClick={() => void saveCrop()}>
                {busy ? "Saving…" : "Save photo"}
              </Button>
            </div>
          </div>
        )}

        <form
          className="space-y-2"
          onSubmit={async e => {
            e.preventDefault();
            try {
              await updateName({ name: shownName });
              setName(null);
              toast.success("Name updated");
            } catch (err) {
              toast.error(errorMessage(err, "Failed to update name"));
            }
          }}
        >
          <Label htmlFor="account-name">Display name</Label>
          <div className="flex gap-2">
            <Input id="account-name" value={shownName} onChange={e => setName(e.target.value)} />
            <Button type="submit" size="sm">
              Save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Signed in as {me.email}</p>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const me = useMe();
  const { signIn } = useAuthActions();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Change password</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!sent ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await signIn("password", { flow: "reset", email: me.email });
                setSent(true);
                toast.success("We emailed you an 8-digit code");
              } catch (err) {
                toast.error(errorMessage(err, "Couldn't send a code"));
              } finally {
                setBusy(false);
              }
            }}
          >
            Email me a code
          </Button>
        ) : (
          <form
            className="space-y-2"
            onSubmit={async e => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              setBusy(true);
              try {
                await signIn("password", {
                  flow: "reset-verification",
                  email: me.email,
                  code: String(form.get("code") ?? ""),
                  newPassword: String(form.get("newPassword") ?? ""),
                });
                setSent(false);
                toast.success("Password changed");
              } catch {
                toast.error("That code didn't work, or the password is shorter than 12 characters.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="8-digit code" required />
            <Input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              placeholder="New password (12+ characters)"
              required
            />
            <Button type="submit" size="sm" disabled={busy}>
              Change password
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <ProfileCard />
      <PasswordCard />
    </div>
  );
}
