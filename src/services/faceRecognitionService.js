import {
  env,
  bufferToImage,
  detectSingleFace,
  SsdMobilenetv1Options,
  LabeledFaceDescriptors,
  FaceMatcher,
} from "face-api.js";
import { Canvas, Image, ImageData } from "canvas";

// Configure face-api.js to use node-canvas
env.monkeyPatch({ Canvas, Image, ImageData });

/**
 * Find matches for a face image against stored descriptors
 * This follows the exact same logic as the React facial recognition component
 *
 * @param {Buffer} imageBuffer - The image buffer to match
 * @param {Array} storedDescriptors - Array of objects with format: { label: string (JSON), descriptor: Float32Array }
 * @param {number} distanceThreshold - Maximum distance to consider a match (default: 0.5)
 * @returns {Promise<Array>} - Array of matches with similarity info
 */
export async function findMatches(
  imageBuffer,
  storedDescriptors,
  distanceThreshold = 0.5
) {
  try {
    // Extract descriptor from image using same detector as React code
    const img = await bufferToImage(imageBuffer);

    const detection = await detectSingleFace(
      img,
      new SsdMobilenetv1Options({ minConfidence: 0.5 })
    )
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      return [];
    }

    // Convert storedDescriptors to LabeledFaceDescriptors format
    const labeledDescriptors = storedDescriptors
      .map((stored) => {
        // Handle different input formats
        let label, descriptor;

        if (stored.label && stored.descriptor) {
          // Already in correct format
          label = stored.label;
          descriptor = Array.isArray(stored.descriptor)
            ? Float32Array.from(stored.descriptor)
            : stored.descriptor;
        } else if (stored.nome && stored.codigoHub && stored.face) {
          // Format: { nome, codigoHub, face: descriptor }
          label = JSON.stringify({
            nome: stored.nome,
            codigoHub: stored.codigoHub,
          });
          descriptor =
            typeof stored.face === "string"
              ? Float32Array.from(JSON.parse(stored.face))
              : Float32Array.from(stored.face);
        } else if (stored.descriptor) {
          // Format: { descriptor: [...] } with other metadata
          label = JSON.stringify({
            nome: stored.nome || "unknown",
            codigoHub: stored.codigoHub || "unknown",
          });
          descriptor = Array.isArray(stored.descriptor)
            ? Float32Array.from(stored.descriptor)
            : stored.descriptor;
        } else {
          return null;
        }

        return new LabeledFaceDescriptors(label, [descriptor]);
      })
      .filter(Boolean);

    if (labeledDescriptors.length === 0) {
      return [];
    }

    // Create FaceMatcher exactly like React code
    const faceMatcher = new FaceMatcher(labeledDescriptors);

    // Find best match
    const bestMatch = faceMatcher.findBestMatch(detection.descriptor);

    // Apply same threshold logic as React: distance > 0.5 means reject
    if (bestMatch.distance > distanceThreshold) {
      return [
        {
          matched: false,
          reason: "Face not recognized with sufficient confidence",
          distance: bestMatch.distance,
          label: "unknown",
        },
      ];
    }

    // Check if unknown
    if (bestMatch.label === "unknown") {
      return [
        {
          matched: false,
          reason: "Face not recognized",
          distance: bestMatch.distance,
          label: "unknown",
        },
      ];
    }

    // Parse the label to get participant data
    let participantData;
    try {
      participantData = JSON.parse(bestMatch.label);
    } catch (error) {
      participantData = { label: bestMatch.label };
    }

    return [
      {
        matched: true,
        distance: bestMatch.distance,
        similarity: 1 - bestMatch.distance, // Convert distance to similarity score
        participant: participantData,
        label: bestMatch.label,
      },
    ];
  } catch (error) {
    console.error("Error finding matches:", error);
    throw error;
  }
}

/**
 * Find matches using a descriptor directly (without extracting from image)
 *
 * @param {Array|Float32Array|string} queryDescriptor - The face descriptor to match
 * @param {Array} storedDescriptors - Array of stored face descriptors
 * @param {number} distanceThreshold - Maximum distance to consider a match (default: 0.5)
 * @returns {Promise<Array>} - Array of matches
 */
export async function findMatchesByDescriptor(
  queryDescriptor,
  storedDescriptors,
  distanceThreshold = 0.5
) {
  try {
    // Ensure queryDescriptor is Float32Array
    let queryDesc;
    if (typeof queryDescriptor === "string") {
      queryDesc = Float32Array.from(JSON.parse(queryDescriptor));
    } else if (Array.isArray(queryDescriptor)) {
      queryDesc = Float32Array.from(queryDescriptor);
    } else {
      queryDesc = queryDescriptor;
    }

    // Convert storedDescriptors to LabeledFaceDescriptors format
    const labeledDescriptors = storedDescriptors
      .map((stored) => {
        let label, descriptor;

        if (stored.label && stored.descriptor) {
          label = stored.label;
          descriptor = Array.isArray(stored.descriptor)
            ? Float32Array.from(stored.descriptor)
            : stored.descriptor;
        } else if (stored.nome && stored.codigoHub && stored.face) {
          label = JSON.stringify({
            nome: stored.nome,
            codigoHub: stored.codigoHub,
          });
          descriptor =
            typeof stored.face === "string"
              ? Float32Array.from(JSON.parse(stored.face))
              : Float32Array.from(stored.face);
        } else if (stored.descriptor) {
          label = JSON.stringify({
            nome: stored.nome || "unknown",
            codigoHub: stored.codigoHub || "unknown",
          });
          descriptor = Array.isArray(stored.descriptor)
            ? Float32Array.from(stored.descriptor)
            : stored.descriptor;
        } else {
          return null;
        }

        return new LabeledFaceDescriptors(label, [descriptor]);
      })
      .filter(Boolean);

    if (labeledDescriptors.length === 0) {
      return [];
    }

    // Create FaceMatcher
    const faceMatcher = new FaceMatcher(labeledDescriptors);

    // Find best match
    const bestMatch = faceMatcher.findBestMatch(queryDesc);

    // Apply same threshold logic
    if (bestMatch.distance > distanceThreshold) {
      return [
        {
          matched: false,
          reason: "Face not recognized with sufficient confidence",
          distance: bestMatch.distance,
          label: "unknown",
        },
      ];
    }

    if (bestMatch.label === "unknown") {
      return [
        {
          matched: false,
          reason: "Face not recognized",
          distance: bestMatch.distance,
          label: "unknown",
        },
      ];
    }

    // Parse the label
    let participantData;
    try {
      participantData = JSON.parse(bestMatch.label);
    } catch (error) {
      participantData = { label: bestMatch.label };
    }

    return [
      {
        matched: true,
        distance: bestMatch.distance,
        similarity: 1 - bestMatch.distance,
        participant: participantData,
        label: bestMatch.label,
      },
    ];
  } catch (error) {
    console.error("Error finding matches by descriptor:", error);
    throw error;
  }
}

/**
 * Helper function to create labeled descriptors in the correct format
 * Use this when storing descriptors in your database
 *
 * @param {string} nome - Participant name
 * @param {string} codigoHub - Participant code
 * @param {Array|Float32Array} descriptor - Face descriptor
 * @returns {Object} - Object ready to be stored
 */
export function createLabeledDescriptor(nome, codigoHub, descriptor) {
  return {
    label: JSON.stringify({ nome, codigoHub }),
    descriptor: Array.isArray(descriptor) ? descriptor : Array.from(descriptor),
  };
}
