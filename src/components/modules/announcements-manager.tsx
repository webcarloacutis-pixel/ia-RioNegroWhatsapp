"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { Edit3, FileAudio, ImagePlus, Send, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PanelCard } from "@/components/ui/panel-card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ANNOUNCEMENT_TYPE_VALUES } from "@/lib/constants";
import {
  formatDateTime,
  formatStatusLabel,
  formatTypeLabel,
  toDateTimeLocalValue,
} from "@/lib/format";
import type { AnnouncementSummary, SegmentSummary } from "@/lib/types";

type AnnouncementsManagerProps = {
  announcements: AnnouncementSummary[];
  segments: SegmentSummary[];
};

type AnnouncementFormState = {
  title: string;
  message: string;
  location: string;
  type: string;
  scheduledAt: string;
  segmentId: string;
  imageUrl: string | null;
  imagePublicId: string | null;
  imageFilename: string | null;
  imageMimeType: string | null;
  imageSize: number | null;
  imageProvider: string | null;
  audioUrl: string | null;
  audioPublicId: string | null;
  audioFilename: string | null;
  audioMimeType: string | null;
  audioSize: number | null;
  audioDuration: number | null;
  audioProvider: string | null;
};

const initialForm: AnnouncementFormState = {
  title: "",
  message: "",
  location: "",
  type: "GENERAL",
  scheduledAt: "",
  segmentId: "",
  imageUrl: null,
  imagePublicId: null,
  imageFilename: null,
  imageMimeType: null,
  imageSize: null,
  imageProvider: null,
  audioUrl: null,
  audioPublicId: null,
  audioFilename: null,
  audioMimeType: null,
  audioSize: null,
  audioDuration: null,
  audioProvider: null,
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const ALLOWED_AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/aac",
]);
const ALLOWED_AUDIO_EXTENSIONS = new Set(["mp3", "m4a", "ogg", "oga", "wav", "webm", "aac"]);

function getAnnouncementStatusTone(status: AnnouncementSummary["status"]) {
  if (status === "SENT" || status === "SENT_REAL") return "success";
  if (status === "FAILED" || status === "BLOCKED_BY_SAFE_MODE") return "danger";
  if (status === "SENDING") return "info";
  if (status === "SENT_SIMULATED") return "warning";
  return "warning";
}

function getAnnouncementStatusNotice(status: AnnouncementSummary["status"]) {
  if (status === "BLOCKED_BY_SAFE_MODE") {
    return "No se envio real porque WHATSAPP_SAFE_MODE esta activo.";
  }

  if (status === "FAILED") {
    return "Si fallo por destinatarios, revisa que el segmento tenga numeros o que ULTRAMSG_DEFAULT_TO este configurado.";
  }

  return null;
}

