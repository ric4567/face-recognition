# Face Recognition Service

A Node.js service for validating face images and matching faces using face-api.js.

## Features

- **Face Validation**: Validates image quality and extracts face descriptors
- **Face Recognition**: Matches faces against stored descriptors
- **RESTful API**: Easy-to-use HTTP endpoints
- **Base64 & File Upload Support**: Accepts images in multiple formats

## Installation

1. Install dependencies:
```bash
npm install
```

2. (Optional) Download face-api.js models locally for offline use:
```bash
# Models will be downloaded from CDN on first run if not present locally
# To use local models, create a models/ directory and download from:
# https://github.com/vladmandic/face-api/tree/master/model
```

## Usage

### Start the server:

```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

The server will start on port 3000 (or the port specified in `PORT` environment variable).

## API Endpoints

### 1. Health Check

**GET** `/health`

Check if the service is running and models are loaded.

**Response:**
```json
{
  "status": "ok",
  "modelsReady": true,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 2. Validate Face and Extract Descriptor

**POST** `/api/validate`

Validates a face image and returns the face descriptor if valid.

**Request Options:**

**Option A: File Upload**
- Content-Type: `multipart/form-data`
- Field name: `image`
- Value: Image file

**Option B: Base64 String**
- Content-Type: `application/json`
- Body:
```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
}
```

**Response (Success):**
```json
{
  "isValid": true,
  "descriptor": [0.123, -0.456, ...],
  "detectionScore": 0.95,
  "faceBox": {
    "x": 100,
    "y": 150,
    "width": 200,
    "height": 250
  },
  "message": "Face validated successfully"
}
```

**Response (Validation Failed):**
```json
{
  "isValid": false,
  "errors": [
    "Rosto muito distante - aproxime-se da câmera."
  ],
  "message": "Face validation failed"
}
```

### 3. Recognize Face from Image

**POST** `/api/recognize`

Matches a face image against stored descriptors.

**Request Body:**
```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "descriptors": [
    [0.123, -0.456, ...],
    [0.789, -0.012, ...]
  ]
}
```

**Response:**
```json
{
  "matches": [
    {
      "index": 0,
      "similarity": 0.85,
      "distance": 0.45,
      "metadata": null
    }
  ],
  "message": "Found 1 match(es)"
}
```

### 4. Recognize Face from Descriptor

**POST** `/api/recognize-descriptor`

Matches a face descriptor against stored descriptors (without processing an image).

**Request Body:**
```json
{
  "descriptor": [0.123, -0.456, ...],
  "descriptors": [
    {
      "id": "user1",
      "face": "[0.789, -0.012, ...]"
    },
    {
      "id": "user2",
      "descriptor": [0.345, -0.678, ...]
    }
  ],
  "threshold": 0.6
}
```

**Response:**
```json
{
  "matches": [
    {
      "index": 0,
      "similarity": 0.85,
      "distance": 0.45,
      "metadata": {
        "id": "user1"
      }
    }
  ],
  "threshold": 0.6,
  "message": "Found 1 match(es) above threshold 0.6"
}
```

## Validation Rules

The service validates faces based on:

- **Detection Score**: Minimum 0.9 (face detection confidence)
- **Face Size**: Face must occupy 10-60% of the image area
- **Face Centering**: Face center must be within 25% of image center

## Recognition Threshold

- Default similarity threshold: **0.6** (60%)
- Higher threshold = stricter matching (fewer false positives)
- Lower threshold = more lenient matching (more matches, but may include false positives)
- Recommended range: 0.5 - 0.7

## Example Usage

### Using cURL

**Validate face:**
```bash
curl -X POST http://localhost:3000/api/validate \
  -F "image=@photo.jpg"
```

**Recognize face:**
```bash
curl -X POST http://localhost:3000/api/recognize \
  -H "Content-Type: application/json" \
  -d '{
    "image": "data:image/jpeg;base64,...",
    "descriptors": [[0.123, -0.456, ...]]
  }'
```

### Using JavaScript/TypeScript

```javascript
// Validate and get descriptor
const response = await fetch('http://localhost:3000/api/validate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    image: base64ImageString
  })
});

const result = await response.json();
if (result.isValid) {
  const descriptor = result.descriptor;
  // Save descriptor to database
}

// Recognize face
const recognizeResponse = await fetch('http://localhost:3000/api/recognize', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    image: base64ImageString,
    descriptors: storedDescriptors // Array of descriptors from database
  })
});

const matches = await recognizeResponse.json();
console.log('Matches:', matches.matches);
```

## Environment Variables

- `PORT`: Server port (default: 3000)

## Notes

- Models are loaded on server startup (may take a few seconds)
- First request may be slower while models initialize
- Supports both local models and CDN fallback
- Descriptors are 128-dimensional vectors (arrays of 128 numbers)

## License

MIT

