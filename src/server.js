const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
app.use(express.static('public'));

// Concurrent request limiter
let activeRequests = 0;
const MAX_CONCURRENT = 3; // Limit to 3 simultaneous on FREE tier

function checkCapacity(req, res, next) {
  if (activeRequests >= MAX_CONCURRENT) {
    return res.status(503).json({ 
      error: 'Server at capacity. Please wait and try again.',
      activeRequests,
      maxConcurrent: MAX_CONCURRENT
    });
  }
  activeRequests++;
  res.on('finish', () => activeRequests--);
  res.on('close', () => activeRequests--);
  next();
}

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB limit per file
    files: 20
  }
});

// Simple password authentication - Multiple clients
const CLIENT_PASSWORDS = {
  'client1': process.env.CLIENT1_PASSWORD || 'DomCrea26',
  'client3': process.env.CLIENT3_PASSWORD || 'Protocol789',
  'client4': process.env.CLIENT4_PASSWORD || 'Elite2024',
  'client5': process.env.CLIENT5_PASSWORD || 'Premium999',
  'client6': process.env.CLIENT6_PASSWORD || 'Exclusive888'
};

// Verify password endpoint
app.post('/api/verify-password', (req, res) => {
  const { username, password } = req.body;
  
  if (CLIENT_PASSWORDS[username] && CLIENT_PASSWORDS[username] === password) {
    res.json({ success: true, username });
  } else {
    res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
});

// Convert image to base64
function bufferToBase64(buffer) {
  return buffer.toString('base64');
}

// Process single image with WaveSpeed SeaDream API
app.post('/api/process-single', checkCapacity, upload.fields([
  { name: 'faceRef', maxCount: 1 },
  { name: 'target', maxCount: 1 }
]), async (req, res) => {
  try {
    const { apiKey } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

    if (!req.files.faceRef || !req.files.target) {
      return res.status(400).json({ error: 'Both face reference and target image required' });
    }

    const faceRef = req.files.faceRef[0];
    const target = req.files.target[0];

    console.log(`Processing single generation...`);

    // Convert images to base64
    const faceRefBase64 = bufferToBase64(faceRef.buffer);
    const targetBase64 = bufferToBase64(target.buffer);

    console.log(`Sending request to WaveSpeed...`);

    // Get dimensions from request (passed from frontend)
    const dimensions = req.body.dimensions || '2572*3576';

    // Prepare payload matching Airtable automation
    const payload = {
      size: dimensions,
      max_images: 1,
      enable_base64_output: false,
      enable_sync_mode: true,
      seed: 42,
      prompt: "Recreate img2 using the face identity from img1. Transfer ONLY the facial features and hair (color, style, texture) from img1. Copy everything else exactly from img2: body proportions, pose, angle, clothing, accessories, background, lighting, composition. If img2 shows genitals, recreate them exactly as shown. Natural amateur photography, iPhone quality, visible skin texture, realistic lighting, seamless integration",
      negative_prompt: "text, variations, different background, different pose, different lightning, inconsistent, caption, watermark, logo, emoji, subtitles, text overlay, banner, stickers, piercings, tattoos, handwriting, different head position",
      images: [
        `data:image/jpeg;base64,${faceRefBase64}`,  // Face reference (3x for weight)
        `data:image/jpeg;base64,${faceRefBase64}`,
        `data:image/jpeg;base64,${faceRefBase64}`,
        `data:image/jpeg;base64,${targetBase64}`    // Target image
      ]
    };

    // Call WaveSpeed API v4 SEQUENTIAL (proven working)
    const response = await axios.post(
      'https://api.wavespeed.ai/api/v3/bytedance/seedream-v4/edit-sequential',
      payload,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 180000 // 3 minute timeout for sync mode
      }
    );

    console.log(`Request completed successfully`);

    // Extract the output image URL from v3 API response
    const data = response.data?.data || response.data;
    const outputUrl = Array.isArray(data?.output) ? data.output[0] : 
                      Array.isArray(data?.outputs) ? data.outputs[0] :
                      typeof data?.output === 'string' ? data.output :
                      response.data?.output?.[0];

    if (!outputUrl) {
      console.error('WaveSpeed response:', JSON.stringify(response.data));
      throw new Error('No output image received from API');
    }

    res.json({
      success: true,
      outputUrl: outputUrl
    });

  } catch (error) {
    console.error('Processing error:', error.message);
    res.status(500).json({ 
      success: false,
      error: error.response?.data?.error || error.message 
    });
  }
});

// NSFW Clothing Removal Endpoint
app.post('/api/remove-clothing', checkCapacity, upload.single('image'), async (req, res) => {
  try {
    const apiKey = req.body.apiKey;
    
    if (!apiKey) {
      return res.status(400).json({ success: false, error: 'API key required' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image provided' });
    }

    console.log('Processing clothing removal request...');

    // Convert image to base64
    const imageBase64 = req.file.buffer.toString('base64');

    // Prepare payload for clothing removal
    const payload = {
      max_images: 1,
      enable_base64_output: false,
      enable_sync_mode: true,
      enable_safety_checker: false,
      nsfw: true,
      explicit_content: true,
      seed: Math.floor(Math.random() * 1000000),
      prompt: "Remove ONLY the clothing from this exact image. Preserve EVERYTHING else identically: exact skin tone and color, all freckles/moles/skin marks, facial features, hair, body proportions, pose, hand position, background, lighting, shadows, image quality, and sharpness. If breasts are visible under clothing, reveal them maintaining the same size, shape, and natural positioning with realistic nipples matching the exact skin tone. The result must look like the original photo with clothing digitally removed - NOT a regenerated image. Keep all fine details, natural skin texture with pores, and the same photographic quality.",
      negative_prompt: "clothing, dressed, clothes, fabric, shirt, pants, underwear, bra, panties, bikini, dress, covered, different skin tone, washed out skin, pale skin, changed skin color, smoothed skin, plastic skin, lost texture, blurry, low quality, regenerated image, different lighting, changed freckles, removed marks, deformed anatomy, distorted body, weird genitals, unnatural pose, different background, moved position, tattoos, text, watermark",
      images: [
        `data:image/jpeg;base64,${imageBase64}`
      ]
    };

    // Call WaveSpeed API v4 SEQUENTIAL
    const response = await axios.post(
      'https://api.wavespeed.ai/api/v3/bytedance/seedream-v4/edit-sequential',
      payload,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 180000
      }
    );

    console.log('Clothing removal completed successfully');

    if (response.data && response.data.data && response.data.data.outputs) {
      const outputUrl = response.data.data.outputs[0];
      res.json({
        success: true,
        outputUrl: outputUrl
      });
    } else {
      throw new Error('Unexpected API response format');
    }

  } catch (error) {
    console.error('Error in clothing removal:', error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data?.message || error.message
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Face Swap Batch Server running on port ${PORT}`);
  console.log(`📍 Access at: http://localhost:${PORT}`);
  console.log(`⚡ Processing mode: SINGLE (one variation at a time)`);
});
