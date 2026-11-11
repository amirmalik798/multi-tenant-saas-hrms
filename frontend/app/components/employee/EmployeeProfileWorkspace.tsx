
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Edit3,
  Globe2,
  ImagePlus,
  Mail,
  Phone,
  RefreshCw,
  Save,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useEmployeeWorkspaceUser } from "./EmployeeChrome";
import EmployeeProfilePhoto from "./EmployeeProfilePhoto";
import { useWorkspaceAutoRefresh } from "../shared/useWorkspaceAutoRefresh";
import {
  CountrySelect,
  formatCountryWithFlag,
  isCallingCodeOnly,
  replacePhoneCountryCode,
} from "../../components/workforce/CountryPhoneFields";

type Row = Record<string, unknown>;
type Notice = { type: "success" | "error"; message: string };

type EditableKey =
  | "phone"
  | "city"
  | "country"
  | "emergency_contact_name"
  | "emergency_contact_relationship"
  | "emergency_contact_phone";

type ProfileDraft = Record<EditableKey, string>;

const PANEL =
  "min-w-0 rounded-2xl border border-white/[0.08] bg-[#121b29] shadow-xl shadow-black/10";

const INPUT =
  "mt-2 w-full rounded-xl border border-white/[0.11] bg-[#0b121d] px-3.5 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-sky-300/50 focus:ring-2 focus:ring-sky-300/10 disabled:cursor-not-allowed disabled:opacity-60";

const BUTTON =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.035] px-3.5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-sky-300/30 hover:bg-sky-300/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-50";

