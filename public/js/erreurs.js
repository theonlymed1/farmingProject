// Error thrown by api.js. `message` is always French text that can be shown to the farmer.
export class ErreurApi extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
