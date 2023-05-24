import {
  getTableFromData,
  getTalkingPointForIntro,
  getTalkingPointForOutro,
  getTitlesFromData,
} from "./openai";
import { getBingImages } from "./bing/images";
import {
  CustomImageDataFromBing,
  VideoMetadata,
  VideoIntro,
  VideoSection,
  VideoTable,
  VideoOutro,
} from "./interfaces";
import { createTTSAudio } from "./textToSpeech";

export async function getVideoSectionsMedia(props: {
  metadata: VideoMetadata;
  talkingPoints: string[];
  titles: string[];
  fileDirectory: string;
}): Promise<VideoSection[]> {
  console.time("getVideoSectionsData()"); // start the timer
  console.log(`😇 Trying to get Video sections media!`);

  // Get all images one by one (Thanks Azure Ratelimits on Free tier!)
  const allRelevantImages: CustomImageDataFromBing[][] = [];
  for (const title of props.titles) {
    const imgsForVideoSection = (await getBingImages({
      query: title,
      count: 3,
    })) as CustomImageDataFromBing[];

    allRelevantImages.push(imgsForVideoSection);
  }

  const videoSectionsPromises = props.talkingPoints.map(
    async (talkingPoint, index) => {
      const text = `${props.titles[index]}. ${talkingPoint}`;

      const [
        maleVoice,
        femaleVoice,
        // relevantImages
      ] = await Promise.all([
        // Create male and female voice audios
        createTTSAudio({
          text,
          gender: "male",
          fileDirectory: props.fileDirectory,
        }),
        createTTSAudio({
          text,
          gender: "female",
          fileDirectory: props.fileDirectory,
        }),

        // get 3 images for point
        // getBingImages({ query: props.metadata.topic, count: 3 }),
      ]);

      return {
        talkingPoint,
        title: props.titles[index],
        // images: relevantImages,
        voiceAudio: {
          urls: [maleVoice.url, femaleVoice.url] as [string, string],
          durations: [maleVoice.duration, femaleVoice.duration] as [
            number,
            number
          ],
        },
      };
    }
  );

  const dataWithoutImages = await Promise.all(videoSectionsPromises);

  const finalData: VideoSection[] = dataWithoutImages.map((section, index) => {
    return {
      ...section,
      images: allRelevantImages[index],
    };
  });

  console.timeEnd("getVideoSectionsData()"); // stop the timer
  return finalData;
}

export async function getVideoIntro(
  props: {
    formattedContentsOfVideo: string;
    metadata: VideoMetadata;
    fileDirectory: string;
    // Keep titles to get decent images for intro?
    titles: Awaited<ReturnType<typeof getTitlesFromData>>;
  },
  userId: string
): Promise<VideoIntro> {
  /**
   * ! HERE, DO THE MULTIPLE DURATIONS FOR AUDIO. :)
   */
  console.time("getVideoIntroOutroMedia()"); // start the timer
  console.log(`😇 Trying to get Video intro media!`);

  /**
   * ! FIXME: GET THE TALKING POINT FOR INTRO AND OUTRO
   */
  const { talkingPoint: introTalkingPoint } = await getTalkingPointForIntro(
    props.metadata,
    props.formattedContentsOfVideo,
    userId
  );

  const IntroPromises = [introTalkingPoint].map(async (talkingPoint, index) => {
    console.log(`Creating Intro audio #${index + 1}`);

    const text = talkingPoint;

    const [maleVoice, femaleVoice, relevantImages] = await Promise.all([
      // Create male and female voice audios
      createTTSAudio({
        text,
        gender: "male",
        fileDirectory: props.fileDirectory,
      }),
      createTTSAudio({
        text,
        gender: "female",
        fileDirectory: props.fileDirectory,
      }),

      // get 3 images for topic
      getBingImages({ query: props.metadata.topic, count: 3 }),
    ]);

    return {
      images: relevantImages,
      talkingPoint,
      voiceAudio: {
        urls: [maleVoice.url, femaleVoice.url] as [string, string],
        durations: [maleVoice.duration, femaleVoice.duration] as [
          number,
          number
        ],
      },
    };
  });

  const [intro] = await Promise.all(IntroPromises);

  console.timeEnd("getVideoIntroOutroMedia()"); // stop the timer

  return intro;
}

export async function getVideoOutro(
  props: {
    formattedContentsOfVideo: string;
    metadata: VideoMetadata;
    fileDirectory: string;
  },
  userId: string
): Promise<VideoOutro> {
  console.time("getVideoOutroMedia()"); // start the timer
  console.log(`😇 Trying to get Video intro media!`);

  const { talkingPoint: outroTalkingPoint } = await getTalkingPointForOutro(
    props.formattedContentsOfVideo,
    userId
  );

  const OutroPromises = [outroTalkingPoint].map(async (talkingPoint, index) => {
    console.log(`Creating Outro audio #${index + 1}`);

    const text = talkingPoint;

    const [maleVoice, femaleVoice] = await Promise.all([
      // Create male and female voice audios
      createTTSAudio({
        text,
        gender: "male",
        fileDirectory: props.fileDirectory,
      }),
      createTTSAudio({
        text,
        gender: "female",
        fileDirectory: props.fileDirectory,
      }),

      // get 3 images for topic
      // getBingImages({ query: props.metadata.topic, count: 3 }),
    ]);

    return {
      // images: relevantImages,
      talkingPoint,
      voiceAudio: {
        urls: [maleVoice.url, femaleVoice.url] as [string, string],
        durations: [maleVoice.duration, femaleVoice.duration] as [
          number,
          number
        ],
      },
    };
  });

  const [outro] = await Promise.all(OutroPromises);

  console.timeEnd("getVideoOutroMedia()"); // stop the timer

  return outro;
}

export async function getVideoTableMedia(props: {
  metadata: VideoMetadata;
  tableData: Awaited<ReturnType<typeof getTableFromData>>;
  fileDirectory: string;
}): Promise<VideoTable> {
  const tableLabel = props.metadata.table?.label ?? "";
  // Return empty table if no table label is present
  if (tableLabel.length < 2)
    return {
      isPresent: false,
      summary: "",
      table: "",
      voiceAudio: {
        urls: ["", ""],
        durations: [0, 0],
      },
    };

  console.time("getVideoTableMedia()"); // start the timer
  console.log(`😇 Trying to get Video table media!`);

  const tableSummary = props.tableData?.summary;

  const TablePromises = [tableSummary].map(async (talkingPoint, index) => {
    console.log(`Creating speech audio for #${index + 1}`);

    const text = talkingPoint;

    const [maleVoice, femaleVoice] = await Promise.all([
      // Create male and female voice audios
      createTTSAudio({
        text,
        gender: "male",
        fileDirectory: props.fileDirectory,
      }),
      createTTSAudio({
        text,
        gender: "female",
        fileDirectory: props.fileDirectory,
      }),
    ]);

    // const { url: maleAudioURL, duration: maleVoiceDuration } = maleVoice;
    // const { url: femaleAudioURL, duration: femaleVoiceDuration } = femaleVoice;

    return {
      ...props.tableData,
      voiceAudio: {
        urls: [maleVoice.url, femaleVoice.url] as [string, string],
        durations: [maleVoice.duration, femaleVoice.duration] as [
          number,
          number
        ],
      },
    };
  });

  const [finalData] = await Promise.all(TablePromises);

  console.timeEnd("getVideoTableMedia()"); // stop the timer

  return { ...finalData, isPresent: true };
}
