export const SIMULATOR_VERSION = "simulator-v1";

export type SimulatedElementType = "IED" | "BAY";

export interface SimulatedElement {
  id: string;
  name: string;
  type: SimulatedElementType;
}

export interface SubstationConfiguration {
  substationName: string;
  elements: SimulatedElement[];
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export class ConfigurationValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super("The configuration revision is invalid.");
    this.name = "ConfigurationValidationError";
    this.issues = issues;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, path: string, maxLength: number, issues: ValidationIssue[]): string {
  if (typeof value !== "string") {
    issues.push({ path, message: "must be a string" });
    return "";
  }
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > maxLength) {
    issues.push({ path, message: `must contain between 1 and ${maxLength} characters` });
  }
  return normalized;
}

export function parseSubstationConfiguration(value: unknown): SubstationConfiguration {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) throw new ConfigurationValidationError([{ path: "$", message: "must be an object" }]);

  for (const key of Object.keys(value)) {
    if (key !== "substationName" && key !== "elements") issues.push({ path: `$.${key}`, message: "is not allowed" });
  }

  const substationName = text(value.substationName, "$.substationName", 100, issues);
  const elements: SimulatedElement[] = [];
  const seenIds = new Set<string>();

  if (!Array.isArray(value.elements) || value.elements.length < 1 || value.elements.length > 100) {
    issues.push({ path: "$.elements", message: "must contain between 1 and 100 elements" });
  } else {
    value.elements.forEach((item, index) => {
      const path = `$.elements[${index}]`;
      if (!isRecord(item)) {
        issues.push({ path, message: "must be an object" });
        return;
      }
      for (const key of Object.keys(item)) {
        if (key !== "id" && key !== "name" && key !== "type") issues.push({ path: `${path}.${key}`, message: "is not allowed" });
      }
      const id = text(item.id, `${path}.id`, 64, issues);
      const name = text(item.name, `${path}.name`, 100, issues);
      if (id && !/^[A-Za-z0-9_-]+$/.test(id)) issues.push({ path: `${path}.id`, message: "must use ASCII letters, digits, hyphen or underscore" });
      if (id && seenIds.has(id)) issues.push({ path: `${path}.id`, message: "must be unique" });
      seenIds.add(id);
      if (item.type !== "IED" && item.type !== "BAY") issues.push({ path: `${path}.type`, message: "must be IED or BAY" });
      if (id && name && (item.type === "IED" || item.type === "BAY")) elements.push({ id, name, type: item.type });
    });
  }

  if (issues.length) throw new ConfigurationValidationError(issues);
  return { substationName, elements };
}
