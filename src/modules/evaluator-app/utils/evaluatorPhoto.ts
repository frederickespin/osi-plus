export type CapturedPhoto = {
  id: string;
  dataUrl: string;
  fileName: string;
  mimeType: string;
  capturedAt: string;
  sizeBytes: number;
  width?: number;
  height?: number;
};

type PhotoOptions = {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  maxBytes?: number;
};

function buildPhotoId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `photo-${crypto.randomUUID()}`;
  }
  return `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readImageDimensions(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      const img = new Image();
      img.onerror = () => reject(new Error("No se pudo procesar la imagen."));
      img.onload = () => resolve({ dataUrl, width: img.width, height: img.height });
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export async function compressPhotoFile(
  file: File,
  options?: PhotoOptions,
): Promise<CapturedPhoto> {
  const { dataUrl, width, height } = await readImageDimensions(file);
  const maxWidth = options?.maxWidth ?? 1280;
  const maxHeight = options?.maxHeight ?? 1280;
  const baseQuality = options?.quality ?? 0.72;
  const maxBytes = options?.maxBytes;

  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  let targetWidth = Math.max(1, Math.round(width * scale));
  let targetHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    return {
      id: buildPhotoId(),
      dataUrl,
      fileName: file.name,
      mimeType: file.type || "image/jpeg",
      capturedAt: new Date().toISOString(),
      sizeBytes: file.size,
      width,
      height,
    };
  }

  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onerror = () => reject(new Error("No se pudo renderizar la imagen."));
    image.onload = () => resolve();
    image.src = dataUrl;
  });

  let quality = baseQuality;
  let compressedDataUrl = dataUrl;
  let sizeBytes = file.size;
  let attempts = 0;

  const renderCompressed = () => {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    context.clearRect(0, 0, targetWidth, targetHeight);
    context.drawImage(image, 0, 0, targetWidth, targetHeight);
    const nextDataUrl = canvas.toDataURL("image/jpeg", quality);
    const base64Payload = nextDataUrl.split(",")[1] || "";
    return {
      dataUrl: nextDataUrl,
      sizeBytes: Math.round((base64Payload.length * 3) / 4),
    };
  };

  ({ dataUrl: compressedDataUrl, sizeBytes } = renderCompressed());

  while (maxBytes && sizeBytes > maxBytes && attempts < 8) {
    attempts += 1;
    if (quality > 0.42) {
      quality = Math.max(0.42, quality - 0.08);
    } else {
      targetWidth = Math.max(96, Math.round(targetWidth * 0.85));
      targetHeight = Math.max(96, Math.round(targetHeight * 0.85));
    }
    ({ dataUrl: compressedDataUrl, sizeBytes } = renderCompressed());
  }

  return {
    id: buildPhotoId(),
    dataUrl: compressedDataUrl,
    fileName: file.name,
    mimeType: "image/jpeg",
    capturedAt: new Date().toISOString(),
    sizeBytes,
    width: targetWidth,
    height: targetHeight,
  };
}

export function formatPhotoSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
}
