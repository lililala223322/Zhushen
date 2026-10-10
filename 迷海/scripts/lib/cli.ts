export type CliArguments = ReadonlyMap<string, string | true>;

export function parseCliArguments(argv: readonly string[]): CliArguments {
  const parsed = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined || !argument.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${argument ?? ""}`);
    }
    const equalsIndex = argument.indexOf("=");
    if (equalsIndex >= 0) {
      parsed.set(argument.slice(2, equalsIndex), argument.slice(equalsIndex + 1));
      continue;
    }
    const key = argument.slice(2);
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      parsed.set(key, next);
      index += 1;
    } else {
      parsed.set(key, true);
    }
  }
  return parsed;
}

export function stringArgument(
  argumentsMap: CliArguments,
  name: string,
  fallback: string,
): string {
  const value = argumentsMap.get(name);
  if (value === undefined || value === true) return fallback;
  return value;
}

export function optionalStringArgument(
  argumentsMap: CliArguments,
  name: string,
): string | undefined {
  const value = argumentsMap.get(name);
  return value === undefined || value === true ? undefined : value;
}

export function integerArgument(
  argumentsMap: CliArguments,
  name: string,
  fallback: number,
  minimum = 1,
): number {
  const raw = argumentsMap.get(name);
  if (raw === undefined) return fallback;
  if (raw === true) throw new Error(`--${name} requires an integer value.`);
  const value = Number(raw.replaceAll("_", ""));
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`--${name} must be an integer >= ${minimum}; got ${raw}.`);
  }
  return value;
}

export function numberArgument(
  argumentsMap: CliArguments,
  name: string,
  fallback: number,
  minimum = Number.NEGATIVE_INFINITY,
): number {
  const raw = argumentsMap.get(name);
  if (raw === undefined) return fallback;
  if (raw === true) throw new Error(`--${name} requires a numeric value.`);
  const value = Number(raw);
  if (!Number.isFinite(value) || value < minimum) {
    throw new Error(`--${name} must be a number >= ${minimum}; got ${raw}.`);
  }
  return value;
}

export function booleanArgument(
  argumentsMap: CliArguments,
  name: string,
  fallback = false,
): boolean {
  const raw = argumentsMap.get(name);
  if (raw === undefined) return fallback;
  if (raw === true) return true;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  throw new Error(`--${name} must be true or false; got ${raw}.`);
}

export function listArgument(
  argumentsMap: CliArguments,
  name: string,
  fallback: readonly string[],
): string[] {
  const raw = argumentsMap.get(name);
  if (raw === undefined) return [...fallback];
  if (raw === true) throw new Error(`--${name} requires a comma-separated value.`);
  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (values.length === 0) throw new Error(`--${name} cannot be empty.`);
  return values;
}

export function hasArgument(argumentsMap: CliArguments, name: string): boolean {
  return argumentsMap.has(name);
}
