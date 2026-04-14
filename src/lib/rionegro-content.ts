import type { AnnouncementStatus } from "@prisma/client";

export const officialEvents = [
  {
    title: "Jornada de desparasitacion gratuita",
    date: "2024-07-03",
    description: "Talento en movimiento: red de empleabilidad para jovenes.",
    location: "Cubo de la Innovacion",
    type: "EVENT",
  },
  {
    title: "Cineclub infantil",
    date: "2026-04-13",
    description: "Actividad cultural para ninos.",
    location: "Biblioteca Baldomero Sanin",
    type: "EVENT",
  },
  {
    title: "Miniolimpiadas CincoPasitos",
    date: "2026-04-15",
    description: "Actividad dirigida a usuarios del programa Arrullos.",
    location: "Casa CincoPasitos",
    type: "EVENT",
  },
] as const;

export const officialNews = [
  {
    title: "Rionegro inicio las celebraciones del Mes de la Infancia y la Adolescencia",
    date: "2026-04-13",
    description:
      "Una masiva y colorida caminata reunio a cerca de 2.000 ninos, ninas y sus familias.",
    type: "NEWS",
  },
  {
    title: "Banda Sinfonica de Rionegro entre las mejores de la musica andina en Colombia",
    date: "2026-04-10",
    description:
      "La banda se ubico entre las tres mejores agrupaciones del pais en el Concurso Nacional de Musica Andina.",
    type: "NEWS",
  },
  {
    title: "Se realizaran jornadas descentralizadas La Alcaldia te Escucha",
    date: "2026-04-09",
    description:
      "Espacios para resolver dudas sobre actualizacion catastral e impuesto predial.",
    type: "NEWS",
  },
  {
    title: "Rionegro fortalece su infraestructura vial en zonas urbanas y rurales",
    date: "2026-04-08",
    description:
      "La Alcaldia anuncio nuevas obras de mantenimiento y mejoramiento en vias estrategicas para mejorar la movilidad del municipio. Prioridad: media.",
    type: "NEWS",
  },
  {
    title: "Avances en seguridad: aumento de operativos en Rionegro",
    date: "2026-04-07",
    description:
      "Las autoridades intensificaron operativos en diferentes sectores del municipio para mejorar la seguridad ciudadana. Prioridad: alta.",
    type: "NEWS",
  },
  {
    title: "Rionegro impulsa programas de empleo para jovenes",
    date: "2026-04-06",
    description:
      "Se lanzaron nuevas estrategias para conectar jovenes con oportunidades laborales y formacion. Prioridad: media.",
    type: "NEWS",
  },
  {
    title: "Mejoras en el sistema de alumbrado publico en Rionegro",
    date: "2026-04-05",
    description:
      "Se instalaron nuevas luminarias en varios barrios para mejorar la seguridad y visibilidad. Prioridad: media.",
    type: "NEWS",
  },
  {
    title: "Rionegro promueve actividades culturales y deportivas",
    date: "2026-04-04",
    description:
      "El municipio continua impulsando eventos culturales y deportivos para fortalecer la comunidad. Prioridad: baja.",
    type: "NEWS",
  },
] as const;

export const officialAnnouncementTranslations = {
  "Rionegro inicio las celebraciones del Mes de la Infancia y la Adolescencia": {
    titleEn: "Rionegro began the Month of Children and Adolescents celebrations",
    messageEn:
      "A large and colorful walk brought together nearly 2,000 children and their families.",
  },
  "Banda Sinfonica de Rionegro entre las mejores de la musica andina en Colombia": {
    titleEn: "Rionegro Symphony Band ranked among the best in Andean music in Colombia",
    messageEn:
      "The band ranked among the top three groups in the country in the National Andean Music Competition.",
  },
  "Se realizaran jornadas descentralizadas La Alcaldia te Escucha": {
    titleEn: "Decentralized \"City Hall Listens to You\" sessions will be held",
    messageEn:
      "These spaces will help resolve questions about cadastral updates and property tax.",
  },
  "Rionegro fortalece su infraestructura vial en zonas urbanas y rurales": {
    titleEn: "Rionegro strengthens its road infrastructure in urban and rural areas",
    messageEn:
      "The City Hall announced new maintenance and improvement works on strategic roads to improve mobility in the municipality. Priority: medium.",
  },
  "Avances en seguridad: aumento de operativos en Rionegro": {
    titleEn: "Security progress: increased operations in Rionegro",
    messageEn:
      "Authorities intensified operations in different sectors of the municipality to improve public safety. Priority: high.",
  },
  "Rionegro impulsa programas de empleo para jovenes": {
    titleEn: "Rionegro promotes employment programs for young people",
    messageEn:
      "New strategies were launched to connect young people with job opportunities and training. Priority: medium.",
  },
  "Mejoras en el sistema de alumbrado publico en Rionegro": {
    titleEn: "Improvements to the public lighting system in Rionegro",
    messageEn:
      "New streetlights were installed in several neighborhoods to improve safety and visibility. Priority: medium.",
  },
  "Rionegro promueve actividades culturales y deportivas": {
    titleEn: "Rionegro promotes cultural and sports activities",
    messageEn:
      "The municipality continues promoting cultural and sports events to strengthen the community. Priority: low.",
  },
} as const;

