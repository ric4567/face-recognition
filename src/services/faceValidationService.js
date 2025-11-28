import {
  env,
  nets,
  detectSingleFace,
  TinyFaceDetectorOptions,
  resizeResults,
} from "face-api.js";
import { Canvas, Image, ImageData, loadImage, createCanvas } from "canvas";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Configure face-api.js to use node-canvas
env.monkeyPatch({ Canvas, Image, ImageData });

let modelsLoaded = false;

export async function initialize() {
  if (modelsLoaded) {
    return;
  }
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const MODEL_DIR = path.join(__dirname, "..", "models");

  // Check if models directory exists, otherwise use CDN
  const useLocalModels = existsSync(MODEL_DIR);

  const cdnModelPath =
    "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/";

  try {
    if (useLocalModels) {
      await Promise.all([
        nets.tinyFaceDetector.loadFromDisk(MODEL_DIR),
        nets.faceLandmark68Net.loadFromDisk(MODEL_DIR),
        nets.faceRecognitionNet.loadFromDisk(MODEL_DIR),
        nets.ssdMobilenetv1.loadFromDisk(MODEL_DIR),
      ]);
    } else {
      await Promise.all([
        nets.tinyFaceDetector.loadFromUri(cdnModelPath),
        nets.faceLandmark68Net.loadFromUri(cdnModelPath),
        nets.faceRecognitionNet.loadFromUri(cdnModelPath),
        nets.ssdMobilenetv1.loadFromUri(cdnModelPath),
      ]);
    }

    modelsLoaded = true;
    console.log("Face-api.js models loaded successfully");
  } catch (error) {
    console.error("Error loading models:", error);
    throw new Error(`Failed to load face-api.js models: ${error.message}`);
  }
}

// Helper function to check brightness
async function checkBrightness(canvas) {
  const ctx = canvas.getContext("2d");
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    // Calculate perceived brightness using luminosity formula
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    sum += 0.299 * r + 0.587 * g + 0.114 * b;
  }

  return sum / (data.length / 4);
}

export async function validateAndExtractDescriptor(
  imageBuffer,
  videoWidth = 854,
  videoHeight = 480
) {
  if (!modelsLoaded) {
    throw new Error("Models not loaded. Call initialize() first.");
  }

  const errors = [];

  try {
    // Convert buffer to image using node-canvas loadImage
    const img = await loadImage(imageBuffer);

    // Create canvas from image
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    // Detect face
    const detection = await detectSingleFace(img, new TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      errors.push("Nenhum rosto detectado na foto");
    } else {
      const { detection: faceDetection } = detection;

      // Verificar qualidade de detecção (confiança)
      if (faceDetection.score < 0.9) {
        errors.push("Qualidade da detecção baixa - tire outra foto");
      }

      // Verificar se o rosto ocupa área adequada
      const faceArea = faceDetection.box.width * faceDetection.box.height;
      const imageArea = canvas.width * canvas.height;
      const faceRatio = faceArea / imageArea;

      if (faceRatio < 0.1) {
        errors.push("Rosto muito distante - aproxime-se da câmera");
      } else if (faceRatio > 0.6) {
        errors.push("Rosto muito próximo - afaste-se da câmera");
      }

      // Verificar centralização do rosto
      const faceCenterX = faceDetection.box.x + faceDetection.box.width / 2;
      const imageCenterX = canvas.width / 2;
      const xOffset = Math.abs(faceCenterX - imageCenterX);

      if (xOffset > canvas.width * 0.25) {
        errors.push("Rosto não centralizado - posicione-se no centro");
      }

      // Verificar iluminação
      const brightness = await checkBrightness(canvas);

      if (brightness < 60) {
        errors.push("Foto muito escura - melhore a iluminação");
      } else if (brightness > 200) {
        errors.push("Foto muito clara - reduza a iluminação");
      }
    }

    // Resultado da validação
    return {
      isValid: errors.length === 0,
      errors,
      descriptor: detection ? Array.from(detection.descriptor) : undefined,
      detectionScore: detection ? detection.detection.score : undefined,
      faceBox: detection
        ? {
            x: detection.detection.box.x,
            y: detection.detection.box.y,
            width: detection.detection.box.width,
            height: detection.detection.box.height,
          }
        : undefined,
    };
  } catch (error) {
    console.error("Face validation error:", error);
    errors.push("Erro ao processar a imagem");
    return { isValid: false, errors };
  }
}
