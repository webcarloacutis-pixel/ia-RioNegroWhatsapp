import { PrismaClient } from "@prisma/client";

import {
  buildOfficialAnnouncements,
  buildOfficialKnowledgeEntries,
  officialSegments,
} from "../src/lib/rionegro-content";

const prisma = new PrismaClient();

async function main() {
  await prisma.deliveryLog.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.knowledgeBaseEntry.deleteMany();
  await prisma.segment.deleteMany();

  const createdSegments = await Promise.all(
    officialSegments.map((segment) =>
      prisma.segment.create({
        data: {
          name: segment.name,
          description: segment.description,
          estimatedUsers: segment.estimatedUsers,
        },
      }),
    ),
  );

  const segmentByName = new Map(createdSegments.map((segment) => [segment.name, segment.id]));

  const createdAnnouncements = await Promise.all(
    buildOfficialAnnouncements().map((item) => {
      let segmentId: string | null = segmentByName.get("Cobertura municipal") ?? null;

      if (item.location === "Vereda Mampuesto") {
        segmentId = segmentByName.get("Zona rural y corregimientos") ?? segmentId;
      } else if (item.location === "Biblioteca Baldomero Sanin") {
        segmentId = segmentByName.get("Cultura y bibliotecas") ?? segmentId;
      } else if (item.location === "Casa CincoPasitos") {
        segmentId = segmentByName.get("Primera infancia y familias") ?? segmentId;
      } else if (item.location === "Instituciones educativas del municipio") {
        segmentId = segmentByName.get("Comunidad educativa") ?? segmentId;
      }

      const scheduledAt = new Date(item.scheduledAt);

      return prisma.announcement.create({
        data: {
          title: item.title,
          message: item.message,
          location: item.location,
          type: item.type,
          scheduledAt,
          status: item.status,
          sentAt: item.status === "SENT" ? scheduledAt : null,
          segmentId,
        },
      });
    }),
  );

  await prisma.knowledgeBaseEntry.createMany({
    data: buildOfficialKnowledgeEntries(),
  });

  const totalAudience = createdSegments.reduce(
    (total, segment) => total + segment.estimatedUsers,
    0,
  );

  await Promise.all(
    createdAnnouncements
      .filter((announcement) => announcement.status === "SENT")
      .slice(0, 6)
      .map((announcement, index) => {
        const segment = createdSegments.find((item) => item.id === announcement.segmentId);
        const deliveredCount = segment?.estimatedUsers ?? totalAudience;

        return prisma.deliveryLog.create({
          data: {
            announcementId: announcement.id,
            segmentId: announcement.segmentId,
            mode: index % 2 === 0 ? "DEMO" : "MANUAL",
            deliveredCount,
            details: `Enviado a ${new Intl.NumberFormat("es-CO").format(deliveredCount)} usuarios.`,
          },
        });
      }),
  );

  console.log("Base de datos poblada con contenido oficial de Rionegro.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Error al poblar la base de datos:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
