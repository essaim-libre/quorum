import "server-only";
import { getEnv } from "@/lib/env";
import {
  formatOtpPlainText,
  OTP_EMAIL_SUBJECT,
  type MailDriver,
  type OtpEmailMessage,
} from "./types";

function parseMailFrom(mailFrom: string): { email: string; name?: string } {
  const match = /^(.*)<([^<>]+)>$/.exec(mailFrom.trim());
  if (match && match[2]) {
    const name = match[1]?.trim();
    return {
      email: match[2].trim(),
      ...(name ? { name } : {}),
    };
  }
  return { email: mailFrom.trim() };
}

export const scalewayMailDriver: MailDriver = {
  async sendOtpCode(message: OtpEmailMessage): Promise<void> {
    const env = getEnv();
    const from = parseMailFrom(env.MAIL_FROM);
    const endpoint = `https://api.scaleway.com/transactional-email/v1alpha1/regions/${encodeURIComponent(env.SCW_REGION)}/emails`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Token": env.SCW_SECRET_KEY,
      },
      body: JSON.stringify({
        from,
        to: [{ email: message.to }],
        subject: OTP_EMAIL_SUBJECT,
        text: formatOtpPlainText(message.code),
        project_id: env.SCW_PROJECT_ID,
      }),
    });

    if (!response.ok) {
      // Invariant n°1 : ne pas inclure le corps d'erreur distant ni l'adresse email.
      throw new Error(`scaleway_mail_http_${response.status}`);
    }
  },
};
