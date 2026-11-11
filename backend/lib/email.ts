type OrganizationAdminInvitationEmail = {
  to: string;
  organizationName: string;
  invitationUrl: string;
  expiresAt: string | Date;
};

type EmployeeInvitationEmail = {
  to: string;
  organizationName: string;
  employeeName: string;
  workforceRole: string;
  invitationUrl: string;
  expiresAt: string | Date;
};

type PasswordResetEmail = {
  to: string;
  resetUrl: string;
  expiresAt: string | Date;
};

type PasswordChangedNotificationEmail = {
  to: string;
  changedAt: string | Date;
};

type EmailRequest = {
  category: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });
}

function getEmailMode(): "sandbox" | "live" {
  const mode = process.env.EMAIL_MODE;

  if (mode !== "sandbox" && mode !== "live") {
    throw new Error(
      "EMAIL_MODE must be either sandbox or live.",
    );
  }

  return mode;
}

function getMailtrapConfiguration() {
  if (process.env.EMAIL_MODE !== "sandbox") {
    throw new Error(
      "Mailtrap Sandbox is available only when EMAIL_MODE=sandbox.",
    );
  }

  const apiToken = process.env.MAILTRAP_API_TOKEN;
  const inboxId = process.env.MAILTRAP_INBOX_ID;

  if (!apiToken || !inboxId || !/^\d+$/.test(inboxId)) {
    throw new Error(
      "Mailtrap API token or Inbox ID is not configured.",
    );
  }

  return {
    apiToken,
    inboxId,
    fromEmail:
      process.env.MAIL_FROM_EMAIL || "no-reply@example.com",
    fromName: process.env.MAIL_FROM_NAME || "HRMS Platform",
  };
}

function getGoogleAppsScriptConfiguration() {
  const gatewayUrl = process.env.GOOGLE_APPS_SCRIPT_URL;
  const sharedSecret = process.env.HRMS_EMAIL_SECRET;

  if (!gatewayUrl || !sharedSecret) {
    throw new Error(
      "Google Apps Script email gateway URL or shared secret is missing.",
    );
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(gatewayUrl);
  } catch {
    throw new Error(
      "GOOGLE_APPS_SCRIPT_URL is not a valid URL.",
    );
  }

  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !== "script.google.com" ||
    !parsedUrl.pathname.startsWith("/macros/s/") ||
    !parsedUrl.pathname.endsWith("/exec") ||
    parsedUrl.search ||
    parsedUrl.hash ||
    parsedUrl.username ||
    parsedUrl.password
  ) {
    throw new Error(
      "GOOGLE_APPS_SCRIPT_URL must be the deployed HTTPS Apps Script /exec URL.",
    );
  }

  return {
    gatewayUrl: parsedUrl.toString(),
    sharedSecret,
  };
}

async function sendSandboxEmail({
  category,
  to,
  subject,
  text,
  html,
}: EmailRequest): Promise<void> {
  const {
    apiToken,
    inboxId,
    fromEmail,
    fromName,
  } = getMailtrapConfiguration();

  let response: Response;

  try {
    response = await fetch(
      `https://sandbox.api.mailtrap.io/api/send/${inboxId}`,
      {
        method: "POST",
        headers: {
          "Api-Token": apiToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: {
            email: fromEmail,
            name: fromName,
          },
          to: [{ email: to }],
          subject,
          text,
          html,
          category,
        }),
        signal: AbortSignal.timeout(30000),
      },
    );
  } catch (error) {
    console.error(
      `Mailtrap Sandbox request failed for ${category}:`,
      error instanceof Error ? error.name : "Unknown error",
    );

    throw new Error(
      "Could not reach the Mailtrap Sandbox email service.",
    );
  }

  if (!response.ok) {
    console.error(
      `Mailtrap Sandbox rejected ${category}: HTTP ${response.status}.`,
    );

    throw new Error(
      `Mailtrap Sandbox rejected the email (HTTP ${response.status}).`,
    );
  }
}

