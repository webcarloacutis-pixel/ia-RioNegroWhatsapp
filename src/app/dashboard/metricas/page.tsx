import { MetricsPanel } from "@/components/modules/metrics-panel";
import { getAssistantAnalyticsSummary } from "@/server/assistant-analytics-service";
import { getMetricsData } from "@/server/panel-service";

export default async function MetricsPage() {
  const [data, assistantAnalytics] = await Promise.all([
    getMetricsData(),
    getAssistantAnalyticsSummary(),
  ]);

  return <MetricsPanel data={data} assistantAnalytics={assistantAnalytics} />;
}
