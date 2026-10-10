export type ValidationSeverity = "info" | "warning" | "error";

export interface ValidationMessage {
  severity: ValidationSeverity;
  code: string;
  message: string;
  target?: {
    kind: string;
    id?: string;
  };
}

export interface ValidationResult {
  messages: ValidationMessage[];
  valid: boolean;
}
