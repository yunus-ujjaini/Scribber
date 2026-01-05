import nodemailer from 'nodemailer';
import archiver from 'archiver';
import dotenv from 'dotenv';
import express from 'express';
import bodyParser from 'body-parser';
import { GoogleGenAI } from "@google/genai";
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
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
    const imageGlob = path.join(__dirname, 'story_page_*.png');
    try {
      const oldImages = await new Promise((resolve, reject) => {
        glob(imageGlob, (err, files) => err ? reject(err) : resolve(files));
      });
      await Promise.all(oldImages.map(img => fs.promises.unlink(img)));
    } catch (err) {
      console.warn('Could not delete old images:', err.message);
    }
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
  const prompt = `You are a master storyteller, historian, and myth-weaver.\n\nYour task is to generate a complete, self-contained story inspired by mythology, philosophy, or history, written in an easy to understand yet engaging, immersive narrative style. The story should feel like it belongs in an ancient storybook—rich in atmosphere, emotion, and meaning.\n\nEra / Culture / Tradition: ${ERA_OR_CULTURE}\nSpecific Story / Character: ${STORY_OR_CHARACTER || 'Random'}\nHook Style: ${hookStyle}\nDarkness Level: ${darknessLevel}\nDialogue Density: ${dialogueDensity}\nMoral Explicitness: ${moralExplicitness}\n\nSTORY REQUIREMENTS\n\nStory Structure\nThe story must be divided into “pages”, like a storybook.\nTotal pages: minimum 6 pages, maximum 19 pages.\nEach page should be clearly labeled, for example:\nPage 1\nPage 2\netc.\nEach page should contain 1–3 short paragraphs, not walls of text.\n\nNarrative Style\nUse engaging, vivid storytelling.\nInclude dialogues or exchanges of words wherever it adds depth.\nMaintain a slow, deliberate pace, as if the reader is turning pages one by one.\nLanguage should feel timeless, slightly poetic but still readable.\n\nContent & Tone\nThe story should feel complete (clear beginning, middle, and end).\nThemes may include: Fate, morality, power, suffering, wisdom, betrayal, love, duty, faith, or philosophy.\nAvoid modern slang or references.\nThe tone should match the era (solemn, mystical, tragic, contemplative, heroic, etc.).\n\nAuthenticity\nStay faithful to the spirit and worldview of the chosen era or philosophy.\nYou may creatively expand events or conversations, but do not break historical or mythological plausibility.\n\nEnding\nEnd with a resonant conclusion: A lesson, reflection, prophecy, or quiet realization. The ending should feel earned and meaningful, not abrupt.\n\nOUTPUT FORMAT\nStart with a story title.\nThen begin page-by-page narration.\nExample structure:\nTitle: The Weight of the Crown\nPage 1\nText...\nPage 2\nText...\n(Continue until the story concludes naturally within 6–19 pages.)\n\nAt the very end, provide a recommended text color and background color for Instagram posts that would best fit the mood and theme of the story.\nFormat:\nText Color: #xxxxxx\nBackground Color: #xxxxxx\nGenerate the story now using provided parameters.`;

  try {
    // Use Gemini SDK (official usage)
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt
    });
    let story = response.candidates?.[0]?.content?.parts?.[0]?.text || "No story generated.";
    // Extract recommended colors from the end of the story
    let textColor = '#222';
    let backgroundColor = '#fffbe9';
    // Remove color lines and any trailing descriptions from the end of the story
    const colorBlockRegex = /Text Color:\s*#[0-9a-fA-F]{6}(?:\s*\([^\)]*\))?\s*\nBackground Color:\s*#[0-9a-fA-F]{6}(?:\s*\([^\)]*\))?(?:\s*\n?)?/;
    const colorMatch = story.match(/Text Color:\s*(#[0-9a-fA-F]{6})(?:\s*\([^\)]*\))?\s*\nBackground Color:\s*(#[0-9a-fA-F]{6})(?:\s*\([^\)]*\))?/);
    if (colorMatch) {
      textColor = colorMatch[1];
      backgroundColor = colorMatch[2];
      // Remove the color lines and any trailing text after them
      story = story.replace(colorBlockRegex, '').trim();
    }
    // Split story into pages (look for 'Page X' markers)
    const pageRegex = /Page \d+/g;
    const pageTitles = [...story.matchAll(pageRegex)].map(match => match[0]);
    const pageSplits = story.split(/Page \d+/);
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
  const imageGlob = path.join(__dirname, 'story_page_*.png');
  try {
    const oldImages = await new Promise((resolve, reject) => {
      glob(imageGlob, (err, files) => err ? reject(err) : resolve(files));
    });
    await Promise.all(oldImages.map(img => fs.promises.unlink(img)));
  } catch (err) {
    console.warn('Could not delete old images:', err.message);
  }
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
        fontFamily: fontFamily || 'Ubuntu, DejaVu Sans, sans-serif',
        textColor: fontColor || '#222',
        background: backgroundColor || '#fffbe9',
        fontSize: 48,
        margin: 120,
        width: 1080,
        height: 1080, // force square
        pageNumber: ''
      });
      imagePaths.push(filename);
    }
    for (let i = 0; i < pages.length; i++) {
      const pageText = pages[i];
      const pageNumber = `Page ${i + 1}`;
      const filename = path.join(__dirname, `story_page_${i + 1}.png`);
      await renderPageToImage(pageText, filename, {
        fontFamily: fontFamily || 'Ubuntu, DejaVu Sans, sans-serif',
        textColor: fontColor || '#222',
        background: backgroundColor || '#fffbe9',
        fontSize: 32,
        margin: 120,
        width: 1080,
        height: 1080, // force square
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

// Send images to Gmail endpoint
app.post('/api/send-images-email', async (req, res) => {
  const { email, imagePaths } = req.body;
  if (!email || !email.includes('@gmail.com') || !Array.isArray(imagePaths) || imagePaths.length === 0) {
    return res.status(400).json({ error: 'Invalid email or no images.' });
  }
  try {
    console.log('[send-images-email] Request received');
    console.log('[send-images-email] email:', email);
    console.log('[send-images-email] imagePaths length:', imagePaths.length);
    console.log('[send-images-email] first image (if any):', imagePaths[0] || 'none');
    console.log('[send-images-email] env GMAIL_USER present:', !!process.env.GMAIL_USER);
    console.log('[send-images-email] env GMAIL_PASS present:', !!process.env.GMAIL_PASS);

    // Create a zip file in memory
    const archive = archiver('zip', { zlib: { level: 9 } });
    const zipChunks = [];
    archive.on('data', chunk => zipChunks.push(chunk));
    archive.on('warning', (warn) => {
      console.warn('[send-images-email][archiver] warning:', warn && warn.message ? warn.message : warn);
    });
    archive.on('error', (aerr) => {
      console.error('[send-images-email][archiver] error:', aerr && aerr.message ? aerr.message : aerr);
    });
    archive.on('end', () => {
      console.log('[send-images-email][archiver] archive end event');
    });
    archive.on('finish', () => {
      console.log('[send-images-email][archiver] archive finish event');
    });
    for (const imgPath of imagePaths) {
      console.log('[send-images-email] adding file to archive:', imgPath);
      archive.file(imgPath, { name: imgPath.split('/').pop() });
    }
    // Wait for archive to finalize (resolve on 'end' or 'finish')
    const finalizePromise = new Promise((resolve, reject) => {
      archive.on('error', reject);
      archive.on('end', resolve);
      archive.on('finish', resolve);
    });
    archive.finalize();
    await finalizePromise;
    const zipBuffer = Buffer.concat(zipChunks);
    console.log('[send-images-email] zipBuffer length:', zipBuffer.length);

    // Optionally save debug copy of the zip when DEBUG_SAVE_ZIP=true
    try {
      if (process.env.DEBUG_SAVE_ZIP === 'true') {
        const debugPath = path.join(__dirname, 'debug_last_images.zip');
        await fs.promises.writeFile(debugPath, zipBuffer);
        console.log('[send-images-email] Saved debug zip to:', debugPath);
      }
    } catch (saveErr) {
      console.warn('[send-images-email] Could not save debug zip:', saveErr.message);
    }

    // Use provided parameters to name the zip file
    let { ERA_OR_CULTURE, STORY_OR_CHARACTER } = req.body;
    function sanitize(str) {
      return (typeof str === 'string' ? str.trim() : '').replace(/[^a-zA-Z0-9_\-]+/g, '_').replace(/^_+|_+$/g, '');
    }
    // Try to get values from req.body if not present directly
    if (!ERA_OR_CULTURE && req.body.eraOrCulture) ERA_OR_CULTURE = req.body.eraOrCulture;
    if (!STORY_OR_CHARACTER && req.body.storyOrCharacter) STORY_OR_CHARACTER = req.body.storyOrCharacter;
    const era = sanitize(ERA_OR_CULTURE);
    const character = sanitize(STORY_OR_CHARACTER);
    let base = '';
    if (era && character) base = `${era}_${character}`;
    else if (era) base = era;
    else if (character) base = character;
    else base = 'scribber';
    const zipFilename = `${base}_story_images.zip`;

    // Configure nodemailer with Gmail SMTP
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
      }
    });
    // Verify transporter connection/configuration before sending
    try {
      console.log('[send-images-email] Verifying transporter...');
      const verified = await transporter.verify();
      console.log('[send-images-email] transporter.verify result:', verified);
    } catch (verifyErr) {
      console.warn('[send-images-email] transporter.verify failed:', verifyErr && verifyErr.message ? verifyErr.message : verifyErr);
    }

    try {
      console.log('[send-images-email] Sending mail...');
      const info = await transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: email,
        subject: 'Your Scribber Story Images',
        text: 'Attached is a zip file containing your generated story images from Scribber.',
        attachments: [
          {
            filename: zipFilename,
            content: zipBuffer
          }
        ]
      });
      console.log('[send-images-email] sendMail info:', info);
      res.json({ success: true, info });
    } catch (sendErr) {
      console.error('[send-images-email] sendMail failed:', sendErr && sendErr.message ? sendErr.message : sendErr);
      // Expose minimal error to client but log full stack
      res.status(500).json({ error: 'Failed to send email. Check server logs.' });
    }
  } catch (err) {
    console.error('[send-images-email] ERROR:', err && err.stack ? err.stack : err);
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
