import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const generalMetadataKey = "generalMetadata";
const promptsKey = "prompts";

export const getPrompts = async (): Promise<PromptsFromRedis> => {
  try {
    const prompts = await redis.hgetall<PromptsFromRedis>(promptsKey);

    if (prompts.videoMetadata_system.length > 3) return prompts;
    else throw "Unable to get prompts...";
  } catch (error) {
    console.error(error);
  }
};

export const getGeneralMetadata = async (): Promise<GeneralMetadata> => {
  try {
    const generalMetadata = await redis.hgetall<{
      creditsForNewUsers: string;
      totalCreditsAllotted: string;
    }>(generalMetadataKey);

    if (!!generalMetadata?.creditsForNewUsers)
      return {
        creditsForNewUsers: Number(generalMetadata.creditsForNewUsers),
        totalCreditsAllotted: Number(generalMetadata.totalCreditsAllotted),
      };
    else throw "Unable to get General Metadata...";
  } catch (error) {
    console.error(error);
    throw `Upstash ERRRRR: ${error as string}`;
  }
};
export const setGeneralMetadata = async (
  value: GeneralMetadata
): Promise<GeneralMetadata> => {
  try {
    const response = await redis.json.set(
      generalMetadataKey,
      `$`,
      JSON.stringify(value)
    );

    if (response !== "OK")
      throw "Something went wrong when setting up generalMetadata......";

    const jsonFromDB = (await redis.json.get(
      generalMetadataKey
      // "$.path"
    )) as GeneralMetadata;

    return jsonFromDB;
  } catch (err) {
    console.log(err);
    throw err;
  }
};

export const reduceNewTotalCreditsAllottedBy = async (
  value: number
): Promise<GeneralMetadata> => {
  try {
    const generalMetadata = await getGeneralMetadata();

    await redis.hset(generalMetadataKey, {
      ...generalMetadata,
      // Redis values are not type aware, so keep everything string, just for safety.
      totalCreditsAllotted: `${generalMetadata.totalCreditsAllotted - value}`,
    });

    if (!!generalMetadata?.creditsForNewUsers)
      return {
        creditsForNewUsers: Number(generalMetadata.creditsForNewUsers),
        totalCreditsAllotted: Number(generalMetadata.totalCreditsAllotted),
      };
    else throw "Unable to get General Metadata...";
  } catch (error) {
    console.error(error);
    throw `Upstash Error while setting NewTotalCreditsAllotted: ${
      error as string
    }`;
  }
};

export type GeneralMetadata = {
  creditsForNewUsers: number;
  totalCreditsAllotted: number;
};

type PromptsFromRedis = {
  intro_system: string;
  /**
   * * {replaceMe.title} - Title from Video Metadata
   * * {replaceMe.description} - Description from Video Metadata
   * * {replaceMe.contentsOfVideo} - Contents covered in the video */
  intro_user: string;

  outro_system: string;
  /**
   * * {replaceMe.contentsOfVideo} - Contents covered in the video */
  outro_user: string;

  tables_system: string;
  /**
   * * {replaceMe.label} - Label of the table in the video */
  tables_user: string;

  videoMetadata_system: string;
  /**
   * * {replaceMe.prompt} - Prompt submitted by user */
  videoMetadata_user: string;

  talkingPoints_system: string;
  /**
   * * {replaceMe.topic} - Topic from metadata
   * * {replaceMe.originalPrompt} - Prompt provided by user
   * * {replaceMe.referenceData} - Data provided by user */
  talkingPoints_user: string;

  titles_system: string;
  /**
   * * {replaceMe.talkingPoints} - Talking points for the video */
  titles_user: string;
};
