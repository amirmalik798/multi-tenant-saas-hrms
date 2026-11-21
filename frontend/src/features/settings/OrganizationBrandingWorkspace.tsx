"use client";

import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Panel, PanelHeading } from "@/components/ui/Panel";
import { apiRequest } from "@/lib/api-client";

export function OrganizationBrandingWorkspace() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState(0);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function upload(file: File | undefined) {
    if (!file) return;
    setError(""); setNotice("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPEG, PNG, or WebP image."); return;
    }
    if (file.size === 0 || file.size > 100 * 1024) {
      setError("The organization logo must be between 1 byte and 100 KB."); return;
    }
    const body = new FormData(); body.append("logo", file);
    setBusy(true);
    try {
      await apiRequest("/org/logo", { method: "PUT", body });
      setFailed(false); setVersion((value) => value + 1); setNotice("Organization logo updated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to upload the organization logo.");
    } finally {
      setBusy(false); if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    setBusy(true); setError(""); setNotice("");
    try {
      await apiRequest("/org/logo", { method: "DELETE" });
      setFailed(true); setVersion((value) => value + 1); setNotice("Organization logo removed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to remove the organization logo.");
    } finally { setBusy(false); }
  }

  return (
    <Panel style={{ marginBottom: 16 }}>
      <PanelHeading title="Organization logo" description="This image identifies your organization throughout the shared workspaces." />
      <div className="panel-pad" style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ width: 76, height: 76, borderRadius: 18, border: "1px solid var(--border)", background: "var(--surface-muted)", display: "grid", placeItems: "center", overflow: "hidden", flexShrink: 0 }}>
          {!failed ? <img key={version} src={`/api/backend/org/logo?v=${version}`} alt="Organization logo preview" onError={() => setFailed(true)} style={{ width: "100%", height: "100%", objectFit: "contain", padding: 5 }} /> : <ImagePlus size={23} color="var(--muted)" />}
        </div>
        <div style={{ minWidth: 230, flex: "1 1 240px" }}>
          <p style={{ color: "var(--text-strong)", fontWeight: 650, margin: "0 0 4px" }}>{failed ? "No logo uploaded" : "Current organization logo"}</p>
          <p className="field-hint" style={{ margin: "0 0 10px" }}>JPEG, PNG or WebP · maximum 100 KB.</p>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => void upload(event.target.files?.[0])} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button type="button" size="sm" variant="secondary" leading={<ImagePlus size={14} />} busy={busy} onClick={() => inputRef.current?.click()}>Upload logo</Button>
            {!failed ? <Button type="button" size="sm" variant="ghost" leading={<Trash2 size={14} />} disabled={busy} onClick={() => void remove()}>Remove</Button> : null}
          </div>
        </div>
      </div>
      {error ? <p role="alert" className="form-error" style={{ margin: "0 16px 14px" }}>{error}</p> : null}
      {notice ? <p role="status" className="success-callout" style={{ margin: "0 16px 14px" }}>{notice}</p> : null}
    </Panel>
  );
}
