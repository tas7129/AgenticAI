# Studywise · offline edition

Studywise works without an OpenAI API key, account, server, or API billing. Open `index.html` or double-click `Start Studywise.command` on macOS. Study paths and progress are saved in the browser.

## What it can do

- Read text-based PDF, TXT, and Markdown files in the browser.
- Keep each uploaded file in its own study path.
- Turn extracted text into a structured lesson and concise recap.
- Make source-based recall cards, a simple concept flow, and a quiz.
- Find note passages matching a question or missed quiz idea.
- Track quiz scores and keep later topics locked until the current topic is passed twice.
- Export and import a progress backup from **My progress**.

These study aids use local text-matching and templates. They organize and quiz on what the source says, but they are not generative AI: they cannot reliably explain unstated ideas, reason beyond the notes, or create the same quality of teaching as an AI model. Questions that use words from the source get the best matches. Quizzes need several readable statements to make useful answer choices.

## PDF note

The PDF reader is loaded from a public CDN when the app opens, so an internet connection is needed to load that reader. Study activities run in your browser without sending notes to an AI service. Scanned image PDFs need OCR before upload. Your original files are not retained; extracted text is stored in this browser as part of the study path.

If you previously used the API version, `server.mjs` is no longer needed. Study paths already saved in your browser remain available there.
