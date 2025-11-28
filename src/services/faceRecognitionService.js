import {
  env,
  bufferToImage,
  detectSingleFace,
  TinyFaceDetectorOptions,
} from "face-api.js";
import { Canvas, Image, ImageData } from "canvas";

// Configure face-api.js to use node-canvas
env.monkeyPatch({ Canvas, Image, ImageData });

/**
 * Calculate Euclidean distance between two face descriptors
 * Lower distance = more similar faces
 */
function euclideanDistance(descriptor1, descriptor2) {
  if (descriptor1.length !== descriptor2.length) {
    throw new Error("Descriptors must have the same length");
  }

  let sum = 0;
  for (let i = 0; i < descriptor1.length; i++) {
    const diff = descriptor1[i] - descriptor2[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

/**
 * Calculate cosine similarity between two face descriptors
 * Higher similarity = more similar faces (range: 0-1)
 */
function cosineSimilarity(descriptor1, descriptor2) {
  if (descriptor1.length !== descriptor2.length) {
    throw new Error("Descriptors must have the same length");
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < descriptor1.length; i++) {
    dotProduct += descriptor1[i] * descriptor2[i];
    norm1 += descriptor1[i] * descriptor1[i];
    norm2 += descriptor2[i] * descriptor2[i];
  }

  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}

/**
 * Find matches for a face image against stored descriptors
 */
export async function findMatches(
  imageBuffer,
  storedDescriptors,
  threshold = 0.6
) {
  try {
    // Extract descriptor from image
    const img = await bufferToImage(imageBuffer);

    const detection = await detectSingleFace(
      img,
      new TinyFaceDetectorOptions()
    ).withFaceDescriptor();

    if (!detection) {
      return [];
    }

    const queryDescriptor = Array.from(detection.descriptor);

    // Compare with stored descriptors
    const matches = [];

    for (let i = 0; i < storedDescriptors.length; i++) {
      const storedDesc = storedDescriptors[i];

      // Handle descriptor format - could be array or object with descriptor property
      let descriptor;
      if (Array.isArray(storedDesc)) {
        descriptor = storedDesc;
      } else if (
        storedDesc.descriptor &&
        Array.isArray(storedDesc.descriptor)
      ) {
        descriptor = storedDesc.descriptor;
      } else if (storedDesc.face && typeof storedDesc.face === "string") {
        // If face is a JSON string, parse it
        try {
          descriptor = JSON.parse(storedDesc.face);
        } catch {
          continue;
        }
      } else {
        continue;
      }

      // Calculate similarity
      const similarity = cosineSimilarity(queryDescriptor, descriptor);
      const distance = euclideanDistance(queryDescriptor, descriptor);

      if (similarity >= threshold) {
        matches.push({
          index: i,
          similarity: similarity,
          distance: distance,
          metadata:
            typeof storedDesc === "object" && !Array.isArray(storedDesc)
              ? { ...storedDesc, descriptor: undefined, face: undefined }
              : null,
        });
      }
    }

    // Sort by similarity (highest first)
    matches.sort((a, b) => b.similarity - a.similarity);

    return matches;
  } catch (error) {
    console.error("Error finding matches:", error);
    throw error;
  }
}

/**
 * Find matches using a descriptor directly (without extracting from image)
 */
export async function findMatchesByDescriptor(
  queryDescriptor,
  storedDescriptors,
  threshold = 0.6
) {
  try {
    // Ensure queryDescriptor is an array
    let queryDesc = queryDescriptor;
    if (typeof queryDescriptor === "string") {
      try {
        queryDesc = JSON.parse(queryDescriptor);
      } catch {
        throw new Error("Invalid descriptor format");
      }
    }

    if (!Array.isArray(queryDesc)) {
      throw new Error("Descriptor must be an array");
    }

    const matches = [];

    for (let i = 0; i < storedDescriptors.length; i++) {
      const storedDesc = storedDescriptors[i];

      // Handle descriptor format
      let descriptor;
      if (Array.isArray(storedDesc)) {
        descriptor = storedDesc;
      } else if (
        storedDesc.descriptor &&
        Array.isArray(storedDesc.descriptor)
      ) {
        descriptor = storedDesc.descriptor;
      } else if (storedDesc.face && typeof storedDesc.face === "string") {
        try {
          descriptor = JSON.parse(storedDesc.face);
        } catch {
          continue;
        }
      } else {
        continue;
      }

      // Calculate similarity
      const similarity = cosineSimilarity(queryDesc, descriptor);
      const distance = euclideanDistance(queryDesc, descriptor);

      if (similarity >= threshold) {
        matches.push({
          index: i,
          similarity: similarity,
          distance: distance,
          metadata:
            typeof storedDesc === "object" && !Array.isArray(storedDesc)
              ? { ...storedDesc, descriptor: undefined, face: undefined }
              : null,
        });
      }
    }

    // Sort by similarity (highest first)
    matches.sort((a, b) => b.similarity - a.similarity);

    return matches;
  } catch (error) {
    console.error("Error finding matches by descriptor:", error);
    throw error;
  }
}