const PRIMARY =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-sky-300 px-4 py-2.5 text-sm font-bold text-[#071421] transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-50";

const LABEL =
  "text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500";

const MAX_PHOTO_SIZE = 25 * 1024;

const ALLOWED_PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

const EDITABLE_FIELDS: {
  key: EditableKey;
  label: string;
  maxLength: number;
  type?: "tel" | "text";
}[] = [
  { key: "country", label: "Country", maxLength: 100 },
  { key: "phone", label: "Phone number", maxLength: 50, type: "tel" },
  { key: "city", label: "City", maxLength: 100 },
  {
    key: "emergency_contact_name",
    label: "Emergency contact name",
    maxLength: 120,
  },
  {
    key: "emergency_contact_relationship",
    label: "Relationship",
    maxLength: 80,
  },
  {
    key: "emergency_contact_phone",
    label: "Emergency contact phone",
    maxLength: 30,
    type: "tel",
  },
];

function isRecord(value: unknown): value is Row {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function read(
  row: Row | null | undefined,
  ...keys: string[]
): string {
  if (!row) return "";

  for (const key of keys) {
    const value = row[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return "";
}

function humanize(value: string): string {
  return value
    ? value
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "Not provided";
}

function formatDate(value: string): string {
  if (!value) return "Not provided";

  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? (() => {
        const [year, month, day] = value.split("-").map(Number);
        return new Date(year, month - 1, day, 12);
      })()
    : new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function makeDraft(profile: Row): ProfileDraft {
  return {
    phone: read(profile, "phone"),
    city: read(profile, "city"),
    country: read(profile, "country"),
    emergency_contact_name: read(
      profile,
      "emergency_contact_name",
      "emergencyContactName",
    ),
    emergency_contact_relationship: read(
      profile,
      "emergency_contact_relationship",
      "emergencyContactRelationship",
    ),
    emergency_contact_phone: read(
      profile,
      "emergency_contact_phone",
      "emergencyContactPhone",
    ),
  };
}

function statusClass(status: string): string {
  const normalized = status.toUpperCase();

  if (normalized === "ACTIVE") {
    return "border-emerald-300/20 bg-emerald-300/10 text-emerald-200";
  }

  if (normalized === "INACTIVE" || normalized === "FORMER") {
    return "border-slate-500/30 bg-slate-500/10 text-slate-300";
  }

  return "border-amber-300/20 bg-amber-300/10 text-amber-200";
}

async function requestJson(
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(`/api/backend${path}`, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(init.body
        ? { "Content-Type": "application/json" }
        : {}),
      ...init.headers,
    },
  });

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message = isRecord(data)
      ? read(data, "message", "error", "detail")
      : "";

    throw new Error(
      message || `The request failed with HTTP ${response.status}.`,
    );
  }

  return data;
}

function Field({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: typeof UserRound;
}) {
  return (
    <div className="min-w-0 border-b border-white/[0.055] py-3 last:border-0">
      <dt className={LABEL}>{label}</dt>

      <dd className="mt-1.5 flex min-w-0 items-start gap-2 break-words text-sm font-medium leading-6 text-slate-200">
        {Icon && (
          <Icon
            size={15}
            className="mt-0.5 shrink-0 text-slate-500"
          />
        )}

        <span>{value || "Not provided"}</span>
      </dd>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof UserRound;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-sky-300/15 bg-sky-300/[0.06] text-sky-200">
        <Icon size={17} />
      </div>

      <div className="min-w-0">
        <h2 className="text-sm font-bold text-white">{title}</h2>

        <p className="mt-1 text-xs leading-5 text-slate-500">
          {description}
        </p>
      </div>
    </div>
  );
}

type EmployeeProfileWorkspaceProps = {
  employeeId?: string;
  permissions?: string[];
  homeHref?: string;
  roleLabel?: string;
  allowSelfEdit?: boolean;
};

export default function EmployeeProfileWorkspace({
  employeeId,
  permissions,
  homeHref = "/employee/dashboard",
  roleLabel = "Employee",
  allowSelfEdit = false,
}: EmployeeProfileWorkspaceProps = {}) {
  const user = useEmployeeWorkspaceUser();

  const [profile, setProfile] = useState<Row | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);

  const [touchedFields, setTouchedFields] = useState<Set<EditableKey>>(
    () => new Set(),
  );

  const [submitAttempted, setSubmitAttempted] = useState(false);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoVersion, setPhotoVersion] = useState(0);

  const photoInputRef = useRef<HTMLInputElement>(null);

  const targetEmployeeId = employeeId ?? user?.employeeId;
  const canEdit = Boolean(
    allowSelfEdit ||
      (permissions ?? user?.permissions)?.includes("employee.self.update"),
  );

  const hasUnsavedChanges = useMemo(() => {
    if (!editing || !draft || !profile) return false;

    const original = makeDraft(profile);

    return EDITABLE_FIELDS.some(
      (field) => draft[field.key].trim() !== original[field.key],
    );
  }, [draft, editing, profile]);

  const loadProfile = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");

    try {
      // Department Managers use their own authenticated employee ID with the
      // existing self-profile authorization on /employees/:id.
      const payload = await requestJson(
        employeeId
          ? `/employees/${encodeURIComponent(employeeId)}`
          : "/employees/me",
      );

      const employee =
        isRecord(payload) && isRecord(payload.employee)
          ? payload.employee
          : null;

      if (!employee) {
        throw new Error(
          "The server did not return your employee profile.",
        );
      }

      setProfile(employee);
      setDraft(makeDraft(employee));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load your employee profile.",
      );
    } finally {
      if (!silent) setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useWorkspaceAutoRefresh(
    () => loadProfile(true),
    {
      enabled: true,
      intervalMs: 60_000,
      shouldRefresh: () => !loading && !saving && !editing && !uploadingPhoto && !hasUnsavedChanges,
    },
  );

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    const confirmInternalNavigation = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;

      if (
        !(target instanceof HTMLAnchorElement) ||
        target.target === "_blank" ||
        target.hasAttribute("download")
      ) {
        return;
      }

      const nextUrl = new URL(target.href, window.location.href);

      if (
        nextUrl.origin !== window.location.origin ||
        nextUrl.pathname === window.location.pathname
      ) {
        return;
      }

      if (
        !window.confirm(
          "You have unsaved profile changes. Leave this page and discard them?",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", warnBeforeLeaving);
    document.addEventListener(
      "click",
      confirmInternalNavigation,
      true,
    );

    return () => {
      window.removeEventListener("beforeunload", warnBeforeLeaving);
      document.removeEventListener(
        "click",
        confirmInternalNavigation,
        true,
      );
    };
  }, [hasUnsavedChanges]);

  const fullName = useMemo(() => {
    const name = [
      read(profile, "first_name", "firstName"),
      read(profile, "last_name", "lastName"),
    ]
      .filter(Boolean)
      .join(" ");

    return name || user?.email || "Employee profile";
  }, [profile, user?.email]);

  const role = humanize(
    read(profile, "workforce_role") || user?.role || "EMPLOYEE",
  );

  const employmentStatus = read(
    profile,
    "employment_status",
    "employmentStatus",
  );

  const departmentName = read(
    profile,
    "department_name",
    "departmentName",
  );

  const managerName =
    read(profile, "manager_name", "managerName") ||
    [
      read(profile, "manager_first_name", "managerFirstName"),
      read(profile, "manager_last_name", "managerLastName"),
    ]
      .filter(Boolean)
      .join(" ");

  const managerId = read(profile, "manager_id", "managerId");

  const managerEmail = read(
    profile,
    "manager_email",
    "managerEmail",
  );

  const departmentStatus = read(
    profile,
    "department_status",
    "departmentStatus",
  );

  function beginEditing() {
    if (!profile || !canEdit) return;

    setDraft(makeDraft(profile));
    setEditing(true);
    setTouchedFields(new Set());
    setSubmitAttempted(false);
    setNotice(null);
  }

  function cancelEditing() {
    if (
      hasUnsavedChanges &&
      !window.confirm("Discard your unsaved profile changes?")
    ) {
      return;
    }

    if (profile) {
      setDraft(makeDraft(profile));
    }

    setEditing(false);
    setTouchedFields(new Set());
    setSubmitAttempted(false);
    setNotice(null);
  }

  function setField(key: EditableKey, value: string) {
    setDraft((current) => {
      if (!current) return current;

      if (key === "country") {
        return {
          ...current,
          country: value,
          phone: replacePhoneCountryCode(
            current.phone,
            current.country,
            value,
          ),
        };
      }

      return { ...current, [key]: value };
    });
  }

  function getFieldError(key: EditableKey): string | null {
    if (!draft) return null;

    const value = draft[key].trim();

    if (key === "city" && !value) {
      return "City is required.";
    }

    if (key === "country" && !value) {
      return "Country is required.";
    }

    if (
      key === "emergency_contact_name" &&
      value.length > 120
    ) {
      return "Name must be 120 characters or fewer.";
    }

    if (
      key === "emergency_contact_relationship" &&
      value.length > 80
    ) {
      return "Relationship must be 80 characters or fewer.";
    }

    return null;
  }

  function showFieldError(key: EditableKey): boolean {
    return (
      (submitAttempted || touchedFields.has(key)) &&
      Boolean(getFieldError(key))
    );
  }

  async function submitProfile(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!profile || !draft || !targetEmployeeId || saving) {
      return;
    }

    if (!canEdit) {
      setNotice({
        type: "error",
        message:
          "Self-service profile updates are not enabled for this account. Contact your HR Manager.",
      });
      return;
    }

    setSubmitAttempted(true);

    setTouchedFields(
      new Set(EDITABLE_FIELDS.map((field) => field.key)),
    );

    if (
      EDITABLE_FIELDS.some((field) =>
        getFieldError(field.key),
      )
    ) {
      setNotice({
        type: "error",
        message:
          "Please correct the highlighted fields before saving.",
      });
      return;
    }

    const original = makeDraft(profile);
    const payload: Record<string, string> = {};

    for (const field of EDITABLE_FIELDS) {
      const draftValue = draft[field.key].trim();

      const nextValue =
        field.key === "phone" &&
        isCallingCodeOnly(draftValue, draft.country)
          ? ""
          : draftValue;

      if (nextValue !== original[field.key]) {
        payload[field.key] = nextValue;
      }
    }

    if (Object.keys(payload).length === 0) {
      setNotice({
        type: "success",
        message: "No changes to save.",
      });

      setEditing(false);
      return;
    }

    if (
      Object.prototype.hasOwnProperty.call(payload, "city") &&
      !payload.city
    ) {
      setNotice({
        type: "error",
        message: "City cannot be empty when changing this field.",
      });
      return;
    }

    if (
      Object.prototype.hasOwnProperty.call(payload, "country") &&
      !payload.country
    ) {
      setNotice({
        type: "error",
        message: "Country cannot be empty when changing this field.",
      });
      return;
    }

    if (
      payload.phone &&
      (
        payload.phone.replace(/\D/g, "").length < 7 ||
        payload.phone.replace(/\D/g, "").length > 15 ||
        !/^\+?[0-9][0-9\s().-]*$/.test(payload.phone)
      )
    ) {
      setNotice({
        type: "error",
        message:
          "Enter a valid international phone number with 7–15 digits.",
      });
      return;
    }

    if (
      payload.emergency_contact_phone &&
      (
        payload.emergency_contact_phone.replace(/\D/g, "").length < 7 ||
        payload.emergency_contact_phone.replace(/\D/g, "").length > 15 ||
        !/^\+?[0-9][0-9\s().-]*$/.test(
          payload.emergency_contact_phone,
        )
      )
    ) {
      setNotice({
        type: "error",
        message:
          "Enter a valid emergency contact phone number with 7–15 digits.",
      });
      return;
    }

    const emergencyName =
      draft.emergency_contact_name.trim();

    const emergencyPhone =
      draft.emergency_contact_phone.trim();

    const emergencyRelationship =
      draft.emergency_contact_relationship.trim();

    const hasEmergencyDetails = Boolean(
      emergencyName ||
      emergencyPhone ||
      emergencyRelationship,
    );

    if (
      hasEmergencyDetails &&
      (!emergencyName || !emergencyPhone)
    ) {
      setNotice({
        type: "error",
        message:
          "Provide both an emergency contact name and phone number, or clear all emergency contact fields. Relationship is optional.",
      });
      return;
    }

    if (!targetEmployeeId) {
      setNotice({ type: "error", message: "Your employee profile could not be identified." });
      return;
    }

    setSaving(true);
    setNotice(null);

    try {
      const response = await requestJson(
        `/employees/${encodeURIComponent(targetEmployeeId ?? "")}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        },
      );

      const updatedEmployee =
        isRecord(response) && isRecord(response.employee)
          ? response.employee
          : null;

      if (!updatedEmployee) {
        throw new Error(
          "The server did not confirm the updated profile.",
        );
      }

      const merged = { ...profile, ...updatedEmployee };

      setProfile(merged);
      setDraft(makeDraft(merged));
      setEditing(false);
      setTouchedFields(new Set());
      setSubmitAttempted(false);

      setNotice({
        type: "success",
        message: "Your profile changes have been saved.",
      });
    } catch (caught) {
      setNotice({
        type: "error",
        message:
          caught instanceof Error
            ? caught.message
            : "Unable to save your profile changes.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function uploadProfilePhoto(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.currentTarget.files?.[0] ?? null;

    // Reset the input so the same file can be selected again.
    event.currentTarget.value = "";

    if (!file || uploadingPhoto) return;

    if (file.size === 0) {
      setNotice({
        type: "error",
        message: "The selected image is empty.",
      });
      return;
    }

    if (file.size > MAX_PHOTO_SIZE) {
      setNotice({
        type: "error",
        message:
          "Your profile photo must not exceed 25 KB (25,600 bytes).",
      });
      return;
    }

    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      setNotice({
        type: "error",
        message: "Choose a JPEG, PNG, or WebP image.",
      });
      return;
    }

    const formData = new FormData();
    formData.append("photo", file);

    setUploadingPhoto(true);
    setNotice(null);

    try {
      const response = await fetch(
        "/api/backend/employees/me/photo",
        {
          method: "PUT",
          credentials: "same-origin",
          cache: "no-store",
          body: formData,
        },
      );

      const payload: unknown = await response
        .json()
        .catch(() => null);

      if (!response.ok) {
        const message = isRecord(payload)
          ? read(payload, "message", "error", "detail")
          : "";

        throw new Error(
          message ||
            `The photo upload failed with HTTP ${response.status}.`,
        );
      }

      // Refresh this profile avatar and any persistent workspace header avatar.
      setPhotoVersion(Date.now());
      window.dispatchEvent(new Event("hrms:profile-photo-updated"));

      setNotice({
        type: "success",
        message:
          "Your profile photo has been uploaded successfully.",
      });
    } catch (caught) {
      setNotice({
        type: "error",
        message:
          caught instanceof Error
            ? caught.message
            : "Unable to upload your profile photo.",
      });
    } finally {
      setUploadingPhoto(false);
    }
  }

  const titleLine = [
    read(profile, "designation", "jobTitle"),
    departmentName,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="employee-profile-workspace min-w-0 space-y-6 pb-8 text-slate-100">
      <header className="employee-profile-page-header flex flex-col justify-between gap-4 rounded-2xl border border-white/[0.08] p-5 shadow-sm sm:flex-row sm:items-end">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-300">
            My workspace / identity
          </p>

          <h2 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
            My Profile
          </h2>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Employment details, reporting line, and personal contact information.
          </p>
        </div>

        <div className="employee-profile-actions flex min-w-0 flex-wrap items-center gap-2">

          <Link
            href={homeHref}
            className={BUTTON}
          >
            <ArrowLeft size={15} />
            My Home
          </Link>
        </div>
      </header>

      {notice && (
        <div
          role={notice.type === "error" ? "alert" : "status"}
          className={`flex items-start gap-3 rounded-xl border p-3.5 text-sm leading-6 ${
            notice.type === "success"
              ? "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-200"
              : "border-rose-300/20 bg-rose-300/[0.06] text-rose-200"
          }`}
        >
          {notice.type === "success" ? (
            <CheckCircle2
              size={17}
              className="mt-0.5 shrink-0"
            />
          ) : (
            <ShieldCheck
              size={17}
              className="mt-0.5 shrink-0"
            />
          )}

          <p className="min-w-0 flex-1">{notice.message}</p>

          <button
            type="button"
            aria-label="Dismiss message"
            className="text-lg leading-5 opacity-70 hover:opacity-100"
            onClick={() => setNotice(null)}
          >
            ×
          </button>
        </div>
      )}

      {error && (
        <section
          role="alert"
          className="rounded-2xl border border-rose-300/20 bg-rose-300/[0.05] p-5"
        >
          <div className="flex items-start gap-3">
            <ShieldCheck
              size={20}
              className="mt-0.5 shrink-0 text-rose-200"
            />

            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-rose-100">
                Your profile could not be loaded
              </h3>

              <p className="mt-1 break-words text-sm leading-6 text-rose-200/80">
                {error}
              </p>
            </div>
          </div>
        </section>

      )}

      {loading && !profile ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className={`${PANEL} h-56 animate-pulse bg-white/[0.02]`}
            />
          ))}
        </div>
      ) : profile ? (
        <>
          <section className="employee-profile-hero relative overflow-hidden rounded-3xl border border-white/[0.09] bg-gradient-to-br from-[#17263a] via-[#121d2d] to-[#101722] p-5 shadow-2xl shadow-black/20 sm:p-7">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-10 -top-20 size-64 rounded-full border border-sky-200/[0.08]"
            />

            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-2 -top-10 size-44 rounded-full bg-sky-300/[0.06] blur-3xl"
            />

            <div className="relative flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex shrink-0 flex-col items-center gap-2">
                <EmployeeProfilePhoto
                  key={photoVersion}
                  name={fullName}
                  // Department Managers must use the authenticated self-photo
                  // endpoint here, matching the upload endpoint and header.
                  employeeId={roleLabel === "Department Manager" ? undefined : targetEmployeeId || undefined}
                  refreshKey={photoVersion}
                  className="size-20 rounded-[1.6rem] border border-sky-200/20 bg-gradient-to-br from-sky-300/20 to-indigo-300/10 text-2xl shadow-inner"
                />

                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(event) =>
                    void uploadProfilePhoto(event)
                  }
                  aria-label="Choose a profile photo"
                />

                <button
                  type="button"
                  className="dm-profile-photo-button inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-sky-600 bg-sky-600 px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121b29] disabled:cursor-not-allowed disabled:opacity-70"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={uploadingPhoto}
                >
                  {uploadingPhoto ? (
                    <RefreshCw
                      size={13}
                      className="animate-spin"
                    />
                  ) : (
                    <ImagePlus size={13} />
                  )}

                  {uploadingPhoto
                    ? "Uploading…"
                    : "Change photo"}
                </button>

                <span className="text-[10px] text-slate-500">
                  Max 25 KB
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200/15 bg-sky-200/[0.06] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.13em] text-sky-200">
                    <BadgeCheck size={13} />
                    Verified {roleLabel.toLowerCase()} record
                  </span>

                  {employmentStatus && (
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${statusClass(employmentStatus)}`}
                    >
                      {humanize(employmentStatus)}
                    </span>
                  )}
                </div>

                <h3 className="mt-3 break-words text-2xl font-black tracking-tight text-white sm:text-3xl">
                  {fullName}
                </h3>

                <p className="mt-1.5 break-words text-sm text-slate-300">
                  {titleLine || role}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400">
                  {read(profile, "employee_code", "employeeCode") && (
                    <span className="inline-flex items-center gap-1.5">
                      <ShieldCheck
                        size={14}
                        className="text-sky-300"
                      />
                      {read(profile, "employee_code", "employeeCode")}
                    </span>
                  )}

                  {read(profile, "organization_name", "organizationName") && (
                    <span className="inline-flex items-center gap-1.5">
                      <Building2
                        size={14}
                        className="text-sky-300"
                      />
                      {read(profile, "organization_name", "organizationName")}
                    </span>
                  )}

                  {read(profile, "email") && (
                    <span className="inline-flex min-w-0 items-center gap-1.5 break-all">
                      <Mail
                        size={14}
                        className="shrink-0 text-sky-300"
                      />
                      {read(profile, "email")}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2 sm:self-start">
                {canEdit ? (
                  editing ? (
                    <button
                      type="button"
                      className={BUTTON}
                      onClick={cancelEditing}
                      disabled={saving}
                    >
                      <X size={15} />
                      Cancel
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={PRIMARY}
                      onClick={beginEditing}
                    >
                      <Edit3 size={15} />
                      Edit contact details
                    </button>
                  )
                ) : (
                  <span className="inline-flex items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.035] px-3.5 py-2.5 text-xs text-slate-400">
                    <ShieldCheck size={14} />
                    Read only
                  </span>
                )}
              </div>
            </div>
          </section>

          {!canEdit && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-4 text-xs leading-5 text-amber-100/90">
              <ShieldCheck
                size={16}
                className="mt-0.5 shrink-0 text-amber-200"
              />

              <p>
                Your profile is visible, but self-service updates are not
                enabled for this account. Contact your HR Manager if you
                need to change contact or emergency-contact details.
                You can still manage your profile photo separately.
              </p>
            </div>
          )}

          <form onSubmit={submitProfile} className="space-y-5">
            {hasUnsavedChanges && (
              <div
                role="status"
                className="flex items-start gap-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-4 text-xs leading-5 text-amber-100"
              >
                <Clock3
                  size={16}
                  className="mt-0.5 shrink-0 text-amber-200"
                />

                <p>
                  You have unsaved changes. Save them to update your
                  profile, or cancel and discard the draft.
                </p>
              </div>
            )}

            <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
              <section className={`${PANEL} p-5 sm:p-6`}>
                <SectionTitle
                  icon={Building2}
                  title="Employment overview"
                  description="Organization-managed information. Contact HR if any of these details are incorrect."
                />

                <dl className="mt-5 grid gap-x-6 sm:grid-cols-2">
                  <Field
                    label="Employee code"
                    value={read(profile, "employee_code", "employeeCode")}
                  />

                  <Field
                    label="Job title"
                    value={read(profile, "designation", "jobTitle")}
                  />

                  <Field
                    label="Department"
                    value={departmentName}
                    icon={Building2}
                  />

                  <Field
                    label="Department status"
                    value={
                      departmentStatus
                        ? humanize(departmentStatus)
                        : "Not provided"
                    }
                  />

                  <Field
                    label="Employment status"
                    value={
                      employmentStatus
                        ? humanize(employmentStatus)
                        : "Not provided"
                    }
                  />

                  <Field
                    label="Joining date"
                    value={formatDate(
                      read(profile, "joining_date", "joiningDate"),
                    )}
                    icon={CalendarDays}
                  />

                  <Field
                    label="Organization"
                    value={
                      read(profile, "organization_name", "organizationName") ||
                      user?.organizationName ||
                      "Not provided"
                    }
                    icon={Globe2}
                  />
                </dl>
              </section>

              <section className={`${PANEL} p-5 sm:p-6`}>
                <SectionTitle
                  icon={Phone}
                  title="Contact information"
                  description="Update only the personal contact and location fields permitted by employee self-service."
                />

                <div className="mt-5 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {EDITABLE_FIELDS.slice(0, 3).map((field) => (
                      <label
                        key={field.key}
                        className="block min-w-0 text-xs font-semibold text-slate-300"
                      >
                        {field.label}

                        {editing ? (
                          field.key === "country" ? (
                            <CountrySelect
                              id="employee-country"
                              value={draft?.country ?? ""}
                              onChange={(value) =>
                                setField("country", value)
                              }
                              onBlur={() =>
                                setTouchedFields(
                                  (current) =>
                                    new Set(current).add("country"),
                                )
                              }
                              required
                              invalid={showFieldError("country")}
                              className={`${INPUT} ${
                                showFieldError("country")
                                  ? "border-rose-300/60"
                                  : ""
                              }`}
                            />
                          ) : (
                            <input
                              className={`${INPUT} ${
                                showFieldError(field.key)
                                  ? "border-rose-300/60"
                                  : ""
                              }`}
                              type={field.type ?? "text"}
                              maxLength={field.maxLength}
                              value={draft?.[field.key] ?? ""}
                              onBlur={() =>
                                setTouchedFields(
                                  (current) =>
                                    new Set(current).add(field.key),
                                )
                              }
                              onChange={(event) =>
                                setField(field.key, event.target.value)
                              }
                              disabled={saving}
                              autoComplete={
                                field.key === "phone" ? "tel" : "off"
                              }
                              aria-invalid={showFieldError(field.key)}
                            />
                          )
                        ) : (
                          <div className="mt-2 min-h-11 break-words rounded-xl border border-white/[0.06] bg-black/10 px-3.5 py-3 text-sm font-medium text-slate-200">
                            {field.key === "country"
                              ? formatCountryWithFlag(
                                  read(profile, field.key),
                                )
                              : read(profile, field.key) || "Not provided"}
                          </div>
                        )}

                        {editing && showFieldError(field.key) && (
                          <p
                            role="alert"
                            className="mt-1.5 text-xs font-medium text-rose-300"
                          >
                            {getFieldError(field.key)}
                          </p>
                        )}

                        {editing && field.key === "phone" && (
                          <p className="mt-1 text-[11px] font-normal text-slate-500">
                            Country selection updates the international
                            calling code automatically.
                          </p>
                        )}
                      </label>
                    ))}
                  </div>

                  <div className="rounded-xl border border-white/[0.06] bg-black/10 p-4">
                    <p className={LABEL}>Reporting manager</p>

                    {managerName ? (
                      <div className="mt-3 flex min-w-0 items-start gap-3">
                        <EmployeeProfilePhoto
                          name={managerName}
                          employeeId={managerId || null}
                          className="size-12 rounded-xl border border-indigo-300/20 bg-indigo-300/[0.07] text-sm"
                          textClassName="text-sm font-bold text-indigo-100"
                        />

                        <div className="min-w-0 flex-1">
                          <p className="break-words text-sm font-bold text-white">
                            {managerName}
                          </p>

                          <p className="mt-1 text-xs text-slate-400">
                            {humanize(
                              read(
                                profile,
                                "manager_workforce_role",
                                "managerWorkforceRole",
                              ) || "Department Manager",
                            )}
                          </p>

                          {managerEmail && (
                            <a
                              href={`mailto:${managerEmail}`}
                              className="mt-2 inline-flex min-w-0 items-center gap-1.5 break-all text-xs font-semibold text-sky-300 hover:text-sky-200"
                            >
                              <Mail
                                size={13}
                                className="shrink-0"
                              />
                              {managerEmail}
                            </a>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-slate-400">
                        No reporting manager is recorded. Contact HR to
                        verify the reporting assignment.
                      </p>
                    )}
                  </div>
                </div>
              </section>
            </div>

            <section className={`${PANEL} p-5 sm:p-6`}>
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <SectionTitle
                  icon={ShieldCheck}
                  title="Emergency contact"
                  description="Information that can help your organization contact someone in an emergency."
                />

                {editing && (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-sky-200">
                    <Check size={13} />
                    Editing permitted fields
                  </span>
                )}
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {EDITABLE_FIELDS.slice(3).map((field) => (
                  <label
                    key={field.key}
                    className="block min-w-0 text-xs font-semibold text-slate-300"
                  >
                    {field.label}

                    {editing ? (
                      <input
                        className={`${INPUT} ${
                          showFieldError(field.key)
                            ? "border-rose-300/60"
                            : ""
                        }`}
                        type={field.type ?? "text"}
                        maxLength={field.maxLength}
                        value={draft?.[field.key] ?? ""}
                        onBlur={() =>
                          setTouchedFields(
                            (current) =>
                              new Set(current).add(field.key),
                          )
                        }
                        onChange={(event) =>
                          setField(field.key, event.target.value)
                        }
                        disabled={saving}
                        aria-invalid={showFieldError(field.key)}
                      />
                    ) : (
                      <div className="mt-2 min-h-11 break-words rounded-xl border border-white/[0.06] bg-black/10 px-3.5 py-3 text-sm font-medium text-slate-200">
                        {read(profile, field.key) || "Not provided"}
                      </div>
                    )}

                    {editing && showFieldError(field.key) && (
                      <p
                        role="alert"
                        className="mt-1.5 text-xs font-medium text-rose-300"
                      >
                        {getFieldError(field.key)}
                      </p>
                    )}
                  </label>
                ))}
              </div>

              {!editing && (
                <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-500">
                  <ShieldCheck
                    size={14}
                    className="mt-0.5 shrink-0"
                  />

                  <p>
                    Your name, email, employee code, job title, department,
                    manager, and employment status are maintained by your
                    organization and cannot be edited here.
                  </p>
                </div>
              )}
            </section>

            {editing && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-300/15 bg-sky-300/[0.035] p-4">
                <p className="text-xs leading-5 text-slate-400">
                  Changes apply only to your permitted contact and
                  emergency-contact fields.
                </p>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    className={BUTTON}
                    onClick={cancelEditing}
                    disabled={saving}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className={PRIMARY}
                    disabled={saving || !hasUnsavedChanges}
                  >
                    {saving ? (
                      <RefreshCw
                        size={15}
                        className="animate-spin"
                      />
                    ) : (
                      <Save size={15} />
                    )}

                    {saving
                      ? "Saving changes…"
                      : hasUnsavedChanges
                        ? "Save changes"
                        : "No changes to save"}
                  </button>
                </div>
              </div>
            )}
          </form>

          <footer className="flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.015] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <Clock3
                size={15}
                className="mt-0.5 shrink-0 text-slate-500"
              />

              <p className="text-xs leading-5 text-slate-500">
                Profile changes are saved only after the server confirms
                the update. Organization-managed employment fields remain
                read-only.
              </p>
            </div>

            <Link
              href={homeHref}
              className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-sky-300 hover:text-sky-200"
            >
              Back to dashboard
              <ArrowRight size={14} />
            </Link>
          </footer>
        </>
      ) : null}
    </div>
  );
}

