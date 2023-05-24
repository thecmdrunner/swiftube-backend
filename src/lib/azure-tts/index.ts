import {
  SpeechConfig,
  SpeechSynthesisResult,
  SpeechSynthesizer,
} from "microsoft-cognitiveservices-speech-sdk";
import {
  createFirebaseUrl,
  deleteFile,
  uploadToFirebase,
} from "../firebase/utils";
import { uploadUncompressedAudio } from "../cloudinary/utils";
import { CreatedTTSAudioData } from "../textToSpeech";
import { VoiceGender } from "../../lib/interfaces";

import dotenv from "dotenv";
dotenv.config();

// type MaleVoice = typeof AzureVoices.male[number]['name'];
// type FemaleVoice = typeof AzureVoices.female[number]['name'];
// type AzureVoice = MaleVoice | FemaleVoice;
type AzureVoice = (typeof AzureVoices)[keyof typeof AzureVoices][number];

export const AzureVoices: { [key in VoiceGender]: { name: string }[] } = {
  male: [{ name: "en-US-GuyNeural" }, { name: "en-GB-RyanNeural" }],
  female: [{ name: "en-US-JennyNeural" }, { name: "en-US-SaraNeural" }],
};

export const createAzureTTSAudio = async ({
  text,
  filePath,
  voice = AzureVoices["female"][0],
}: {
  text: string;
  //   ssml?: string;
  filePath: string;
  voice: AzureVoice;
}): Promise<CreatedTTSAudioData> => {
  const speechConfig = SpeechConfig.fromSubscription(
    process.env.AZURE_TTS_KEY,
    process.env.AZURE_TTS_REGION
  );

  // Use ideally `SSML` instead of 'text'...
  //   const { text, filePath, voice } = props;

  //   <break time="100ms" />
  const ssmlToSpeak = `<speak version="1.0" xml:lang="en-US"><voice name="${voice.name}">${text}</voice></speak>`;
  // const fileExists = await checkIfAudioHasAlreadyBeenSynthesized(fileName);

  //   if (fileExists) {
  //     return createS3Url(fileName);
  //   }

  const synthesizer = new SpeechSynthesizer(speechConfig);

  const result = await new Promise<SpeechSynthesisResult>((resolve, reject) => {
    synthesizer.speakSsmlAsync(
      ssmlToSpeak,
      (res) => {
        resolve(res);
      },
      (error) => {
        reject(error);
        synthesizer.close();
      }
    );
  });
  const { audioData } = result;
  synthesizer.close();

  // Upload the file to firebase
  const fileUploaded = await uploadToFirebase(audioData, filePath);

  const fullPathOfUploadedFile = fileUploaded.metadata.fullPath;

  // fetch and return the URL
  const firebaseURL = await createFirebaseUrl(fullPathOfUploadedFile);

  // Create web-safe URL
  const filePublicID = filePath.replace(".mp3", "");
  // Upload to cloudinary
  const { duration, url } = await uploadUncompressedAudio({
    fileURL: firebaseURL,
    public_id: filePublicID,
  });

  /**
   * ! TODO: DELETE the file from firebase here...
   */

  await deleteFile(fullPathOfUploadedFile);

  // Return URL and duration of the file
  return { duration, url };
};
