/**
 * Email utilities via Resend.
 * Required env vars:
 *   RESEND_API_KEY       — from resend.com dashboard
 *   RESEND_FROM_EMAIL    — e.g. "noreply@duelr.gg" (must be a verified Resend sender)
 *   NEXT_PUBLIC_APP_URL  — e.g. "https://duelr.gg" (used for verification links)
 */

import { Resend } from "resend";

const FROM =
  process.env.RESEND_FROM_EMAIL ?? "Duelr <noreply@duelr.gg>";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  return new Resend(key);
}

function verificationEmailHtml(verifyUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f13;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f13;padding:40px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#1a1a24;border-radius:16px;border:1px solid #2a2a3a;overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="padding:28px 32px 24px;border-bottom:1px solid #2a2a3a;">
            <span style="font-size:26px;font-weight:900;letter-spacing:1px;">
              <span style="color:#fbbf24;">Duel</span><span style="color:#fff;">r</span>
            </span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <h1 style="margin:0 0 12px;color:#fff;font-size:20px;font-weight:700;">Verify your email address</h1>
            <p style="margin:0 0 28px;color:#9ca3af;font-size:14px;line-height:1.7;">
              Thanks for creating a Duelr account. Click the button below to confirm your
              email — the link expires in <strong style="color:#e5e7eb;">24 hours</strong>.
            </p>
            <a href="${verifyUrl}"
               style="display:block;background:#fbbf24;color:#0f0f13;text-decoration:none;
                      text-align:center;padding:14px 24px;border-radius:10px;
                      font-weight:800;font-size:15px;letter-spacing:0.3px;">
              Verify Email Address
            </a>
            <p style="margin:24px 0 0;color:#4b5563;font-size:12px;text-align:center;line-height:1.6;">
              Or copy this link into your browser:<br>
              <span style="color:#6b7280;word-break:break-all;">${verifyUrl}</span>
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #2a2a3a;">
            <p style="margin:0;color:#4b5563;font-size:11px;text-align:center;">
              If you didn't create a Duelr account, you can safely ignore this email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Coach booking notification ─────────────────────────────────────────────────

function coachBookingEmailHtml(opts: {
  studentRiotId:   string;
  durationMinutes: number;
  totalCharged:    number; // cents
  platformFee:     number; // cents
}): string {
  const gross   = `$${(opts.totalCharged / 100).toFixed(2)}`;
  const fee     = `$${(opts.platformFee  / 100).toFixed(2)}`;
  const net     = `$${((opts.totalCharged - opts.platformFee) / 100).toFixed(2)}`;
  const dur     = opts.durationMinutes;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f13;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f13;padding:40px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#1a1a24;border-radius:16px;border:1px solid #2a2a3a;overflow:hidden;">
        <tr>
          <td style="padding:28px 32px 24px;border-bottom:1px solid #2a2a3a;">
            <span style="font-size:26px;font-weight:900;letter-spacing:1px;">
              <span style="color:#fbbf24;">Duel</span><span style="color:#fff;">r</span>
            </span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <h1 style="margin:0 0 8px;color:#fff;font-size:20px;font-weight:700;">New session booked! 🎮</h1>
            <p style="margin:0 0 24px;color:#9ca3af;font-size:14px;line-height:1.7;">
              A student has purchased a coaching session with you on Duelr.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0"
              style="background:#0f0f13;border:1px solid #2a2a3a;border-radius:10px;margin-bottom:24px;">
              <tr>
                <td style="padding:14px 18px;border-bottom:1px solid #2a2a3a;">
                  <span style="color:#6b7280;font-size:12px;display:block;margin-bottom:2px;">Student</span>
                  <span style="color:#fff;font-size:15px;font-weight:600;">${opts.studentRiotId}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 18px;border-bottom:1px solid #2a2a3a;">
                  <span style="color:#6b7280;font-size:12px;display:block;margin-bottom:2px;">Session length</span>
                  <span style="color:#fff;font-size:15px;font-weight:600;">${dur} minutes</span>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 18px;border-bottom:1px solid #2a2a3a;">
                  <span style="color:#6b7280;font-size:12px;display:block;margin-bottom:2px;">Gross payment</span>
                  <span style="color:#fff;font-size:15px;font-weight:600;">${gross}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 18px;border-bottom:1px solid #2a2a3a;">
                  <span style="color:#6b7280;font-size:12px;display:block;margin-bottom:2px;">Platform fee (20%)</span>
                  <span style="color:#9ca3af;font-size:15px;">${fee}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 18px;">
                  <span style="color:#6b7280;font-size:12px;display:block;margin-bottom:2px;">Your payout</span>
                  <span style="color:#fbbf24;font-size:18px;font-weight:800;">${net}</span>
                </td>
              </tr>
            </table>
            <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.7;">
              The student has your Discord handle and will reach out to schedule the session.
              Make sure your Discord DMs are open!
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #2a2a3a;">
            <p style="margin:0;color:#4b5563;font-size:11px;text-align:center;">
              Duelr · Questions? Reply to this email or contact playduelrsupport@gmail.com
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Sends a booking notification email to a coach.
 * Returns true on success.
 */
export async function sendCoachBookingEmail(opts: {
  toEmail:         string;
  studentRiotId:   string;
  durationMinutes: number;
  totalCharged:    number;
  platformFee:     number;
}): Promise<boolean> {
  const resend = getResend();
  if (!resend) return false;
  try {
    const { error } = await resend.emails.send({
      from:    FROM,
      to:      opts.toEmail,
      subject: "New Duelr coaching session booked!",
      html:    coachBookingEmailHtml(opts),
    });
    if (error) { console.error("[email] coach booking send error:", error); return false; }
    return true;
  } catch (err) {
    console.error("[email] coach booking unexpected error:", err);
    return false;
  }
}

/**
 * Sends a verification email with a signed token link.
 * Returns true on success, false if Resend is not configured or the send fails.
 */
export async function sendVerificationEmail(
  toEmail: string,
  token:   string
): Promise<boolean> {
  const resend = getResend();
  if (!resend) return false;

  const verifyUrl = `${APP_URL}/verify-email?token=${token}`;

  try {
    const { error } = await resend.emails.send({
      from:    FROM,
      to:      toEmail,
      subject: "Verify your Duelr account",
      html:    verificationEmailHtml(verifyUrl),
    });
    if (error) { console.error("[email] send error:", error); return false; }
    return true;
  } catch (err) {
    console.error("[email] unexpected error:", err);
    return false;
  }
}
