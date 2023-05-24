import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";
dotenv.config();

export async function uploadUncompressedAudio({
  fileURL,
  public_id,
}: {
  fileURL: string;
  public_id: string;
}) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  // Upload file
  const uploadedFile = await cloudinary.uploader.upload(fileURL, {
    resource_type: "video",
    public_id,
  });

  const { duration, secure_url } = uploadedFile;

  return { url: secure_url, duration };
}
