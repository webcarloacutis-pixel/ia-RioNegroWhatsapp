export type EmergencyContact = {
  key: string;
  label: string;
  phone: string;
};

const CONTACT_CONFIG = [
  ["general", "emergencias", "EMERGENCY_PHONE_GENERAL"],
  ["police", "Policia", "EMERGENCY_PHONE_POLICE"],
  ["transit", "Transito", "EMERGENCY_PHONE_TRANSIT"],
  ["fire_department", "Bomberos", "EMERGENCY_PHONE_FIRE_DEPARTMENT"],
  ["health", "salud", "EMERGENCY_PHONE_HEALTH"],
] as const;

function sanitizePhone(value: string | undefined) {
  return value?.trim().replace(/\s+/g, " ") || "";
}

export function getEmergencyContacts(): EmergencyContact[] {
  return CONTACT_CONFIG.map(([key, label, envKey]) => ({
    key,
    label,
    phone: sanitizePhone(process.env[envKey]),
  })).filter((contact) => contact.phone);
}

export function getEmergencyContactReference() {
  const contacts = getEmergencyContacts();

  if (!contacts.length) {
    return "la linea de emergencias correspondiente";
  }

  const general = contacts.find((contact) => contact.key === "general");

  if (general) {
    return `la linea de emergencias ${general.phone}`;
  }

  return `las lineas confirmadas: ${contacts
    .map((contact) => `${contact.label} ${contact.phone}`)
    .join(", ")}`;
}
