"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  GraduationCap,
  Info,
  MessageSquare,
  ShieldCheck,
  Target,
  UserRound,
  Wallet,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import EmployeeProfileWorkspace from "../../components/employee/EmployeeProfileWorkspace";

type PlannedFeature = {
  title: string;
  description: string;
};

type WorkflowStep = {
  title: string;
  description: string;
};

type ModuleDefinition = {
  title: string;
  category: string;
  description: string;
  icon: LucideIcon;
  plannedFeatures: PlannedFeature[];
  workflowIntro: string;
  workflowSteps: WorkflowStep[];
  systemResponsibilities: string[];
  completionNote: string;
};

const moduleDefinitions: Record<string, ModuleDefinition> = {
  profile: {
    title: "My Profile",
    category: "MY WORKSPACE",
    description:
      "Your employment information, reporting line, and permitted personal contact details.",
    icon: UserRound,
    plannedFeatures: [],
    workflowIntro:
      "Your profile is loaded from the employee record linked to your authenticated session. The page is restricted to your own record.",
    workflowSteps: [
      {
        title: "Open your own profile",
        description:
          "The HRMS identifies your signed-in account and retrieves the employee record linked to that account without accepting a profile ID from the browser.",
      },
      {
        title: "Review your details",
        description:
          "Your contact details are separated from organization-managed employment information such as your job title, department, and reporting manager.",
      },
      {
        title: "Edit permitted personal fields",
        description:
          "When self-service update permission is enabled, you can edit your phone, city, country, and emergency-contact information. Organization-managed fields remain read-only.",
      },
      {
        title: "Save and confirm the result",
        description:
          "The server validates and saves allowed fields. The page confirms the save only after the server returns success and displays validation errors without discarding your edits.",
      },
    ],
    systemResponsibilities: [
      "Verify the signed-in employee and enforce own-record access on the server.",
      "Validate editable fields even if a client submits a request outside the visible form.",
      "Preserve organization-managed fields and prevent unauthorized profile changes.",
      "Show saved information from the server response and keep employee-managed fields read-only.",
    ],
    completionNote:
      "Your own employee profile is loaded through an identity-bound endpoint. Only approved personal contact and emergency-contact fields may be edited through self-service.",
  },

  attendance: {
    title: "Attendance & Time",
    category: "TIME & LEAVE",
    description:
      "Review work time, attendance activity, and schedules when those workflows are connected.",
    icon: Clock,
    plannedFeatures: [
      {
        title: "Daily attendance",
        description:
          "A view of attendance information and actions enabled by the organization's attendance rules.",
      },
      {
        title: "Attendance history",
        description:
          "A chronological view of recorded attendance events and time entries.",
      },
      {
        title: "Work schedules",
        description:
          "Assigned working times and schedule details when maintained by the HRMS.",
      },
    ],
    workflowIntro:
      "The attendance area will show recorded time information and any actions permitted by the organization's attendance configuration.",
    workflowSteps: [
      {
        title: "Review your schedule and current status",
        description:
          "The page loads the schedule and attendance records available to your employee account. If schedule data is missing, the page explains that rather than inventing a shift.",
      },
      {
        title: "Record an allowed attendance action",
        description:
          "If check-in, check-out, or another attendance action is enabled, you use the relevant control and receive confirmation from the server.",
      },
      {
        title: "Review recorded entries",
        description:
          "The history view displays persisted attendance entries, relevant dates, and statuses returned by the backend.",
      },
      {
        title: "Request a correction when supported",
        description:
          "If a recorded entry needs correction, a dedicated reviewable correction workflow can be provided if the HRMS policy supports it. The page should not silently rewrite historical records.",
      },
    ],
    systemResponsibilities: [
      "Validate the employee's session and access scope.",
      "Apply configured attendance and schedule rules on the server.",
      "Save attendance actions before showing them as complete.",
      "Return actual recorded entries and clearly report rejected or unavailable actions.",
    ],
    completionNote:
      "Attendance records, schedules, and clock-in or clock-out actions are not connected by this skeleton.",
  },

  leave: {
    title: "Leave & Absence",
    category: "TIME & LEAVE",
    description:
      "A central place for leave information, future requests, and absence history.",
    icon: CalendarDays,
    plannedFeatures: [
      {
        title: "Leave information",
        description:
          "Applicable leave types, available balances, and policy information returned by the HRMS.",
      },
      {
        title: "Request leave",
        description:
          "A guided form for entering leave dates, type, and any required supporting details.",
      },
      {
        title: "Leave history",
        description:
          "A dated view of previous leave requests and their actual outcomes.",
      },
    ],
    workflowIntro:
      "Leave will be a request-and-review workflow. The employee submits a request; the HRMS validates it and routes it according to the configured approval process.",
    workflowSteps: [
      {
        title: "Review leave rules and available information",
        description:
          "The page shows applicable leave types, balances, and policy details when those values are available from the backend.",
      },
      {
        title: "Complete the leave request",
        description:
          "You select a supported leave type and dates, provide required details, and attach information only where the implemented policy permits it.",
      },
      {
        title: "Submit for validation and review",
        description:
          "The server checks the submitted request against applicable rules and records it before the UI treats it as submitted. The configured reviewer or approval process handles the next step.",
      },
      {
        title: "Track the decision",
        description:
          "You return to the leave page or My Requests to see the status and available history. Only a confirmed approval should be represented as approved leave.",
      },
    ],
    systemResponsibilities: [
      "Validate dates, required fields, applicable policy, and other supported business rules.",
      "Determine the review route from configured rules rather than a hardcoded frontend assumption.",
      "Persist a request and return its real status before showing a successful submission.",
      "Make status changes and relevant history visible from the backend response.",
    ],
    completionNote:
      "Leave balances, request forms, approval routing, and leave history are not connected yet. No leave request is being submitted.",
  },

  pay: {
    title: "Pay & Benefits",
    category: "PAY & DEVELOPMENT",
    description:
      "Your future entry point for payroll documents and employee benefits information.",
    icon: Wallet,
    plannedFeatures: [
      {
        title: "Payslips and payroll documents",
        description:
          "Access to payroll documents specifically made available to your account.",
      },
      {
        title: "Compensation information",
        description:
          "Approved compensation details, subject to existing authorization rules.",
      },
      {
        title: "Benefits information",
        description:
          "Relevant benefits information and employee resources where supported.",
      },
    ],
    workflowIntro:
      "Pay information will be presented as a secure, read-oriented employee service. Employees should only see payroll records they are authorized to access.",
    workflowSteps: [
      {
        title: "Open your pay workspace",
        description:
          "The page loads payroll periods or pay-related information available to your authenticated employee account.",
      },
      {
        title: "Select a record or pay period",
        description:
          "Where payroll data is available, you can choose a record to inspect its details or open an available payslip.",
      },
      {
        title: "View or download authorized documents",
        description:
          "Documents should be retrieved through an authorized server endpoint. A download control should appear only when a real document is available and access is allowed.",
      },
      {
        title: "Follow the appropriate support route",
        description:
          "If information appears incorrect, the page can direct you to an available payroll support or request process when that workflow is defined.",
      },
    ],
    systemResponsibilities: [
      "Enforce employee-level authorization on payroll records and documents.",
      "Never expose another employee's compensation or payroll data.",
      "Return actual payroll records and document availability from the backend.",
      "Report unavailable records clearly instead of displaying sample payslips or amounts.",
    ],
    completionNote:
      "Payroll data, payslips, benefits information, and downloads are not connected. No payroll figures are displayed as live information.",
  },

  performance: {
    title: "Performance & Goals",
    category: "PAY & DEVELOPMENT",
    description:
      "A workspace for objectives, feedback, and performance-review activities.",
    icon: Target,
    plannedFeatures: [
      {
        title: "Goals and objectives",
        description:
          "A view of goals assigned to you and their recorded progress.",
      },
      {
        title: "Reviews and feedback",
        description:
          "Performance review activities and feedback made available to your account.",
      },
      {
        title: "Development plans",
        description:
          "Personal development activities linked to your role and goals.",
      },
    ],
    workflowIntro:
      "The performance workspace will show assigned goals and review activities. Any changes will be submitted as a recorded action, not silently written into a displayed card.",
    workflowSteps: [
      {
        title: "Review assigned goals",
        description:
          "You see goals and expectations assigned to your account, including the details and due dates supplied by the system.",
      },
      {
        title: "Update progress when permitted",
        description:
          "If employee progress updates are enabled, you submit a change with the required information. The backend validates and saves the change.",
      },
      {
        title: "Complete a review activity",
        description:
          "When a review or self-assessment is assigned, the page explains what is required and lets you submit responses through the implemented workflow.",
      },
      {
        title: "Review feedback and history",
        description:
          "You see feedback and review outcomes once they have been saved and made available to your account.",
      },
    ],
    systemResponsibilities: [
      "Load goals and reviews within the signed-in employee's permitted scope.",
      "Respect configured review stages and restrictions on editing submitted or completed records.",
      "Validate and persist progress updates or review submissions.",
      "Show actual saved values, review status, and feedback access returned by the server.",
    ],
    completionNote:
      "Goals, review cycles, assessments, performance updates, and feedback are not connected yet.",
  },

  learning: {
    title: "Learning & Development",
    category: "PAY & DEVELOPMENT",
    description:
      "A future home for learning assignments, courses, and skills development.",
    icon: GraduationCap,
    plannedFeatures: [
      {
        title: "Learning assignments",
        description:
          "Courses or learning activities assigned to your account.",
      },
      {
        title: "Learning resources",
        description:
          "Approved learning materials and resources made available to employees.",
      },
      {
        title: "Skills and development",
        description:
          "Relevant skills and development activities when supported by the system.",
      },
    ],
    workflowIntro:
      "The learning workspace will bring together available learning resources and any assignments tracked by the HRMS or an integrated learning provider.",
    workflowSteps: [
      {
        title: "Review available learning",
        description:
          "The page lists resources or assignments available to your account and explains any relevant requirements.",
      },
      {
        title: "Open an assigned resource",
        description:
          "You open the learning resource through its configured destination or provider integration.",
      },
      {
        title: "Complete the learning activity",
        description:
          "Where supported, completion is recorded by the connected learning provider or HRMS rather than inferred from opening a page.",
      },
      {
        title: "Review completion status",
        description:
          "The workspace displays the completion state or certificate only after receiving reliable data from the connected system.",
      },
    ],
    systemResponsibilities: [
      "Show only learning resources and assignments made available to the employee.",
      "Use an actual integration or recorded HRMS data to determine completion.",
      "Display unavailable integrations and resources honestly.",
      "Avoid treating a visit to a course page as proof of course completion.",
    ],
    completionNote:
      "Course catalogs, assignments, integrations, completion tracking, and certificates are not connected.",
  },

  communication: {
    title: "Communication",
    category: "COMPANY RESOURCES",
    description:
      "Organization announcements and employee communications in one place.",
    icon: MessageSquare,
    plannedFeatures: [
      {
        title: "Company announcements",
        description:
          "Notices published by authorized users for the relevant audience.",
      },
      {
        title: "Employee communications",
        description:
          "Relevant updates made available to employees.",
      },
      {
        title: "Important notices",
        description:
          "A place for current notices and their published dates.",
      },
    ],
    workflowIntro:
      "The communication area will display announcements according to organization and audience rules, so employees only see information intended for them.",
    workflowSteps: [
      {
        title: "Open the announcement feed",
        description:
          "The HRMS loads published announcements that apply to your organization and employee audience.",
      },
      {
        title: "Read an announcement",
        description:
          "Open an item to see its full content, publication information, and any approved attachments or links.",
      },
      {
        title: "Acknowledge when required",
        description:
          "If a notice requires acknowledgement and the feature is implemented, the page records your acknowledgement through the server.",
      },
      {
        title: "Review previous announcements",
        description:
          "The feed can provide an archive of announcements that remain available to your account.",
      },
    ],
    systemResponsibilities: [
      "Apply organization and audience restrictions before returning announcements.",
      "Return actual publication details and attachments available to the user.",
      "Record acknowledgements only when the required acknowledgement workflow is implemented.",
      "Avoid showing unpublished or unauthorized communications.",
    ],
    completionNote:
      "Announcements, notifications, attachments, and acknowledgement tracking are not connected.",
  },

  documents: {
    title: "My Documents",
    category: "COMPANY RESOURCES",
    description:
      "A future library for personal employment documents and approved resources.",
    icon: FileText,
    plannedFeatures: [
      {
        title: "Personal employment documents",
        description:
          "Documents specifically made available to your employee account.",
      },
      {
        title: "Shared resources",
        description:
          "Company resources or templates authorized for employee access.",
      },
      {
        title: "Document acknowledgements",
        description:
          "A record of required reviews or acknowledgements where supported.",
      },
    ],
    workflowIntro:
      "The document workspace will list files made available to your employee account and apply access checks when files are viewed or downloaded.",
    workflowSteps: [
      {
        title: "Review your document list",
        description:
          "The page shows documents the system has made available to you, along with useful metadata such as document type and date when supplied.",
      },
      {
        title: "Open or download a permitted document",
        description:
          "The server checks access to the requested document before returning its contents.",
      },
      {
        title: "Complete a required acknowledgement",
        description:
          "If a document requires acknowledgement, you can review it and submit the acknowledgement through an explicit workflow when available.",
      },
      {
        title: "Review document history",
        description:
          "Where the HRMS tracks document versions or acknowledgements, the page displays the actual information it returns.",
      },
    ],
    systemResponsibilities: [
      "Enforce document-level access checks when listing and retrieving files.",
      "Keep private employment documents scoped to the correct employee and organization.",
      "Return real files and metadata, not sample document links.",
      "Record acknowledgements only after the server confirms them.",
    ],
    completionNote:
      "The document library, secure downloads, document uploads, and acknowledgement tracking are not connected. Uploading will not be offered unless an authorized upload workflow is designed.",
  },

  requests: {
    title: "My Requests",
    category: "COMPANY RESOURCES",
    description:
      "A central view for HR requests, current status, and past submissions.",
    icon: CheckCircle2,
    plannedFeatures: [
      {
        title: "Submit a supported request",
        description:
          "A guided entry point for request types implemented by the HRMS.",
      },
      {
        title: "Request status",
        description:
          "A view of actual status and decisions returned by the backend.",
      },
      {
        title: "History and timeline",
        description:
          "A chronological view of request updates and relevant outcomes.",
      },
    ],
    workflowIntro:
      "My Requests will act as the employee's central tracking page for supported request workflows. Each request should have a server-backed status and history where available.",
    workflowSteps: [
      {
        title: "Choose a supported request type",
        description:
          "The page offers only request types for which the HRMS has an implemented submission workflow.",
      },
      {
        title: "Complete and submit the request",
        description:
          "You enter the information required by that request type. The server validates the submission and saves it before the page reports success.",
      },
      {
        title: "Follow review or processing",
        description:
          "If the request requires another person or team to review it, the page displays the status and updates returned by the backend.",
      },
      {
        title: "Review the result and history",
        description:
          "You can reopen the request to see its latest recorded outcome and available timeline. The interface does not invent status changes or approval dates.",
      },
    ],
    systemResponsibilities: [
      "List only requests the signed-in employee is authorized to see.",
      "Validate submissions and generate any request reference through the backend.",
      "Use the actual request status returned by the server rather than hardcoding a workflow state.",
      "Preserve request history and display reviewer notes only when the backend makes them available.",
    ],
    completionNote:
      "Request submission, routing, status history, and reviewer updates are not connected. No request is created by visiting this page.",
  },

  policies: {
    title: "Policies & Handbook",
    category: "COMPANY RESOURCES",
    description:
      "A place to access organization policies, employee guidance, and handbook resources.",
    icon: BookOpen,
    plannedFeatures: [
      {
        title: "Employee handbook",
        description:
          "The organization's published employee guidance and handbook content.",
      },
      {
        title: "Workplace policies",
        description:
          "Relevant policy documents supplied by the organization.",
      },
      {
        title: "Policy acknowledgements",
        description:
          "Required employee acknowledgements once that workflow is implemented.",
      },
    ],
    workflowIntro:
      "This area will give employees a consistent place to read organization-published policies and see any required acknowledgement tasks.",
    workflowSteps: [
      {
        title: "Browse published policies",
        description:
          "The HRMS lists policies and handbook resources published for your organization and available to your account.",
      },
      {
        title: "Open a policy and review its details",
        description:
          "Where supplied, the page shows policy title, version, publication information, and effective date.",
      },
      {
        title: "Acknowledge a required policy",
        description:
          "If the organization requires acknowledgement and the feature is implemented, you review the policy and submit an explicit acknowledgement.",
      },
      {
        title: "Confirm completion",
        description:
          "The page shows acknowledgement status only after the server confirms it. Simply opening a document should not automatically count as acknowledgement.",
      },
    ],
    systemResponsibilities: [
      "Show published policy versions applicable to the employee's organization.",
      "Keep acknowledgement records linked to the correct employee and policy version.",
      "Record acknowledgements only after a confirmed submission.",
      "Make unavailable policies and missing documents clear to the employee.",
    ],
    completionNote:
      "The policy library, version history, and acknowledgement workflow are not connected.",
  },
};

