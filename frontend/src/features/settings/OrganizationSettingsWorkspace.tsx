"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AlertCircle, Building2, CalendarDays, CheckCircle2, Clock3, Globe2, Save, ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useWorkspace } from "@/components/layout/WorkspaceGate";
import { Button } from "@/components/ui/Button";
import { Field, SelectInput, TextInput } from "@/components/ui/Field";
import { Panel, PanelHeading } from "@/components/ui/Panel";
import { PageHeader } from "@/components/ui/PageHeader";
import { apiRequest } from "@/lib/api-client";
import { OrganizationBrandingWorkspace } from "@/features/settings/OrganizationBrandingWorkspace";
import { useSmartRefresh } from "@/lib/smart-refresh";

type Settings = {
  timeZone: string; locale: string; currencyCode: string; dateFormat: string;
  weekStartsOn: number; workingDays: number[]; countryCode: string;
  legalEntityName: string; legalEntityCountryCode: string; setupCompletedAt?: string | null;
};
type Organization = { name: string; slug: string; contactEmail: string; contactPhone: string; address: string; country: string | null };
type Response = { status?: string; settings?: Partial<Settings>; organization?: Partial<Organization>; message?: string };
const defaultSettings: Settings = { timeZone: "Africa/Kigali", locale: "en-RW", currencyCode: "RWF", dateFormat: "DD/MM/YYYY", weekStartsOn: 1, workingDays: [1,2,3,4,5], countryCode: "RW", legalEntityName: "", legalEntityCountryCode: "RW" };
const days = [{ value: 1, label: "Monday" },{ value: 2, label: "Tuesday" },{ value: 3, label: "Wednesday" },{ value: 4, label: "Thursday" },{ value: 5, label: "Friday" },{ value: 6, label: "Saturday" },{ value: 7, label: "Sunday" }];

