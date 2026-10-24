# Woven · local AI test

**What Woven knows**, available in the main menu and AI chat, shows profiles,
individual facts, their sources and dates. Browse People, About me, Preferences,
Other and Recently learned; search and filter facts that need review. Add or edit
a fact, confirm a proposed fact, merge duplicate profiles, forget one fact or an
entire profile, or forget a fact and delete a selected original source. Direct
attachments are deleted with their task/note using the existing deletion flow.
Forgetting alone keeps original tasks, notes and messages. Removal from memory
does not delete copies in other records or provider retention/backups.

Automatic learning starts enabled and requires an AI connection. On opening the
app it reviews existing saved tasks, notes and user messages, then processes new
or changed items in the background. This sends source text to the AI and incurs
API usage. Turn it off in What Woven knows or say “Pause automatic learning.”
Paused items stay queued for resuming. Failed reviews show a retry option through
“Review existing tasks & notes.” Sources over 24,000 characters must be split.
Task saving does not wait for the learning API call. Background jobs persist
across restarts; the server must be running to process them. Assistant-generated
messages and synthetic step-review prompts are not learning sources.

Clear, explicitly stated facts are usable memory; uncertain implications are
marked Needs review, and conflicts stay separate until confirmed. Explicit,
source-supported “now/instead” corrections can supersede older roles, keeping
previous facts visible through Include previous facts. Every learned fact requires
an exact source quotation, though the model can still misinterpret that quote.
Deleting or changing a source retires learned facts with no remaining support;
facts manually confirmed by the user remain. A direct correction is authoritative.
Say “Remember that I run a design studio,” “Forget Maya’s role,” or ask what Woven
knows. Ambiguous targets need clarification; original sources are only deleted
through their explicit UI controls.

Forgotten facts leave hashed suppression markers so matching facts are not
automatically learned again. Stored source ranges redact known forgotten
fragments from future AI task/note/chat reference context while the source stays
visible to its owner. Other copies, images, paraphrases and changed source text
may still contain the information; delete sources for erasure of those records.
A direct manual save can restore a fact. Sensitive secrets and temporary task
details are excluded by extraction instructions; review learned facts regularly.

This is saved context, not model training. Relevant current facts are included
in typed and voice AI requests; task assignments never authorize contacting
people. For this pilot, normalized entities, facts, evidence, jobs, suppression
markers and value-free audit events live in `payload.memory` within the existing
owner-protected cloud state row, or local `data/state.json`. No new database
tables or permissions are required. Existing knowledge entries migrate on the
next save/review. The independent collections can later move to database tables
without changing the user-facing model. Cloud writes retain existing version
checks and use the signed-in user's token.

## Private cloud pilot

New entries receive both a segment and a topic: website development defaults to
**Work / Websites**, explicit personal sites stay personal, and loan references
use **Loans**. Linked notes inherit their project’s category when appropriate.
The list and category groups display the segment with the category. Related loan
amounts are checked against existing financial notes; ambiguous amounts ask
whether they are additional, a corrected total, or a separate loan. Confirmed
updates keep the original entry and a dated update; balances are not silently
replaced or calculated across currencies.

**Voice language** defaults to **Hebrew + English**, with other language choices
saved on this browser. Transcription sends expected language hints and recent
conversation context. Unexpected Arabic text in Hebrew mode is held for review
instead of automatically creating tasks. Spoken replies are kept brief and a
1.1-second pause ends a turn; the transcription, AI and speech API calls still
have processing time.

Press the left Woven icon to open the dedicated **Woven AI** page. Type naturally
to add tasks, save notes, add references to existing tasks, or ask for guidance.
The conversation continues across tasks; **New chat** starts a fresh conversation.
**Back to tasks** returns to the list. The lower **Next actions** area puts due
tasks first and provides Discuss, Open, Snooze and Done controls. Advice does not
mean a task was changed; saved changes link back to their records.

