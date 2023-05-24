import { CognitiveServicesCredentials } from "@azure/ms-rest-azure-js";
import { ImageSearchClient } from "@azure/cognitiveservices-imagesearch";
import { CustomImageDataFromBing } from "../../interfaces";
import dotenv from "dotenv";

dotenv.config();

const subscriptionKey = process.env.MICROSOFT_BING_SEARCH_API_KEY as string;
const endpoint = "https://api.bing.microsoft.com/v7.0/images/search";

const credentials = new CognitiveServicesCredentials(subscriptionKey);
const client = new ImageSearchClient(credentials, {
  endpoint,
});

export async function getBingImages(data: {
  query: string;
  count?: number;
}): Promise<CustomImageDataFromBing[]> {
  const { value } = await client.images.search(data.query, {
    count: data.count ?? 2,
    safeSearch: "Moderate",
  });

  const imageData: CustomImageDataFromBing[] = value.map(
    ({
      name,
      contentUrl,
      hostPageUrl,
      hostPageDisplayUrl,
      encodingFormat,
      contentSize,
      width,
      height,
      accentColor,
      text,
      description,
      imageId,
    }) => {
      return {
        name,
        contentUrl,
        hostPageUrl,
        hostPageDisplayUrl,
        encodingFormat,
        contentSize,
        width,
        height,
        accentColor: "#" + accentColor,
        // text, // These come undefined.
        // description, // These come undefined.
        imageId,
      };
    }
  );

  return imageData;
}
