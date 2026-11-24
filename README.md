# Urban Cruise rule-based support chatbot

The support widget routes chats to CMS agents from 09:00–21:00 India time and uses approved FAQ answers from 21:00–09:00. The CMS **Chatbot** panel manages FAQs, the shared inbox, agent roster, weekly hours, and holidays. The chatbot and CMS share the existing `urban_cruise` database. It does not use an LLM or a chatbot platform.

## Requirements and setup

- Node.js 20.19+, 22.12+, or 24+
- MySQL 8 with permission to create tables and indexes

1. Use the existing `urban_cruise` database and configure an application user (choose a strong password). Do not create or drop a database for this chatbot:

   ```sql
   CREATE USER IF NOT EXISTS 'urban_cruise_app'@'localhost' IDENTIFIED BY 'your-local-password';
   GRANT ALL PRIVILEGES ON urban_cruise.* TO 'urban_cruise_app'@'localhost';
   ```

2. Create `.env.local` in the repository root with the local MySQL settings below. Replace the password placeholder with the password configured for the MySQL application user. Never commit `.env.local`.

   ```dotenv
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=urban_cruise_app
   DB_PASSWORD=replace-with-a-local-secret
   DB_NAME=urban_cruise
   DB_POOL_SIZE=10
   ```

3. Install packages, create the schema, and load the starter taxonomy:

   ```sh
   npm install
   npm run db:migrate
   npm run db:seed
   ```

   The migration adds the chatbot tables and indexes inside `urban_cruise`; it does not create, drop, or rename databases. Back up the database before applying schema changes.

4. Create CMS agent accounts in CMS Users and assign them the existing `Agent` role. Migration `006_cms_chatbot_operations.sql` grants that role the `chatbot.manage` permission and links agent ownership to CMS user IDs. The CMS Agent roster is at `/admin/chatbot`; agent account creation and deactivation stay in CMS Users.

   The standalone chatbot inbox remains available for legacy agent accounts. To create one (password input is hidden):

   ```sh
   npm run db:agent:create
   ```

5. Start the website:

   ```sh
   npm run dev
   ```

   The development server is available at `http://localhost:5001`.

The migration runner applies numbered files under `db/migrations` in order and stores each file name and SHA-256 checksum in `schema_migrations`. Do not edit an already-applied migration; add a new numbered migration instead. The seed command is safe to rerun.

## Configuration and approval

- `chatbot_business_hours` is seeded for every day, 09:00–21:00 India time. `chatbot_holidays` starts empty. A dated holiday can force day, night, or closed/night mode; `chatbot_settings.service_mode_override` can force day/night or return to `auto`.
- The server resolves mode with `Asia/Kolkata`; the browser clock is never used for mode.
- During day mode, every chat message enters the shared inbox. CMS agents handle conversations in the CMS **Chatbot** panel; the legacy `/agent` inbox remains for standalone chatbot agent accounts. Website city pages attach their city slug to new sessions; the global homepage uses the `global` fallback. Agents can filter open conversations by location, and the first agent to reply owns that conversation until it is closed. Waiting conversations are listed oldest first. Legacy standalone agent sessions expire after eight hours.
- During night mode, user messages are matched against published FAQs. The starter FAQ rows are drafts without answers and must be completed and approved before they can answer customers.
- Starter FAQ questions and keywords from Appendix A are seeded in English and Hindi. No FAQ answers are supplied by the source document, so entries are intentionally `draft`, have a `NULL` answer, and are not returned to customers until each language's answer is approved and published.
- The enquiry notice is explicitly provisional (`provisional-v1`). Replace it with Urban Cruise-approved privacy wording and version before production.
- The lead form reveals a return-date field when the visitor selects “Include a return journey.”
- The lead confirmation says that an enquiry is not a confirmed booking. No prices or live fleet/availability claims are provided.
- `npm run db:seed` creates the initial taxonomy and draft questions; it does not overwrite FAQ answers or publish drafts.
- Chat transcripts are stored in `chatbot_messages` and restored for the same browser session. Messages older than 90 days are deleted when chat session/message endpoints run; also schedule `npm run db:prune-chat-history` to run daily from the repository root so retention is enforced during periods with no chat traffic.

## Real-time chat

