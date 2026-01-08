import dotenv from 'dotenv';
import express from 'express';
import bodyParser from 'body-parser';
import { GoogleGenAI } from "@google/genai";
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import archiver from 'archiver';
import { renderPageToImage } from './renderPageToImage.js';
import { postToInstagram } from './instagram.js';
import glob from 'glob';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve frontend static files
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

// Serve generated images from /images/ route
app.use('/images', express.static(__dirname));

app.use(bodyParser.json());

// Utility function to delete old story images
async function deleteOldImages() {
  const imageGlob = path.join(__dirname, 'story_page_*.png');
  try {
    const oldImages = await new Promise((resolve, reject) => {
      glob(imageGlob, (err, files) => err ? reject(err) : resolve(files));
    });
    await Promise.all(oldImages.map(img => fs.promises.unlink(img)));
    console.log(`[cleanup] Deleted ${oldImages.length} old images`);
  } catch (err) {
    console.warn('[cleanup] Could not delete old images:', err.message);
  }
}

// Fallback models in order of preference
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-3-flash',
  'gemini-2.5-flash-lite'
];

// Utility function to generate content with model fallback
async function generateStoryWithFallback(prompt) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let lastError = null;

  for (const model of GEMINI_MODELS) {
    try {
      console.log(`[story-generation] Attempting with model: ${model}`);
      const response = await ai.models.generateContent({
        model: model,
        contents: prompt
      });
      const story = response.candidates?.[0]?.content?.parts?.[0]?.text || "No story generated.";
      console.log(`[story-generation] Success with model: ${model}`);
      return { story, model };
    } catch (error) {
      lastError = error;
      const errorCode = error.status || error.code;
      const errorMessage = error.message || 'Unknown error';
      console.warn(`[story-generation] Model '${model}' failed: [${errorCode}] ${errorMessage}`);
      
      // Only retry on rate limit or overload errors, not on authentication errors
      if (errorCode === 'RESOURCE_EXHAUSTED' || errorCode === 429 || errorCode === 'UNAVAILABLE' || errorCode === 503) {
        console.log(`[story-generation] Retrying with next model...`);
        continue;
      } else {
        // Don't retry on auth errors, quota errors that aren't rate limits, etc.
        throw error;
      }
    }
  }
  
  // All models failed
  console.error(`[story-generation] All models exhausted or failed`);
  throw lastError || new Error('All Gemini models failed to generate content');
}

