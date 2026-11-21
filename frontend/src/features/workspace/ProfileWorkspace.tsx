"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Camera, Mail, MapPin, Pencil, Phone, ShieldCheck, UserRound } from "lucide-react";
import { useWorkspace } from "@/components/layout/WorkspaceGate";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, TextInput } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiRequest } from "@/lib/api-client";
import { humanize, formatDate } from "@/lib/format";
import { ProfilePhoto } from "@/components/ui/ProfilePhoto";
import { useSmartRefresh } from "@/lib/smart-refresh";

interface ProfileRecord {
  id?: string;
  email?: string;
  firstName?: string; lastName?: string; contactPhone?: string; country?: string; city?: string;
  first_name?: string; last_name?: string; phone?: string; employee_code?: string; designation?: string; workforce_role?: string; employment_status?: string; department_name?: string | null; manager_id?: string | null; manager_name?: string | null; joining_date?: string;
  emergency_contact_name?: string | null; emergency_contact_relationship?: string | null; emergency_contact_phone?: string | null;
}
interface ProfileForm { phone: string; country: string; city: string; emergencyName: string; emergencyRelationship: string; emergencyPhone: string }

export function ProfileWorkspace() {
  const { user, timeZone } = useWorkspace();
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoVersion, setPhotoVersion] = useState(0);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const loadSequenceRef = useRef(0);
  const [form, setForm] = useState<ProfileForm>({ phone: "", country: "", city: "", emergencyName: "", emergencyRelationship: "", emergencyPhone: "" });
  const isAdmin = user.role === "ORGANIZATION_ADMIN";
  const canEdit = isAdmin || user.role === "DEPARTMENT_MANAGER" || user.permissions.includes("employee.self.update") || (user.role === "HR_MANAGER" && user.permissions.includes("employee.update"));
  const canEditEmergency = isAdmin || user.role === "DEPARTMENT_MANAGER" || user.permissions.includes("employee.self.update") || (user.role === "HR_MANAGER" && user.permissions.includes("employee.update"));

  const load = useCallback(async (silent = false) => {
    const requestId = ++loadSequenceRef.current;
    if (!silent) setLoading(true); setError("");
    try {
      let record: ProfileRecord;
      if (isAdmin) {
        const result = await apiRequest<{ profile?: ProfileRecord }>("/org/profile");
        record = result.profile || {};
      } else if (user.role === "EMPLOYEE") {
        const result = await apiRequest<{ employee?: ProfileRecord }>("/employees/me");
        record = result.employee || {};
      } else {
        const result = await apiRequest<{ employee?: ProfileRecord }>(`/employees/${user.employeeId}`);
        record = result.employee || {};
      }
      if (requestId !== loadSequenceRef.current) return;
      setProfile(record);
      setForm({
        phone: isAdmin ? record.contactPhone || "" : record.phone || "",
        country: record.country || "",
        city: record.city || "",
        emergencyName: record.emergency_contact_name || "",
        emergencyRelationship: record.emergency_contact_relationship || "",
        emergencyPhone: record.emergency_contact_phone || "",
      });
    } catch (caught) { if (requestId === loadSequenceRef.current) setError(caught instanceof Error ? caught.message : "Unable to load your profile."); }
    finally { if (!silent && requestId === loadSequenceRef.current) setLoading(false); }
  }, [isAdmin, user.role, user.employeeId]);

  useEffect(() => { void load(); }, [load]);
  useSmartRefresh(() => load(true), !drawerOpen && !saving && !photoUploading);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      if (isAdmin) {
        const result = await apiRequest<{ profile?: ProfileRecord }>("/org/profile", { method: "PATCH", body: JSON.stringify({ contactPhone: form.phone.trim() || null, country: form.country.trim() || null, city: form.city.trim() || null }) });
        setProfile((current) => ({ ...current, ...(result.profile || {}) }));
      } else {
        const body: Record<string, string | null> = { phone: form.phone.trim() || null, country: form.country.trim() || null, city: form.city.trim() || null };
        if (canEditEmergency) {
          body.emergency_contact_name = form.emergencyName.trim() || null;
          body.emergency_contact_relationship = form.emergencyRelationship.trim() || null;
          body.emergency_contact_phone = form.emergencyPhone.trim() || null;
        }
        const result = await apiRequest<{ employee?: ProfileRecord }>(`/employees/${user.employeeId}`, { method: "PATCH", body: JSON.stringify(body) });
        setProfile((current) => ({ ...current, ...(result.employee || {}) }));
      }
      setDrawerOpen(false); setNotice("Your contact details have been updated.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to update your profile."); }
    finally { setSaving(false); }
  }


  async function uploadPhoto(file: File | undefined) {
    if (!file) return;
    setError(""); setNotice("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size === 0 || file.size > 25 * 1024) {
      setError("Your profile photo must be between 1 byte and 25 KB.");
      return;
    }
    const body = new FormData();
    body.append("photo", file);
    setPhotoUploading(true);
    try {
      const endpoint = isAdmin ? "/org/profile/photo" : "/employees/me/photo";
      await apiRequest(endpoint, { method: "PUT", body });
      setPhotoVersion((value) => value + 1);
      window.dispatchEvent(new Event("hrms:profile-photo-updated"));
      setNotice("Your profile photo has been updated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to upload your profile photo.");
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  const firstName = isAdmin ? profile?.firstName || "" : profile?.first_name || "";
  const lastName = isAdmin ? profile?.lastName || "" : profile?.last_name || "";
  const fullName = `${firstName} ${lastName}`.trim() || user.displayName || "Workforce member";
  const phone = isAdmin ? profile?.contactPhone : profile?.phone;

  return <>
    <PageHeader eyebrow="My account" title="My profile" description="Your identity and contact details for this organization workspace." action={canEdit ? <Button variant="primary" leading={<Pencil size={14} />} onClick={() => { setError(""); setDrawerOpen(true); }}>Edit contact details</Button> : undefined} />
    {notice ? <div className="success-callout" role="status" style={{ marginBottom: 12 }}>{notice}</div> : null}
    {error && !drawerOpen ? <div className="form-error" role="alert" style={{ marginBottom: 12 }}>{error}</div> : null}
    <div className="profile-layout">
      <Panel className="profile-identity">
        <ProfilePhoto name={fullName} organizationAdmin={isAdmin} currentUser={!isAdmin} refreshKey={photoVersion} className="profile-avatar" />
        <h2>{fullName}</h2><p>{profile?.email || user.email}</p>
        <StatusBadge value={isAdmin ? "ORGANIZATION_ADMIN" : profile?.employment_status || user.role} label={isAdmin ? "Organization Admin" : humanize(profile?.workforce_role || user.role)} />
        <div className="profile-photo-actions">
          <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => void uploadPhoto(event.target.files?.[0])} />
          <Button size="sm" variant="secondary" leading={<Camera size={14} />} busy={photoUploading} onClick={() => photoInputRef.current?.click()}>Update photo</Button>
          <span className="field-hint">JPEG, PNG or WebP · up to 25 KB</span>
        </div>
        <div className="profile-identity-foot"><ShieldCheck size={14} /> Verified organization account</div>
      </Panel>
      <div className="profile-detail-column">
        <Panel><div className="panel-heading"><div><h2>Contact details</h2><p>Information used to reach you.</p></div></div><div className="profile-detail-grid"><ProfileItem icon={<Mail size={15} />} label="Email" value={profile?.email || user.email} /><ProfileItem icon={<Phone size={15} />} label="Phone" value={phone} /><ProfileItem icon={<MapPin size={15} />} label="Location" value={[profile?.city, profile?.country].filter(Boolean).join(", ")} /></div></Panel>
        {!isAdmin ? <Panel><div className="panel-heading"><div><h2>Work information</h2><p>Your current role and reporting context.</p></div></div><div className="profile-detail-grid"><ProfileItem icon={<UserRound size={15} />} label="Employee code" value={profile?.employee_code} /><ProfileItem icon={<ShieldCheck size={15} />} label="Workforce role" value={humanize(profile?.workforce_role)} /><ProfileItem icon={<MapPin size={15} />} label="Department" value={profile?.department_name} /><div className="profile-item"><span className="profile-item-icon"><UserRound size={15} /></span><div><p>Reporting manager</p>{profile?.manager_name ? <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0, marginTop: 3 }}>{profile.manager_id ? <ProfilePhoto name={profile.manager_name} employeeId={profile.manager_id} /> : null}<strong style={{ overflowWrap: "anywhere" }}>{profile.manager_name}</strong></div> : <strong>—</strong>}</div></div><ProfileItem icon={<Mail size={15} />} label="Job title" value={profile?.designation} /><ProfileItem icon={<Phone size={15} />} label="Joining date" value={profile?.joining_date ? formatDate(profile.joining_date, timeZone) : "—"} /></div></Panel> : null}
        {!isAdmin && (profile?.emergency_contact_name || profile?.emergency_contact_phone) ? <Panel><div className="panel-heading"><div><h2>Emergency contact</h2><p>Stored contact details for emergencies.</p></div></div><div className="profile-detail-grid"><ProfileItem label="Name" value={profile.emergency_contact_name} /><ProfileItem label="Relationship" value={profile.emergency_contact_relationship} /><ProfileItem label="Phone" value={profile.emergency_contact_phone} /></div></Panel> : null}
      </div>
    </div>
    {loading ? <div className="loading-state">Loading your profile…</div> : null}
    <Drawer open={drawerOpen} title="Edit contact details" description="Only the contact fields accepted by your role's existing profile API are submitted." onClose={() => { if (!saving) setDrawerOpen(false); }} footer={<><Button variant="secondary" disabled={saving} onClick={() => setDrawerOpen(false)}>Cancel</Button><Button variant="primary" busy={saving} onClick={() => document.querySelector<HTMLFormElement>("#profile-edit-form")?.requestSubmit()}>Save changes</Button></>}>
      <form id="profile-edit-form" onSubmit={save}>
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        <div className="form-section"><h3 className="form-section-title">Contact details</h3><div className="form-grid"><Field label="Phone number"><TextInput maxLength={50} value={form.phone} onChange={(e) => setForm((current) => ({ ...current, phone: e.target.value }))} /></Field><Field label="Country"><TextInput maxLength={100} value={form.country} onChange={(e) => setForm((current) => ({ ...current, country: e.target.value }))} /></Field><Field label="City"><TextInput maxLength={100} value={form.city} onChange={(e) => setForm((current) => ({ ...current, city: e.target.value }))} /></Field></div></div>
        {!isAdmin && canEditEmergency ? <div className="form-section"><h3 className="form-section-title">Emergency contact</h3><div className="form-grid"><Field label="Contact name"><TextInput maxLength={160} value={form.emergencyName} onChange={(e) => setForm((current) => ({ ...current, emergencyName: e.target.value }))} /></Field><Field label="Relationship"><TextInput maxLength={80} value={form.emergencyRelationship} onChange={(e) => setForm((current) => ({ ...current, emergencyRelationship: e.target.value }))} /></Field><Field label="Phone number"><TextInput maxLength={50} value={form.emergencyPhone} onChange={(e) => setForm((current) => ({ ...current, emergencyPhone: e.target.value }))} /></Field></div></div> : null}
      </form>
    </Drawer>
  </>;
}
function ProfileItem({ icon, label, value }: { icon?: ReactNode; label: string; value?: string | null }) { return <div className="profile-item">{icon ? <span className="profile-item-icon">{icon}</span> : null}<div><p>{label}</p><strong>{value || "—"}</strong></div></div>; }
