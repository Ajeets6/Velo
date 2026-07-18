const SENSITIVE_KEY = /authorization|password|secret|token|api.?key|prompt|message|content|url/i;

function redact(value, key = "") {
  if (SENSITIVE_KEY.test(key)) return "[redacted]";
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redact(entryValue, entryKey)]));
  return value;
}

export function createLogger(write = console.log) {
  return (level, event, fields = {}) => write(JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...redact(fields) }));
}
