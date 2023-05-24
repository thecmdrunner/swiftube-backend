import { paidApp } from "../index";
import {
  collection,
  doc,
  getDoc,
  getFirestore,
  setDoc,
} from "firebase/firestore";
import {
  Customer,
  FinalVideoDataFromServer,
  VideoCreated,
} from "../../../lib/interfaces";

import dotenv from "dotenv";
dotenv.config();

const db = getFirestore(paidApp);

const videoCollection = "swiftube_video";
// const videoCollection = "video";
const videoCollectionRef = collection(db, videoCollection);
const customerCollection = "clerk_user";
const customerCollectionRef = collection(db, customerCollection);

// Not in use right now.
// const tokenCollectionRef = collection(db, "token");

// USER (Customer)
// export async function getCustomerDetails({ userId }: { userId: string }) {
//   console.time("getCustomerDetails");

//   let customer = await getCustomer(userId);

//   if (!!!customer) {
//     // TODO: Keep free credits system in redis?
//     // const creditsForNewUsers = await HowManyFreeCreditsToGive()

//     await createNewCustomer({
//       userId,
//       data: {
//         userId,
//         redFlags: 0,
//         isBanned: false,
//         initialFreeCredits: creditsForNewUsers,
//         credits: 0,
//         videosCreated: [],
//       },
//     });

//     customer = await getCustomer(userId);
//     console.log("Created new customer:", customer.userId);
//   }

//   console.timeEnd("getCustomerDetails");
//   return customer;
// }

export async function getCustomer(userId: string) {
  const newDocRef = doc(db, customerCollection, userId);
  const customer = await getDoc(newDocRef);
  const usableData = customer.data() as Customer;

  return usableData;
}

export async function createNewCustomer(props: {
  userId: string;
  data: Customer;
}): Promise<{ success: boolean }> {
  try {
    // Add a new customer document to the database
    await setDoc(doc(customerCollectionRef, props.userId), props.data, {
      merge: true,
    });

    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false };
  }
}

export async function updateCustomer(props: {
  userId: string;
  data: Customer;
}): Promise<{ success: boolean }> {
  // SAME AS CREATE NEW Customer function

  try {
    // Update customer document to the database
    await setDoc(doc(customerCollectionRef, props.userId), props.data, {
      merge: true,
    });

    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false };
  }
}

export function canCustomerCreateVideo(customer: Customer): boolean {
  try {
    // let canCreateVideo = false;
    // if (customer.credits !== 0 && !customer.isBanned) canCreateVideo = true;

    return (
      // Does customer have free or paid credits?
      (customer?.credits >= 1 || customer?.initialFreeCredits >= 1) &&
      // Is customer banned?
      !customer?.isBanned
    );
  } catch (err) {
    console.error(err);
    return false;
  }
}

export async function banUser(userId: string) {
  try {
    const customer = await getCustomer(userId);
    await updateCustomer({
      userId,
      data: { ...customer, isBanned: true },
    });

    return { ok: true, error: null };
  } catch (err) {
    console.error(err);
    return { ok: false, error: err };
  }
}

// VIDEO
// export async function initializeNewVideo(props: {
//   userId: string;
//   referenceData: string;
//   prompt: string;
// }) {
//   const { userId, referenceData, prompt } = props;

//   // TODO: add Time/date randomness to this

//   const uniqueRandomness = new Date().getTime().toPrecision(20);
//   const seed = md5(userId + referenceData + prompt + uniqueRandomness);
//   const uniqueVideoId = generateDeterministicVideoId(seed);

//   const { isSuccess, message } = await createNewVideoInDB({
//     videoId: uniqueVideoId,
//     userId,
//     videoToCreate: {
//       userId,
//       prompt,
//       referenceData,
//       status: "INITIALIZED",
//       message:
//         "Initialized video, waiting for the backend server to process...",
//       uniqueId: uniqueVideoId,
//     },
//   });

//   if (!isSuccess)
//     return {
//       error: message,
//       isSuccess,
//       message:
//         "An error occurred. Unable to create video. Please try again after some time.",
//       videoId: uniqueVideoId,
//     };

//   const { isSuccess: isServerSuccess, message: serverMsg } =
//     await sendReqToServer({ userId, videoId: uniqueVideoId });

//   // This should be actually verified from above...
//   // const isServerSuccess = true;

//   return {
//     error: isServerSuccess ? "" : serverMsg,
//     isSuccess: isServerSuccess,
//     message: isServerSuccess
//       ? "Hey! Something went wrong on the server side. If you're the user, contact support for assistance. If you're the admin, check server logs for details."
//       : "Server response was a success!",
//     videoId: uniqueVideoId,
//   };
// }

