import {
  ChatCompletionRequestMessage,
  Configuration,
  CreateChatCompletionRequest,
  OpenAIApi,
} from "openai";
import type { FinalVideoDataFromServer, VideoMetadata } from "./interfaces";
import dotenv from "dotenv";
import { checkValidJson, extractJson } from "./openai_utils";
import dJSON from "dirty-json";
import { getPrompts } from "./upstash";
dotenv.config();

const configuration = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
const openai = new OpenAIApi(configuration);

const breaker = `============================`;

// Assume the following values if the user hasn't mentioned about them:

// const defaultOptions: Video = {
//   width: 1920,
//   height: 1080,
//   color: "#1e1e1eff",
//   durationInSeconds: 120,
//   style: "default",
//   graphic: {
//     required: false,
//   },
//   table: {
//     required: false,
//   },
// }

export async function getAIChatResponse(
  messages: ChatCompletionRequestMessage[],
  user: CreateChatCompletionRequest["user"],
  options: Partial<CreateChatCompletionRequest> = {}
): Promise<string> {
  try {
    const { data: AIResponse } = await openai.createChatCompletion({
      messages,
      user,
      model: "gpt-3.5-turbo",
      temperature: 1,
      //   top_p: defaultOpenAIRequest.top_p, // disabled as per the docs recommendation.
      //   frequency_penalty: defaultOpenAIRequest.frequency_penalty,
      max_tokens: 1000,
      ...options,
    });

    const response = AIResponse.choices[0].message?.content as string;

    // console.log(`💬 Original AI response: `, response);

    return response;
  } catch (err: any) {
    console.error(err.response);

    throw `Error while fetching response: ${err}`;
  }
}

// Part 1: Getting video metadata
export async function getVideoMetadata(
  initialVideoData: Pick<
    FinalVideoDataFromServer,
    "message" | "error" | "prompt" | "referenceData"
  >,
  userId: string,
  tryCount: number = 0
): Promise<VideoMetadata | null> {
  const prompts = await getPrompts();

  const userPrompt = prompts.videoMetadata_user.replace(
    "{replaceMe.prompt}",
    initialVideoData.prompt
  );

  const messages: ChatCompletionRequestMessage[] = [
    { role: "system", content: prompts.videoMetadata_system },
    { role: "user", content: userPrompt },
  ];

  try {
    tryCount = tryCount + 1;
    console.info(`Getting Metadata #${tryCount} TRY!`);

    // console.log(`🚨 CHECKING SYSTEM PROMPT: ${messages[0].content}`);
    // console.log(`🚨 CHECKING USER PROMPT: ${messages[1].content}`);

    const response = await getAIChatResponse(messages, userId);

    const extractedJson = extractJson(response);

    const isJSONValid = await checkValidJson(extractedJson);

    if (!isJSONValid) throw `Invalid JSON while generating METADATA...`;

    const data: VideoMetadata = await dJSON.parse(extractedJson);

    // console.log(`🚨 VALIDATING METADATA: `, data);

    if (data.topic.length < 3 || data.description.length < 3)
      throw `Data seems to be invalid...`;

    // console.log(`💜 Generated Metadata`);

    return {
      ...defaultMetadataOptions, // fill in any missing options.
      ...data,
    };
  } catch (err) {
    console.error(err);

    if (tryCount < 3) {
      console.info(`Error generating METADATA, trying again...`);
      return await getVideoMetadata(initialVideoData, userId, tryCount);
    } else {
      console.error("RETRY LIMITS REACHED! Returning...");
      return null;
    }
  }
}

