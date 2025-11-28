import express, { json, urlencoded } from "express";
import cors from "cors";
import multer, { memoryStorage } from "multer";
import path from "path";
import {
  initialize,
  validateAndExtractDescriptor,
} from "./services/faceValidationService.js";
import {
  findMatches,
  findMatchesByDescriptor,
} from "./services/faceRecognitionService.js";
import { Blob } from "buffer";

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(json({ limit: "50mb" }));
app.use(urlencoded({ extended: true, limit: "50mb" }));

// Configure multer for file uploads
const upload = multer({
  storage: memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Initialize face-api.js models
let modelsReady = false;

async function initializeModels() {
  try {
    await initialize();
    modelsReady = true;
  } catch (error) {
    console.error("Error loading models:", error);
    process.exit(1);
  }
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    modelsReady,
    timestamp: new Date().toISOString(),
  });
});

// Validate face and extract descriptor
app.post("/api/validate", upload.single("image"), async (req, res) => {
  try {
    if (!modelsReady) {
      return res.status(503).json({
        error: "Models are still loading. Please try again in a moment.",
      });
    }

    let imageBuffer;
    let imageBase64;

    // Handle file upload
    if (req.file) {
      imageBuffer = req.file.buffer;
    }
    // Handle base64 from body
    else if (req.body.image) {
      imageBase64 = req.body.image;
      // Remove data URL prefix if present
      if (imageBase64.startsWith("data:image")) {
        imageBase64 = imageBase64.split(",")[1];
      }
      imageBuffer = Buffer.from(imageBase64, "base64");
    } else {
      return res.status(400).json({
        error:
          'No image provided. Send either a file upload with key "image" or base64 string in body.image',
      });
    }

    // Convert Buffer to Blob (preserve mime type if available)
    let mimeType = "application/octet-stream";
    if (req.file && req.file.mimetype) {
      mimeType = req.file.mimetype;
    } else if (
      req.body.image &&
      typeof req.body.image === "string" &&
      req.body.image.startsWith("data:")
    ) {
      const match = req.body.image.match(
        /^data:(image\/[a-zA-Z0-9.+-]+);base64,/
      );
      if (match) mimeType = match[1];
    }
    const imageBlob = imageBuffer;

    const result = await validateAndExtractDescriptor(imageBlob);

    if (!result.isValid) {
      return res.status(200).json({
        isValid: false,
        errors: result.errors,
        message: "Face validation failed",
      });
    }

    res.json({
      isValid: true,
      descriptor: result.descriptor,
      detectionScore: result.detectionScore,
      faceBox: result.faceBox,
      message: "Face validated successfully",
    });
  } catch (error) {
    console.error("Validation error:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

// Recognize/match face against stored descriptors
app.post("/api/recognize", async (req, res) => {
  try {
    if (!modelsReady) {
      return res.status(503).json({
        error: "Models are still loading. Please try again in a moment.",
      });
    }

    const { image, descriptors } = req.body;

    if (!image) {
      return res.status(400).json({
        error: "No image provided. Send base64 string in body.image",
      });
    }

    if (
      !descriptors ||
      !Array.isArray(descriptors) ||
      descriptors.length === 0
    ) {
      return res.status(400).json({
        error:
          "No descriptors provided. Send array of descriptors in body.descriptors",
      });
    }

    // Parse descriptors if they're strings
    const parsedDescriptors = descriptors.map((desc) => {
      if (typeof desc === "string") {
        try {
          return JSON.parse(desc);
        } catch {
          return desc;
        }
      }
      return desc;
    });

    // Handle base64 image
    let imageBase64 = image;
    if (imageBase64.startsWith("data:image")) {
      imageBase64 = imageBase64.split(",")[1];
    }
    const imageBuffer = Buffer.from(imageBase64, "base64");

    const matches = await findMatches(imageBuffer, parsedDescriptors);

    res.json({
      matches,
      message: `Found ${matches.length} match(es)`,
    });
  } catch (error) {
    console.error("Recognition error:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

// Batch recognize - match one descriptor against multiple stored descriptors
app.post("/api/recognize-descriptor", async (req, res) => {
  try {
    if (!modelsReady) {
      return res.status(503).json({
        error: "Models are still loading. Please try again in a moment.",
      });
    }

    const { descriptor, descriptors, threshold = 0.6 } = req.body;

    if (!descriptor) {
      return res.status(400).json({
        error: "No descriptor provided. Send descriptor in body.descriptor",
      });
    }

    if (
      !descriptors ||
      !Array.isArray(descriptors) ||
      descriptors.length === 0
    ) {
      return res.status(400).json({
        error:
          "No descriptors provided. Send array of descriptors in body.descriptors",
      });
    }

    // Parse descriptor if it's a string
    let parsedDescriptor = descriptor;
    if (typeof descriptor === "string") {
      try {
        parsedDescriptor = JSON.parse(descriptor);
      } catch {
        // If parsing fails, assume it's already an array string
      }
    }

    // Parse all descriptors
    const parsedDescriptors = descriptors.map((desc, index) => {
      if (typeof desc === "string") {
        try {
          return JSON.parse(desc);
        } catch {
          return desc;
        }
      }
      return desc;
    });

    const matches = await findMatchesByDescriptor(
      parsedDescriptor,
      parsedDescriptors,
      threshold
    );

    res.json({
      matches,
      threshold,
      message: `Found ${matches.length} match(es) above threshold ${threshold}`,
    });
  } catch (error) {
    console.error("Recognition error:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

// Start server
async function startServer() {
  await initializeModels();

  app.listen(PORT, () => {
    console.log(`Face Recognition Service running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(
      `Validate endpoint: POST http://localhost:${PORT}/api/validate`
    );
    console.log(
      `Recognize endpoint: POST http://localhost:${PORT}/api/recognize`
    );
  });
}

startServer().catch(console.error);
