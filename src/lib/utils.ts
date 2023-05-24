import * as crypto from "crypto";
import { audioPaddingInSeconds } from "./constants";

const secretKey = process.env.ENCRYPTION_SECRET as string;

export function encryptString(plaintext: string) {
  const key = crypto
    .createHash("sha256")
    .update(secretKey)
    .digest("base64")
    .slice(0, 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(plaintext);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptString(ciphertext: string) {
  const [ivHex, encryptedHex] = ciphertext.split(":");
  const key = crypto
    .createHash("sha256")
    .update(secretKey)
    .digest("base64")
    .slice(0, 32);
  const iv = Buffer.from(ivHex!, "hex");
  const encrypted = Buffer.from(encryptedHex!, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

export function adjustColor(hex: string, brightness: number) {
  // Parse the hex code into its individual RGB components
  var red = parseInt(hex.substring(1, 3), 16);
  var green = parseInt(hex.substring(3, 5), 16);
  var blue = parseInt(hex.substring(5, 7), 16);

  // Adjust the brightness of the color by reducing the RGB values
  red = Math.max(0, Math.min(255, Math.round(red * brightness)));
  green = Math.max(0, Math.min(255, Math.round(green * brightness)));
  blue = Math.max(0, Math.min(255, Math.round(blue * brightness)));

  // Convert the adjusted RGB values back to a hex code
  var adjustedHex =
    "#" +
    red.toString(16).padStart(2, "0") +
    green.toString(16).padStart(2, "0") +
    blue.toString(16).padStart(2, "0");

  return adjustedHex;
}

// Example usage
// var originalColor = "#F5F5F5";
// var adjustedColor = adjustColor(originalColor, 0.8); // Reduce brightness by 20%
// console.log("Original color: " + originalColor); // Output: Original color: #F5F5F5
// console.log("Adjusted color: " + adjustedColor); // Output: Adjusted color: #BFBFBF

// Generate ID for video in DB

export function generateDeterministicVideoId(seed: string) {
  // Uses SHA256 algorithm
  const hash = crypto.createHash("sha256");
  hash.update(seed.toString());
  return hash.digest("hex");
}

// Generate ID for presentation in DB
export function generateUniquePresentationId(str: string) {
  const randomString = crypto.randomBytes(8).toString("hex");
  const hash = crypto.createHash("sha1");
  hash.update(str + randomString);
  const uniqueId = hash.digest("hex").slice(0, 10);
  return uniqueId;
}

export const md5 = (contents: string) =>
  crypto.createHash("md5").update(contents).digest("hex");

export const getDurationWithPadding = (dur: number) =>
  dur + audioPaddingInSeconds || 700;
