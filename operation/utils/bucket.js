import axios from "axios";
import path from "path";

import { getDownloadURL } from "firebase-admin/storage";

/**
 * @param {import("firebase-admin").app.App} admin
 * @param {string} filePath
 * @param {string} destination
 * @param {"pdf" | "png" | "jpg"} format
 * @param {boolean} [emulator]
 */
export async function uploadFileToFirebase(
  admin,
  filePath,
  destination,
  format,
  emulator = false
) {
  if (emulator) return "Hello, world";

  const bucket = admin.storage().bucket();

  for (let count = 1; count < 20; count++) {
    try {
      await bucket.upload(filePath, {
        destination: destination,
        metadata: {
          contentType:
            format === "pdf"
              ? "application/pdf"
              : format === "png"
              ? "image/png"
              : format === "jpg"
              ? "image/jpeg"
              : format,
        },
      });

      const file = bucket.file(destination);
      return getDownloadURL(file);
    } catch (error) {
      console.error(
        count,
        "Error uploading to Firebase Storage:",
        destination,
        error
      );
    }
  }
}

/**
 * @param {string} downloadUrl
 */
export async function downloadFileAsBuffer(downloadUrl) {
  const response = await axios.get(downloadUrl, {
    responseType: "arraybuffer",
  });
  return Buffer.from(response.data, "binary");
}

/**
 * @param {import("firebase-admin").app.App} admin
 * @param {any} buffer
 * @param {string} destination
 * @param {"pdf" | "png" | "jpg"} format
 */
export async function uploadBufferToFirebase(
  admin,
  buffer,
  destination,
  format
) {
  const bucket = admin.storage().bucket();
  const file = bucket.file(destination);

  await file.save(buffer, {
    metadata: {
      contentType:
        format === "pdf"
          ? "application/pdf"
          : format === "png"
          ? "image/png"
          : format === "jpg"
          ? "image/jpeg"
          : format,
    },
  });

  return getDownloadURL(file);
}

/**
 * @param {string} url
 * @returns {{ bucket: string, path: string }}
 */
export function parseFirebaseStorageURL(url) {
  const bucketMatch = url.match(/\/b\/([^/]+)\//);
  const pathMatch = url.match(/\/o\/([^?]+)\?/);

  if (!bucketMatch || !pathMatch) return null;

  const bucket = bucketMatch[1]; // e.g. giyoung.appspot.com
  const path = decodeURIComponent(pathMatch[1]); // e.g. organizations/.../0000.png.png

  return { bucket, path };
}

/**
 * @param {import("firebase-admin").app.App} admin
 * @param {string} source
 * @param {string} destination
 * @param {boolean} [isEmulator]
 */
export async function copyFirebaseFile(
  admin,
  source,
  destination,
  isEmulator = false
) {
  if (isEmulator) return "Hello, world";

  const bucket = admin.storage().bucket();
  await bucket.file(source).copy(destination);

  return getDownloadURL(bucket.file(destination));
}

/**
 * @param {import("firebase-admin").app.App} admin
 * @param {string} imagePath
 * @param {string} destination
 */
export async function uploadImageToFirebase(
  admin,
  imagePath,
  destination,
  bucketName = undefined
) {
  const bucket = bucketName
    ? admin.storage().bucket(bucketName)
    : admin.storage().bucket();

  for (let count = 1; count < 20; count++) {
    try {
      await bucket.upload(imagePath, {
        destination: destination,
        metadata: {
          contentType:
            path.extname(imagePath).toLowerCase() === ".jpg" ||
            path.extname(imagePath).toLowerCase() === ".jpeg"
              ? "image/jpeg"
              : "image/png",
        },
      });

      const file = bucket.file(destination);
      return getDownloadURL(file);
    } catch (error) {
      console.error(
        count,
        "Error uploading to Firebase Storage:",
        destination,
        error
      );
    }
  }
}

/**
 * @param {import("firebase-admin").app.App} admin
 * @param {string} mp3Path
 * @param {string} destination
 */
export async function uploadMp3ToFirebase(admin, mp3Path, destination) {
  const bucket = admin.storage().bucket();

  for (let count = 1; count < 20; count++) {
    try {
      await bucket.upload(mp3Path, {
        destination: destination,
        metadata: {
          contentType: "audio/mpeg",
        },
      });

      const file = bucket.file(destination);
      return getDownloadURL(file);
    } catch (error) {
      console.error(
        count,
        "Error uploading to Firebase Storage:",
        destination,
        error
      );
    }
  }
}

/**
 * @param {import("firebase-admin").app.App} admin
 * @param {string} filePath
 */
export async function deleteFile(admin, filePath) {
  try {
    const bucket = admin.storage().bucket();
    await bucket.file(filePath).delete();
  } catch (error) {
    console.error(`Error deleting file: ${error.message}`);
  }
}
