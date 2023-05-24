import { Configuration, OpenAIApi, CreateCompletionRequest } from "openai";
import dJSON from "dirty-json";
import dotenv from "dotenv";
dotenv.config();

const configuration = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
const openai = new OpenAIApi(configuration);

export async function checkValidJson(jsonResponse: string): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const dataAsObj = await dJSON.parse(jsonResponse); // should return object, or throw error
    // console.error(`🟢 SUCCESS: Provided data is valid JSON.`);
    return true;
  } catch (error) {
    console.error(`🟥 ERROR: Provided data is not valid JSON: ${jsonResponse}`);
    return false;
  }
}

export function extractJson(data: string): string {
  // check if curley braces exist
  // eslint-disable-next-line prefer-const
  let jsonStart = data.indexOf("{");
  // eslint-disable-next-line prefer-const
  let jsonEnd = data.lastIndexOf("}");
  // No opening bracket
  if (jsonStart < 0) data = "{" + data; // add the opening bracket
  // No closing bracket
  if (jsonEnd <= 0) data = data + "}"; // add the closing bracket

  // if (jsonStart < 0 || jsonEnd <= 0)    console.log(`🟨 Trying to add missing braces to JSON data.`);

  const openJson = data.indexOf("{");
  const closeJson = data.lastIndexOf("}");
  //   console.log(openJson, closeJson);

  const dataAsJSON = data.substring(openJson, closeJson + 1);
  return dataAsJSON;
}

const defaultOpenAIRequest: CreateCompletionRequest = {
  model: "text-davinci-003",
  prompt: "Say this is a test",
  temperature: 0.7,
  max_tokens: 1000,
  // top_p: 1,
  frequency_penalty: 0,
  presence_penalty: 0.6,
};

export async function checkModerationFlag(input: string) {
  const { data: moderationsData } = await openai.createModeration({ input });

  const [results] = moderationsData.results;

  const isFlagged = results?.flagged;

  console.log(
    `=====================\nPrompt is ${
      isFlagged ? "FLAGGED!" : "SAFE."
    }\n=====================`
  );

  return { isFlagged };
}
