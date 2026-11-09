/**
 * Structured logging with an allow-list of fields. Household content (titles, notes, names,
 * emails) and credentials can't be logged by accident because only these keys are written.
 */
const ALLOWED_FIELDS = [
  'requestId',
  'method',
  'route',
  'status',
  'durationMs',
  'householdId',
  'memberId',
  'errorName',
  'errorCode',
] as const;

export type LogFields = Partial<Record<(typeof ALLOWED_FIELDS)[number], string | number>>;
export type LogSink = (line: string) => void;

export interface Logger {
  info(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

export function createLogger(sink: LogSink = (line) => console.warn(line)): Logger {
  const write = (level: string, event: string, fields: LogFields = {}) => {
    const safe: Record<string, string | number> = {};
    for (const key of ALLOWED_FIELDS) {
      const value = fields[key];
      if (value !== undefined) safe[key] = value;
    }
    sink(JSON.stringify({ level, event, ...safe }));
  };
  return {
    info: (event, fields) => write('info', event, fields),
    error: (event, fields) => write('error', event, fields),
  };
}
