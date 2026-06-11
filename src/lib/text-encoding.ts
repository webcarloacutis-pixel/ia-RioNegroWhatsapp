import type { SupportedLanguage } from "@/lib/language";

const MOJIBAKE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\u00C2\u00BF/g, "¿"],
  [/\u00C2\u00A1/g, "¡"],
  [/\u00C3\u0081/g, "Á"],
  [/\u00C3\u0089/g, "É"],
  [/\u00C3\u008D/g, "Í"],
  [/\u00C3\u0093/g, "Ó"],
  [/\u00C3\u009A/g, "Ú"],
  [/\u00C3\u0091/g, "Ñ"],
  [/\u00C3\u00A1/g, "á"],
  [/\u00C3\u00A9/g, "é"],
  [/\u00C3\u00AD/g, "í"],
  [/\u00C3\u00B3/g, "ó"],
  [/\u00C3\u00BA/g, "ú"],
  [/\u00C3\u00B1/g, "ñ"],
  [/\u00C3\u00BC/g, "ü"],
  [/\u00E2\u0080\u0099/g, "'"],
  [/\u00E2\u0080\u009C/g, '"'],
  [/\u00E2\u0080\u009D/g, '"'],
  [/\u00E2\u0080\u00A6/g, "..."],
];

const SPANISH_WORD_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\binformacion\b/gi, "información"],
  [/\badministracion\b/gi, "administración"],
  [/\bubicacion\b/gi, "ubicación"],
  [/\bdireccion\b/gi, "dirección"],
  [/\btelefono\b/gi, "teléfono"],
  [/\btelefonos\b/gi, "teléfonos"],
  [/\batencion\b/gi, "atención"],
  [/\brevision\b/gi, "revisión"],
  [/\bsituacion\b/gi, "situación"],
  [/\btransito\b/gi, "tránsito"],
  [/\btramite\b/gi, "trámite"],
  [/\btramites\b/gi, "trámites"],
  [/\btambien\b/gi, "también"],
  [/\btodavia\b/gi, "todavía"],
  [/\bmanana\b/gi, "mañana"],
  [/\banos\b/gi, "años"],
  [/\bnino\b/gi, "niño"],
  [/\bespanol\b/gi, "español"],
  [/\benvianos\b/gi, "envíanos"],
  [/\benviame\b/gi, "envíame"],
  [/\benvia\b/gi, "envía"],
  [/\bescribenos\b/gi, "escríbenos"],
  [/\bescribeme\b/gi, "escríbeme"],
  [/\bcuentanos\b/gi, "cuéntanos"],
  [/\bcomunicate\b/gi, "comunícate"],
  [/\bocurrio\b/gi, "ocurrió"],
  [/\bmas\b/gi, "más"],
  [/\bAlcaldia\b/g, "Alcaldía"],
  [/\balcaldia\b/g, "alcaldía"],
  [/\barbol\b/gi, "árbol"],
  [/\bcaido\b/gi, "caído"],
  [/\bcaidos\b/gi, "caídos"],
  [/\bsemaforo\b/gi, "semáforo"],
  [/\bvehiculo\b/gi, "vehículo"],
  [/\bpublicos\b/gi, "públicos"],
  [/\bexplosion\b/gi, "explosión"],
];

function preserveCase(match: string, replacement: string) {
  if (match === match.toUpperCase()) {
    return replacement.toUpperCase();
  }

  if (match[0] === match[0]?.toUpperCase()) {
    return `${replacement[0]?.toUpperCase() ?? ""}${replacement.slice(1)}`;
  }

  return replacement;
}

export function repairMojibake(text: string) {
  return MOJIBAKE_REPLACEMENTS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    text,
  );
}

export function cleanFinalReplyText(text: string, language: SupportedLanguage = "es") {
  const repaired = repairMojibake(text);

  if (language === "en") {
    return repaired;
  }

  return SPANISH_WORD_REPLACEMENTS.reduce(
    (current, [pattern, replacement]) =>
      current.replace(pattern, (match) => preserveCase(match, replacement)),
    repaired,
  );
}
