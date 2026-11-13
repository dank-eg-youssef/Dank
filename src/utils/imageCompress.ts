/**
 * Compresses an uploaded image file on an offscreen canvas so it safely
 * fits inside Firestore document payload bounds without losing sharpness.
 */
export async function compressImageFile(
  file: File,
  options: { maxDimension?: number; maxChars?: number; initialQuality?: number } = {}
): Promise<string> {
  const maxDimension = options.maxDimension ?? 960;
  const maxChars = options.maxChars ?? 360000;
  const initialQuality = options.initialQuality ?? 0.78;

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Invalid image file'));
    image.src = dataUrl;
  });

  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;
  if (width > maxDimension || height > maxDimension) {
    const ratio = Math.min(maxDimension / width, maxDimension / height);
    width = Math.max(1, Math.round(width * ratio));
    height = Math.max(1, Math.round(height * ratio));
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not initialize image canvas');
  }

  ctx.drawImage(img, 0, 0, width, height);

  let quality = initialQuality;
  let result = canvas.toDataURL('image/jpeg', quality);
  while (result.length > maxChars && quality > 0.32) {
    quality -= 0.1;
    result = canvas.toDataURL('image/jpeg', quality);
  }

  if (result.length > maxChars) {
    // Downscale further if still too large
    const scale = 0.65;
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    result = canvas.toDataURL('image/jpeg', 0.65);
  }

  if (result.length > maxChars) {
    throw new Error('Image is too large even after compression. Please pick a smaller photo.');
  }

  return result;
}
