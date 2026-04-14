import { AnnouncementsManager } from "@/components/modules/announcements-manager";
import { listAnnouncements, listSegments } from "@/server/panel-service";

export default async function AnnouncementsPage() {
  const [announcements, segments] = await Promise.all([
    listAnnouncements(),
    listSegments(),
  ]);

  return <AnnouncementsManager announcements={announcements} segments={segments} />;
}