export async function createNewVideoInDB(props: {
  videoId: string;
  videoToCreate: Pick<
    FinalVideoDataFromServer,
    | "message"
    | "prompt"
    | "referenceData"
    | "status"
    | "uniqueId"
    | "userId"
    | "error"
  >;
  // videoToCreate: Omit<
  //   FinalVideoDataFromServer,
  //   "data" | "metadata" | "creditType"
  // >;
  userId: string;
}): Promise<{
  isSuccess: boolean;
  message: string;
  // videoData: Partial<FinalVideoDataFromServer> | null;
}> {
  const { videoId, videoToCreate, userId } = props;

  const customer = await getCustomer(userId);

  const isUserAllowed = canCustomerCreateVideo(customer);

  if (!isUserAllowed)
    return {
      isSuccess: false,
      message: `User not allowed to create this video [${videoId}]`,
      // videoData: null,
    };

  console.log(`Creating new video: ${videoId}`);

  /** Update the customer
   * * Reduce user's free/paid credits by 1.
   * * Push the newly craeted video to user's collection.
   * */

  const updatedCustomer = structuredClone(customer);

  let creditType: FinalVideoDataFromServer["creditType"];

  if (customer.initialFreeCredits > 0) {
    creditType = "free";
    updatedCustomer.initialFreeCredits = customer.initialFreeCredits - 1;
  } else {
    creditType = "paid";
    updatedCustomer.credits = customer.credits - 1;
  }

  // * Append the new video to user's created list
  // * This method is better than updatedCustomer.videosCreated.push()
  let videosCreated: VideoCreated[] = [];

  if (updatedCustomer?.videosCreated.length > 0)
    videosCreated = [...updatedCustomer.videosCreated];

  videosCreated.push({ videoId });

  updatedCustomer.videosCreated = videosCreated;

  const newVideo: Omit<FinalVideoDataFromServer, "data" | "metadata"> = {
    ...videoToCreate,
    createdAt: new Date().toDateString(),
    isPublic: false,
    render: {
      error: "",
      msg: "Render not initiated yet.",
      status: "PENDING",
      url: "",
    },
    creditType,
  };

  // Add a new document in the collection
  await setDoc(doc(videoCollectionRef, videoId), newVideo, {
    merge: true,
  });

  // updatedCustomer.videosCreated.push({videoId});

  await updateCustomer({ userId, data: updatedCustomer });

  // const newVideo = await getVideoFromDB(videoId);

  // update
  return {
    isSuccess: true,
    message: "Video created successfully.",
    // videoData: newVideo,
  };
}

export async function updateVideoInDB(props: {
  videoId: string;
  videoData: Omit<
    FinalVideoDataFromServer,
    "data" | "metadata" | "prompt" | "referenceData" | "creditType"
  >;
}): Promise<{
  isSuccess: boolean;
  message: string;
  videoData: Partial<FinalVideoDataFromServer>;
}> {
  const { videoId, videoData: videoToCreate } = props;

  console.log(`Uploading video to DB: ${videoId}`);

  // const oldVideo = await getVideoFromDB(videoId);

  // Update document in the collection, by only supplying updated contents.
  await setDoc(doc(videoCollectionRef, videoId), videoToCreate, {
    merge: true,
  });

  const newVideo = await getVideoFromDB(videoId);

  // update
  return {
    isSuccess: true,
    message: "Video created successfully.",
    videoData: newVideo,
  };
}

export async function getVideoFromDB(
  id: string
): Promise<FinalVideoDataFromServer> {
  // console.log(`Fetching video: ${id}`);

  const newDocRef = doc(db, videoCollection, id);
  const video = await getDoc(newDocRef);
  const usableData = video.data() as FinalVideoDataFromServer;

  return usableData;
}

export async function getVideos(
  videoIds: string[]
): Promise<FinalVideoDataFromServer[] | []> {
  const fetchPromises = videoIds.map((id) => getVideoFromDB(id));
  const videos = await Promise.all(fetchPromises);
  return videos || [];
}

// export async function getTokenFromDB(id: string): Promise<{
//   token: Awaited<ReturnType<typeof getDoc>>;
//   usableData: TokenInDB;
// }> {
//   // console.log(`about to fetch token with ID: ${id}`);

//   const newDocRef = doc(db, "token", id);
//   const token = await getDoc(newDocRef);
//   const usableData = token.data() as TokenInDB;

//   return { usableData, token };
// }

// export async function updateTokenInDB(
//   id: string,
//   token: TokenInDB
// ): Promise<{
//   updatedToken: Awaited<ReturnType<typeof getDoc>>;
//   usableData: TokenInDB;
// }> {
//   console.log(`Updating token with ID: ${id}`);

//   // Update document in collection "Token"
//   await setDoc(doc(tokenCollectionRef, id), token, {
//     merge: true,
//   });

//   // Get the updated Token
//   const { token: updatedToken, usableData } = await getTokenFromDB(id);

//   return { usableData, updatedToken };
// }
