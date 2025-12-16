const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Master access code for registration
const MASTER_ACCESS_CODE = process.env.MASTER_ACCESS_CODE || 'AscendedOnly';

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
app.use(express.static('public'));

// Concurrent request limiter
let activeRequests = 0;
const MAX_CONCURRENT = 3;

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

// Configure multer
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { 
    fileSize: 10 * 1024 * 1024,
    files: 20
  }
});

// ============================================
// REGISTRATION ENDPOINT
// ============================================

app.post('/api/register', async (req, res) => {
  try {
    const { masterCode, username, password, apiKey } = req.body;

    // Validate master access code
    if (masterCode !== MASTER_ACCESS_CODE) {
      return res.status(403).json({ 
        success: false, 
        error: 'Invalid master access code' 
      });
    }

    // Validate inputs
    if (!username || !password || !apiKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'All fields required' 
      });
    }

    if (username.length < 3) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username must be at least 3 characters' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        error: 'Password must be at least 6 characters' 
      });
    }

    // Check if username already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('username')
      .eq('username', username)
      .single();

    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username already taken' 
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert user
    const { data, error } = await supabase
      .from('users')
      .insert([{
        username: username,
        password_hash: passwordHash,
        wavespeed_api_key: apiKey
      }])
      .select();

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Registration failed' 
      });
    }

    res.json({ 
      success: true, 
      message: 'Account created successfully' 
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error' 
    });
  }
});

// ============================================
// LOGIN ENDPOINT
// ============================================

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username and password required' 
      });
    }

    // Get user from database
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    if (error || !user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid credentials' 
      });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid credentials' 
      });
    }

    // Return success with API key
    res.json({ 
      success: true, 
      username: user.username,
      apiKey: user.wavespeed_api_key 
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error' 
    });
  }
});

// ============================================
// FACE SWAP ENDPOINT
// ============================================

function bufferToBase64(buffer) {
  return buffer.toString('base64');
}

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

    const faceRefBase64 = bufferToBase64(faceRef.buffer);
    const targetBase64 = bufferToBase64(target.buffer);

    console.log(`Sending request to WaveSpeed...`);

    const dimensions = req.body.dimensions || '2572*3576';

    const payload = {
      size: dimensions,
      max_images: 1,
      enable_base64_output: false,
      enable_sync_mode: true,
      seed: 42,
      prompt: "Recreate img2 using the face identity from img1. Transfer ONLY the facial features and hair (color, style, texture) from img1. Copy everything else exactly from img2: body proportions, pose, angle, clothing, accessories, background, lighting, composition. If img2 shows genitals, recreate them exactly as shown. Natural amateur photography, iPhone quality, visible skin texture, realistic lighting, seamless integration",
      negative_prompt: "text, variations, different background, different pose, different lightning, inconsistent, caption, watermark, logo, emoji, subtitles, text overlay, banner, stickers, piercings, tattoos, handwriting, different head position",
      images: [
        `data:image/jpeg;base64,${faceRefBase64}`,
        `data:image/jpeg;base64,${faceRefBase64}`,
        `data:image/jpeg;base64,${faceRefBase64}`,
        `data:image/jpeg;base64,${targetBase64}`
      ]
    };

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

    console.log(`Request completed successfully`);

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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 ONLY ASCENDING Server running on port ${PORT}`);
  console.log(`📍 Access at: http://localhost:${PORT}`);
  console.log(`⚡ Supabase auth enabled`);
});