export const officialAlerts = [
  {
    title: "Ataque armado en zona rural de Rionegro",
    date: "2026-04-12",
    description:
      "Dos hombres fueron asesinados en la vereda Mampuesto en un ataque con arma de fuego.",
    location: "Vereda Mampuesto",
    type: "ALERT",
  },
  {
    title: "Expulsion de ciudadano extranjero por alteracion del orden publico",
    date: "2026-04-11",
    description:
      "Un ciudadano estadounidense fue expulsado tras generar disturbios en instituciones educativas.",
    location: "Instituciones educativas del municipio",
    type: "ALERT",
  },
] as const;

export const officialSegments = [
  {
    name: "Cobertura municipal",
    description:
      "Mensajeria general para informacion institucional, noticias y comunicados amplios del municipio.",
    estimatedUsers: 4500,
  },
  {
    name: "Zona rural y corregimientos",
    description:
      "Audiencia priorizada para alertas de seguridad, movilidad rural y hechos relevantes fuera del casco urbano.",
    estimatedUsers: 980,
  },
  {
    name: "Cultura y bibliotecas",
    description:
      "Segmento para actividades culturales, agenda artistica y programacion de bibliotecas.",
    estimatedUsers: 760,
  },
  {
    name: "Primera infancia y familias",
    description:
      "Cobertura orientada a programas infantiles, bienestar familiar y actividades para ninos y cuidadores.",
    estimatedUsers: 540,
  },
  {
    name: "Comunidad educativa",
    description:
      "Informacion relevante para instituciones educativas, estudiantes, docentes y familias.",
    estimatedUsers: 1200,
  },
] as const;

export const municipalityContact = {
  municipality: "Rionegro",
  nit: "890.907.317-2",
  address: "Calle 49 No. 50 - 05, Rionegro, Antioquia, Colombia",
  phone: "+57 (604) 520 4060",
  tollFreeLine: "+57 (604) 520 4060",
  citizenEmail: "atencionalusuario@rionegro.gov.co",
  judicialEmail: "juridica@rionegro.gov.co",
  transitEmail: "transito@rionegro.gov.co",
  taxesEmail: "rentas@rionegro.gov.co",
  valuationEmail: "valorizacion@rionegro.gov.co",
  postalCode: "054040",
  schedule: {
    mondayThursday: "7:00 a.m. a 12:00 m. y 1:00 p.m. a 5:00 p.m.",
    friday: "7:00 a.m. a 12:00 m. y 1:00 p.m. a 4:00 p.m.",
  },
} as const;

export const municipalityHistory =
  "Rionegro es uno de los municipios mas importantes del departamento de Antioquia, ubicado en el Valle de San Nicolas, en la subregion del Oriente antioqueno. Fue fundado en 1541 por Alvaro de Mendoza. Durante la epoca colonial se convirtio en un centro politico, economico y cultural clave en Antioquia. En 1863 fue sede de la Convencion de Rionegro, donde se redacto la Constitucion de los Estados Unidos de Colombia. Por eso es conocido como la Cuna de la Constitucion de 1863. Hoy se reconoce por su desarrollo economico, infraestructura, crecimiento urbano y por albergar el Aeropuerto Internacional Jose Maria Cordova.";

export const municipalityProfile = {
  name: "Rionegro",
  department: "Antioquia",
  region: "Oriente antioqueno",
  foundation: "1541",
  founder: "Alvaro de Mendoza",
  nickname: "Cuna de la Constitucion de 1863",
  airport: "Aeropuerto Internacional Jose Maria Cordova",
  importance: "Centro economico, logistico y urbano del Oriente antioqueno",
  nearMedellin: "Aproximadamente 45 minutos",
} as const;

