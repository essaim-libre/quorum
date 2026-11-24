type ClockSource = () => Date;

let customClock: ClockSource | null = null;

export function now(): Date {
  return customClock ? new Date(customClock().getTime()) : new Date();
}

export function setTestClock(source: Date | ClockSource): void {
  if (source instanceof Date) {
    const fixedTime = source.getTime();
    customClock = () => new Date(fixedTime);
    return;
  }
  customClock = source;
}

export function resetTestClock(): void {
  customClock = null;
}