async function sendGoogleAppsScriptEmail({
  category,
  to,
  subject,
  text,
  html,
}: EmailRequest): Promise<void> {
  const {
    gatewayUrl,
    sharedSecret,
  } = getGoogleAppsScriptConfiguration();

  let response: Response;

  try {
    response = await fetch(gatewayUrl, {
      method: "POST",
      redirect: "follow",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: sharedSecret,
        category,
        to,
        subject,
        text,
        html,
      }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    console.error(
      `Google Apps Script request failed for ${category}:`,
      error instanceof Error ? error.name : "Unknown error",
    );

    throw new Error(
      "Could not reach the Google Apps Script email gateway.",
    );
  }

  if (!response.ok) {
    console.error(
      `Google Apps Script returned HTTP ${response.status} for ${category}.`,
    );

    throw new Error(
      `Google Apps Script email gateway returned HTTP ${response.status}.`,
    );
  }

  let result: {
    ok?: unknown;
    error?: unknown;
  };

  try {
    const responseText = await response.text();
    const parsed: unknown = JSON.parse(responseText);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error("Invalid response structure.");
    }

    result = parsed as {
      ok?: unknown;
      error?: unknown;
    };
  } catch {
    console.error(
      "Google Apps Script returned an unexpected response format.",
    );

    throw new Error(
      "The email gateway did not return valid JSON. Check its deployment access and /exec URL.",
    );
  }

  // Apps Script may return HTTP 200 even when its JSON body
  // reports an application-level failure. Check the body as well.
  if (result.ok !== true) {
    const gatewayError =
      typeof result.error === "string"
        ? result.error.slice(0, 120)
        : "Unknown gateway error";

    console.error(
      `Google Apps Script could not send ${category}: ${gatewayError}.`,
    );

    throw new Error(
      `Google Apps Script email delivery failed: ${gatewayError}.`,
    );
  }
}

async function sendConfiguredEmail(
  email: EmailRequest,
): Promise<void> {
  const mode = getEmailMode();

  if (mode === "sandbox") {
    await sendSandboxEmail(email);
    return;
  }

  await sendGoogleAppsScriptEmail(email);
}