export function OrganizationSettingsWorkspace() {
  const { user, setupCompleted, refreshSession, timeZone } = useWorkspace();
  const searchParams = useSearchParams();
  const setupRequired = searchParams.get("setup") === "required" || !setupCompleted;
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [organization, setOrganization] = useState<Organization>({ name: user.organizationName, slug: "", contactEmail: "", contactPhone: "", address: "", country: "" });
  const [loading, setLoading] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); setError("");
    try {
      const result = await apiRequest<Response>("/org/settings");
      if (silent && dirtyRef.current) return;
      setSettings({ ...defaultSettings, ...(result.settings ?? {}), workingDays: Array.isArray(result.settings?.workingDays) ? result.settings.workingDays : defaultSettings.workingDays, legalEntityName: result.settings?.legalEntityName ?? "", legalEntityCountryCode: result.settings?.legalEntityCountryCode ?? result.settings?.countryCode ?? "RW" });
      setOrganization({ name: result.organization?.name ?? user.organizationName, slug: result.organization?.slug ?? "", contactEmail: result.organization?.contactEmail ?? "", contactPhone: result.organization?.contactPhone ?? "", address: result.organization?.address ?? "", country: result.organization?.country ?? "" });
      setDirty(false); dirtyRef.current = false;
      setSettingsLoaded(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load organization settings."); }
    finally { if (!silent) setLoading(false); }
  }, [user.organizationName]);
  useEffect(() => { void load(); }, [load]);
  useSmartRefresh(() => load(true), !dirty && !saving && !completing);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) { dirtyRef.current = true; setDirty(true); setSettings((current) => ({ ...current, [key]: value })); }
  function toggleDay(value: number) { dirtyRef.current = true; setDirty(true); setSettings((current) => ({ ...current, workingDays: current.workingDays.includes(value) ? current.workingDays.filter((day) => day !== value) : [...current.workingDays, value].sort((a,b) => a-b) })); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      await apiRequest("/org/settings", { method: "PATCH", body: JSON.stringify({
        timeZone: settings.timeZone.trim(), locale: settings.locale.trim(), currencyCode: settings.currencyCode.trim().toUpperCase(),
        dateFormat: settings.dateFormat, weekStartsOn: settings.weekStartsOn, workingDays: settings.workingDays,
        countryCode: settings.countryCode.trim().toUpperCase() || null,
        legalEntityName: settings.legalEntityName.trim() || null,
        legalEntityCountryCode: settings.legalEntityCountryCode.trim().toUpperCase() || null,
      }) });
      setNotice("Organization settings saved.");
      await refreshSession();
      dirtyRef.current = false; setDirty(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save organization settings."); }
    finally { setSaving(false); }
  }

  async function completeSetup() {
    setCompleting(true); setError(""); setNotice("");
    try {
      await apiRequest("/org/settings/complete", { method: "POST", body: JSON.stringify({}) });
      await refreshSession();
      setNotice("Organization setup has been completed. Your workspace is ready.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to complete organization setup."); }
    finally { setCompleting(false); }
  }

  const requiredReady = Boolean(settings.timeZone.trim() && settings.locale.trim() && /^[A-Z]{3}$/.test(settings.currencyCode.trim().toUpperCase()) && settings.dateFormat && settings.workingDays.length && /^[A-Z]{2}$/.test(settings.countryCode.trim().toUpperCase()));
  return <>
    <PageHeader eyebrow="Organization" title="Organization profile & settings" description="Set the organization’s locale, working calendar, currency, and legal context. These settings drive attendance and payroll display throughout the workspace." />
    {setupRequired ? <div className="info-callout" style={{ marginBottom: 16 }}><ShieldCheck size={17} />Before using the organization workspace, review and complete the required settings below. Your changes are saved to the existing organization settings API.</div> : null}
    {error ? <div role="alert" className="form-error" style={{ marginBottom: 14 }}>{error}</div> : null}
    {notice ? <div role="status" className="success-callout" style={{ marginBottom: 14 }}><CheckCircle2 size={15} />{notice}</div> : null}
    {loading ? <Panel><div className="loading-state">Loading organization settings…</div></Panel> : !settingsLoaded ? <Panel><div className="error-state"><div className="state-icon"><AlertCircle size={18} /></div><h3>Organization settings are unavailable</h3><p>The settings could not be verified. The placeholder values have not been enabled for editing, so they cannot accidentally overwrite the organization configuration.</p><Button variant="secondary" onClick={() => void load()}>Retry loading settings</Button></div></Panel> : <form onSubmit={save}>
      <Panel style={{ marginBottom: 16 }}>
        <PanelHeading title="Regional & time settings" description="These are the authoritative settings used for dates, shifts, and pay calculations." />
        <div className="panel-pad form-grid">
          <Field label="Time zone" hint="Use a valid IANA time-zone name, for example Africa/Kigali."><TextInput required maxLength={64} value={settings.timeZone} onChange={(e) => update("timeZone", e.target.value)} /></Field>
          <Field label="Locale" hint="A valid locale tag, such as en-RW or en-US."><TextInput required maxLength={35} value={settings.locale} onChange={(e) => update("locale", e.target.value)} /></Field>
          <Field label="Currency code" hint="Three-letter ISO-style currency code used for pay rates and payment totals."><TextInput required maxLength={3} value={settings.currencyCode} onChange={(e) => update("currencyCode", e.target.value.toUpperCase())} /></Field>
          <Field label="Date format"><SelectInput value={settings.dateFormat} onChange={(e) => update("dateFormat", e.target.value)}><option value="DD/MM/YYYY">DD/MM/YYYY</option><option value="MM/DD/YYYY">MM/DD/YYYY</option><option value="YYYY-MM-DD">YYYY-MM-DD</option><option value="DD.MM.YYYY">DD.MM.YYYY</option></SelectInput></Field>
          <Field label="Week starts on"><SelectInput value={String(settings.weekStartsOn)} onChange={(e) => update("weekStartsOn", Number(e.target.value))}>{days.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}</SelectInput></Field>
          <Field label="Organization country code" hint="Two-letter country code, e.g. RW."><TextInput required maxLength={2} value={settings.countryCode} onChange={(e) => update("countryCode", e.target.value.toUpperCase())} /></Field>
        </div>
        <div className="panel-pad" style={{ paddingTop: 0 }}>
          <Field label="Working days" hint="Select at least one weekday. This configures the standard organization calendar.">
            <div className="day-picker">{days.map((day) => <label key={day.value} className={`day-picker-item ${settings.workingDays.includes(day.value) ? "day-picker-selected" : ""}`}><input type="checkbox" checked={settings.workingDays.includes(day.value)} onChange={() => toggleDay(day.value)} /><span>{day.label.slice(0,3)}</span></label>)}</div>
          </Field>
        </div>
      </Panel>
      <Panel style={{ marginBottom: 16 }}>
        <PanelHeading title="Legal entity" description="Optional legal-entity details for organization records." />
        <div className="panel-pad form-grid"><Field label="Legal entity name"><TextInput maxLength={200} value={settings.legalEntityName} onChange={(e) => update("legalEntityName", e.target.value)} placeholder="Registered legal name" /></Field><Field label="Legal entity country code"><TextInput maxLength={2} value={settings.legalEntityCountryCode} onChange={(e) => update("legalEntityCountryCode", e.target.value.toUpperCase())} /></Field></div>
      </Panel>
      <OrganizationBrandingWorkspace />
      <Panel style={{ marginBottom: 16 }}>
        <PanelHeading title="Organization identity" description="Read-only organization identity information from the current backend contract." />
        <div className="panel-pad form-grid"><Detail label="Organization" value={organization.name} /><Detail label="Workspace slug" value={organization.slug} /><Detail label="Country on organization record" value={organization.country || "Not specified"} /><Detail label="Current configured timezone" value={timeZone} /></div>
      </Panel>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        {setupRequired ? <span className="field-hint">{requiredReady ? "Required settings are populated. Save changes, then complete the setup review." : "Complete the required fields before setup can be reviewed."}</span> : <span className="field-hint">Changes affect future workspace date, time, and currency formatting.</span>}
        <div style={{ display: "flex", gap: 8 }}><Button variant="secondary" type="button" disabled={!dirty || saving || completing} leading={<Clock3 size={14} />} onClick={() => void load()}>Discard changes</Button><Button variant="primary" type="submit" busy={saving} disabled={!settingsLoaded || completing} leading={<Save size={14} />}>Save settings</Button>{setupRequired ? <Button variant="primary" type="button" busy={completing} disabled={!settingsLoaded || !requiredReady || saving || dirty || completing} leading={<ShieldCheck size={14} />} onClick={() => void completeSetup()}>Complete setup</Button> : null}</div>
      </div>
    </form>}
  </>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div><p className="field-hint" style={{ margin: 0 }}>{label}</p><strong style={{ color: "var(--text-strong)", fontSize: 12 }}>{value || "—"}</strong></div>; }