// Part 2: Getting talking points based on prompt
export async function getTalkingPointForIntro(
  metadata: VideoMetadata,
  contentsOfVideo: string,
  userId: string,
  tryCount: number = 0
): Promise<{ talkingPoint: string } | null> {
  const prompts = await getPrompts();

  const userPrompt = prompts.intro_user
    .replace("{replaceMe.title}", metadata.title)
    .replace("{replaceMe.description}", metadata.description)
    .replace("{replaceMe.contentsOfVideo}", contentsOfVideo);

  const messages: ChatCompletionRequestMessage[] = [
    { role: "system", content: prompts.talkingPoints_system },
    { role: "user", content: userPrompt },
  ];

  try {
    tryCount = tryCount + 1;
    console.info(`Getting Intro #${tryCount} TRY!`);

    const response = await getAIChatResponse(messages, userId);
    const extractedJson = extractJson(response);

    const isJSONValid = await checkValidJson(extractedJson);

    if (!isJSONValid) {
      throw `Invalid JSON while generating INTRO...`;
    }

    const { intro } = (await dJSON.parse(extractedJson)) as {
      intro: string;
    };
    if (intro.length < 3) throw `Data seems to be invalid...`;

    return { talkingPoint: intro };
  } catch (err) {
    console.error(err);

    if (tryCount < 3) {
      console.info(`Error generating INTRO, trying again...`);
      return await getTalkingPointForIntro(
        metadata,
        contentsOfVideo,
        userId,
        tryCount
      );
    } else {
      console.error("RETRY LIMITS REACHED! Returning...");
      return null;
    }
  }
}

export async function getTalkingPoints(
  videoData: Pick<
    FinalVideoDataFromServer,
    "prompt" | "referenceData" | "userId"
  >,
  videoMetadata: VideoMetadata,
  tryCount: number = 0
): Promise<VideoTalkingPoints | null> {
  const prompts = await getPrompts();

  const userPrompt = prompts.talkingPoints_user
    .replace("{replaceMe.topic}", videoMetadata.topic)
    .replace("{replaceMe.originalPrompt}", videoData.prompt)
    .replace("{replaceMe.referenceData}", videoData.referenceData);

  const messages: ChatCompletionRequestMessage[] = [
    { role: "system", content: prompts.talkingPoints_system },
    { role: "user", content: userPrompt },
  ];

  try {
    tryCount = tryCount + 1;
    console.info(`Getting Talking Points #${tryCount} TRY!`);

    const response = await getAIChatResponse(messages, videoData.userId, {
      temperature: 0.5,
    });
    const extractedJson = extractJson(response);

    const isJSONValid = await checkValidJson(extractedJson);

    if (!isJSONValid) throw `Invalid JSON while generating TALKING POINTS...`;

    const data = (await dJSON.parse(extractedJson)) as VideoTalkingPoints;

    if (data.talkingPoints.length < 3) throw `Data seems to be invalid...`;

    return data;
  } catch (err) {
    console.error(err);

    if (tryCount < 3) {
      console.info(`Error generating TALKING POINTS, trying again...`);
      return await getTalkingPoints(videoData, videoMetadata, tryCount);
    } else {
      console.error("RETRY LIMITS REACHED! Returning...");
      return null;
    }
  }
}

// Part 3: Getting titles based on prompt
export async function getTitlesFromData(
  data: string,
  userId: string,
  tryCount: number = 0
): Promise<VideoTitles | null> {
  const prompts = await getPrompts();

  const userPrompt = prompts.titles_user.replace(
    "{replaceMe.talkingPoints}",
    data
  );

  const messages: ChatCompletionRequestMessage[] = [
    { role: "system", content: prompts.talkingPoints_system },
    { role: "user", content: userPrompt },
  ];

  try {
    tryCount = tryCount + 1;
    console.info(`Getting Titles #${tryCount} TRY!`);

    const response = await getAIChatResponse(messages, userId);
    const extractedJson = extractJson(response);

    const isJSONValid = await checkValidJson(extractedJson);

    if (!isJSONValid) {
      throw `Invalid JSON while generating TITLES...`;
    }

    const data = (await dJSON.parse(extractedJson)) as VideoTitles;

    if (data.titles.length < 3) throw `Data seems to be invalid...`;

    return data;
  } catch (err) {
    console.error(err);

    if (tryCount < 3) {
      console.info(`Error generating TITLES, trying again...`);
      return await getTitlesFromData(data, userId, tryCount);
    } else {
      console.error("RETRY LIMITS REACHED! Returning...");
      return null;
    }
  }
}

