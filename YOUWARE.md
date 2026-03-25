# YOUWARE Guide - PetCam1218

This project is a React application that generates Christmas-themed pet photos using Google Gemini API. It has been deployed to Youware with a secure backend, usage tracking, and admin controls.

## Project Architecture

### Frontend
- **Framework**: React 18 + Vite + TypeScript
- **Styling**: Tailwind CSS
- **API Client**: `@edgespark/client` connects to the Youbase backend.
- **Entry Point**: `src/main.tsx`
- **Authentication**: Disabled (Public Access).
- **Admin Panel**: `/admin` page for banning users (requires `ADMIN_SECRET`). Note: Banning by email is currently ineffective for public users.
- **Key Components**:
  - `src/pages/LandingPage.tsx`: New entry point.
    - **Features**: Hero section with retro minimalist design (cream white + watercolor texture), interactive film stack (framer-motion), and scroll-to-camera navigation (one-way).
    - **Components**: `Hero.tsx`, `FilmStack.tsx`.
    - **Assets**: 
      - `src/assets/landing/` contains sample images.
      - `src/assets/landing/portrait/` for Portrait mode samples (pairs of original/result).
      - `src/assets/landing/hat/` for Hat mode samples (pairs of original/result).
  - `src/components/RetroCamera.tsx`: Main camera interface. 
    - **Modes**: "Pet Portrait" (Default) and "Hat Only". Switchable via UI.
    - **UX**: Optimized for mobile and tablet (responsive scaling), full-screen layout, enhanced animations (ejection, gallery fly-in, cat sticker vertical slide-out, crisp lever pull), informative loading states, and consistent branding typography.
    - **Audio**: Custom retro sound effects for lever pull (1.5x speed, 0ms pre-roll) and photo ejection (100ms pre-roll, synced with 5s animation), plus mode switch sounds.
    - **Onboarding**: Interactive tape labels guide users through "Load Film", "Snap". Mode description uses clean text overlay.
    - **Assets**: Custom stickers for Santa Hat and Cat animation (updated).
  - `src/services/gemini.ts`: Calls the public backend API.

### Backend (Youbase)
- **Framework**: Hono (Cloudflare Workers)
- **Location**: `backend/src/index.ts`
- **Logic**: 
  - `generatePetFashionPortrait`: Constructs a concise, high-fashion prompt ensuring the pet's identity and body proportions are strictly maintained while applying Christmas elements.
  - `generateSimpleChristmasHat`: Simpler mode for just adding a hat.
- **API Endpoints**:
  - `POST /api/public/gemini/generate` (Public): Generates images. Tracks IP address.
  - `POST /api/public/admin/ban` (Public + Secret Header): Bans/Unbans users (by email).
- **Security**: Uses `edgespark.secret.get("GEMINI_API_KEY")` and `edgespark.secret.get("ADMIN_SECRET")`.
- **Database**: Tracks usage in `generations` table.
- **Storage**: Stores generated images in `images` bucket.
- **Access Control**: IP tracking enabled. Email banning exists but is bypassed for anonymous users.

## Development Commands

- **Frontend**:
  - Install dependencies: `npm install`
  - Build: `npm run build`
  - Dev: `npm run dev`

- **Backend**:
  - Location: `backend/`
  - Install dependencies: `cd backend && npm install`
  - Typecheck: `cd backend && npm run typecheck`
  - Deploy: `cd backend && npx edgespark deploy`
  - Logs: `cd backend && npx edgespark logs`

## Configuration

- **Open Graph**: Thumbnail located at `public/og-image.jpg`.
- **Secrets**:
  - `GEMINI_API_KEY` (Required for generation).
  - `ADMIN_SECRET` (Required for admin panel).
- **Environment**: Frontend connects to `https://staging--bcnobgb58vrte098wg6d.youbase.cloud`.

## Database
- **Table `generations`**: Tracks usage (user_id="anonymous", ip_address, prompt="Full Generated Prompt", timestamp, image_uri, error_log).
- **Table `user_profiles`**: Manages user status (is_banned).
- Schema: `backend/src/__generated__/db_schema.ts`.

## Storage
- **Bucket `images`**: Stores generated images.

## Deployment
1. **Backend**: Run `cd backend && npx edgespark deploy`.
2. **Frontend**: Run `npm run build` and Publish.
