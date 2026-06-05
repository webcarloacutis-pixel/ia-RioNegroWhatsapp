import type { ChannelRuntimeStatus } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { messageServiceInternals } from "@/server/messageService";

function isEnvTrue(name: string) {
  return process.env[name]?.trim() === "true";
}

export function getChannelRuntimeStatus(input: {
  segmentsWithRecipients?: number;
} = {}): ChannelRuntimeStatus {
  const safeMode = messageServiceInternals.isWhatsAppSafeMode();
  const dryRun = messageServiceInternals.isWhatsAppDryRunMode();
  const ultramsgMock = isEnvTrue("ULTRAMSG_MOCK");
  const simulationMode = isEnvTrue("SIMULATION_MODE");
  const ultraMsgConfigured = messageServiceInternals.isUltraMsgConfigured();
  const defaultRecipientConfigured = Boolean(process.env.ULTRAMSG_DEFAULT_TO?.trim());
  const schedulerEnabled = process.env.SCHEDULER_ENABLED !== "false";
  const segmentsWithRecipients = input.segmentsWithRecipients ?? 0;
  const hasRecipientSource = defaultRecipientConfigured || segmentsWithRecipients > 0;
  const realSendingReady = ultraMsgConfigured && !safeMode && !dryRun;

  if (safeMode) {
    return {
      mode: "blocked",
      label: "Modo seguro activo",
      description: "Los envios reales estan bloqueados por WHATSAPP_SAFE_MODE.",
      badgeTone: "danger",
      safeMode,
      dryRun,
      ultramsgMock,
      simulationMode,
      ultraMsgConfigured,
      defaultRecipientConfigured,
      schedulerEnabled,
      segmentsWithRecipients,
      hasRecipientSource,
      realSendingReady,
    };
  }

  if (dryRun) {
    return {
      mode: "simulated",
      label: "Modo prueba activo",
      description: "Los envios se simulan por WHATSAPP_DRY_RUN, ULTRAMSG_MOCK o SIMULATION_MODE.",
      badgeTone: "warning",
      safeMode,
      dryRun,
      ultramsgMock,
      simulationMode,
      ultraMsgConfigured,
      defaultRecipientConfigured,
      schedulerEnabled,
      segmentsWithRecipients,
      hasRecipientSource,
      realSendingReady,
    };
  }

  if (!ultraMsgConfigured) {
    return {
      mode: "unconfigured",
      label: "UltraMsg incompleto",
      description: "Falta configurar ULTRAMSG_TOKEN y la URL o instancia de UltraMsg.",
      badgeTone: "danger",
      safeMode,
      dryRun,
      ultramsgMock,
      simulationMode,
      ultraMsgConfigured,
      defaultRecipientConfigured,
      schedulerEnabled,
      segmentsWithRecipients,
      hasRecipientSource,
      realSendingReady,
    };
  }

  return {
    mode: "real",
    label: "Canal real activo",
    description: "UltraMsg esta configurado y los envios reales estan habilitados.",
    badgeTone: hasRecipientSource ? "success" : "warning",
    safeMode,
    dryRun,
    ultramsgMock,
    simulationMode,
    ultraMsgConfigured,
    defaultRecipientConfigured,
    schedulerEnabled,
    segmentsWithRecipients,
    hasRecipientSource,
    realSendingReady,
  };
}

export async function getChannelRuntimeStatusFromDatabase() {
  try {
    const segmentsWithRecipients = await prisma.segment.count({
      where: {
        recipientPhones: {
          isEmpty: false,
        },
      },
    });

    return getChannelRuntimeStatus({ segmentsWithRecipients });
  } catch {
    return getChannelRuntimeStatus();
  }
}
