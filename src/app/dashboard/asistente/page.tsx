import { AssistantPlayground } from "@/components/modules/assistant-playground";
import {
  assistantRules,
  assistantSampleQuestions,
  mayorProfile,
  municipalityContact,
} from "@/lib/rionegro-content";
import { getAssistantAnalyticsSummary } from "@/server/assistant-analytics-service";
import { getAssistantConfig, getConversation } from "@/server/rionegro-assistant";

export default async function AssistantPage() {
  const analytics = await getAssistantAnalyticsSummary();
  const config = getAssistantConfig();
  const testScenarios = [
    {
      title: "Identidad del municipio",
      prompt: "Que es Rionegro?",
      goal: "Validar respuesta institucional basica sobre el municipio.",
    },
    {
      title: "Autoridad local",
      prompt: "Quien es el alcalde de Rionegro?",
      goal: "Comprobar datos del alcalde y periodo actual.",
    },
    {
      title: "Canales oficiales",
      prompt: "Cuales son los canales de contacto de la Alcaldia?",
      goal: "Revisar correo, telefono, direccion y horario.",
    },
    {
      title: "Eventos",
      prompt: "Que eventos hay programados?",
      goal: "Probar listado de eventos con fecha y lugar.",
    },
    {
      title: "Noticias",
      prompt: "Dame las noticias mas recientes de Rionegro.",
      goal: "Verificar respuesta tipo boletin institucional.",
    },
    {
      title: "Alertas",
      prompt: "Hay alertas recientes en el sistema?",
      goal: "Comprobar contenido de alertas y tono formal.",
    },
    {
      title: "Secretarias",
      prompt: "Que secretarias principales tiene la Alcaldia?",
      goal: "Probar catalogo de dependencias y funciones.",
    },
    {
      title: "PQRS",
      prompt: "Donde puedo poner una queja o solicitud?",
      goal: "Validar orientacion a canales oficiales.",
    },
  ];

  return (
    <AssistantPlayground
      initialHistory={getConversation("panel-demo-session")}
      analytics={analytics}
      sampleQuestions={[...assistantSampleQuestions]}
      rules={[...assistantRules]}
      testScenarios={testScenarios}
      mayorName={mayorProfile.name}
      contactEmail={municipalityContact.citizenEmail}
      contactPhone={municipalityContact.phone}
      openAIEnabled={config.openAIEnabled}
      openAIModel={config.openAIModel}
    />
  );
}