export const mayorProfile = {
  name: "Jorge Humberto Rivas Urrea",
  role: "Alcalde de Rionegro",
  period: "2024 - 2027",
  description:
    "Actual alcalde del municipio de Rionegro, encargado de liderar la administracion municipal y ejecutar planes de desarrollo enfocados en crecimiento, seguridad y bienestar ciudadano.",
} as const;

export const mayorOfficeSummary =
  "El alcalde de Rionegro es la maxima autoridad del municipio y es responsable de la administracion publica, la ejecucion de obras, la seguridad, la educacion y el desarrollo economico. La Alcaldia de Rionegro trabaja en areas como infraestructura, movilidad, seguridad, cultura, educacion y desarrollo economico.";

export const officialSecretaries = [
  {
    name: "Secretaria de Gobierno",
    function:
      "Encargada de la seguridad, convivencia ciudadana y orden publico.",
  },
  {
    name: "Secretaria de Desarrollo Territorial",
    function: "Gestiona obras, urbanismo y planificacion del municipio.",
  },
  {
    name: "Secretaria de Hacienda",
    function: "Maneja los recursos economicos, impuestos y finanzas del municipio.",
  },
  {
    name: "Secretaria de Educacion",
    function: "Encargada de programas educativos y colegios del municipio.",
  },
  {
    name: "Secretaria de Salud",
    function: "Gestiona servicios de salud publica y bienestar social.",
  },
  {
    name: "Secretaria de Movilidad",
    function: "Regula el transito, transporte y cierres viales.",
  },
] as const;

export const officialPrograms = [
  {
    name: "La Alcaldia te Escucha",
    description:
      "Programa donde los ciudadanos pueden expresar sus inquietudes y recibir atencion directa de la administracion.",
  },
  {
    name: "Talento en Movimiento",
    description:
      "Programa de empleabilidad dirigido a jovenes del municipio.",
  },
  {
    name: "Arrullos",
    description:
      "Programa enfocado en la primera infancia y el desarrollo integral de ninos.",
  },
] as const;

export const institutionalServices = [
  {
    key: "citizen_services",
    titleEs: "Atencion al ciudadano y PQRS",
    titleEn: "Citizen services and PQRS",
    descriptionEs:
      "Orientacion general, solicitudes, peticiones, quejas, reclamos y tramites de atencion al ciudadano.",
    descriptionEn:
      "General guidance, requests, petitions, complaints, claims and citizen service procedures.",
    aliases: ["atencion al ciudadano", "pqrs", "queja", "solicitud", "peticion", "complaint", "request"],
  },
  {
    key: "taxes",
    titleEs: "Hacienda e impuestos",
    titleEn: "Treasury and taxes",
    descriptionEs:
      "Consultas de impuesto predial, rentas municipales, pagos, acuerdos y tramites tributarios.",
    descriptionEn:
      "Property tax, municipal revenue, payments, payment agreements and tax-related procedures.",
    aliases: ["hacienda", "impuestos", "predial", "rentas", "taxes", "treasury"],
  },
  {
    key: "cadastre",
    titleEs: "Catastro",
    titleEn: "Cadastre",
    descriptionEs:
      "Actualizacion catastral, informacion predial y procesos asociados a catastro municipal.",
    descriptionEn:
      "Cadastre updates, property information and municipal cadastre-related processes.",
    aliases: ["catastro", "catastral", "cadastre"],
  },
  {
    key: "mobility",
    titleEs: "Movilidad y transito",
    titleEn: "Mobility and transit",
    descriptionEs:
      "Tramites y consultas de transito, movilidad, comparendos, permisos y orientacion vial.",
    descriptionEn:
      "Transit and mobility procedures, fines, permits and road guidance.",
    aliases: ["movilidad", "transito", "comparendo", "traffic", "mobility", "transit"],
  },
  {
    key: "planning",
    titleEs: "Planeacion",
    titleEn: "Planning",
    descriptionEs:
      "Licencias, uso del suelo, planeacion territorial y orientacion urbanistica.",
    descriptionEn:
      "Licenses, land use, territorial planning and urban guidance.",
    aliases: ["planeacion", "uso del suelo", "licencia", "planning", "land use"],
  },
  {
    key: "employment",
    titleEs: "Empleo y desarrollo economico",
    titleEn: "Employment and economic development",
    descriptionEs:
      "Programas de empleabilidad, orientacion laboral y apoyo a iniciativas productivas.",
    descriptionEn:
      "Employability programs, labor guidance and support for productive initiatives.",
    aliases: ["empleo", "trabajo", "desarrollo economico", "employment", "job"],
  },
  {
    key: "health",
    titleEs: "Salud y bienestar",
    titleEn: "Health and wellbeing",
    descriptionEs:
      "Orientacion sobre programas de salud, bienestar y articulacion con dependencias del municipio.",
    descriptionEn:
      "Guidance on health and wellbeing programs and coordination with municipal offices.",
    aliases: ["salud", "bienestar", "health", "wellbeing"],
  },
  {
    key: "education",
    titleEs: "Educacion",
    titleEn: "Education",
    descriptionEs:
      "Consultas de programas educativos, instituciones y procesos asociados al sector educativo.",
    descriptionEn:
      "Questions about educational programs, schools and education-related processes.",
    aliases: ["educacion", "colegio", "education", "school"],
  },
] as const;