export async function sendOrganizationAdminInvitationEmail({
  to,
  organizationName,
  invitationUrl,
  expiresAt,
}: OrganizationAdminInvitationEmail): Promise<void> {
  const safeOrganizationName = escapeHtml(organizationName);
  const safeInvitationUrl = escapeHtml(invitationUrl);
  const expiryText = new Date(expiresAt).toUTCString();

  await sendConfiguredEmail({
    category: "Organization Admin Invitation",
    to,
    subject: `Invitation to ${organizationName} - HRMS Platform`,
    text: [
      `You have been invited to administer ${organizationName}.`,
      "",
      `Accept your invitation: ${invitationUrl}`,
      "",
      `This invitation expires at: ${expiryText}`,
      "",
      "If you were not expecting this invitation, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="margin:0;padding:28px 12px;background:#080d15;font-family:Arial,Helvetica,sans-serif;color:#e8eef7;line-height:1.6">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:620px;margin:0 auto;border-collapse:separate;border-spacing:0">
          <tr><td style="padding:0 4px 16px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="width:38px;height:38px;border-radius:12px;background:#75c7ff;color:#07111d;text-align:center;vertical-align:middle;font-size:19px;font-weight:900">H</td>
              <td style="padding-left:11px"><div style="font-size:15px;font-weight:800;letter-spacing:.02em;color:#f8fbff">HRMS <span style="color:#75c7ff">Platform</span></div><div style="font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#8394aa">People operations, thoughtfully connected</div></td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:30px 28px;background:#111a28;border:1px solid #29384b;border-radius:18px">
            <div style="display:inline-block;padding:5px 9px;border:1px solid #3e83a6;border-radius:999px;color:#9bdcff;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">Organization administrator</div>
            <h1 style="margin:18px 0 10px;font-size:26px;line-height:1.2;letter-spacing:-.03em;color:#f8fbff">You’re invited to your workspace.</h1>
            <p style="margin:0 0 14px;font-size:15px;color:#c1ccda">You have been invited to administer <strong style="color:#fff">${safeOrganizationName}</strong> on HRMS Platform.</p>
            <p style="margin:0 0 24px;font-size:14px;color:#9aa9bb">Accept your invitation to set up your account and access your organization workspace.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px"><tr><td align="center" bgcolor="#75c7ff" style="border-radius:10px"><a href="${safeInvitationUrl}" style="display:inline-block;padding:13px 22px;border:1px solid #75c7ff;border-radius:10px;color:#07111d;text-decoration:none;font-size:14px;font-weight:800">Accept invitation&nbsp; →</a></td></tr></table>
            <div style="padding:13px 15px;border:1px solid #29384b;border-radius:12px;background:#0b121d"><div style="font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#73869d">Invitation expires</div><div style="margin-top:4px;font-size:13px;color:#d4deeb">${escapeHtml(expiryText)}</div></div>
            <p style="margin:20px 0 0;font-size:12px;color:#7f90a6">If you were not expecting this invitation, you can safely ignore this email. For security, do not forward your invitation link.</p>
          </td></tr>
          <tr><td style="padding:16px 8px 0;text-align:center;font-size:11px;line-height:1.7;color:#64758c">Sent by HRMS Platform · This is an automated invitation email.</td></tr>
        </table>
      </div>
    `,
  });
}

export async function sendEmployeeInvitationEmail({
  to,
  organizationName,
  employeeName,
  workforceRole,
  invitationUrl,
  expiresAt,
}: EmployeeInvitationEmail): Promise<void> {
  const greetingName = employeeName.trim() || "there";
  const displayRoleName = workforceRole.replace(/_/g, " ");

  const safeEmployeeName = escapeHtml(greetingName);
  const safeOrganizationName = escapeHtml(organizationName);
  const safeWorkforceRole = escapeHtml(displayRoleName);
  const safeInvitationUrl = escapeHtml(invitationUrl);
  const expiryText = new Date(expiresAt).toUTCString();

  await sendConfiguredEmail({
    category: "Employee Invitation",
    to,
    subject: `Invitation to join ${organizationName} - HRMS Platform`,
    text: [
      `Hello ${greetingName},`,
      "",
      `You have been invited to join ${organizationName} on HRMS Platform as ${displayRoleName}.`,
      "",
      `Accept your invitation: ${invitationUrl}`,
      "",
      `This invitation expires at: ${expiryText}`,
      "",
      "If you were not expecting this invitation, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="margin:0;padding:28px 12px;background:#080d15;font-family:Arial,Helvetica,sans-serif;color:#e8eef7;line-height:1.6">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:620px;margin:0 auto;border-collapse:separate;border-spacing:0">
          <tr><td style="padding:0 4px 16px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="width:38px;height:38px;border-radius:12px;background:#75c7ff;color:#07111d;text-align:center;vertical-align:middle;font-size:19px;font-weight:900">H</td>
              <td style="padding-left:11px"><div style="font-size:15px;font-weight:800;letter-spacing:.02em;color:#f8fbff">HRMS <span style="color:#75c7ff">Platform</span></div><div style="font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#8394aa">Your work, clearly connected</div></td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:30px 28px;background:#111a28;border:1px solid #29384b;border-radius:18px">
            <div style="display:inline-block;padding:5px 9px;border:1px solid #3e83a6;border-radius:999px;color:#9bdcff;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">Workforce invitation</div>
            <h1 style="margin:18px 0 10px;font-size:26px;line-height:1.2;letter-spacing:-.03em;color:#f8fbff">Welcome to ${safeOrganizationName}.</h1>
            <p style="margin:0 0 14px;font-size:15px;color:#c1ccda">Hello <strong style="color:#fff">${safeEmployeeName}</strong>, you have been invited to join your organization’s HRMS workspace.</p>
            <div style="margin:18px 0 22px;padding:13px 15px;border:1px solid #29384b;border-radius:12px;background:#0b121d"><div style="font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#73869d">Your assigned role</div><div style="margin-top:4px;font-size:14px;font-weight:700;color:#eaf5ff">${safeWorkforceRole}</div></div>
            <p style="margin:0 0 24px;font-size:14px;color:#9aa9bb">Set up your account to securely accept the invitation and continue to your employee workspace.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px"><tr><td align="center" bgcolor="#75c7ff" style="border-radius:10px"><a href="${safeInvitationUrl}" style="display:inline-block;padding:13px 22px;border:1px solid #75c7ff;border-radius:10px;color:#07111d;text-decoration:none;font-size:14px;font-weight:800">Accept invitation&nbsp; →</a></td></tr></table>
            <div style="padding:13px 15px;border:1px solid #29384b;border-radius:12px;background:#0b121d"><div style="font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#73869d">Invitation expires</div><div style="margin-top:4px;font-size:13px;color:#d4deeb">${escapeHtml(expiryText)}</div></div>
            <p style="margin:20px 0 0;font-size:12px;color:#7f90a6">If you were not expecting this invitation, you can safely ignore this email. For security, do not forward your invitation link.</p>
          </td></tr>
          <tr><td style="padding:16px 8px 0;text-align:center;font-size:11px;line-height:1.7;color:#64758c">Sent by HRMS Platform · This is an automated invitation email.</td></tr>
        </table>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail({
  to,
  resetUrl,
  expiresAt,
}: PasswordResetEmail): Promise<void> {
  const safeResetUrl = escapeHtml(resetUrl);
  const expiryText = new Date(expiresAt).toUTCString();

  await sendConfiguredEmail({
    category: "Password Reset",
    to,
    subject: "Reset your password - HRMS Platform",
    text: [
      "We received a request to reset the password for your HRMS Platform account.",
      "",
      `Reset your password using this link: ${resetUrl}`,
      "",
      `This link expires at: ${expiryText}`,
      "",
      "If you did not request this password reset, ignore this email. Your password will not change unless the reset link is used.",
    ].join("\n"),
    html: `
      <div style="margin:0;padding:28px 12px;background:#080d15;font-family:Arial,Helvetica,sans-serif;color:#e8eef7;line-height:1.6">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:620px;margin:0 auto;border-collapse:separate;border-spacing:0">
          <tr><td style="padding:0 4px 16px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="width:38px;height:38px;border-radius:12px;background:#75c7ff;color:#07111d;text-align:center;vertical-align:middle;font-size:19px;font-weight:900">H</td>
              <td style="padding-left:11px"><div style="font-size:15px;font-weight:800;letter-spacing:.02em;color:#f8fbff">HRMS <span style="color:#75c7ff">Platform</span></div><div style="font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#8394aa">People operations, thoughtfully connected</div></td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:30px 28px;background:#111a28;border:1px solid #29384b;border-radius:18px">
            <div style="display:inline-block;padding:5px 9px;border:1px solid #3e83a6;border-radius:999px;color:#9bdcff;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">Account security</div>
            <h1 style="margin:18px 0 10px;font-size:26px;line-height:1.2;letter-spacing:-.03em;color:#f8fbff">Reset your password.</h1>
            <p style="margin:0 0 14px;font-size:15px;color:#c1ccda">We received a request to reset the password for your HRMS Platform account.</p>
            <p style="margin:0 0 24px;font-size:14px;color:#9aa9bb">Use the secure button below to choose a new password. If you did not request this, you can safely ignore this email.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px"><tr><td align="center" bgcolor="#75c7ff" style="border-radius:10px"><a href="${safeResetUrl}" style="display:inline-block;padding:13px 22px;border:1px solid #75c7ff;border-radius:10px;color:#07111d;text-decoration:none;font-size:14px;font-weight:800">Reset password&nbsp; →</a></td></tr></table>
            <div style="padding:13px 15px;border:1px solid #29384b;border-radius:12px;background:#0b121d"><div style="font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#73869d">Reset link expires</div><div style="margin-top:4px;font-size:13px;color:#d4deeb">${escapeHtml(expiryText)}</div></div>
            <p style="margin:20px 0 0;font-size:12px;color:#7f90a6">For your security, never forward this link. Your password will not change unless the link is used.</p>
          </td></tr>
          <tr><td style="padding:16px 8px 0;text-align:center;font-size:11px;line-height:1.7;color:#64758c">Sent by HRMS Platform · This is an automated account security email.</td></tr>
        </table>
      </div>
    `,
  });
}

export async function sendPasswordChangedNotificationEmail({
  to,
  changedAt,
}: PasswordChangedNotificationEmail): Promise<void> {
  const changedAtText = new Date(changedAt).toUTCString();

  await sendConfiguredEmail({
    category: "Password Changed Security Notification",
    to,
    subject: "Your HRMS Platform password was changed",
    text: [
      "The password for your HRMS Platform account was changed successfully.",
      "",
      `Date and time: ${changedAtText}`,
      "",
      "If you made this change, no further action is required.",
      "",
      "If you did not change your password, contact your platform or organization administrator immediately.",
      "",
      "For your security, this notification does not contain your password.",
    ].join("\n"),
    html: `
      <div style="margin:0;padding:28px 12px;background:#080d15;font-family:Arial,Helvetica,sans-serif;color:#e8eef7;line-height:1.6">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:620px;margin:0 auto;border-collapse:separate;border-spacing:0">
          <tr><td style="padding:0 4px 16px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="width:38px;height:38px;border-radius:12px;background:#75c7ff;color:#07111d;text-align:center;vertical-align:middle;font-size:19px;font-weight:900">H</td>
              <td style="padding-left:11px"><div style="font-size:15px;font-weight:800;letter-spacing:.02em;color:#f8fbff">HRMS <span style="color:#75c7ff">Platform</span></div><div style="font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#8394aa">People operations, thoughtfully connected</div></td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:30px 28px;background:#111a28;border:1px solid #29384b;border-radius:18px">
            <div style="display:inline-block;padding:5px 9px;border:1px solid #3e83a6;border-radius:999px;color:#9bdcff;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">Security notification</div>
            <h1 style="margin:18px 0 10px;font-size:26px;line-height:1.2;letter-spacing:-.03em;color:#f8fbff">Your password was changed.</h1>
            <p style="margin:0 0 18px;font-size:15px;color:#c1ccda">The password for your HRMS Platform account was changed successfully.</p>
            <div style="padding:13px 15px;border:1px solid #29384b;border-radius:12px;background:#0b121d"><div style="font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#73869d">Change recorded</div><div style="margin-top:4px;font-size:13px;color:#d4deeb">${escapeHtml(changedAtText)}</div></div>
            <p style="margin:20px 0 16px;font-size:14px;color:#9aa9bb">If you made this change, no further action is required.</p>
            <div style="padding:15px;border:1px solid #7d493d;border-radius:12px;background:#211719"><div style="font-size:12px;font-weight:800;color:#ffb8a8">Didn’t change your password?</div><p style="margin:6px 0 0;font-size:13px;color:#e6c1b9">Contact your platform or organization administrator immediately to secure your account.</p></div>
            <p style="margin:20px 0 0;font-size:12px;color:#7f90a6">For your security, this notification never includes your password.</p>
          </td></tr>
          <tr><td style="padding:16px 8px 0;text-align:center;font-size:11px;line-height:1.7;color:#64758c">Sent by HRMS Platform · This is an automated account security email.</td></tr>
        </table>
      </div>
    `,
  });
}