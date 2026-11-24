import "server-only";
import { now } from "@/lib/clock";

export type LogLevel = "info" | "warn" | "error";

export type LogPrimitive = string | number | boolean | null | undefined;
export type LogValue = LogPrimitive | readonly LogValue[] | LogObject;
export interface LogObject {
  readonly [key: string]: LogValue;
}

export interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly event: string;
  readonly data?: LogObject;
}

type LogSink = (line: string, level: LogLevel) => void;

const EMAIL_PATTERN = /[^\s@]+@[^\s@]+/g;

let activeSink: LogSink = (line, level) => {
  if (level === "error") {
    process.stderr.write(`${line}\n`);
    return;
  }
  process.stdout.write(`${line}\n`);
};

export function maskEmails(input: string): string {
  return input.replace(EMAIL_PATTERN, "[redacted]");
}

export function sanitizeForLog(value: LogValue): LogValue {
  if (typeof value === "string") {
    return maskEmails(value);
  }
  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item));
  }
  const sanitized: Record<string, LogValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    sanitized[key] = sanitizeForLog(entry);
  }
  return sanitized;
}

export function setLogSink(sink: LogSink | null): void {
  if (sink === null) {
    activeSink = (line, level) => {
      if (level === "error") {
        process.stderr.write(`${line}\n`);
        return;
      }
      process.stdout.write(`${line}\n`);
    };
    return;
  }
  activeSink = sink;
}

export function log(level: LogLevel, event: string, data?: LogObject): void {
  const entry: LogEntry = {
    timestamp: now().toISOString(),
    level,
    event: maskEmails(event),
    ...(data ? { data: sanitizeForLog(data) as LogObject } : {}),
  };

  activeSink(JSON.stringify(entry), level);
}
