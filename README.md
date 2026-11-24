# Urban Cruise rule-based support chatbot

Phase 1 provides a MySQL-backed support widget, approved-FAQ lookup, and travel enquiry capture. It does not use an LLM or a chatbot platform. Live chat, video, and an admin dashboard are out of scope.

## Requirements and setup

- Node.js 20.19+, 22.12+, or 24+
- MySQL 8 with permission to create tables and indexes

1. Create a local database and application user (choose a strong password):

   ```sql
   CREATE DATABASE urban_cruise_chatbot
     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'urban_cruise_app'@'localhost' IDENTIFIED BY 'your-local-password';
   GRANT ALL PRIVILEGES ON urban_cruise_chatbot.* TO 'urban_cruise_app'@'localhost';
   ```

2. Create `.env.local` in the repository root with the local MySQL settings below. Replace the password placeholder with the password configured for the MySQL application user. Never commit `.env.local`.

   ```dotenv
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=urban_cruise_app
   DB_PASSWORD=replace-with-a-local-secret
   DB_NAME=urban_cruise_chatbot
   DB_POOL_SIZE=10
   ```

3. Install packages, create the schema, and load the starter taxonomy:

   ```sh
   npm install
   npm run db:migrate
   npm run db:seed
   ```

4. Start the website:

   ```sh
   npm run dev
   ```

   The development server is available at `http://localhost:5001`.

The migration runner applies numbered files under `db/migrations` in order and stores each file name and SHA-256 checksum in `schema_migrations`. Do not edit an already-applied migration; add a new numbered migration instead. The seed command is safe to rerun.

## Configuration and approval

- `chatbot_business_hours` is seeded for every day, 09:00–21:00 India time. `chatbot_holidays` starts empty. A dated holiday can force day, night, or closed/night mode; `chatbot_settings.service_mode_override` can force day/night or return to `auto`.
- The server resolves mode with `Asia/Kolkata`; the browser clock is never used for mode.
- Starter FAQ questions and keywords from Appendix A are seeded in English and Hindi. No FAQ answers are supplied by the source document, so entries are intentionally `draft`, have a `NULL` answer, and are not returned to customers until each language's answer is approved and published.
- The enquiry notice is explicitly provisional (`provisional-v1`). Replace it with Urban Cruise-approved privacy wording and version before production.
- The lead form reveals a return-date field when the visitor selects “Include a return journey.”
- The lead confirmation says that an enquiry is not a confirmed booking. No prices or live fleet/availability claims are provided.
- `npm run db:seed` creates the initial taxonomy and draft questions; it does not overwrite FAQ answers or publish drafts.

## API

| Endpoint | Purpose |
| --- | --- |
| `POST /api/chat/sessions` | Create a session and return a one-time raw token; only its SHA-256 hash is stored |
| `GET /api/chat/config` | Resolve server-side mode, weekly hours, language and widget configuration |
| `GET /api/chat/faqs/categories` | List published FAQ categories |
| `GET /api/chat/faqs/search?q=...&languageCode=en` | Search published, answered FAQs |
| `GET /api/chat/faqs/:id` | Read a published, answered FAQ and related questions |
| `POST /api/chat/messages` | Store a message and run the deterministic FAQ rules |
| `POST /api/chat/leads` | Validate and store a consented enquiry with an idempotency key |

JSON writes reject unknown fields, validate input with Zod, and return stable error codes. SQL errors are logged on the server and never included in API responses. Initial per-process limits are 15 session creations, 60 messages, and 10 leads per minute; use shared rate-limit infrastructure before running multiple app instances.

## Project structure

```text
app/
  api/chat/                 Route handlers
  globals.css
  layout.tsx
  page.tsx
components/chat/            Lazy launcher, widget, messages, replies, search, lead form
db/migrations/              Ordered MySQL schema and settings migrations
lib/api/                    HTTP validation, rate limiting, session authentication
lib/chat/                   Mode resolver, FAQ rules, schemas and UI copy
lib/repositories/           Typed parameterized SQL access by table
scripts/                    Migration and seed runners
```

## Validation

```sh
npm run typecheck
npm test
npm run lint
npm run build
```

The unit tests cover the 08:59, 09:00, 20:59, and 21:00 IST mode boundaries and FAQ matching priority. Database commands require a reachable MySQL 8 instance and the `.env.local` settings above.
