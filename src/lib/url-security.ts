function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map((part) => Number(part));

  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first = 0, second = 0] = parts;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isBlockedHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized.startsWith("localhost.") ||
    isPrivateIpv4(normalized)
  );
}

export function isPublicHttpUrl(value: string) {
  try {
    const parsed = new URL(value);

    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      !isBlockedHostname(parsed.hostname)
    );
  } catch {
    return false;
  }
}
