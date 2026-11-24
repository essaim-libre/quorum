export interface OtpEmailMessage {
  /** Adresse destinataire : transitoire en mémoire uniquement, jamais stockée ni journalisée. */
  readonly to: string;
  readonly code: string;
}

export interface MailDriver {
  sendOtpCode(message: OtpEmailMessage): Promise<void>;
}

export function formatOtpPlainText(code: string): string {
  return `Ton code Quorum : ${code}. Il expire dans 10 minutes. Si tu n'as rien demandé, ignore ce message.`;
}

export const OTP_EMAIL_SUBJECT = "Ton code Quorum";