The chatbot, CMS inbox, and public website use a separate Socket.IO service from the Next.js apps. REST APIs and MySQL remain authoritative; the widgets and CMS automatically fall back to polling if realtime is unavailable.

For local development, add the following to the chatbot and CMS `.env.local` files. Use the same newly generated secret in both files; do not commit it or put it in a `NEXT_PUBLIC_*` variable.

```dotenv
CHATBOT_REALTIME_SECRET=replace-with-a-long-random-secret
CHATBOT_REALTIME_URL=http://127.0.0.1:5002
```

In the chatbot `.env.local`, configure the Socket.IO service origin allowlist:

```dotenv
CHATBOT_REALTIME_PORT=5002
CHATBOT_REALTIME_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5000,http://localhost:5001
```

Set this browser-facing URL in the chatbot, CMS, and website `.env.local` files:

```dotenv
NEXT_PUBLIC_CHAT_REALTIME_URL=http://localhost:5002
```

Run the chatbot app and realtime service in separate terminals:

```sh
npm run dev
npm run dev:realtime
```

The service health check is `GET /health`. In production, set `CHATBOT_REALTIME_URL` to an address reachable by both server apps, set `NEXT_PUBLIC_CHAT_REALTIME_URL` to the public HTTPS endpoint, and list the exact public website, CMS, and chatbot origins in `CHATBOT_REALTIME_ALLOWED_ORIGINS`. Terminate TLS at the proxy and allow Socket.IO WebSocket upgrades. Keep the realtime service private to trusted servers for internal publishing; only browser Socket.IO connections need public access.

`NEXT_PUBLIC_CHAT_REALTIME_URL` is embedded into each app at build time, so rebuild and restart the three apps after changing it. The service currently runs as one Socket.IO instance; add a shared Socket.IO adapter and sticky routing before horizontally scaling it.

## API

| Endpoint | Purpose |
| --- | --- |
| `POST /api/chat/sessions` | Create a session with optional `locationSlug` (defaults to `global`) and return a one-time raw token; only its SHA-256 hash is stored |
| `GET /api/chat/config` | Resolve server-side mode, weekly hours, language and widget configuration |
| `GET /api/chat/faqs/categories` | List published FAQ categories |
| `GET /api/chat/faqs/search?q=...&languageCode=en` | Search published, answered FAQs |
| `GET /api/chat/faqs/:id` | Read a published, answered FAQ and related questions |
| `POST /api/chat/messages` | Queue messages to the agent inbox by day; answer from approved FAQs at night |
| `GET /api/chat/messages` | Restore the authenticated session's messages from the last 90 days |
| `/agent` | Sign in to the daytime agent inbox |
| `/admin/chatbot` (CMS) | Manage FAQs, categories, conversations, CMS agents, and schedule settings |
| `/api/agent/auth` | Sign in/out and validate an agent session |
| `/api/agent/conversations?location=all\|<slug>` | List waiting and assigned conversations, with per-location counts, for the authenticated agent |
| `/api/agent/conversations/:id` | Read, reply to, or close an assigned conversation |
| `POST /api/chat/leads` | Validate and store a consented enquiry with an idempotency key |

JSON writes reject unknown fields, validate input with Zod, and return stable error codes. SQL errors are logged on the server and never included in API responses. Initial per-process limits are 15 session creations, 60 messages, 5 agent logins, and 10 leads per minute; use shared rate-limit infrastructure before running multiple app instances.

## Project structure

```text
app/
  api/chat/                 Customer chat and FAQ route handlers
  api/agent/                Authenticated agent inbox APIs
  agent/                    Agent inbox page
  globals.css
  layout.tsx
  page.tsx
components/chat/            Lazy launcher, widget, messages, replies, search, lead form
components/agent/           Authenticated daytime support inbox
db/migrations/              Ordered MySQL schema and settings migrations
lib/api/                    HTTP validation, rate limiting, session authentication
lib/agent/                  Agent password hashing
lib/chat/                   Mode resolver, FAQ rules, schemas and UI copy
lib/repositories/           Typed parameterized SQL access by table
scripts/                    Migration, seed, retention and agent account commands
```

## Validation

```sh
npm run typecheck
npm test
npm run lint
npm run build
```

The unit tests cover the 08:59, 09:00, 20:59, and 21:00 IST mode boundaries and FAQ matching priority. Database commands require a reachable MySQL 8 instance and the `.env.local` settings above.