// POST /api/instagram
// { imagePaths: [...], caption: '...' }
app.post('/api/instagram', async (req, res) => {
  const { imagePaths, caption, config } = req.body;
  try {
    const result = await postToInstagram(imagePaths, caption, config);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Main story generation endpoint
app.post('/api/story', async (req, res) => {
  // Delete old images before generating new ones
  await deleteOldImages();
  const {
    ERA_OR_CULTURE,
    STORY_OR_CHARACTER,
    hookStyle,
    darknessLevel,
    dialogueDensity,
    moralExplicitness
  } = req.body;

  if (!ERA_OR_CULTURE) {
    return res.status(400).json({ error: 'ERA_OR_CULTURE is required.' });
  }

  // Build the prompt
  const prompt = `You are a master storyteller, historian, and myth-weaver.\n\nYour task is to generate a complete, self-contained story inspired by mythology, philosophy, or history, written in an easy to understand yet engaging, immersive narrative style. The story should feel like it belongs in an ancient storybook—rich in atmosphere, emotion, and meaning.\n\nEra / Culture / Tradition: ${ERA_OR_CULTURE}\nSpecific Story / Character: ${STORY_OR_CHARACTER || 'Random'}\nHook Style: ${hookStyle}\nDarkness Level: ${darknessLevel}\nDialogue Density: ${dialogueDensity}\nMoral Explicitness: ${moralExplicitness}\n\nSTORY REQUIREMENTS\n\nStory Structure\nThe story must be divided into “pages”, like a storybook.\nTotal pages: minimum 6 pages, maximum 19 pages.\nEach page should be clearly labeled, for example:\nPage 1\nPage 2\netc.\n**CRITICAL: Each page MUST contain EXACTLY 1-2 paragraphs maximum. NEVER more than 2 paragraphs per page.**.\n\nNarrative Style\nUse engaging, vivid storytelling.\nInclude dialogues or exchanges of words wherever it adds depth.\nMaintain a slow, deliberate pace, as if the reader is turning pages one by one.\nLanguage should feel timeless, slightly poetic but still readable.\n\nContent & Tone\nThe story should feel complete (clear beginning, middle, and end).\nThemes may include: Fate, morality, power, suffering, wisdom, betrayal, love, duty, faith, or philosophy.\nAvoid modern slang or references.\nThe tone should match the era (solemn, mystical, tragic, contemplative, heroic, etc.).\n\nAuthenticity\nStay faithful to the spirit and worldview of the chosen era or philosophy.\nYou may creatively expand events or conversations, but do not break historical or mythological plausibility.\n\nEnding\nEnd with a resonant conclusion: A lesson, reflection, prophecy, or quiet realization. The ending should feel earned and meaningful, not abrupt.\n\nOUTPUT FORMAT\nStart with a story title.\nThen begin page-by-page narration.\nExample structure:\nTitle: The Weight of the Crown\nPage 1\n[1-2 paragraphs only]\nPage 2\n[1-2 paragraphs only]\n(Continue until the story concludes naturally within 6–19 pages.)\n\nAt the very end, provide a recommended text color and background color for Instagram posts that would best fit the mood and theme of the story.\nFormat:\nText Color: #xxxxxx\nBackground Color: #xxxxxx\nGenerate the story now using provided parameters.`;

  try {
    // Use Gemini SDK with model fallback
    const { story, model } = await generateStoryWithFallback(prompt);
    console.log(`[story] Generated using model: ${model}`);
    let storyContent = story;
    // Extract recommended colors from the end of the story
    let textColor = '#222';
    let backgroundColor = '#fffbe9';
    // Remove color lines and any trailing descriptions from the end of the story
    const colorBlockRegex = /Text Color:\s*#[0-9a-fA-F]{6}(?:\s*\([^\)]*\))?\s*\nBackground Color:\s*#[0-9a-fA-F]{6}(?:\s*\([^\)]*\))?(?:\s*\n?)?/;
    const colorMatch = storyContent.match(/Text Color:\s*(#[0-9a-fA-F]{6})(?:\s*\([^\)]*\))?\s*\nBackground Color:\s*(#[0-9a-fA-F]{6})(?:\s*\([^\)]*\))?/);
    if (colorMatch) {
      textColor = colorMatch[1];
      backgroundColor = colorMatch[2];
      // Remove the color lines and any trailing text after them
      storyContent = storyContent.replace(colorBlockRegex, '').trim();
    }
    // Split story into pages (look for 'Page X' markers)
    const pageRegex = /Page \d+/g;
    const pageTitles = [...storyContent.matchAll(pageRegex)].map(match => match[0]);
    const pageSplits = storyContent.split(/Page \d+/);
    // The first split is the title, rest are pages
    const title = pageSplits[0].replace(/^Title:\s*/i, '').trim();
    const pages = pageSplits.slice(1).map(text => text.trim()).filter(Boolean);

    // Render each page as an image using the recommended colors
    const imagePaths = [];
    const filename = path.join(__dirname, `story_page_0.png`);
    await renderPageToImage(title, filename, {
      font: 'bold 40px "Ubuntu", "DejaVu Sans", sans-serif',
      fontSize: 48,
      width: 1080,
      height: 1080, // force square
      margin: 120,
      background: backgroundColor,
      textColor: textColor,
      lineHeight: 56,
      pageNumber: ''
    });
    imagePaths.push(filename);
    for (let i = 0; i < pages.length; i++) {
      let pageText = pages[i];
      let pageNumber = `Page ${i + 1}`;
      const filename = path.join(__dirname, `story_page_${i + 1}.png`);
      await renderPageToImage(pageText, filename, {
        font: 'bold 40px "Ubuntu", "DejaVu Sans", sans-serif',
        width: 1080,
        height: 1080, // force square
        margin: 120,
        background: backgroundColor,
        textColor: textColor,
        lineHeight: 56,
        pageNumber
      });
      imagePaths.push(filename);
    }

    res.json({ title, pages, imagePaths, textColor, backgroundColor });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to generate story.' });
  }
});

// Rerender images for the same story with new style options
app.post('/api/rerender-images', async (req, res) => {
  // Delete old images before generating new ones
  await deleteOldImages();
  const { pages, fontFamily, fontColor, backgroundColor, title } = req.body;
  if (!pages || !Array.isArray(pages) || pages.length === 0) {
    return res.status(400).json({ error: 'No pages provided.' });
  }
  try {
    const imagePaths = [];
    // Render title page as story_page_0.png
    if (title) {
      const filename = path.join(__dirname, `story_page_0.png`);
      await renderPageToImage(title, filename, {
        font: `bold 48px "${fontFamily || 'Ubuntu'}", "DejaVu Sans", sans-serif`,
        width: 1080,
        height: 1080, // force square
        margin: 120,
        background: backgroundColor || '#fffbe9',
        textColor: fontColor || '#222',
        lineHeight: 56,
        pageNumber: ''
      });
      imagePaths.push(filename);
    }
    for (let i = 0; i < pages.length; i++) {
      const pageText = pages[i];
      const pageNumber = `Page ${i + 1}`;
      const filename = path.join(__dirname, `story_page_${i + 1}.png`);
      await renderPageToImage(pageText, filename, {
        font: `bold 32px "${fontFamily || 'Ubuntu'}", "DejaVu Sans", sans-serif`,
        width: 1080,
        height: 1080, // force square
        margin: 120,
        background: backgroundColor || '#fffbe9',
        textColor: fontColor || '#222',
        lineHeight: 40,
        pageNumber
      });
      imagePaths.push(filename);
    }
    res.json({ imagePaths });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to rerender images.' });
  }
});

// Download images as zip endpoint
app.get('/api/download-images', async (req, res) => {
  try {
    // Find all story page images in the backend directory
    const imageGlob = path.join(__dirname, 'story_page_*.png');
    const imagePaths = await new Promise((resolve, reject) => {
      glob(imageGlob, (err, files) => err ? reject(err) : resolve(files));
    });

    if (imagePaths.length === 0) {
      return res.status(400).json({ error: 'No story images found. Generate a story first.' });
    }

    // Create a zip file in memory
    const archive = archiver('zip', { zlib: { level: 9 } });
    const zipChunks = [];

    archive.on('data', chunk => zipChunks.push(chunk));
    archive.on('error', (err) => {
      console.error('[download-images] Archive error:', err.message);
      res.status(500).json({ error: 'Failed to create zip file.' });
    });

    // Add all images to the zip
    for (const imgPath of imagePaths) {
      const filename = path.basename(imgPath);
      archive.file(imgPath, { name: filename });
    }

    // Finalize and wait for completion
    archive.finalize();
    
    await new Promise((resolve, reject) => {
      archive.on('end', resolve);
      archive.on('finish', resolve);
      archive.on('error', reject);
    });

    const zipBuffer = Buffer.concat(zipChunks);

    // Send zip file as response
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="story_images.zip"');
    res.send(zipBuffer);
  } catch (err) {
    console.error('[download-images] Error:', err.message);
    res.status(500).json({ error: 'Failed to download images.' });
  }
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