export const assistantRules = [
  "Responder como asistente oficial de la Alcaldia de Rionegro.",
  "Mantener un tono mixto: institucional, cercano, claro y directo.",
  "Priorizar informacion oficial.",
  "No inventar datos.",
  "Recomendar canales oficiales cuando sea necesario.",
  "Restringirse solo a informacion relacionada con Rionegro.",
  "Responder en espanol o en ingles segun el idioma del usuario.",
] as const;

export const assistantWelcomeMessage =
  "Hola 👋 soy el asistente oficial de Rionegro. Puedo ayudarte con eventos, noticias, cierres viales y mas. En que puedo ayudarte?";

export const assistantNoDataMessage =
  "No tengo esa informacion en este momento, te recomiendo consultar con la Alcaldia.";

export const assistantScopeMessage =
  "Puedo ayudarte solo con informacion oficial del municipio de Rionegro.";

export const assistantSampleQuestions = [
  "Que es Rionegro?",
  "Quien es el alcalde de Rionegro?",
  "Que hay hoy en Rionegro?",
  "Que programas tiene la Alcaldia?",
  "Cuales son las noticias mas recientes?",
  "Donde puedo poner una queja o solicitud?",
  "Where is Rionegro City Hall?",
] as const;

export const officialFaqEntries = [
  {
    question: "Que es Rionegro?",
    answer:
      "Rionegro es un municipio del departamento de Antioquia, ubicado en el Oriente antioqueno. Es uno de los principales centros economicos y logisticos de la region y es conocido por ser la cuna de la Constitucion de 1863.",
    category: "Municipio",
  },
  {
    question: "Que importancia tiene Rionegro?",
    answer:
      "Rionegro es clave para el desarrollo de Antioquia, ya que concentra actividad industrial, comercial y logistica. Ademas, cuenta con el Aeropuerto Internacional Jose Maria Cordova, uno de los mas importantes del pais.",
    category: "Municipio",
  },
  {
    question: "Donde queda Rionegro?",
    answer:
      "Rionegro esta ubicado en el departamento de Antioquia, en el Oriente antioqueno, a aproximadamente 45 minutos de Medellin.",
    category: "Municipio",
  },
  {
    question: "Quien es el alcalde de Rionegro?",
    answer:
      "El alcalde de Rionegro es Jorge Humberto Rivas Urrea, quien lidera la administracion municipal en el periodo 2024 - 2027.",
    category: "Alcaldia",
  },
  {
    question: "Que hace la Alcaldia?",
    answer:
      "La Alcaldia de Rionegro se encarga de la administracion del municipio, incluyendo seguridad, obras, educacion, salud y desarrollo economico.",
    category: "Alcaldia",
  },
  {
    question: "Donde puedo poner una queja o solicitud?",
    answer:
      "Puedes hacerlo a traves de los canales oficiales de la Alcaldia o participando en programas como La Alcaldia te Escucha, donde los ciudadanos pueden expresar sus inquietudes directamente.",
    category: "Atencion ciudadana",
  },
] as const;

