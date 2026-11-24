const PARIS_TIMEZONE = "Europe/Paris";

const fullDateTimeFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: PARIS_TIMEZONE,
  weekday: "long",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const shortDateTimeFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: PARIS_TIMEZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const integerFormatter = new Intl.NumberFormat("fr-FR");

const percentFormatter = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

export function formatDateTimeParis(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return fullDateTimeFormatter.format(d);
}

export function formatShortDateTimeParis(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return shortDateTimeFormatter.format(d);
}

export function formatNumberFr(value: number): string {
  return integerFormatter.format(value);
}

export function formatPercentFr(ratio: number): string {
  return `${percentFormatter.format(ratio * 100)} %`;
}

export function formatDurationRemaining(
  targetDate: Date,
  referenceDate: Date,
): string {
  const diffMs = targetDate.getTime() - referenceDate.getTime();
  if (diffMs <= 0) {
    return "0 min";
  }

  const totalMinutes = Math.ceil(diffMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days >= 1) {
    return hours > 0 ? `${days} j ${hours} h` : `${days} j`;
  }
  if (hours >= 1) {
    return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  }
  return `${minutes} min`;
}
