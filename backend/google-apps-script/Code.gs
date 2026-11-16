/**
 * HRMS Platform — Google Apps Script live email gateway.
 *
 * Contract implemented for backend/lib/email.ts:
 * POST JSON:
 *   { token, category, to, subject, text, html }
 * Response JSON:
 *   { ok: true } or { ok: false, error: "..." }
 *
 * Security:
 * - Shared secret is stored only in Script Properties.
 * - The caller cannot choose sender, CC, BCC, attachments, or reply-to.
 * - One validated recipient per request.
 * - Subject/header injection is rejected.
 */

const HRMS_CONFIG = Object.freeze({
  SECRET_PROPERTY: "HRMS_EMAIL_SECRET",
  SENDER_NAME: "HRMS Platform",
  MAX_REQUEST_BYTES: 150 * 1024,
  MAX_SUBJECT_LENGTH: 250,
  MAX_BODY_LENGTH: 120 * 1024,
  ALLOWED_CATEGORIES: Object.freeze([
    "Organization Admin Invitation",
    "Employee Invitation",
    "Password Reset",
    "Password Changed Security Notification"
  ])
});

/**
 * Basic public health check.
 * This confirms the deployed web app is running; it does not send an email.
 */
function doGet() {
  return jsonResponse({
    ok: true,
    service: "HRMS Live Email Gateway",
    status: "active"
  });
}

/**
 * Receives and sends one HRMS email.
 */
function doPost(e) {
  try {
    const rawBody = e && e.postData && typeof e.postData.contents === "string"
      ? e.postData.contents
      : "";

    if (!rawBody) {
      return jsonResponse({ ok: false, error: "Request body is missing." });
    }

    const requestBytes = Utilities.newBlob(rawBody, "application/json").getBytes().length;
    if (requestBytes > HRMS_CONFIG.MAX_REQUEST_BYTES) {
      return jsonResponse({ ok: false, error: "Request exceeds the allowed size." });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (_parseError) {
      return jsonResponse({ ok: false, error: "Request body must contain valid JSON." });
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return jsonResponse({ ok: false, error: "Invalid request format." });
    }

    const expectedSecret = PropertiesService.getScriptProperties()
      .getProperty(HRMS_CONFIG.SECRET_PROPERTY);

    if (!expectedSecret || expectedSecret.length < 32) {
      return jsonResponse({
        ok: false,
        error: "Email gateway secret is missing or too short. Configure Script Properties."
      });
    }

    if (!constantTimeEquals(payload.token, expectedSecret)) {
      return jsonResponse({ ok: false, error: "Unauthorized request." });
    }

    const category = typeof payload.category === "string" ? payload.category.trim() : "";
    const to = typeof payload.to === "string" ? payload.to.trim() : "";
    const subject = typeof payload.subject === "string" ? payload.subject.trim() : "";
    const textBody = typeof payload.text === "string" ? payload.text : "";
    const htmlBody = typeof payload.html === "string" ? payload.html : "";

    if (HRMS_CONFIG.ALLOWED_CATEGORIES.indexOf(category) === -1) {
      return jsonResponse({ ok: false, error: "Unsupported email category." });
    }

    if (!isValidSingleEmailAddress(to)) {
      return jsonResponse({ ok: false, error: "Invalid recipient email address." });
    }

    if (
      !subject ||
      subject.length > HRMS_CONFIG.MAX_SUBJECT_LENGTH ||
      /[\r\n\u0000-\u001F\u007F]/.test(subject)
    ) {
      return jsonResponse({ ok: false, error: "Invalid email subject." });
    }

    if (!textBody && !htmlBody) {
      return jsonResponse({ ok: false, error: "Email content is empty." });
    }

    if (
      textBody.length > HRMS_CONFIG.MAX_BODY_LENGTH ||
      htmlBody.length > HRMS_CONFIG.MAX_BODY_LENGTH
    ) {
      return jsonResponse({ ok: false, error: "Email content exceeds the allowed size." });
    }

    const plainText = textBody || htmlToPlainText(htmlBody);
    if (!plainText.trim()) {
      return jsonResponse({ ok: false, error: "Email content is empty." });
    }

    let remainingQuota;
    try {
      remainingQuota = MailApp.getRemainingDailyQuota();
    } catch (_quotaError) {
      return jsonResponse({
        ok: false,
        error: "Mail sending authorization is missing. Re-authorize the Apps Script project."
      });
    }

    if (remainingQuota < 1) {
      return jsonResponse({
        ok: false,
        error: "Daily email recipient quota has been reached."
      });
    }

    const message = {
      to: to,
      subject: subject,
      body: plainText,
      name: HRMS_CONFIG.SENDER_NAME
    };

    if (htmlBody) {
      message.htmlBody = htmlBody;
    }

    MailApp.sendEmail(message);

    // Avoid logging recipient addresses, message bodies, tokens, or reset links.
    console.log("HRMS email sent. Category: " + category);

    return jsonResponse({ ok: true });
  } catch (error) {
    // Do not log raw error messages: service errors can contain personal data.
    const errorName = error && error.name ? String(error.name) : "Error";
    console.error("HRMS email gateway delivery failed. Type: " + errorName);

    return jsonResponse({
      ok: false,
      error: classifyDeliveryError(error)
    });
  }
}

/**
 * Run this once from the Apps Script editor and approve the mail permission.
 * It does not send an email and never prints the shared secret.
 */
function authorizeMailSending() {
  const secret = PropertiesService.getScriptProperties()
    .getProperty(HRMS_CONFIG.SECRET_PROPERTY);

  if (!secret || secret.length < 32) {
    throw new Error(
      "Set Script Property HRMS_EMAIL_SECRET (at least 32 characters) before authorization."
    );
  }

  const remaining = MailApp.getRemainingDailyQuota();
  console.log("HRMS email gateway authorization completed.");
  console.log("Remaining email recipients for today: " + remaining);
}

/**
 * Returns the remaining daily recipient quota without exposing secrets.
 */
function getEmailQuotaStatus() {
  console.log("Remaining email recipients for today: " + MailApp.getRemainingDailyQuota());
}

function isValidSingleEmailAddress(value) {
  return typeof value === "string" &&
    value.length <= 254 &&
    /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value);
}

/**
 * Constant-time comparison for the shared gateway token.
 */
function constantTimeEquals(candidate, expected) {
  if (typeof candidate !== "string" || typeof expected !== "string") {
    return false;
  }

  let difference = candidate.length ^ expected.length;
  const maxLength = Math.max(candidate.length, expected.length);

  for (let i = 0; i < maxLength; i++) {
    difference |= (candidate.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }

  return difference === 0;
}

/**
 * Only used when the backend sends no plain-text alternative.
 */
function htmlToPlainText(html) {
  return String(html)
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function classifyDeliveryError(error) {
  const message = error && error.message ? String(error.message) : "";

  if (/quota|limit exceeded|too many times/i.test(message)) {
    return "Google email sending quota or service limit has been reached.";
  }

  if (/authorization|permission|not allowed/i.test(message)) {
    return "Mail sending authorization is missing. Re-authorize the Apps Script project.";
  }

  return "Email delivery failed. Check the Apps Script execution log.";
}

function jsonResponse(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