const officialFaqEntriesEn = [
  {
    question: "What is Rionegro?",
    answer:
      "Rionegro is a municipality in the department of Antioquia, located in Eastern Antioquia. It is one of the region's main economic and logistics centers and is known as the cradle of the 1863 Constitution.",
    category: "Municipality",
  },
  {
    question: "Why is Rionegro important?",
    answer:
      "Rionegro is key to Antioquia's development because it concentrates industrial, commercial and logistics activity. It is also home to Jose Maria Cordova International Airport, one of the most important airports in Colombia.",
    category: "Municipality",
  },
  {
    question: "Where is Rionegro located?",
    answer:
      "Rionegro is located in the department of Antioquia, in Eastern Antioquia, about 45 minutes from Medellin.",
    category: "Municipality",
  },
  {
    question: "Who is the mayor of Rionegro?",
    answer:
      "The mayor of Rionegro is Jorge Humberto Rivas Urrea, who leads the municipal administration for the 2024 - 2027 term.",
    category: "City Hall",
  },
  {
    question: "What does the City Hall do?",
    answer:
      "The Rionegro City Hall manages the municipality, including public safety, public works, education, health and economic development.",
    category: "City Hall",
  },
  {
    question: "Where can I file a complaint or request?",
    answer:
      "You can do it through the official City Hall channels or through programs such as La Alcaldia te Escucha, where residents can share their concerns directly.",
    category: "Citizen services",
  },
] as const;