function NotConnectedNotice() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-sky-300/15 bg-sky-300/[0.045] p-4">
      <Info size={18} className="mt-0.5 shrink-0 text-sky-300" />
      <div>
        <p className="text-sm font-semibold text-sky-100">
          UI foundation — backend not connected
        </p>
        <p className="mt-1 text-xs leading-6 text-slate-400">
          This page explains the planned workflow. Data loading, submissions,
          updates, approvals, and history are not connected here. Nothing on
          this page is being saved or approved.
        </p>
      </div>
    </div>
  );
}

function WorkflowGuide({
  definition,
}: {
  definition: ModuleDefinition;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#111a27] p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-sky-300/15 bg-sky-300/[0.06] text-sky-200">
          <Workflow size={18} />
        </div>
        <div>
          <h2 className="text-base font-semibold text-white">
            How this workflow will work
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            {definition.workflowIntro}
          </p>
        </div>
      </div>

      <ol className="mt-6 space-y-4">
        {definition.workflowSteps.map((step, index) => (
          <li
            key={step.title}
            className="flex items-start gap-3 sm:gap-4"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.025] text-xs font-bold text-slate-300">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1 border-b border-white/[0.06] pb-4 last:border-b-0 last:pb-0">
              <h3 className="text-sm font-semibold text-slate-200">
                {step.title}
              </h3>
              <p className="mt-1.5 text-xs leading-6 text-slate-400">
                {step.description}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function SystemResponsibilities({
  definition,
}: {
  definition: ModuleDefinition;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#111a27] p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <ShieldCheck size={19} className="mt-0.5 shrink-0 text-sky-300" />
        <div>
          <h2 className="text-base font-semibold text-white">
            What the HRMS will handle
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            These are the expected safeguards and system responsibilities
            when this workflow is connected.
          </p>
        </div>
      </div>

      <ul className="mt-5 space-y-3">
        {definition.systemResponsibilities.map((responsibility) => (
          <li
            key={responsibility}
            className="flex items-start gap-3 text-sm leading-6 text-slate-400"
          >
            <CheckCircle2
              size={16}
              className="mt-1 shrink-0 text-slate-500"
            />
            <span>{responsibility}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">
          Current boundary
        </p>
        <p className="mt-2 text-xs leading-6 text-slate-400">
          {definition.completionNote}
        </p>
      </div>
    </section>
  );
}

function ModulePage({
  definition,
}: {
  definition: ModuleDefinition;
}) {
  const Icon = definition.icon;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/[0.08] bg-[#111a27] p-5 sm:p-7">
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-sky-300/15 bg-sky-300/[0.07] text-sky-200">
            <Icon size={21} />
          </div>

          <div className="min-w-0">
            <span className="inline-flex rounded-full border border-white/10 bg-white/[0.025] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              {definition.category}
            </span>
            <h2 className="mt-3 text-xl font-semibold text-white">
              {definition.title}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-400">
              {definition.description}
            </p>
          </div>
        </div>
      </section>

      <NotConnectedNotice />

      <WorkflowGuide definition={definition} />

      <section>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-white">
            Planned workspace components
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            These describe the intended areas within this module. They are
            not live records or working controls.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {definition.plannedFeatures.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border border-white/[0.08] bg-[#111a27] p-5"
            >
              <div className="flex size-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-slate-400">
                <Icon size={17} />
              </div>

              <h3 className="mt-4 text-sm font-semibold text-slate-200">
                {feature.title}
              </h3>

              <p className="mt-2 text-xs leading-6 text-slate-500">
                {feature.description}
              </p>

              <div className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-600">
                UI planned
              </div>
            </div>
          ))}
        </div>
      </section>

      <SystemResponsibilities definition={definition} />

      <Link
        href="/employee/dashboard"
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.04] hover:text-white"
      >
        <ArrowLeft size={15} />
        Back to My Home
      </Link>
    </div>
  );
}

export default function EmployeeSectionPage() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  const section = parts[parts.length - 1] ?? "";
  const definition = moduleDefinitions[section];

  if (!definition) {
    return (
      <section className="rounded-2xl border border-white/[0.08] bg-[#111a27] p-6">
        <h1 className="text-xl font-semibold text-white">
          Workspace page unavailable
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          This workspace route has not been defined.
        </p>
        <Link
          href="/employee/dashboard"
          className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-sky-300 hover:text-sky-200"
        >
          Return to My Home <ArrowRight size={15} />
        </Link>
      </section>
    );
  }

  if (section === "profile") {
    return <EmployeeProfileWorkspace />;
  }

  const Icon = definition.icon;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-sky-300">
            {definition.category}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {definition.title}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-400">
            {definition.description}
          </p>
        </div>

        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] bg-[#111a27] text-sky-200">
          <Icon size={20} />
        </div>
      </header>

      <ModulePage definition={definition} />
    </div>
  );
}