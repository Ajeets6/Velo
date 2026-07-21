export const ERROR_CODES = Object.freeze({
  MODEL_UNAVAILABLE: "MODEL_UNAVAILABLE",
  MOTIONFORGE_UNAVAILABLE: "MOTIONFORGE_UNAVAILABLE",
  INVALID_SCENE: "INVALID_SCENE",
  SIMULATION_FAILED: "SIMULATION_FAILED",
  EXPORT_FAILED: "EXPORT_FAILED",
  CANCELLED: "CANCELLED",
  TIMEOUT: "TIMEOUT",
  DISK_FULL: "DISK_FULL",
  CONTRACT_MISMATCH: "CONTRACT_MISMATCH",
  INVALID_REQUEST: "INVALID_REQUEST",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  RATE_LIMITED: "RATE_LIMITED",
  NOT_FOUND: "NOT_FOUND",
  INTERNAL_ERROR: "INTERNAL_ERROR",
});

const statusByCode = {
  INVALID_REQUEST: 400,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  NOT_FOUND: 404,
  MODEL_UNAVAILABLE: 503,
  MOTIONFORGE_UNAVAILABLE: 503,
  TIMEOUT: 504,
  DISK_FULL: 507,
  INTERNAL_ERROR: 500,
};

export class VeloError extends Error {
  constructor(code, message, { cause, status } = {}) {
    super(message, { cause });
    this.name = "VeloError";
    this.code = ERROR_CODES[code] || ERROR_CODES.INTERNAL_ERROR;
    this.status = status || statusByCode[this.code] || 500;
  }
}

export function toVeloError(error) {
  if (error instanceof VeloError) return error;
  return new VeloError("INTERNAL_ERROR", "The request could not be completed.", { cause: error });
}

export function errorPayload(error, requestId) {
  const safe = toVeloError(error);
  return { contractVersion: 1, error: { code: safe.code, message: safe.message, requestId } };
}
