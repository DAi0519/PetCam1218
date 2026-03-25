# PET CAM — Xmas Edition

Upload a photo of your pet, get a AI-generated Christmas fashion portrait back. Built with Google Gemini's image generation API.

## Features

**Two generation modes:**
- **Pet Portrait** — Full editorial treatment: Gemini analyzes the pet, picks a Christmas accessory style and scene theme, generates a high-fashion studio photo
- **Hat Only** — Adds a Santa hat to any subject, preserving the original background and style

**Production-ready backend:**
- Gemini API key kept server-side, never exposed to the client
- IP-based rate limiting (20 generations / IP / day for Portrait mode)
- Generated images persisted to object storage
- Full generation log in database (status, prompt, IP, errors)
- Admin panel at `/admin` for banning/unbanning users

## Tech Stack

**Frontend**
- React 18 + TypeScript + Vite
- Tailwind CSS + Framer Motion
- React Router

**Backend**
- Hono (edge runtime via EdgeSpark)
- Google Gemini (`gemini-3-pro-preview` for analysis, `gemini-3-pro-image-preview` for generation)
- Drizzle ORM + SQLite (Cloudflare D1)
- S3-compatible object storage

## Project Structure

```
src/
├── components/
│   ├── RetroCamera.tsx     # Main camera UI
│   └── landing/
│       ├── Hero.tsx        # Landing page
│       └── FilmStack.tsx   # Animated film stack preview
├── pages/
│   ├── LandingPage.tsx
│   ├── AdminPage.tsx       # /admin — ban/unban users
│   └── LoginPage.tsx
├── services/
│   └── gemini.ts           # Frontend API client
└── lib/
    └── client.ts           # EdgeSpark client config

backend/
└── src/
    └── index.ts            # Hono app — all API routes
```

## Local Development

**Frontend**
```bash
npm install
npm run dev
# http://localhost:5173
```

**Backend**

The backend runs on EdgeSpark. Set the following secrets in your EdgeSpark project:
- `GEMINI_API_KEY` — Google AI Studio API key
- `ADMIN_SECRET` — Secret header value for the `/admin` panel

Update `src/lib/client.ts` with your EdgeSpark project URL.

## API Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/public/gemini/generate` | None | Generate Christmas pet image |
| POST | `/api/public/admin/ban` | `x-admin-secret` header | Ban or unban a user by email |

## Generation Flow

```
Upload image
    │
    ▼
Detect: is this a real pet photo? (gemini-3-pro-preview)
    │
    ├─ Yes → Analyze pet features → Build editorial prompt
    │        → Generate fashion portrait (gemini-3-pro-image-preview, 3:4, 2K)
    │
    └─ No  → Add Santa hat directly (gemini-3-pro-image-preview, 2K)
```
