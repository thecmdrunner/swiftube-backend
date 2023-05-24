import express from "express";
import dotenv from "dotenv";
import {
  getVideoFromDB,
  updateVideoInDB,
} from "../lib/firebase/firestore/utils";
import {
  getTableFromData,
  getTalkingPoints,
  getTitlesFromData,
  getVideoMetadata,
} from "../lib/openai";
import {
  getVideoIntro,
  getVideoOutro,
  getVideoSectionsMedia,
  getVideoTableMedia,
} from "../lib/main";
import {
  FinalVideoDataFromServer,
  VideoStatusCode,
  InitialVideoServerResponse,
  InitialVideoServerRequest,
} from "../lib/interfaces";
import { DEMO_MODE } from "../lib/constants";
import { checkModerationFlag } from "../lib/openai_utils";
import { getPrompts } from "../lib/upstash";
dotenv.config();

const router = express.Router();

router.post("/getdata", async (req, res) => {
  console.time("LetsMakeAVideo()"); // start the timer

  const sendResponseToClient = (
    statusCode: number,
    data: InitialVideoServerResponse
  ) => res.status(statusCode).json(data).end();

  const { videoId, userId } = req.body as InitialVideoServerRequest;

  console.log(`🔥 Making new video 🐦 !`);
  console.table({ videoId, userId });

  /**
   * TODO: Implement Zod validation for prompt and ref data here, and on client tRPC. */

  /**
   * TODO: Implement DEMO MODE.
   * ! SAFETY: NO REQUESTS ARE PROCESSED DURING DEMO MODE. */

  if (DEMO_MODE)
    return sendResponseToClient(200, {
      error: null,
      isSuccess: true,
      message: "THIS IS DEMO MODE.",
      userId,
      videoId,
    });

  // * Set the initialized video from db.
  const initialVideoData = await getVideoFromDB(videoId);

  console.log(`🔥 Prompt: ${initialVideoData.prompt}`);

  // TODO: Set all prompts here and check them for moderation.
  const prompts = await getPrompts();
  const metadataPrompt = prompts.videoMetadata_user.replace(
    "{replaceMe.prompt}",
    initialVideoData.prompt
  );

  const { isFlagged } = await checkModerationFlag(metadataPrompt);
  console.log(`[1] Prompt is ${isFlagged ? "NOT SAFE ❌!" : "SAFE ✅"}.`);
  if (isFlagged)
    return await updateVideoInDB({
      videoId,
      videoData: {
        createdAt: new Date().toDateString(),
        isPublic: false,
        render: {
          error: "",
          msg: "Render not initiated yet.",
          status: "PENDING",
          url: "",
        },
        userId,
        uniqueId: videoId,
        status: "FLAGGED",
        message: "An error occurred.",
        error:
          "Your request was flagged by OpenAI. Your account is at the risk of being permanently banned.",
      },
    });

  /**
   * ! Exit out if status is one of the below. */
  const rejectedStatus: VideoStatusCode[] = [
    "DELETED",
    "FLAGGED",
    "HALTED",
    "IN_PROGRESS",
    "SUCCESS",
  ];
  if (rejectedStatus.includes(initialVideoData.status)) {
    console.log(`❌ Rejected for status: ${initialVideoData.status}.`);
    return sendResponseToClient(400, {
      error: `Cannot proceed because video status is "${initialVideoData.status}"`,
      isSuccess: false,
      message: "An error occurred.",
      userId,
      videoId,
    });
  }

  try {
    /**
     * * Set video status "IN_PROGRESS" */
    const videoInProgress = await updateVideoInDB({
      videoId,
      videoData: {
        ...initialVideoData,
        status: "IN_PROGRESS",
        message: "Video is in progress...",
      },
    });

    if (videoInProgress.isSuccess)
      console.log(`[2] Set status: ${videoInProgress.videoData.status}.`);

    // * Send response to client that video is "IN_PROGRESS"
    sendResponseToClient(200, {
      error: null,
      isSuccess: true,
      message: "Video creation has begun sucessfully!",
      userId: videoInProgress.videoData.userId,
      videoId: videoInProgress.videoData.uniqueId,
    });

    console.log(`[3] Sent to client - ${videoInProgress.videoData.uniqueId}`);

    // TODO: Now do this very efficiently all... only for shorts video...
    // TODO: As for the Images, do normally for now. And if its 429, then
    // TODO: use redis to see if any other video's images are being processed.

    const videoMetadata = await getVideoMetadata(
      {
        error: videoInProgress.videoData.error,
        message: videoInProgress.videoData.message,
        prompt: videoInProgress.videoData.prompt,
        referenceData: videoInProgress.videoData.referenceData,
      },
      userId
    );

    console.log(`[4] Video metadata topic - ${videoMetadata.topic}`);

    /**
     * * TODO: First do titles, then images (synchronously) + talking points (intro, main, outro) together.
     * * After talking points, TTS Audio all at once */

    const videoTalkingPoints = await getTalkingPoints(
      initialVideoData,
      videoMetadata
    );

    // TODO: I'm sure there is a better way to provide talking points, instead of the RAW JSON...
    // * So just listing the points index wise in a string...
    let talkingPointsAsString = ``;
    videoTalkingPoints.talkingPoints.forEach(
      (talkPoint, index) =>
        (talkingPointsAsString += `\n${index + 1}. ${talkPoint}`)
    );
    const [videoTitles, tableData] = await Promise.all([
      getTitlesFromData(talkingPointsAsString, userId),
      // TODO: MAKE THIS TABLE FUNCTION RETURN AUDIO AND OTHER NECESSARY STUFF TOO.
      getTableFromData(videoMetadata, userId),
    ]);

    /**
     * * For avoiding all URL errors for CDN */
    const fileDirectory = "aishortz/" + encodeURIComponent(videoId);
    console.log(`File directory: ${fileDirectory}`);

    /**
     * * Step 3: Get final processed data for intro, each section, and table. */

    const [videoSections, videoIntro, videoOutro, finalTable] =
      await Promise.all([
        getVideoSectionsMedia({
          metadata: videoMetadata,
          titles: videoTitles.titles,
          talkingPoints: videoTalkingPoints.talkingPoints,
          fileDirectory,
        }),

        getVideoIntro(
          {
            formattedContentsOfVideo: talkingPointsAsString,
            metadata: videoMetadata,
            titles: videoTitles,
            fileDirectory,
          },
          userId
        ),

        getVideoOutro(
          {
            formattedContentsOfVideo: talkingPointsAsString,
            metadata: videoMetadata,
            fileDirectory,
          },
          userId
        ),

        getVideoTableMedia({
          fileDirectory,
          metadata: videoMetadata,
          tableData,
        }),
      ]);

    const finalVideo: FinalVideoDataFromServer = {
      ...initialVideoData,

      error: "", // set error as empty just in case there was a previous error.
      status: "SUCCESS",
      message: "Video created successfully!",

      metadata: videoMetadata,
      data: {
        videoSections,
        intro: videoIntro,
        outro: videoOutro,
        table: finalTable, // don't set to undefined or else firebase complains...
      },
    };

    /**
     * * Step 4: Finally upload video to database */
    const successfulVideo = await updateVideoInDB({
      videoId,
      videoData: finalVideo,
    });

    // Return final video in encrypted format
    // return res.status(200).json({
    //   data: encryptString(
    //     JSON.stringify({
    //       // This will replace the initialToken data with the new token that has reduced credits.
    //       ...readyVideo.video,
    //       token: readyVideo.token,
    //     })
    //   ),
    // });

    console.log(`🥳 Video made successfully: [${videoId}] 🎉`);
    console.timeEnd("LetsMakeAVideo()"); // start the timer
    return true;
  } catch (err) {
    console.error(err);
    // * Set video status as "FAILED"
    const videoWithError = await updateVideoInDB({
      videoId,
      videoData: {
        ...initialVideoData,
        status: "FAILED",
        error: err,
        message:
          "An error occurred while creating video, please check the `error` field.",
      },
    });

    console.timeEnd("LetsMakeAVideo()"); // start the timer

    return false;
  }
});

export default router;