export function buildOfficialKnowledgeEntries() {
  return [
    ...officialFaqEntries,
    ...officialFaqEntriesEn,
    {
      question: "Datos de contacto de la Alcaldia de Rionegro",
      answer:
        `Direccion: ${municipalityContact.address}. Telefono: ${municipalityContact.phone}. Correo de atencion: ${municipalityContact.citizenEmail}. Correo judicial: ${municipalityContact.judicialEmail}. Correo de transito: ${municipalityContact.transitEmail}. Correo de rentas: ${municipalityContact.taxesEmail}. Correo de valorizacion: ${municipalityContact.valuationEmail}.`,
      category: "Contacto",
    },
    {
      question: "Horario de atencion de la Alcaldia",
      answer:
        `Lunes a jueves: ${municipalityContact.schedule.mondayThursday}. Viernes: ${municipalityContact.schedule.friday}.`,
      category: "Contacto",
    },
    {
      question: "Historia e importancia de Rionegro",
      answer: municipalityHistory,
      category: "Historia",
    },
    {
      question: "Perfil general del municipio de Rionegro",
      answer:
        `Rionegro pertenece a ${municipalityProfile.department}, en el ${municipalityProfile.region}. Fue fundado en ${municipalityProfile.foundation} por ${municipalityProfile.founder}. Es conocido como ${municipalityProfile.nickname} y alberga el ${municipalityProfile.airport}.`,
      category: "Municipio",
    },
    {
      question: "Informacion del alcalde de Rionegro",
      answer:
        `${mayorProfile.name} es el ${mayorProfile.role} para el periodo ${mayorProfile.period}. ${mayorProfile.description}`,
      category: "Alcaldia",
    },
    {
      question: "Funciones generales de la Alcaldia de Rionegro",
      answer: mayorOfficeSummary,
      category: "Alcaldia",
    },
    {
      question: "Secretarias principales de la Alcaldia de Rionegro",
      answer: officialSecretaries
        .map((item) => `${item.name}: ${item.function}`)
        .join(" "),
      category: "Secretarias",
    },
    {
      question: "Programas destacados de la Alcaldia de Rionegro",
      answer: officialPrograms
        .map((item) => `${item.name}: ${item.description}`)
        .join(" "),
      category: "Programas",
    },
    {
      question: "Que tramites puedo realizar en la Alcaldia de Rionegro?",
      answer:
        `En la Alcaldia de Rionegro puedes realizar tramites y consultas relacionados con ${institutionalServices
          .slice(0, 6)
          .map((service) => service.titleEs.toLowerCase())
          .join(", ")}. La sede principal esta en ${municipalityContact.address}. Si quieres, puedo ayudarte a ubicar una dependencia especifica.`,
      category: "Tramites",
    },
    {
      question: "Cual es el horario de atencion de la Alcaldia y sus dependencias?",
      answer:
        `El horario general de atencion es: lunes a jueves ${municipalityContact.schedule.mondayThursday}; viernes ${municipalityContact.schedule.friday}. Algunas dependencias pueden tener variaciones, pero este es el horario institucional base.`,
      category: "Horario",
    },
    {
      question: "Lineamientos del asistente oficial de la Alcaldia",
      answer: assistantRules.join(" "),
      category: "Asistente",
    },
    {
      question: "Contact information for Rionegro City Hall",
      answer:
        `Address: ${municipalityContact.address}. Phone: ${municipalityContact.phone}. Citizen services email: ${municipalityContact.citizenEmail}. Legal email: ${municipalityContact.judicialEmail}. Transit email: ${municipalityContact.transitEmail}. Taxes email: ${municipalityContact.taxesEmail}. Valuation email: ${municipalityContact.valuationEmail}.`,
      category: "Contact",
    },
    {
      question: "Rionegro City Hall opening hours",
      answer:
        `Monday to Thursday: ${municipalityContact.schedule.mondayThursday}. Friday: ${municipalityContact.schedule.friday}.`,
      category: "Contact",
    },
    {
      question: "History and importance of Rionegro",
      answer:
        "Rionegro is one of the most important municipalities in Antioquia, located in the San Nicolas Valley in Eastern Antioquia. It was founded in 1541 by Alvaro de Mendoza. During the colonial period it became a key political, economic and cultural center in Antioquia. In 1863 it hosted the Convention of Rionegro, where the Constitution of the United States of Colombia was drafted. That is why it is known as the cradle of the 1863 Constitution. Today it is recognized for its economic development, infrastructure, urban growth and for hosting Jose Maria Cordova International Airport.",
      category: "History",
    },
    {
      question: "General profile of the municipality of Rionegro",
      answer:
        `Rionegro is located in ${municipalityProfile.department}, in ${municipalityProfile.region}. It was founded in ${municipalityProfile.foundation} by ${municipalityProfile.founder}. It is known as ${municipalityProfile.nickname} and is home to ${municipalityProfile.airport}.`,
      category: "Municipality",
    },
    {
      question: "Information about the mayor of Rionegro",
      answer:
        `${mayorProfile.name} is the ${mayorProfile.role} for the ${mayorProfile.period} term. ${mayorProfile.description}`,
      category: "City Hall",
    },
    {
      question: "General functions of the Rionegro City Hall",
      answer:
        "The mayor of Rionegro is the highest municipal authority and is responsible for public administration, public works, safety, education and economic development. The municipal administration works on infrastructure, mobility, public safety, culture, education and economic development.",
      category: "City Hall",
    },
    {
      question: "Main secretariats of the Rionegro City Hall",
      answer: officialSecretaries
        .map((item) => `${item.name}: ${item.function}`)
        .join(" "),
      category: "Secretariats",
    },
    {
      question: "Featured programs of the Rionegro City Hall",
      answer: officialPrograms
        .map((item) => `${item.name}: ${item.description}`)
        .join(" "),
      category: "Programs",
    },
    {
      question: "What procedures can I do at the Rionegro City Hall?",
      answer:
        `At the Rionegro City Hall you can complete procedures and consultations related to ${institutionalServices
          .slice(0, 6)
          .map((service) => service.titleEn.toLowerCase())
          .join(", ")}. The main headquarters is located at ${municipalityContact.address}. If you want, I can help you locate a specific office.`,
      category: "Procedures",
    },
    {
      question: "What are the opening hours of the City Hall and its offices?",
      answer:
        `The general service hours are Monday to Thursday ${municipalityContact.schedule.mondayThursday}; Friday ${municipalityContact.schedule.friday}. Some offices may vary, but this is the institutional base schedule.`,
      category: "Hours",
    },
    {
      question: "Guidelines of the official assistant",
      answer:
        "Respond as the official assistant of the Rionegro City Hall. Keep an institutional, clear and helpful tone. Prioritize official information. Do not invent facts. Recommend official channels when needed. Stay within information related to Rionegro. Reply in Spanish or English depending on the user's language.",
      category: "Assistant",
    },
  ];
}

export function buildOfficialAnnouncements(now = new Date()) {
  const todayKey = now.toISOString().slice(0, 10);

  return [
    ...officialEvents.map((item) => ({
      title: item.title,
      message: item.description,
      location: item.location,
      type: item.type,
      scheduledAt: `${item.date}T09:00:00.000Z`,
      status:
        item.date >= todayKey
          ? ("SCHEDULED" as AnnouncementStatus)
          : ("SENT" as AnnouncementStatus),
    })),
    ...officialNews.map((item) => ({
      title: item.title,
      message: item.description,
      location: null,
      type: item.type,
      scheduledAt: `${item.date}T14:00:00.000Z`,
      status: "SENT" as AnnouncementStatus,
    })),
    ...officialAlerts.map((item) => ({
      title: item.title,
      message: item.description,
      location: item.location,
      type: item.type,
      scheduledAt: `${item.date}T16:00:00.000Z`,
      status: "SENT" as AnnouncementStatus,
    })),
  ];
}