export function AnnouncementsManager({
  announcements,
  segments,
}: AnnouncementsManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AnnouncementFormState>(initialForm);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);

  const sortedAnnouncements = useMemo(
    () =>
      [...announcements].sort(
        (left, right) =>
          new Date(right.scheduledAt).getTime() - new Date(left.scheduledAt).getTime(),
      ),
    [announcements],
  );
  const availableTypes = useMemo(
    () =>
      Array.from(
        new Set([
          ...ANNOUNCEMENT_TYPE_VALUES,
          ...announcements.map((announcement) => announcement.displayType),
          form.type,
        ]),
      ).filter(Boolean),
    [announcements, form.type],
  );

  function resetForm() {
    setEditingId(null);
    setForm(initialForm);
  }

  async function request(url: string, options?: RequestInit) {
    const response = await fetch(url, options);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "No se pudo procesar la solicitud.");
    }

    return payload.data;
  }

  function getImageExtension(filename: string) {
    const extension = filename.split(".").pop()?.toLowerCase();
    return extension || "";
  }

  function getAudioExtension(filename: string) {
    const extension = filename.split(".").pop()?.toLowerCase();
    return extension || "";
  }

  function formatFileSize(size: number | null) {
    if (!size) return "Tamano no disponible";
    if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  function formatDuration(duration: number | null) {
    if (!duration) return null;
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  function validateImageBeforeUpload(file: File) {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.type)) {
      return "Solo se permiten imagenes JPG, PNG o WebP.";
    }

    if (!ALLOWED_IMAGE_EXTENSIONS.has(getImageExtension(file.name))) {
      return "La extension debe ser jpg, jpeg, png o webp.";
    }

    if (file.size > MAX_IMAGE_BYTES) {
      return "La imagen no puede superar 5 MB.";
    }

    return null;
  }

  function validateAudioBeforeUpload(file: File) {
    if (!ALLOWED_AUDIO_MIME_TYPES.has(file.type)) {
      return "Solo se permiten audios MP3, M4A, OGG, WAV, WEBM o AAC.";
    }

    if (!ALLOWED_AUDIO_EXTENSIONS.has(getAudioExtension(file.name))) {
      return "La extension debe ser mp3, m4a, ogg, oga, wav, webm o aac.";
    }

    if (file.size > MAX_AUDIO_BYTES) {
      return "El audio no puede superar 15 MB.";
    }

    return null;
  }

  async function handleImageUpload(file: File) {
    const validationError = validateImageBeforeUpload(file);

    if (validationError) {
      toast.error(validationError);
      return;
    }

    const body = new FormData();
    body.append("file", file);
    setIsUploadingImage(true);

    try {
      const response = await fetch("/api/admin/uploads/announcement-image", {
        method: "POST",
        body,
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "No se pudo subir la imagen.");
      }

      const image = payload.image as {
        url: string;
        secureUrl: string;
        publicId: string;
        filename: string;
        mimeType: string;
        size: number;
        provider: string;
      };

      setForm((current) => ({
        ...current,
        imageUrl: image.secureUrl || image.url,
        imagePublicId: image.publicId,
        imageFilename: image.filename,
        imageMimeType: image.mimeType,
        imageSize: image.size,
        imageProvider: image.provider,
      }));
      toast.success("Flyer subido.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo subir la imagen.");
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleAudioUpload(file: File) {
    const validationError = validateAudioBeforeUpload(file);

    if (validationError) {
      toast.error(validationError);
      return;
    }

    const body = new FormData();
    body.append("file", file);
    setIsUploadingAudio(true);

    try {
      const response = await fetch("/api/admin/uploads/announcement-audio", {
        method: "POST",
        body,
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "No se pudo subir el audio.");
      }

      const audio = payload.audio as {
        url: string;
        secureUrl: string;
        publicId: string;
        filename: string;
        mimeType: string;
        size: number;
        duration?: number;
        provider: string;
      };

      setForm((current) => ({
        ...current,
        audioUrl: audio.secureUrl || audio.url,
        audioPublicId: audio.publicId,
        audioFilename: audio.filename,
        audioMimeType: audio.mimeType,
        audioSize: audio.size,
        audioDuration: audio.duration ?? null,
        audioProvider: audio.provider,
      }));
      toast.success("Audio subido.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo subir el audio.");
    } finally {
      setIsUploadingAudio(false);
      if (audioInputRef.current) {
        audioInputRef.current.value = "";
      }
    }
  }

  function removeImage() {
    setForm((current) => ({
      ...current,
      imageUrl: null,
      imagePublicId: null,
      imageFilename: null,
      imageMimeType: null,
      imageSize: null,
      imageProvider: null,
    }));
  }

  function removeAudio() {
    setForm((current) => ({
      ...current,
      audioUrl: null,
      audioPublicId: null,
      audioFilename: null,
      audioMimeType: null,
      audioSize: null,
      audioDuration: null,
      audioProvider: null,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const url = editingId ? `/api/announcements/${editingId}` : "/api/announcements";
      const method = editingId ? "PATCH" : "POST";
      await request(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          location: form.location || null,
          segmentId: form.segmentId || null,
        }),
      });

      toast.success(editingId ? "Comunicado actualizado." : "Comunicado creado.");
      resetForm();
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar.");
    }
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm("Deseas eliminar este comunicado?");
    if (!confirmed) return;

    try {
      await request(`/api/announcements/${id}`, { method: "DELETE" });
      toast.success("Comunicado eliminado.");
      if (editingId === id) resetForm();
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar.");
    }
  }

  async function handleSimulate(id: string) {
    try {
      const data = await request(`/api/announcements/${id}/simulate`, {
        method: "POST",
      });
      toast.success(data.feedback);
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo simular el envio.");
    }
  }

  async function handleSendNow(announcement: AnnouncementSummary) {
    const confirmed = window.confirm(
      `Vas a enviar "${announcement.title}" ahora.${
        announcement.imageUrl ? "\nIncluye flyer adjunto." : ""
      }${announcement.audioUrl ? "\nIncluye audio adjunto." : ""
      }\nDeseas continuar?`,
    );
    if (!confirmed) return;

    try {
      const data = await request(`/api/announcements/${announcement.id}/send`, {
        method: "POST",
      });
      toast.success(data.feedback);
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo enviar.");
    }
  }

  function startEditing(announcement: AnnouncementSummary) {
    setEditingId(announcement.id);
    setForm({
      title: announcement.title,
      message: announcement.message,
      location: announcement.location ?? "",
      type: announcement.displayType,
      scheduledAt: toDateTimeLocalValue(announcement.scheduledAt),
      segmentId: announcement.segment?.id ?? "",
      imageUrl: announcement.imageUrl,
      imagePublicId: announcement.imagePublicId,
      imageFilename: announcement.imageFilename,
      imageMimeType: announcement.imageMimeType,
      imageSize: announcement.imageSize,
      imageProvider: announcement.imageProvider,
      audioUrl: announcement.audioUrl,
      audioPublicId: announcement.audioPublicId,
      audioFilename: announcement.audioFilename,
      audioMimeType: announcement.audioMimeType,
      audioSize: announcement.audioSize,
      audioDuration: announcement.audioDuration,
      audioProvider: announcement.audioProvider,
    });
  }

  return (
    <div className="space-y-6">
      <section className="panel-card rounded-[34px] px-7 py-8">
        <Badge tone="info">Modulo de comunicados</Badge>
        <h1 className="mt-4 text-4xl text-foreground">Crea, organiza y activa informacion oficial</h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-muted">
          Disenado para que el equipo de la Alcaldia pueda cargar mensajes claros, programarlos y
          enviarlos por WhatsApp a numeros generales o a los destinatarios asociados a cada
          segmento.
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <PanelCard className="space-y-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
              {editingId ? "Editar comunicado" : "Nuevo comunicado"}
            </p>
            <h2 className="mt-2 text-2xl text-foreground">
              {editingId ? "Actualiza la pieza seleccionada" : "Carga un nuevo mensaje institucional"}
            </h2>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-foreground">Titulo</span>
              <Input
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="Ej. Jornada de desparasitacion gratuita"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-foreground">Tipo</span>
                <Input
                  value={form.type}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, type: event.target.value }))
                  }
                  list="announcement-type-options"
                  placeholder="Ej. Evento, Feria de empleo o Salud publica"
                />
                <datalist id="announcement-type-options">
                  {availableTypes.map((type) => (
                    <option key={type} value={type}>
                      {formatTypeLabel(type)}
                    </option>
                  ))}
                </datalist>
                <p className="text-xs text-muted">
                  Puedes elegir una categoria existente o escribir una nueva.
                </p>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-foreground">Fecha y hora</span>
                <Input
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, scheduledAt: event.target.value }))
                  }
                />
              </label>
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-foreground">Lugar</span>
              <Input
                value={form.location}
                onChange={(event) =>
                  setForm((current) => ({ ...current, location: event.target.value }))
                }
                placeholder="Ej. Biblioteca Baldomero Sanin"
              />
            </label>

            <label className="block space-y-2">
              <span className="flex items-center justify-between gap-3 text-sm font-semibold text-foreground">
                <span>Segmento</span>
                <Link
                  href="/dashboard/segmentacion"
                  className="text-xs font-medium text-primary transition hover:opacity-80"
                >
                  Crear o editar segmentos
                </Link>
              </span>
              <Select
                value={form.segmentId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, segmentId: event.target.value }))
                }
              >
                <option value="">Cobertura general</option>
                {segments.map((segment) => (
                  <option key={segment.id} value={segment.id}>
                    {segment.name} ({segment.recipientCount} numeros)
                  </option>
                ))}
              </Select>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-foreground">Mensaje</span>
              <Textarea
                value={form.message}
                onChange={(event) =>
                  setForm((current) => ({ ...current, message: event.target.value }))
                }
                placeholder="Escribe el comunicado con tono institucional y foco ciudadano."
              />
            </label>

            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Flyer o imagen</p>
                  <p className="mt-1 text-xs text-muted">
                    Opcional: sube un flyer existente para acompanar el comunicado.
                  </p>
                </div>
                {form.imageUrl ? <Badge tone="success">Con imagen</Badge> : null}
              </div>

              <input
                ref={fileInputRef}
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleImageUpload(file);
                }}
              />

              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  className="gap-2"
                  disabled={isUploadingImage}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="size-4" />
                  {isUploadingImage ? "Subiendo..." : form.imageUrl ? "Cambiar flyer" : "Subir flyer"}
                </Button>
                {form.imageUrl ? (
                  <Button type="button" variant="ghost" className="gap-2" onClick={removeImage}>
                    <X className="size-4" />
                    Quitar imagen
                  </Button>
                ) : null}
              </div>

              {form.imageUrl ? (
                <div className="flex items-center gap-4">
                  <Image
                    src={form.imageUrl}
                    alt="Vista previa del flyer"
                    width={96}
                    height={96}
                    className="h-24 w-24 rounded-lg border border-border object-cover"
                  />
                  <div className="min-w-0 text-sm text-muted">
                    <p className="truncate font-medium text-foreground">
                      {form.imageFilename ?? "Flyer cargado"}
                    </p>
                    <p>{form.imageMimeType ?? "imagen"}</p>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Audio o nota de voz</p>
                  <p className="mt-1 text-xs text-muted">
                    Opcional: sube una nota de voz o audio. MP3, M4A, OGG, WAV, WEBM o AAC. Maximo 15 MB.
                  </p>
                </div>
                {form.audioUrl ? <Badge tone="success">Con audio</Badge> : null}
              </div>

              <input
                ref={audioInputRef}
                className="sr-only"
                type="file"
                accept="audio/mpeg,audio/mp3,audio/mp4,audio/m4a,audio/ogg,audio/wav,audio/webm,audio/aac"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleAudioUpload(file);
                }}
              />

              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  className="gap-2"
                  disabled={isUploadingAudio}
                  onClick={() => audioInputRef.current?.click()}
                >
                  <FileAudio className="size-4" />
                  {isUploadingAudio ? "Subiendo..." : form.audioUrl ? "Cambiar audio" : "Subir audio"}
                </Button>
                {form.audioUrl ? (
                  <Button type="button" variant="ghost" className="gap-2" onClick={removeAudio}>
                    <X className="size-4" />
                    Quitar audio
                  </Button>
                ) : null}
              </div>

              {form.audioUrl ? (
                <div className="space-y-3 rounded-lg border border-border bg-white p-3">
                  <audio controls className="w-full" src={form.audioUrl}>
                    Tu navegador no puede reproducir este audio.
                  </audio>
                  <div className="min-w-0 text-sm text-muted">
                    <p className="truncate font-medium text-foreground">
                      {form.audioFilename ?? "Audio cargado"}
                    </p>
                    <p>
                      {form.audioMimeType ?? "audio"} - {formatFileSize(form.audioSize)}
                      {formatDuration(form.audioDuration)
                        ? ` - ${formatDuration(form.audioDuration)}`
                        : ""}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={isPending}>
                {editingId ? "Actualizar comunicado" : "Crear comunicado"}
              </Button>
              {editingId ? (
                <Button variant="ghost" onClick={resetForm}>
                  Cancelar edicion
                </Button>
              ) : null}
            </div>
          </form>
        </PanelCard>

        <PanelCard className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
                Bandeja institucional
              </p>
              <h2 className="mt-2 text-2xl text-foreground">Comunicados creados</h2>
            </div>
            <Badge tone="info">{sortedAnnouncements.length} registrados</Badge>
          </div>

          <div className="space-y-4">
            {sortedAnnouncements.map((announcement) => (
              <article
                key={announcement.id}
                className="rounded-[28px] border border-border bg-white p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold text-foreground">{announcement.title}</p>
                      <Badge tone="info">{formatTypeLabel(announcement.displayType)}</Badge>
                      <Badge tone={getAnnouncementStatusTone(announcement.status)}>
                        {formatStatusLabel(announcement.status)}
                      </Badge>
                      {announcement.imageUrl ? <Badge tone="success">Con imagen</Badge> : null}
                      {announcement.audioUrl ? <Badge tone="success">Con audio</Badge> : null}
                    </div>
                    <p className="mt-3 text-sm leading-7 text-muted">{announcement.message}</p>
                  </div>
                  {announcement.imageUrl ? (
                    <Image
                      src={announcement.imageUrl}
                      alt={`Flyer de ${announcement.title}`}
                      width={96}
                      height={96}
                      className="h-24 w-24 rounded-lg border border-border object-cover"
                    />
                  ) : null}
                </div>

                {announcement.audioUrl ? (
                  <div className="mt-4 space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                    <audio controls className="w-full" src={announcement.audioUrl}>
                      Tu navegador no puede reproducir este audio.
                    </audio>
                    <p className="truncate text-xs text-muted">
                      {announcement.audioFilename ?? "Audio cargado"} - {formatFileSize(announcement.audioSize)}
                    </p>
                  </div>
                ) : null}

                {getAnnouncementStatusNotice(announcement.status) ? (
                  <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3 text-sm font-semibold text-foreground">
                    {getAnnouncementStatusNotice(announcement.status)}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted">
                  <span>{formatDateTime(announcement.scheduledAt)}</span>
                  <span>-</span>
                  <span>{announcement.location ?? "Sin lugar definido"}</span>
                  <span>-</span>
                  <span>{announcement.segment?.name ?? "Cobertura general"}</span>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <Button
                    variant="secondary"
                    className="gap-2"
                    onClick={() => startEditing(announcement)}
                  >
                    <Edit3 className="size-4" />
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    className="gap-2"
                    onClick={() => handleSimulate(announcement.id)}
                    disabled={announcement.status === "SENDING"}
                  >
                    <Sparkles className="size-4" />
                    Simular envio
                  </Button>
                  <Button
                    variant="primary"
                    className="gap-2"
                    onClick={() => handleSendNow(announcement)}
                    disabled={announcement.status === "SENDING"}
                  >
                    <Send className="size-4" />
                    Enviar ahora
                  </Button>
                  <Button
                    variant="danger"
                    className="gap-2"
                    onClick={() => handleDelete(announcement.id)}
                  >
                    <Trash2 className="size-4" />
                    Eliminar
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </PanelCard>
      </div>
    </div>
  );
}
