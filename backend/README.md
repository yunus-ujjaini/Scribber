# Scribber Backend

This is a Node.js Express API for generating storybook-style stories using the Gemini API.

## Setup

1. Install dependencies:
   npm install

2. Add your Gemini API key to the `.env` file:
   GEMINI_API_KEY=your-gemini-api-key-here

3. Start the server:
   npm start

## API Usage

POST /api/story

Body (JSON):
```
{
  "ERA_OR_CULTURE": "Ancient Greece",
  "STORY_OR_CHARACTER": "Sisyphus",
  "hookStyle": "mysterious",
  "darknessLevel": "subtle",
  "dialogueDensity": "medium",
  "moralExplicitness": "implicit"
}
```

Returns:
```
{
  "story": "...generated story..."
}
```