// Part 4: Getting table based on data
export async function getTableFromData(
  videoMetadata: VideoMetadata,
  userId: string,
  tryCount: number = 0
): Promise<VideoTableData> {
  const tableLabel = videoMetadata.table?.label ?? "";
  if (tableLabel.length < 2)
    return {
      summary: "",
      table: "",
    };

  const prompts = await getPrompts();

  const userPrompt = prompts.tables_user.replace(
    "{replaceMe.label}",
    videoMetadata.table.label
  );

  const messages: ChatCompletionRequestMessage[] = [
    { role: "system", content: prompts.talkingPoints_system },
    { role: "user", content: userPrompt },
  ];

  try {
    tryCount = tryCount + 1;
    console.info(`Getting Table #${tryCount} TRY!`);

    const response = await getAIChatResponse(messages, userId);
    const extractedJson = extractJson(response);

    const isJSONValid = await checkValidJson(extractedJson);

    if (!isJSONValid) {
      throw `Invalid JSON while generating TABLE...`;
    }

    const data = (await dJSON.parse(extractedJson)) as VideoTableData;

    if (data.table.length < 15 || data.summary.length < 10)
      throw `Data seems to be invalid...`;

    return data;
    /**
     * * Sample response:
     */
    // { table: "| Year | Impact |\n| ---- | ---- |\n| 2020 | High |\n| 2021 | Medium |\n",
    //   summary: "The table shows the impact of coronavirus on the world from 2020 to 2021. In 2020, the impact was high as the virus spread rapidly across the globe, leading to a significant number of infections, hospitalizations, and deaths. Governments imposed strict lockdown measures, leading to an economic downturn, and many businesses were forced to shut down. In 2021, the impact was medium as countries rolled out vaccines and the number of cases decreased. However, new variants of the virus emerged, and some countries experienced new waves of infections, leading to continued disruptions in travel, trade, and everyday life. Overall, the coronavirus pandemic has had a significant impact on the world, and its effects are likely to be felt for years to come.", };
  } catch (err) {
    console.error(err);

    if (tryCount < 3) {
      console.info(`Error generating TABLE, trying again...`);
      return await getTableFromData(videoMetadata, userId, tryCount);
    } else {
      console.error("RETRY LIMITS REACHED! Returning...");
      return {
        summary: "",
        table: "",
      };
    }
  }
}

// Part 5: Getting Outro on talking points.
export async function getTalkingPointForOutro(
  contentsOfVideo: string,
  userId: string,
  tryCount: number = 0
): Promise<{ talkingPoint: string }> {
  const prompts = await getPrompts();

  const userPrompt = prompts.outro_user.replace(
    "{replaceMe.contentsOfVideo}",
    contentsOfVideo
  );

  const messages: ChatCompletionRequestMessage[] = [
    { role: "system", content: prompts.talkingPoints_system },
    { role: "user", content: userPrompt },
  ];

  try {
    tryCount = tryCount + 1;
    console.info(`Getting Outro #${tryCount} TRY!`);

    const response = await getAIChatResponse(messages, userId);
    const extractedJson = extractJson(response);

    const isJSONValid = await checkValidJson(extractedJson);

    if (!isJSONValid) {
      throw `Invalid JSON while generating Outro...`;
    }

    const { outro } = (await dJSON.parse(extractedJson)) as {
      outro: string;
    };

    if (outro.length < 3) throw `Data seems to be invalid...`;

    return { talkingPoint: outro };
  } catch (err) {
    console.error(err);

    if (tryCount < 3) {
      console.info(`Error generating OUTRO, trying again...`);
      return await getTalkingPointForOutro(contentsOfVideo, userId, tryCount);
    } else {
      console.error("RETRY LIMITS REACHED! Returning...");
      return null;
    }
  }
}

type VideoTalkingPoints = {
  talkingPoints: string[];
};

type VideoTitles = {
  titles: string[];
};

type VideoTableData = {
  table: string;
  summary: string;
};

export const defaultMetadataOptions: VideoMetadata = {
  topic: "",
  title: "",
  description: "",
  width: 1920,
  height: 1080,
  color: {
    accentColor: "#D20013", // dark-red-ish
  },
  durationInSeconds: 120,
  style: "normal",
};
