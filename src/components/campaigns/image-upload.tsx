"use client";

import * as React from "react";
import { ImageIcon, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-client";

/**
 * Pick an image from the device, rather than pasting a URL.
 *
 * The field here used to be "Image URL — https://…". Nobody has a URL for a
 * photo on their phone; they have the photo. Getting a URL meant uploading it
 * somewhere else first, which most hotel owners cannot do — so the image half
 * of campaigns was effectively unusable, and the field sat empty.
 *
 * The uploaded image is shown back rather than just its address. This is the
 * picture that goes out to every contact on the list and cannot be recalled,
 * so "did the right file attach?" has to be answerable by looking.
 */
export function CampaignImageUpload({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      // No Content-Type header: fetch has to generate the multipart boundary
      // itself, and forcing one produces a body the server cannot parse.
      const { url } = await apiFetch<{ url: string }>("/api/uploads/image", { method: "POST", body });
      onChange(url);
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't upload that image");
    } finally {
      setUploading(false);
      // Cleared so picking the SAME file again still fires a change event.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label>Image</Label>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      {value ? (
        <div className="flex items-start gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- an arbitrary
              tenant-uploaded URL on object storage, not a known-domain asset
              next/image can be configured for. */}
          <img
            src={value}
            alt="Campaign image"
            className="size-20 shrink-0 rounded-md border border-border object-cover"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <p className="truncate text-[11px] text-muted-foreground">{value}</p>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
                Replace
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onChange("")}>
                <X className="size-3.5" /> Remove
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Button variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()} className="self-start">
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}
          {uploading ? "Uploading…" : "Choose an image"}
        </Button>
      )}

      <p className="text-[11px] text-muted-foreground">
        JPG or PNG from your phone or computer. This is what every contact on the list receives.
      </p>
    </div>
  );
}
