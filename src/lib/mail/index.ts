import "server-only";
import { getEnv } from "@/lib/env";
import { consoleMailDriver } from "./console";
import { scalewayMailDriver } from "./scaleway";
import type { MailDriver } from "./types";

export function getMailDriver(): MailDriver {
  const { MAIL_DRIVER, NODE_ENV } = getEnv();
  if (MAIL_DRIVER === "console") {
    if (NODE_ENV === "production") {
      throw new Error("MAIL_DRIVER=console est refusé en production.");
    }
    return consoleMailDriver;
  }
  return scalewayMailDriver;
}