Tap the **microphone** to talk. A visible listening indicator follows your voice.
After you pause, Woven transcribes and sends the message automatically, speaks
its reply, then listens for your next turn. **End voice** stops the conversation.
You can also tap **■** to finish a turn or **Cancel** to discard.
Recordings end after one minute; initial silence does not send an empty message.
If automatic pause detection is unavailable, finish using **■**. The mic opens
the connection form when AI is disconnected, and explains blocked permissions.
Recordings are not written to Woven storage. Microphone input needs browser
permission and localhost or HTTPS. **Voice replies** starts enabled, so typed
messages also receive spoken replies unless you turn it off. Reply text remains
visible and **Replay voice** repeats an earlier reply. Audio is activated on the
mic/Send tap before waiting for AI; replies then play through that same audio
session automatically. Speech uses OpenAI-generated audio and is not saved to
Woven storage. Chrome or Edge can be used when an embedded browser lacks
microphone support.
The transcription model defaults to `gpt-transcribe` and can be set using
`OPENAI_TRANSCRIBE_MODEL`. The conversation alternates recorded turns and spoken
replies, with a written transcript; it does not support interrupting the AI by
speaking over it. See the official
[transcription guide](https://developers.openai.com/api/docs/guides/speech-to-text).
The pilot speech output uses `gpt-4o-mini-tts` (`OPENAI_TTS_MODEL` can override
it), a currently supported compatibility endpoint scheduled to shut down on
January 6, 2027. Migrate speech output to Realtime before then; simply putting a
Realtime model name in `OPENAI_TTS_MODEL` will not work with `/audio/speech`.

The home screen lists tasks and notes in a messaging-style layout. One box searches
as you type; press Enter or the add button to capture a new task or note. Only the
current clarification appears. Opening an item shows its saved details, without
AI conversation history. List subtitles show the actual content.

Today’s dates are yellow; overdue dates are red and include the date and known
time. Tap a date to change it or snooze. Tasks and notes can become checklists.
Completed tasks move to **Completed / Archive**, with a choice to keep or permanently
delete them. Deletion requires a separate confirmation, removes direct attachments
and undo history, and keeps related tasks/notes separately. Restore reopens the item.
The header contains just the capture box, icon and menu; rows are compact. Small
celebrations mark adding and completing items and respect reduced-motion settings. Connections
show parent tasks, children, and clickable category/person filters. Use **Edit
connections** to link existing records.

The home view selector switches between a flat list, categories and main-task
groups. Swipe a row left to reveal Snooze / Done, or use its ellipsis button.
Checklist conversion detects comma, semicolon, bullet, numbered and multi-line
lists and shows an editable preview, keeping original text and existing step IDs.
Celebrations cover the app with confetti; reduced-motion mode keeps them still.

AI capture creates minimal useful steps for new tasks. Opening an older task with
AI connected reviews missing steps once; **Find steps** can review again. Task
review is restricted to the opened task. Call, WhatsApp, email, SMS, directions,
website and cloud-file buttons use supplied details or ask for a destination.
They open your app or file; you review/send/edit there. No messages are sent and
no external files are updated automatically. Phone numbers, destinations and
optional drafts are saved with the task when you choose **Save action**.

Tap a task title, task text, note or checklist item to type directly. Leaving the
field saves it; Enter saves a single line, Ctrl/Cmd+Enter saves multiline text.
Each edit keeps its previous text and timestamp in the record’s **Updates**.
**Add update** appends dated progress without replacing the task or note. A stale
text edit is rejected rather than overwriting a newer saved version.

Explicit daily/weekly/monthly/yearly patterns, including Hebrew and weekday
phrases, are detected for tasks. The repeat button changes or disables the rule.
On completion the saved occurrence stays in Completed and one next occurrence
is created; old missed occurrences are skipped. Monthly repeats clamp short
months and keep the original day anchor. Attached files remain on the original
occurrence. Turning off repetition also stops the active upcoming occurrence.

**Menu → Settings** selects system/light/dark appearance, accent color,
confetti/balloons/stars/bubbles/off and top-down/bottom-up effects. Confetti tumbles
at varied speeds; balloons drift independently with strings. Changes and the home
sort choice persist on this browser. **Due first** is the default: overdue and
dated tasks come before undated tasks and notes. Other choices include newest,
oldest, title, tasks first and notes first.

Statements such as “John needs to pay me 500” are saved as money-owed notes, with
a currency question when needed. Picking a currency updates the same note, not a
new task. This common pattern works without an AI connection; broader language
and other requests still use the assistant. No collection reminder is invented.

Woven now also supports a private Supabase login, cloud task saving and a private
file bucket. See [DEPLOYMENT.md](DEPLOYMENT.md) for configuration, verification and
Render setup. Cloud mode starts empty and never imports or changes local data
automatically. The original local mode below remains available.

Open **http://127.0.0.1:4317** while the app is running. To start it again, right-click `Start-Woven.ps1` and choose **Run with PowerShell**, or open this folder in a terminal and run `node server.mjs`.

On the connection screen, enter an OpenAI API key from https://platform.openai.com/api-keys. Do not send the key in chat. The key lives only in the local server process memory and is forgotten when the process stops or you disconnect. The connection check verifies model access; the first conversation tests actual inference and may surface API billing or quota requirements.

## Try it

- “Buy wine.” The model receives the existing Friday family dinner and can suggest a connection, with selectable answers.
- “No, the wine is a gift for my client.” Check whether the assistant respects the correction rather than forcing a dinner match.
- Paste a screenshot into the chat, attach a file, or drop an image. The actual image is sent to the model, not simulated.
- “What should I focus on?”
- “I finished the permission form.” Check the task menu and try undo.

## What is real

The app uses the OpenAI Responses API, GPT-4.1 by default, with real image inputs and structured question options. It passes recent conversation and current tasks to each request. It validates changes against existing task identifiers and saves tasks, source messages, conversation and images in `data/state.json` on this computer. AI can still misinterpret a request; use undo to reverse a change. New groups can be classified as Personal, Family or Work.

Messages, submitted images and relevant task context are sent to OpenAI; API requests use `store: false`. This does not override any provider retention policies. API costs belong to your API account. Keep this test for your own use: the server listens only on `127.0.0.1`, has no login, and is not a hosted multi-user product. It checks the local origin and an app token before accepting changes.

Reminders are saved notes only; they do not trigger notifications. Sharing, messaging others, payments and bookings are not connected. Your tasks are saved between restarts; the key is not. Earlier image content can be referenced through the assistant’s reading; attach an image again for visual reinspection.

To stop the app, stop the specific Node process running this folder’s `server.mjs` (or press Ctrl+C if started in a terminal). To change models, set `OPENAI_MODEL` before starting the server; choose a model supporting images, Responses and Structured Outputs. `OPENAI_API_KEY` can also be supplied as an environment variable instead of using the local connection screen.

Official documentation: https://developers.openai.com/api/docs/guides/images-vision and https://developers.openai.com/api/docs/guides/structured-outputs

## Notes, completion and saved documents

Write naturally in the home box; Woven infers whether to save a note or create a task and asks when intent is unclear. Use **Mark task done** to record completion. On the home list, use the ellipsis or swipe left for Done; there is no separate checkmark.

Attachments are limited to 10 MB and saved locally in data/files (or in the private Supabase bucket in cloud mode). Uploading checks the filename and readable content against saved tasks and notes, then lets you confirm the destination. If nothing matches, choose a separate file note. With AI connected, file analysis sends readable text, images or PDFs and candidate task/note context to OpenAI using `store: false`; without AI, filename/text matching remains available.

Click a filename or **View** to open images, PDFs, text and supported Office document text inside Woven. Other formats retain **Download**. PDFs render locally using the bundled Apache-licensed PDF.js viewer; Office previews show extracted text rather than the original page layout. Scanned PDFs need an AI connection for content-based filing.

General automatic capture requires an AI connection. File storage, checklists, task completion, relationships, archive and direct date changes work without an AI key. Calendar choices save directly for existing tasks. New or ambiguous tasks use AI to interpret the reply. Slow requests show progress and a bounded timeout.

## Voice in the main window

Tap the microphone icon at the left of the search/add bar to start a focused conversation in the main window. The task list is hidden while voice is open, and search and the microphone stay in the top bar. Replies speak automatically and the microphone listens again after playback. Tap End voice to release the microphone, or use the top-left Back arrow to stop voice and return to your tasks. You can also type in the conversation panel. Opening a task closes voice.

Settings → Voice languages defaults to Automatic for all supported languages. Select multiple language preferences to help mixed-language recognition; these are hints, not a forced Hebrew/English setting. Preferences save on this browser. Recognition accuracy and available languages depend on the transcription provider.

Voice still has three network stages: transcription, task interpretation, and speech generation. Raw 24 kHz PCM speech now plays in chunks as it arrives, without waiting for a complete base64 audio download. The microphone stays open between turns (recording pauses during replies), and a 900 ms silence ends a spoken turn. Permission is requested only when starting voice; ending voice releases the tracks and cancels pending speech. This reduces avoidable delay but does not make network/model processing instantaneous.

Going Back clears the visible conversation, pending question, typed draft and active topic; reopening starts a new session. Tasks, notes and their saved source history remain intact. Voice starts with an AI-spoken 'I’m here' in the first selected language (English for Automatic). Fixed greeting audio is cached in server memory by language/model, so repeat openings avoid another speech-generation call. Response timing below the composer separates transcription, task reasoning and time to first spoken audio; it excludes recording and playback duration. The audio request explicitly uses raw audio streaming. This pipeline still waits for the task reply to be validated and saved before speaking it.

## Install Woven

Open the deployed HTTPS app and choose Menu → Install Woven. Supported browsers show their native install prompt; other browsers show home-screen instructions. iPhone and iPad users can open Woven in Safari, choose Share → Add to Home Screen, then Add. The installed app opens in its own window with a Woven icon. Sign in normally after installing.

Installation does not add offline task editing, notification delivery or background AI. Tasks, files, voice and syncing still require a connection. The service worker caches only the generic offline help page and its style sheet; account, task, chat and file API responses are never cached. Other app resources are fetched from the network so updated code is not held in a stale application cache.
