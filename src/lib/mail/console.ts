import "server-only";
import { formatOtpPlainText, type MailDriver, type OtpEmailMessage } from "./types";

type ConsoleOtpObserver = (code: string) => void;

let observer: ConsoleOtpObserver | null = null;

/** Permet aux tests d'intercepter le code sans jamais exposer l'email dans les logs. */
export function setConsoleMailObserver(fn: ConsoleOtpObserver | null): void {
  observer = fn;
}

export const consoleMailDriver: MailDriver = {
  async sendOtpCode(message: OtpEmailMessage): Promise<void> {
    // Invariant n°1 : ne JAMAIS écrire message.to dans la sortie standard ou les logs.
    const text = formatOtpPlainText(message.code);
    if (observer) {
      observer(message.code);
      return;
    }
    process.stdout.write(`[quorum:mail:console] ${text}\n`);
  },
};
