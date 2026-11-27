import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

export type PhotoResult = { kind: "ok"; base64: string } | { kind: "cancelled" } | { kind: "denied" };

/**
 * Takes or picks one photo and returns it small enough to send: 1024 px wide
 * JPEG. Shrinking it keeps uploads fast on bad signal and cheap to read.
 */
export async function getMealPhoto(from: "camera" | "library"): Promise<PhotoResult> {
  if (from === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return { kind: "denied" };
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.8, exif: false };
  const picked =
    from === "camera"
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (picked.canceled || !picked.assets[0]) return { kind: "cancelled" };

  const asset = picked.assets[0];
  const context = ImageManipulator.manipulate(asset.uri);
  if (!asset.width || asset.width > 1024) context.resize({ width: 1024 });
  const rendered = await context.renderAsync();
  const out = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.6, base64: true });
  if (!out.base64) throw new Error("The photo could not be prepared.");
  return { kind: "ok", base64: out.base64 };
}
