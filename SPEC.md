# Spec & Plan: App Ramassa

## Context

AE Ramassa is a football club and NGO in Barcelona that runs an inclusive women's football program for 35+ refugee, asylum-seeking, and migrant women. All coordination currently happens via WhatsApp groups — overloaded, chaotic, and impossible to extract impact data from. Staff spend hours on manual attendance tracking, surveys, and individual messages that get lost in the noise.

This app will be the centralized connection point between participants (players), Ramassa staff, and collaborating social entities (Creu Roja, CEAR, ACNUR, etc.). It replaces WhatsApp chaos with organized, accessible, multilingual information — while automating data collection for impact reporting from day one.

The project is backed by a Generalitat de Catalunya grant (line 3.8.1) for digital innovation in social action. The platform is designed with a gender perspective and decolonial approach, ensuring cultural sensitivity and inclusivity for all participants.

---

## Objective

Build a cross-platform application (mobile + web) that:

1. **Eliminates WhatsApp dependency** — organized info board, community forums, push notifications, direct staff-user messaging
2. **Automates participant data collection** — onboarding profiles with personal data, equipment sizes, documentation status, reference entity
3. **Streamlines operations** — training schedules, attendance tracking, event management, mentoring
4. **Enables impact measurement** — data collection from day one, exportable reports for funders
5. **Is replicable** — white-label architecture so other social entities/sports clubs can adopt it
6. **Gives staff full content management** — no developer needed for day-to-day operations
7. **Provides knowledge resources** — rights & asylum info, digital literacy guides, training content
8. **Builds community** — forums, content sharing, feedback channels for participant voice
9. **Coordinates entities** — portal for social entities to refer participants, share resources, track impact

---

## Architecture Strategy

### Monorepo — Two Apps, Shared Core

Based on research of real-world production teams, React Native Web is not suitable for complex admin dashboards (data tables, charts, rich forms). The project uses a **monorepo split**:

| App                       | Technology          | Purpose                                          | Primary Users   |
| ------------------------- | ------------------- | ------------------------------------------------ | --------------- |
| **Mobile + Player Web**   | Expo (React Native) | Mobile app (Android/iOS) + player web experience | Players         |
| **Admin + Entity Portal** | Next.js + shadcn/ui | Staff CMS, entity portal, desktop-optimized      | Staff, Entities |
| **Shared Package**        | TypeScript          | Supabase client, types, hooks, i18n, constants   | Both apps       |

**Why this split:**

- Expo excels at mobile + simple web screens (player-facing)
- Next.js + shadcn/ui excels at desktop admin interfaces (data tables, forms, dashboards, charts)
- Shared package prevents business logic duplication (Supabase queries, types, translations)
- Each tool is used for what it does best — no fighting the framework

### Infrastructure — Two Providers Only

| Service                                         | Provider                          | Purpose                             | Cost             |
| ----------------------------------------------- | --------------------------------- | ----------------------------------- | ---------------- |
| **Database + Auth + Realtime + Edge Functions** | Supabase (EU — Frankfurt)         | Core backend                        | $25/month (Pro)  |
| **Media Storage**                               | Cloudflare R2                     | Photos, videos, documents           | Free tier (10GB) |
| **Web Hosting (Admin)**                         | Cloudflare Workers (via OpenNext) | Next.js admin app                   | Free             |
| **Web Hosting (Player)**                        | Cloudflare Pages                  | Expo web export                     | Free             |
| **Serverless Processing**                       | Cloudflare Workers                | Image compression, auto-translation | Free tier        |
| **Mobile Builds**                               | EAS (Expo)                        | Android/iOS builds                  | Free tier        |

**Total infrastructure cost: ~$25/month** at current scale (50-200 users).

**Why Cloudflare R2 instead of Supabase Storage:**

- 10GB free (vs 1GB on Supabase)
- Zero egress fees — every image load in the forum/gallery is free bandwidth
- $0.015/GB/month beyond free tier (vs $0.021 on Supabase)
- Same Cloudflare network as Pages hosting = fast delivery

---

### Platform Strategy

| Platform          | Technology               | Primary Users       | Purpose                                                                                      |
| ----------------- | ------------------------ | ------------------- | -------------------------------------------------------------------------------------------- |
| **Android app**   | Expo (React Native)      | Players (primary)   | Main interface for participants. Most users are on Android.                                  |
| **iOS app**       | Expo (React Native)      | Players (secondary) | Same features as Android. Secondary priority.                                                |
| **Player web**    | Expo Web (same codebase) | Players             | Browser fallback for players who can't/won't install the app.                                |
| **Admin web**     | Next.js + shadcn/ui      | Staff               | Full CMS: content management, participant management, analytics, reports. Desktop-optimized. |
| **Entity portal** | Next.js + shadcn/ui      | Social entities     | Referrals, course submissions, impact tracking. Desktop-optimized.                           |

**Key design principle:** Mobile-first for player screens, desktop-first for admin/entity screens.

---

## Design Principles

### Decolonial Design

The application avoids eurocentrism in its visual design and content presentation:

- Use culturally diverse imagery and illustrations that reflect the identities and realities of refugee women from different backgrounds
- Avoid eurocentric symbols, metaphors, and visual conventions where they may not be universally understood
- Respect cultural traditions and identities in visual language, iconography, and tone of written content
- Participant-created content features (stories, experiences) give voice to users' own narratives

### Gender Perspective

- The platform is designed as a safe digital space for women
- Content moderation prioritizes safety from harassment
- Mentoring and resources address gender-specific topics (labor rights, gender violence, personal empowerment)
- All features consider the specific barriers refugee women face in digital access

### Disability Accessibility — WCAG AA (Hard Requirement)

- Screen reader compatible (proper ARIA labels, roles, semantic structure)
- High contrast mode (WCAG AA minimum contrast ratios)
- Large tap targets (minimum 48dp, aim for 56dp on player-facing screens)
- Text resizing support
- No information conveyed by color alone

---

## UX Principles (Hard Constraints)

These are not guidelines — they are enforced during code review and `/react-native-perfection` runs.

| Principle                            | Rule                                                                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Fewer choices per screen**         | Prefer 3 screens with 2 options each over 1 screen with 6 options. Reduce cognitive load.                                           |
| **Visual feedback for every action** | Every tap produces immediate visual response (color change, checkmark, animation). No silent state changes.                         |
| **Tap targets**                      | Minimum 48x48dp. Aim for 56x56dp on player-facing screens.                                                                          |
| **Icons + labels**                   | Every navigation item has both icon AND label. Icons alone fail with low-literacy users, text alone fails with non-native speakers. |
| **Max 2 levels of navigation**       | If you need 3 levels, the information architecture is wrong. Aim for 2 taps to primary actions, flex when content demands it.       |
| **Progressive disclosure**           | Show the essential, hide the advanced. Don't show 10 options when 3 cover 90% of use cases.                                         |
| **Human error states**               | "Something went wrong, tap to try again" — not "Error 422". In the user's language.                                                 |
| **Offline-tolerant**                 | Show cached content with subtle banner when offline. Never show blank screens or technical errors.                                  |
| **Language in settings**             | Language switcher lives in settings/profile. Set once during onboarding, rarely changed. Not a persistent UI element.               |
| **No text-only screens**             | Use visual cues, icons, colors, and imagery to support understanding. Important for low-literacy and non-native speakers.           |

---

## Target Users & What They Can Do

### 1. Players (Jugadores/Usuaries) — Role: `player`

**Interface:** Mobile app (Android/iOS) + web browser fallback (Expo)
**Tech level:** Very low — must be extremely intuitive and visual

| Capability                    | Description                                                                                                                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **View announcements**        | Home feed with pinned items, categorized (info, training, social)                                                                                                                                   |
| **View events/calendar**      | Upcoming trainings, courses, activities, outings — calendar grid view AND chronological list view                                                                                                   |
| **Sign up for events**        | One-tap "I'm interested" or "I'll attend"                                                                                                                                                           |
| **Browse services directory** | 8 categories: Housing, Language Courses, Job Insertion, Legal Aid, Health, Training, Leisure & Culture, Documentation & Administrative. Category-specific filters (zone, cost, type, availability). |
| **Mark interest in services** | Tap to express interest — staff gets notified                                                                                                                                                       |
| **Chat with staff**           | Direct messaging with Ramassa staff or coach (not with other players)                                                                                                                               |
| **Community forum**           | Browse community board, create posts, reply, flag inappropriate content                                                                                                                             |
| **Share media**               | Upload photos, videos (max 10MB), documents with privacy controls                                                                                                                                   |
| **View knowledge base**       | Rights & asylum info, digital literacy guides, training content, participant stories                                                                                                                |
| **Share your story**          | Submit personal story/experience (text + images). Staff reviews, translates, and publishes to knowledge base.                                                                                       |
| **Submit feedback**           | Typed feedback drawer: propose activity, share idea, report problem, general feedback (goes to staff)                                                                                               |
| **View own profile**          | See and edit personal information                                                                                                                                                                   |
| **Request mentoring**         | Request/schedule individual support sessions (gender-specific topics available)                                                                                                                     |
| **Change language**           | Switch between CA/ES/EN/AR/FA in settings                                                                                                                                                           |
| **View own attendance**       | See history of attended events                                                                                                                                                                      |
| **Respond to surveys**        | Answer surveys/polls from staff (post-event or standalone). Simple, visual question types (stars, choices, yes/no).                                                                                 |

### 2. Staff Ramassa — Role: `staff` / `admin`

**Interface:** Next.js admin web app (desktop) + Expo mobile app for field work (attendance)
**Tech level:** Medium-high

**Content Management (Full CMS — no developer needed):**

| Capability                        | Description                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Manage announcements**          | Create, edit, delete, pin/unpin. Add images (compressed, stored on R2). Multilingual content with AI auto-translation (staff writes in one language, system suggests translations for the other 4, staff reviews and publishes).                                                                                                                   |
| **Manage events**                 | Create, edit, delete events. Set category, location (with map link), date/time, recurrence, max participants, signup requirement. Multilingual with auto-translation.                                                                                                                                                                              |
| **Manage event categories**       | Create, edit, reorder categories (trainings, courses, cultural activities, job insertion, language courses, outings). Set icon and color per category.                                                                                                                                                                                             |
| **Manage services directory**     | Add, edit, remove services across 8 categories. Structured fields per category (housing type, legal aid type, etc.) + shared fields (cost, location, zone, contact, schedule, availability). Multilingual with auto-translation. Schedule publishing with `published_at` / `expires_at`. Review entity submissions (approve/reject with comments). |
| **Manage knowledge base**         | Create, edit, publish articles for: rights & asylum information, digital literacy guides, gender equality & decolonial training content, general resources. Multilingual with auto-translation. Support for participant-created content (stories, experiences).                                                                                    |
| **Upload media**                  | Upload images/videos for content. Client-side compression before upload. Stored on Cloudflare R2.                                                                                                                                                                                                                                                  |
| **Send push notifications**       | Send to all users, or filter by: category interest, event signup, reference entity, custom groups. Include notification title + body with auto-translation.                                                                                                                                                                                        |
| **Manage notification templates** | Create reusable notification templates for recurring messages (e.g., weekly training reminder).                                                                                                                                                                                                                                                    |

**Participant Management:**

| Capability                      | Description                                                                                                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **View all participants**       | Searchable, filterable table (shadcn data table) of all players in the org. Filter by entity, nationality, active/inactive, has dependents. Full-text search (PostgreSQL). |
| **View participant detail**     | Full profile, attendance history, event signups, chat history, forum activity, feedback submissions, reference entity info.                                                |
| **Edit participant profiles**   | Update any field. Add notes. Change status (active/inactive).                                                                                                              |
| **Create participant accounts** | Create accounts directly (for users without email: generate internal email + set password). No SMS/messaging cost.                                                         |
| **Invite new participants**     | Generate invite link (magic link via email, with optional pre-filled reference entity). Share link directly or via entity.                                                 |
| **Deactivate participants**     | Soft-delete: mark inactive without destroying data (RGPD: keep for reporting, anonymize on request).                                                                       |
| **Delete participants**         | Full RGPD deletion on request. Remove all personal data.                                                                                                                   |
| **Reset passwords**             | Reset password for admin-created accounts (fallback auth).                                                                                                                 |
| **Assign equipment**            | Record clothing size, shoe size (on profile). Track deliveries: item, size, date, who delivered (via `equipment_deliveries` table). View delivery history per participant. |

**Operations:**

| Capability                   | Description                                                                                                                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mark attendance**          | In-situ attendance screen for events. List of expected participants, tap to mark present/absent/excused. Real-time sync. Works on mobile (at the field). Offline-tolerant.                                                                              |
| **View attendance reports**  | Per-event and per-participant attendance history. Aggregate stats.                                                                                                                                                                                      |
| **Manage conversations**     | View and respond to all player-staff chat conversations. Assign conversations to specific staff members.                                                                                                                                                |
| **Schedule mentoring**       | View mentoring requests. Schedule sessions. Mark completed. Track topics (labor, gender violence, empowerment, asylum, other).                                                                                                                          |
| **Moderate community forum** | Flagged content queue (prioritized). Dismiss flags, hide/delete posts, contact users. Pin/unpin posts. Disable posting for specific users (soft ban from forum). Auto-hide posts with 3+ flags pending review.                                          |
| **Review feedback**          | Inbox of player feedback submissions. Filter by type (activity proposal, idea, problem, general). Mark as read/in-progress/resolved. Respond via chat.                                                                                                  |
| **Create & manage surveys**  | Create surveys/polls (linked to event or standalone). Question types: rating (1-5 stars), multiple choice, yes/no, free text. Distribute via push notification or in-app prompt. View aggregated results + individual responses. Export results as CSV. |

**Analytics & Reporting:**

| Capability         | Description                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard**      | Overview: total participants, attendance rates, participation by category, new signups over time, referral entity breakdown, forum activity. |
| **Impact reports** | Generate reports for funders/grant: attendance rates, participation trends, demographic breakdown, entity referral stats.                    |
| **Export data**    | Export participant data, attendance records, event history as CSV/Excel for grant reporting.                                                 |
| **Audit log**      | View who changed what and when (staff actions on participant data).                                                                          |

**Organization Settings (admin only):**

| Capability             | Description                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Branding**           | Upload logo, set primary/secondary colors (for white-label).                                                         |
| **Manage staff**       | Invite/remove staff members. Set roles (staff vs admin).                                                             |
| **Manage entities**    | Add/remove collaborating social entities. Generate entity access links.                                              |
| **App settings**       | Configure available languages, default language, org name, contact info.                                             |
| **Internal documents** | Manage internal documents: medical insurance forms, material inventory, organizational resources. Staff-only access. |

### 3. Social Entities (Entitats Socials) — Role: `entity`

**Interface:** Next.js admin web app (entity portal section, desktop)
**Tech level:** Medium

| Capability                     | Description                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Refer participants**         | Submit new participant referral with basic info (name, contact, documentation status). Ramassa staff completes onboarding.                                                                                                                                                                                                                                                                                                     |
| **View referred participants** | See status and progress of participants they referred (attendance, active/inactive). Cannot see participants from other entities.                                                                                                                                                                                                                                                                                              |
| **Manage service submissions** | Full CRUD portal: submit services/resources with structured category-specific fields, images, and contact info. View all submissions (pending, approved, rejected, published). Edit, delete, or resubmit. Edits to published services go live immediately (staff notified). New submissions require staff approval. Smart contact reuse with autocomplete from previous submissions. Schedule submissions with `published_at`. |
| **Communicate with staff**     | Comments on each submission (ask questions, respond to feedback). General messaging with Ramassa staff. Staff can leave internal notes invisible to entity user.                                                                                                                                                                                                                                                               |
| **View events**                | See upcoming events (read-only). Cannot create or edit.                                                                                                                                                                                                                                                                                                                                                                        |
| **Report updates**             | Submit status updates about referred participants (e.g., "housing situation changed", "started language course at our center").                                                                                                                                                                                                                                                                                                |
| **View impact data**           | See aggregate impact stats for their referred participants (attendance rates, participation).                                                                                                                                                                                                                                                                                                                                  |

---

## Authentication

### Strategy: Magic Link Primary, Admin-Created Fallback

| User type                     | Auth method           | Details                                                                                                                              |
| ----------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Players (with email)**      | Magic link            | Player enters email → receives link → taps → logged in. No password to remember. Free (Supabase email).                              |
| **Players (no email — rare)** | Admin-created account | Staff creates account with internal email (`name.id@ramassa.app`) + password. Gives credentials to player. Staff can reset password. |
| **Staff / Admin**             | Magic link            | All staff have email. Magic link is simplest.                                                                                        |
| **Entity users**              | Magic link            | All entity contacts have email.                                                                                                      |

**Session persistence:** Sessions persist on device (MMKV on mobile, localStorage on web). Users log in once and stay logged in. Re-authentication only needed on device change or session expiry.

**Zero messaging cost.** No SMS, no WhatsApp API. All auth is via email (free through Supabase) or admin-created credentials.

**Admin capabilities on all accounts:**

- Create accounts (with or without real email)
- Reset passwords
- Deactivate / reactivate accounts
- Delete accounts (RGPD full deletion)

---

## Auto-Translation System

Staff creates content in one language (typically Catalan). The system auto-translates to the other 4 languages. Staff reviews suggestions and publishes.

**Flow:**

```
Staff writes announcement in Catalan
    ↓
System generates translations: ES, EN, AR, FA
    ↓
Staff reviews each translation (side-by-side editor)
    ↓
Staff edits if needed, approves
    ↓
Content published in all 5 languages
```

**Applies to:** announcements, events, services, knowledge base articles, notification templates.

### Scheduled Publishing

All publishable content supports scheduled publishing via `published_at` and `expires_at` timestamps (where applicable). Content is only visible when `published_at <= now() AND (expires_at IS NULL OR expires_at > now())`. No cron jobs — just a WHERE clause.

| Content Type       | `published_at`                   | `expires_at`                           |
| ------------------ | -------------------------------- | -------------------------------------- |
| Announcements      | Yes                              | Yes                                    |
| Events             | Yes (when event appears in feed) | No (events have `starts_at`/`ends_at`) |
| Services           | Yes                              | Yes                                    |
| Knowledge Articles | Yes                              | Yes                                    |
| Surveys            | Yes                              | No (uses `closes_at`)                  |

**Implementation:** Cloudflare Worker with a pluggable translation provider interface. The system defines a contract:

```ts
// packages/shared/lib/translation.ts
interface TranslationProvider {
  translate(text: string, from: Language, to: Language[]): Promise<Record<Language, string>>;
}
```

Provider can be swapped at deploy time without touching app code. Options:

- **DeepL API** — purpose-built for translation, cheap, high quality. Supports CA, ES, EN, AR. Does NOT support Farsi.
- **Claude API** — handles all 5 languages including Farsi, understands context (e.g., "translate this football training announcement for refugee women").
- **Hybrid** — DeepL for CA→ES/EN/AR (where it excels), Claude for CA→FA. Two providers, best of both.

Decision deferred to implementation time. The architecture supports any combination. Cost is negligible at this content volume (~cents/month regardless of provider).

---

### Success Criteria

- [ ] Players can view upcoming trainings and events without WhatsApp
- [ ] Players can access the app via mobile (Android/iOS) OR web browser
- [ ] Players can mark interest in courses/activities with one tap
- [ ] Players can post to community forum and reply to other posts
- [ ] Players can flag inappropriate forum content for staff review
- [ ] Players can submit feedback (ideas, problems, activity proposals) via feedback drawer
- [ ] Players can browse knowledge base (rights, asylum, digital literacy, training content)
- [ ] Players can share photos and videos (max 10MB) with the community
- [ ] Coach can take attendance in-situ during training sessions (mobile, offline-tolerant)
- [ ] Staff can manage ALL content (events, announcements, services, knowledge base, categories) from the web admin panel without developer help
- [ ] Staff can write content in one language and auto-translate to the other 4
- [ ] Staff can see a dashboard of all participants with profile data
- [ ] Staff can create player accounts directly (for users without email)
- [ ] Staff can send push notifications to all or filtered groups
- [ ] Staff can invite participants via magic links
- [ ] Staff can moderate community forum via flagged content queue
- [ ] Staff can review and respond to player feedback
- [ ] Staff can generate impact reports and export data as CSV
- [ ] Staff can manage internal documents (insurance, inventory)
- [ ] Social entities can refer participants and track their progress
- [ ] Social entities can offer courses/resources for the services directory
- [ ] Onboarding flow collects all required profile data (name, DOB, address, NIE/passport, nationality, reference entity, dependents, clothing/shoe sizes)
- [ ] App works in Catalan, Spanish, English, Arabic, and Farsi with full RTL support
- [ ] Web admin is responsive and desktop-optimized (Next.js + shadcn/ui)
- [ ] Player web is responsive and mobile-friendly (Expo Web)
- [ ] RGPD-compliant: terms acceptance, data viewing, deletion request
- [ ] WCAG AA accessibility compliance on all player-facing screens
- [ ] Impact data exportable (attendance rates, participation by activity type, referral entity breakdown)
- [ ] All media stored on Cloudflare R2 with client-side compression before upload

---

## Tech Stack

| Layer                    | Technology                              | Why                                                                        |
| ------------------------ | --------------------------------------- | -------------------------------------------------------------------------- |
| **Mobile App**           | Expo SDK 52+ / React Native             | Cross-platform (Android + iOS). OTA updates via EAS.                       |
| **Player Web**           | Expo Web (same codebase)                | Players access via browser. Simple screens that work well on RN Web.       |
| **Admin Web**            | Next.js (App Router) + shadcn/ui        | Desktop-optimized CMS. Data tables, forms, dashboards, charts.             |
| **Admin Styling**        | Tailwind CSS + shadcn/ui                | Polished, accessible component library.                                    |
| **Mobile Styling**       | NativeWind (Tailwind for RN)            | Utility-first, RTL-ready (`start`/`end`). Fast iteration.                  |
| **Backend**              | Supabase (EU — Frankfurt)               | Auth, PostgreSQL, Realtime, Edge Functions. EU-hosted. RGPD.               |
| **Database**             | PostgreSQL (via Supabase)               | Relational model. SQL for reporting. Row-Level Security. Full-text search. |
| **Auth**                 | Supabase Auth                           | Magic links (email) + password fallback. Free.                             |
| **Media Storage**        | Cloudflare R2                           | Zero egress fees. 10GB free. Upload via presigned URLs.                    |
| **Web Hosting (Admin)**  | Cloudflare Workers (via OpenNext)       | Free. Full Node.js runtime for Next.js.                                    |
| **Web Hosting (Player)** | Cloudflare Pages                        | Free. Static Expo web export.                                              |
| **Serverless**           | Cloudflare Workers                      | Image compression, auto-translation. Free tier.                            |
| **Push Notifications**   | Expo Push API + Supabase Edge Functions | Store push tokens. Trigger from Edge Functions.                            |
| **i18n**                 | react-i18next + expo-localization       | CA, ES, EN, AR, FA. Full RTL support. Shared translation files.            |
| **State/Cache**          | TanStack React Query + MMKV (mobile)    | Offline resilience. Optimistic updates. Persistent cache.                  |
| **Navigation (Mobile)**  | Expo Router (file-based)                | Deep linking. Convention over configuration.                               |
| **Navigation (Admin)**   | Next.js App Router                      | File-based routing. Server components where beneficial.                    |
| **Search**               | PostgreSQL full-text search             | Built into Supabase. No external service needed at this scale.             |
| **Auto-Translation**     | Cloudflare Worker + translation API     | Staff writes once, system suggests 4 translations. Cents/month.            |

---

## Commands

```
# Monorepo root
bun install                                    # Install all dependencies

# Mobile app (Expo)
bun run dev:mobile                             # bunx expo start
bun run build:android                          # bunx eas build --platform android --profile preview
bun run test:mobile                            # bun test (mobile app tests)

# Admin app (Next.js)
bun run dev:admin                              # next dev
bun run build:admin                            # next build
bun run test:admin                             # bun test (admin app tests)

# Shared
bun run typecheck                              # bunx tsc --noEmit (all packages)
bun run lint                                   # bunx eslint . --fix
bun run format                                 # bunx prettier --write .
bun run test                                   # All tests across monorepo

# Database
bun run db:push                                # bunx supabase db push
bun run db:studio                              # bunx supabase studio
bun run db:generate-types                      # bunx supabase gen types typescript
```

---

## Project Structure

```
ramassa/
  apps/
    mobile/                           # Expo app (Android + iOS + Player Web)
      app/                            # Expo Router file-based routes
        (auth)/
          login.tsx                   # Magic link login (enter email)
          onboarding/
            index.tsx                 # Step-by-step onboarding wizard
        (app)/                        # Authenticated — Player-facing routes
          (tabs)/
            index.tsx                 # Home / Announcements feed
            calendar.tsx              # Events calendar (grid + list view)
            community.tsx             # Community forum board
            services.tsx              # Services directory (8 categories, filterable)
            profile.tsx               # Profile + settings + language
          chat/
            [conversationId].tsx      # Direct messaging with staff
          event/
            [eventId].tsx             # Event detail + sign up
          forum/
            [postId].tsx              # Forum post detail + replies
            create.tsx                # Create new forum post
          service/
            [serviceId].tsx           # Service detail (images, contact, metadata, mark interest)
          knowledge/
            [articleId].tsx           # Knowledge base article detail
          mentoring/
            request.tsx               # Request a mentoring session
          feedback/
            index.tsx                 # Feedback drawer (submit ideas, problems, proposals)
          story/
            submit.tsx                # Submit participant story (text + images, creates unpublished knowledge_article with content_type='participant_story')
          gallery/
            index.tsx                 # Media gallery (shared photos/videos)
            upload.tsx                # Upload media
      src/
        components/
          ui/                         # Shared UI primitives (Pressable, Card, etc.)
          forms/                      # Form components (onboarding wizard)
          layout/                     # Layout wrappers (RTL-aware)
        hooks/                        # Mobile-specific hooks
        lib/                          # Mobile-specific config
      assets/                         # Images, fonts (including Arabic/Farsi fonts)

    admin/                            # Next.js app (Staff CMS + Entity Portal)
      app/                            # Next.js App Router
        (auth)/
          login/page.tsx              # Magic link login
        (admin)/                      # Staff/Admin routes — sidebar layout
          layout.tsx                  # Admin sidebar navigation
          dashboard/page.tsx          # Stats, charts, recent activity
          announcements/
            page.tsx                  # List all announcements
            create/page.tsx           # Create/edit (multilingual + auto-translate)
          events/
            page.tsx                  # List all events
            create/page.tsx           # Create/edit event
            categories/page.tsx       # Manage categories (CRUD, reorder)
          services/
            page.tsx                  # List all services (filter by category, status)
            create/page.tsx           # Create/edit service (category-specific form)
            categories/page.tsx       # Manage service categories (CRUD, reorder, metadata schema)
            submissions/
              page.tsx                # Entity submission review queue (pending, approved, rejected)
              [submissionId]/page.tsx  # Review submission detail + comments + approve/reject
          knowledge-base/
            page.tsx                  # List all articles
            create/page.tsx           # Create/edit article (rights, digital literacy, training)
          participants/
            page.tsx                  # Participant data table (search, filter, sort)
            [userId]/page.tsx         # Participant detail (profile, history, chat, forum, feedback)
            create/page.tsx           # Create participant account (no-email fallback)
            invite/page.tsx           # Generate magic link invites
          attendance/
            page.tsx                  # Attendance overview
            [eventId]/page.tsx        # In-situ attendance marking
          conversations/
            page.tsx                  # All conversations (assign, filter)
            [conversationId]/page.tsx # Staff-side chat view
          forum-moderation/
            page.tsx                  # Flagged content queue + moderation tools
          feedback/
            page.tsx                  # Player feedback inbox (ideas, problems, proposals)
          mentoring/
            page.tsx                  # Mentoring requests, scheduling
          surveys/
            page.tsx                  # List all surveys + results overview
            create/page.tsx           # Create/edit survey (question builder, targeting, scheduling)
            [surveyId]/page.tsx       # Survey results (aggregated + individual, export CSV)
          notifications/
            send/page.tsx             # Send push notifications (filters, auto-translate)
            templates/page.tsx        # Manage notification templates
          reports/
            page.tsx                  # Impact reports dashboard
            export/page.tsx           # Export data as CSV/Excel
          documents/
            page.tsx                  # Internal documents (insurance, inventory)
          settings/
            page.tsx                  # Organization settings
            branding/page.tsx         # Logo, colors (white-label)
            staff/page.tsx            # Manage staff members + roles
            entities/page.tsx         # Manage collaborating entities
            languages/page.tsx        # Configure available languages
        (entity)/                     # Entity portal routes — separate layout
          layout.tsx                  # Entity portal layout
          dashboard/page.tsx          # Entity overview
          referrals/
            page.tsx                  # Referred participants + status
            new/page.tsx              # Submit new referral
          services/
            page.tsx                  # All submissions dashboard (pending, approved, rejected, published)
            new/page.tsx              # Submit new service (category-specific form)
            [submissionId]/
              page.tsx                # View/edit submission + comments thread
          updates/
            page.tsx                  # Status updates on participants
          events/page.tsx             # View upcoming events (read-only)
          reports/page.tsx            # Impact stats for their referrals
      components/
        ui/                           # shadcn/ui components
        admin/                        # Admin-specific (data tables, charts, editors)
        entity/                       # Entity-specific components

  packages/
    shared/                           # Shared between both apps
      types/
        database.ts                   # Generated Supabase types (bunx supabase gen types)
        index.ts                      # Shared interfaces
      hooks/
        use-auth.ts                   # Auth hooks (shared logic)
        use-events.ts                 # Event queries (React Query)
        use-profiles.ts               # Profile queries
        use-announcements.ts          # Announcement queries
        use-forum.ts                  # Forum queries
        use-knowledge-base.ts         # Knowledge base queries
        use-attendance.ts             # Attendance queries
        use-conversations.ts          # Chat queries
        use-services.ts               # Services directory queries (category filtering, metadata search)
        use-service-submissions.ts    # Entity submission CRUD + comments
        use-surveys.ts                # Survey queries
      lib/
        supabase.ts                   # Supabase client initialization
        r2.ts                         # Cloudflare R2 upload utilities
        i18n.ts                       # i18n configuration (shared)
        constants.ts                  # App-wide constants
        image-compression.ts          # Client-side image compression before R2 upload
      locales/
        ca.json                       # Catalan translations
        es.json                       # Spanish translations
        en.json                       # English translations
        ar.json                       # Arabic translations
        fa.json                       # Farsi translations

  supabase/
    migrations/                       # SQL migration files
    functions/                        # Supabase Edge Functions
      send-notification/              # Push notification sender
      invite-user/                    # Magic link invite generator
      export-report/                  # CSV/Excel report generator
      translate-content/              # Auto-translation trigger (calls Cloudflare Worker)
    seed.sql                          # Seed data for development

  .github/
    workflows/
      ci.yml                          # Lint, typecheck, test, build (both apps)
      eas-build.yml                   # Mobile builds on version tags
    dependabot.yml                    # Weekly dependency updates
```

---

## Database Schema

### Core Tables

```sql
-- Organizations (white-label support from day one)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#0077B6',
  secondary_color TEXT DEFAULT '#FFD166',
  default_language TEXT DEFAULT 'ca',
  available_languages TEXT[] DEFAULT ARRAY['ca', 'es', 'en', 'ar', 'fa'],
  contact_email TEXT,
  contact_phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable pgcrypto for field-level encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- User profiles (extends Supabase auth.users)
-- Encryption: fields that identify or locate a refugee are encrypted at rest.
-- Encrypted fields use pgp_sym_encrypt/pgp_sym_decrypt with a server-side key
-- stored in Supabase Vault (never in client code).
-- Admins see decrypted values through the app — encryption protects against DB breaches.
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) NOT NULL,
  role TEXT CHECK (role IN ('player', 'staff', 'entity', 'admin')) NOT NULL DEFAULT 'player',
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth DATE,
  nationality TEXT,
  address BYTEA,                           -- ENCRYPTED (pgp_sym_encrypt) — physical location
  city TEXT,                               -- Not encrypted: needed for aggregate reporting
  postal_code BYTEA,                       -- ENCRYPTED — location data
  phone BYTEA,                             -- ENCRYPTED — personal contact
  document_type TEXT CHECK (document_type IN ('nie', 'passport', 'other', 'none')),
  document_number BYTEA,                   -- ENCRYPTED — identity document (NIE/passport)
  reference_entity TEXT,                   -- e.g., "Creu Roja", "CEAR"
  reference_contact_name TEXT,
  has_dependents BOOLEAN DEFAULT FALSE,
  num_dependents INTEGER DEFAULT 0,
  clothing_size TEXT,
  shoe_size TEXT,
  preferred_language TEXT DEFAULT 'ca',
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  is_forum_banned BOOLEAN DEFAULT FALSE,   -- Soft ban from forum posting
  terms_accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Encryption helpers (used in Edge Functions and RLS policies)
-- Write: pgp_sym_encrypt('value', current_setting('app.encryption_key'))
-- Read:  pgp_sym_decrypt(column, current_setting('app.encryption_key'))
-- The encryption key is set via Supabase Vault and injected into the session.
```

### Events & Attendance

```sql
-- Event categories
CREATE TABLE event_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  name JSONB NOT NULL,                     -- {"ca": "Entrenament", "es": "Entrenamiento", ...}
  icon TEXT,
  color TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Events (trainings, courses, activities, outings)
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  category_id UUID REFERENCES event_categories(id),
  title JSONB NOT NULL,                    -- {"ca": "...", "es": "...", "en": "...", "ar": "...", "fa": "..."}
  description JSONB,
  location TEXT,
  location_url TEXT,                       -- Google Maps link
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_rule TEXT,                    -- RRULE format
  max_participants INTEGER,
  requires_signup BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMPTZ DEFAULT now(),  -- Scheduled: when event appears in calendar/feed
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Event signups
CREATE TABLE event_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT CHECK (status IN ('interested', 'confirmed', 'cancelled')) DEFAULT 'interested',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, user_id)
);

-- Attendance records
CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT CHECK (status IN ('present', 'absent', 'excused')) NOT NULL,
  notes TEXT,
  marked_by UUID REFERENCES profiles(id),
  marked_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, user_id)
);
```

### Services Directory

The services directory uses a hybrid schema: shared columns for fields common to all categories + a `metadata` JSONB column for category-specific structured fields. This avoids 8 separate tables while keeping category-specific data queryable and typed at the app level.

**8 default service categories** (seeded on org creation):

| Category                                 | Metadata Fields                                                                                                                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Allotjament / Housing                    | `housing_type` (room, shared_flat, apartment, emergency_shelter, social_housing), `duration` (temporary, long_term, emergency), `deposit_required`, `deposit_amount`, `for_whom` (women_only, families, singles, any), `restrictions` |
| Cursos d'idiomes / Language Courses      | `language_taught` (catalan, spanish, english, other), `level` (beginner, intermediate, advanced, all_levels), `modality` (in_person, online, hybrid), `registration_deadline`                                                         |
| Inserció laboral / Job Insertion         | `job_type` (job_offer, training, cv_workshop, interview_prep, internship), `sector` (hospitality, care, cleaning, retail, admin, other), `requirements`, `language_required`                                                          |
| Assessoria jurídica / Legal Aid          | `legal_type` (asylum, residency, family_reunification, labor_rights, gender_violence, general), `languages_available[]`, `appointment_required`                                                                                       |
| Salut / Health                           | `health_type` (medical, dental, mental_health, reproductive, emergency), `health_card_required`, `languages_available[]`, `appointment_required`                                                                                      |
| Formació / Training                      | `training_type` (digital_literacy, professional, certificate), `modality` (in_person, online, hybrid), `requirements`, `registration_deadline`                                                                                        |
| Oci i cultura / Leisure & Culture        | `activity_type` (sports, cultural, social, trips), `family_friendly`, `age_restriction`                                                                                                                                               |
| Tràmits / Documentation & Administrative | `document_type` (empadronament, nie, tie, health_card, social_services, other), `appointment_required`, `documents_needed`, `languages_available[]`, `processing_time`                                                                |

```sql
-- Service categories (separate from event categories)
CREATE TABLE service_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  name JSONB NOT NULL,                     -- {"ca": "Allotjament", "es": "Alojamiento", ...}
  slug TEXT NOT NULL,                      -- 'housing', 'language-courses', etc.
  icon TEXT,
  color TEXT,
  sort_order INTEGER DEFAULT 0,
  metadata_schema JSONB,                   -- Defines expected metadata fields for this category (used by admin/entity forms)
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Contacts for services (reusable by entity users)
CREATE TABLE service_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  created_by UUID REFERENCES profiles(id) NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  role TEXT,                               -- "Housing coordinator", "Receptionist", etc.
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Services / courses / resources — hybrid schema
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  category_id UUID REFERENCES service_categories(id) NOT NULL,
  title JSONB NOT NULL,                    -- Multilingual
  description JSONB,                       -- Multilingual
  -- Shared structured fields (all categories)
  provider_name TEXT,                      -- Who offers this (Ramassa, Creu Roja, etc.)
  location TEXT,
  zone TEXT,                               -- Neighborhood/district (filterable)
  cost_type TEXT CHECK (cost_type IN ('free', 'subsidized', 'paid', 'varies')) DEFAULT 'free',
  cost_amount NUMERIC,                     -- Only if subsidized/paid
  cost_details TEXT,                       -- "deposit 300€", "depends on administrative status"
  contact_id UUID REFERENCES service_contacts(id),  -- Nullable: staff may not create a contact record
  schedule TEXT,                           -- "Mon-Fri 10-14h", "by appointment"
  external_url TEXT,
  availability TEXT CHECK (availability IN ('available', 'waiting_list', 'by_appointment', 'full')) DEFAULT 'available',
  -- Category-specific structured fields
  metadata JSONB DEFAULT '{}',             -- Validated at app level per category TypeScript types
  -- Scheduling
  published_at TIMESTAMPTZ DEFAULT now(),  -- Don't show before this date
  expires_at TIMESTAMPTZ,                  -- Auto-hide after this date (nullable = no expiry)
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES profiles(id),
  source_submission_id UUID REFERENCES entity_submissions(id),  -- If created from entity submission (bidirectional with entity_submissions.published_service_id — on approval: create service with source_submission_id first, then update submission with published_service_id, in a transaction)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- GIN index for metadata filtering
CREATE INDEX idx_services_metadata ON services USING GIN (metadata);
-- Index for scheduling queries
CREATE INDEX idx_services_published ON services (published_at, expires_at) WHERE is_active = TRUE;

-- Service images (separate table for ordering + alt text for WCAG AA)
CREATE TABLE service_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES services(id) ON DELETE CASCADE,
  submission_id UUID REFERENCES entity_submissions(id) ON DELETE CASCADE,
  url TEXT NOT NULL,                       -- R2 URL
  alt_text JSONB,                          -- Multilingual: {"ca": "Habitació doble amb llum natural", ...}
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  -- Image belongs to either a service or a submission, never both
  CONSTRAINT image_belongs_to_one CHECK (
    (service_id IS NOT NULL AND submission_id IS NULL) OR
    (service_id IS NULL AND submission_id IS NOT NULL)
  )
);

-- Player interest in services
CREATE TABLE service_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES services(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(service_id, user_id)
);

-- Entity submissions — same structured fields as services (becomes a service on approval)
CREATE TABLE entity_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  submitted_by UUID REFERENCES profiles(id) NOT NULL,  -- Entity user
  category_id UUID REFERENCES service_categories(id) NOT NULL,
  title JSONB NOT NULL,
  description JSONB,
  -- Same shared fields as services
  provider_name TEXT,
  location TEXT,
  zone TEXT,
  cost_type TEXT CHECK (cost_type IN ('free', 'subsidized', 'paid', 'varies')) DEFAULT 'free',
  cost_amount NUMERIC,
  cost_details TEXT,
  contact_id UUID REFERENCES service_contacts(id),
  schedule TEXT,
  external_url TEXT,
  availability TEXT CHECK (availability IN ('available', 'waiting_list', 'by_appointment', 'full')) DEFAULT 'available',
  metadata JSONB DEFAULT '{}',
  published_at TIMESTAMPTZ,               -- Desired publish date
  expires_at TIMESTAMPTZ,
  -- Approval workflow
  status TEXT CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  published_service_id UUID REFERENCES services(id),  -- Links to created service after approval
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Comments on entity submissions (entity ↔ staff conversation)
CREATE TABLE submission_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES entity_submissions(id) ON DELETE CASCADE,
  author_id UUID REFERENCES profiles(id) NOT NULL,
  body TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT FALSE,       -- TRUE = staff-only note, invisible to entity user
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Announcements & Notifications

```sql
-- Announcements (broadcast info board posts)
CREATE TABLE announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  category TEXT CHECK (category IN ('info', 'training', 'social', 'urgent')) DEFAULT 'info',
  title JSONB NOT NULL,                    -- {"ca": "...", "es": "...", "en": "...", "ar": "...", "fa": "..."}
  body JSONB NOT NULL,
  image_url TEXT,                          -- Cloudflare R2 URL
  is_pinned BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMPTZ DEFAULT now(),  -- Scheduled publishing
  expires_at TIMESTAMPTZ,                  -- Auto-hide after this date (nullable = no expiry)
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Push notification tokens
CREATE TABLE push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT CHECK (platform IN ('android', 'ios', 'web')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, token)
);

-- Notification templates
CREATE TABLE notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  name TEXT NOT NULL,
  title JSONB NOT NULL,
  body JSONB NOT NULL,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Messaging

```sql
-- Conversations (staff-to-player direct chat)
-- 1:1 messaging between staff and any non-staff user (player or entity)
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  user_id UUID REFERENCES profiles(id) NOT NULL,       -- Player or entity user (not staff)
  assigned_staff_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES profiles(id) NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,                           -- Optional image attachment (R2)
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Community Forum

```sql
-- Forum categories
CREATE TABLE forum_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  name JSONB NOT NULL,                     -- {"ca": "Habitatge", "es": "Vivienda", ...}
  icon TEXT,
  color TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Forum posts
CREATE TABLE forum_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  category_id UUID REFERENCES forum_categories(id),
  author_id UUID REFERENCES profiles(id) NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,                           -- Optional photo (R2)
  is_pinned BOOLEAN DEFAULT FALSE,
  is_hidden BOOLEAN DEFAULT FALSE,         -- Hidden by staff or auto-hidden by flags
  flag_count INTEGER DEFAULT 0,            -- Denormalized for quick filtering
  reply_count INTEGER DEFAULT 0,           -- Denormalized for display
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Forum replies
CREATE TABLE forum_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES forum_posts(id) ON DELETE CASCADE,
  author_id UUID REFERENCES profiles(id) NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  is_hidden BOOLEAN DEFAULT FALSE,
  flag_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Forum flags (user-reported content)
CREATE TABLE forum_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES forum_posts(id) ON DELETE CASCADE,
  reply_id UUID REFERENCES forum_replies(id) ON DELETE CASCADE,
  flagged_by UUID REFERENCES profiles(id) NOT NULL,
  reason TEXT CHECK (reason IN ('inappropriate', 'spam', 'incorrect_info', 'other')) NOT NULL,
  comment TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id),
  resolution TEXT CHECK (resolution IN ('dismissed', 'hidden', 'deleted')),
  created_at TIMESTAMPTZ DEFAULT now(),
  -- A user can only flag a specific post/reply once
  UNIQUE(post_id, flagged_by),
  UNIQUE(reply_id, flagged_by),
  -- Must reference either a post or a reply, not both
  CHECK ((post_id IS NOT NULL AND reply_id IS NULL) OR (post_id IS NULL AND reply_id IS NOT NULL))
);
```

### Knowledge Base

```sql
-- Knowledge base categories
CREATE TABLE knowledge_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  name JSONB NOT NULL,
  slug TEXT NOT NULL,                      -- 'rights-asylum', 'digital-literacy', 'gender-training'
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Knowledge base articles
-- "Interactive" content means: rich text + embedded video URLs + external links
-- (e.g., link to a Zoom/Meet session for live webinars, YouTube for tutorials).
-- NOT a quiz engine or LMS — that's over-engineering for 35-50 users.
-- If quiz functionality is needed later, add a separate quizzes table.
CREATE TABLE knowledge_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  category_id UUID REFERENCES knowledge_categories(id) NOT NULL,
  title JSONB NOT NULL,
  body JSONB NOT NULL,                     -- Rich content in all 5 languages (text, embedded video URLs, step-by-step guides with images)
  image_url TEXT,
  video_url TEXT,                          -- Optional: embedded video (YouTube, Vimeo, or R2-hosted)
  external_url TEXT,                       -- Optional: link to live session (Zoom/Meet) or external resource
  content_type TEXT CHECK (content_type IN ('article', 'tutorial', 'video', 'external_link', 'participant_story')) DEFAULT 'article',
  -- Participant stories workflow: player submits via mobile (story/submit.tsx) →
  -- creates row with content_type='participant_story', is_published=FALSE, author_id=player →
  -- staff reviews in admin, adds translations, publishes. Player writes in their language only.
  is_published BOOLEAN DEFAULT FALSE,
  author_id UUID REFERENCES profiles(id),   -- For participant_story: the player who submitted it
  published_at TIMESTAMPTZ,               -- Scheduled publishing
  expires_at TIMESTAMPTZ,                  -- Auto-hide after this date (nullable = no expiry)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Feedback & Surveys

```sql
-- Feedback submissions (feedback drawer)
CREATE TABLE feedback_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  author_id UUID REFERENCES profiles(id) NOT NULL,
  type TEXT CHECK (type IN ('activity_proposal', 'idea', 'problem', 'general')) NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  status TEXT CHECK (status IN ('new', 'read', 'in_progress', 'resolved')) DEFAULT 'new',
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Surveys & Polls (general-purpose, not just post-activity)
-- Staff creates surveys from the dashboard. Can be:
--   1. Linked to a specific event (post-activity feedback)
--   2. Standalone (general opinion poll, satisfaction survey, needs assessment)
-- Distribution: via push notification, in-app prompt after event, or visible in a "surveys" section
-- Question types stored in JSONB: rating (1-5 stars), multiple choice, yes/no, free text
CREATE TABLE surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  event_id UUID REFERENCES events(id),     -- NULL = standalone survey, set = post-event survey
  title JSONB NOT NULL,                    -- Multilingual
  description JSONB,                       -- Multilingual — optional intro text
  questions JSONB NOT NULL,                -- Array: [{type: 'rating'|'choice'|'yes_no'|'text', label: {ca:..., es:...}, options?: [...]}]
  is_active BOOLEAN DEFAULT TRUE,
  send_notification BOOLEAN DEFAULT FALSE, -- Push notification to target users when published
  target_audience TEXT CHECK (target_audience IN ('all', 'event_attendees', 'entity', 'custom')) DEFAULT 'all',
  published_at TIMESTAMPTZ DEFAULT now(),  -- Scheduled publishing
  closes_at TIMESTAMPTZ,                   -- Optional deadline (acts as expires_at)
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID REFERENCES surveys(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  answers JSONB NOT NULL,                  -- [{question_index: 0, value: 4}, {question_index: 1, value: "option_b"}, ...]
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(survey_id, user_id)
);
```

### Media Gallery

```sql
-- Shared media (photos, videos, documents)
CREATE TABLE media_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  uploaded_by UUID REFERENCES profiles(id) NOT NULL,
  file_url TEXT NOT NULL,                  -- Cloudflare R2 URL
  thumbnail_url TEXT,                      -- Compressed thumbnail (R2)
  file_type TEXT CHECK (file_type IN ('image', 'video', 'document')) NOT NULL,
  file_size INTEGER NOT NULL,              -- Bytes (enforced: images <1MB compressed, videos <10MB)
  caption TEXT,
  visibility TEXT CHECK (visibility IN ('community', 'staff_only', 'private')) DEFAULT 'community',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Equipment Tracking

```sql
-- Track equipment delivered to participants (jerseys, shoes, balls, etc.)
CREATE TABLE equipment_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  item TEXT NOT NULL,                        -- 'jersey', 'shorts', 'shoes', 'ball', 'bag', etc.
  size TEXT,                                 -- 'S', 'M', 'L', '38', etc.
  delivered_at DATE NOT NULL,
  delivered_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Internal (Staff-Only)

```sql
-- Staff documents (insurance, inventory, internal resources)
CREATE TABLE staff_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,                  -- Cloudflare R2 URL
  category TEXT CHECK (category IN ('insurance', 'inventory', 'forms', 'other')) NOT NULL,
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Audit log
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  actor_id UUID REFERENCES profiles(id) NOT NULL,
  action TEXT NOT NULL,                    -- 'profile.update', 'event.create', 'forum_post.delete', etc.
  target_type TEXT NOT NULL,               -- 'profile', 'event', 'forum_post', etc.
  target_id UUID NOT NULL,
  changes JSONB,                           -- {"field": {"old": "...", "new": "..."}}
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Entity referrals (formalized referral tracking)
CREATE TABLE entity_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  entity_user_id UUID REFERENCES profiles(id) NOT NULL,  -- The entity user who referred
  referred_profile_id UUID REFERENCES profiles(id),       -- Linked after onboarding
  referred_name TEXT NOT NULL,
  referred_phone TEXT,
  referred_email TEXT,
  documentation_status TEXT,
  notes TEXT,
  status TEXT CHECK (status IN ('pending', 'onboarded', 'active', 'inactive')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Entity status updates on referred participants
CREATE TABLE entity_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id UUID REFERENCES entity_referrals(id) ON DELETE CASCADE,
  author_id UUID REFERENCES profiles(id) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Mentoring sessions
CREATE TABLE mentoring_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  player_id UUID REFERENCES profiles(id) NOT NULL,
  topic TEXT CHECK (topic IN ('personal_development', 'labor_orientation', 'asylum_rights', 'gender_violence', 'empowerment', 'digital_skills', 'other')) NOT NULL,
  topic_detail TEXT,
  preferred_date DATE,
  preferred_time TEXT,
  status TEXT CHECK (status IN ('requested', 'scheduled', 'completed', 'cancelled')) DEFAULT 'requested',
  scheduled_at TIMESTAMPTZ,
  assigned_staff_id UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Row-Level Security (RLS)

Every table has RLS enabled. Policies enforce:

| Role       | Access                                                                                                                                                                                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Player** | Own profile (read/write). Own org's events, announcements, knowledge base, services, forum (read). Own signups, attendance, conversations, feedback, media, service interests (read/write). Forum: create posts/replies if not banned. Flag any content. |
| **Staff**  | All data within their org (read/write). Create/edit/delete content. Mark attendance. Moderate forum. Manage participants. Review entity submissions. See internal submission comments.                                                                   |
| **Entity** | Own referrals, updates, and service submissions (read/write). Own submission comments (read/write, excluding `is_internal`). Own service contacts (read/write). Org events and published services (read). Referred participants' limited data (read).    |
| **Admin**  | Full access within org. Manage staff, entities, settings, branding.                                                                                                                                                                                      |

---

## Code Style

### Engineering Standards (Hard Rules)

These apply to ALL code in the monorepo. Enforced during code review and `/react-native-perfection`.

| Rule                                   | Details                                                                                                                                                                                                                                         |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Composition over monoliths**         | Small, focused components (<100 lines). If a component does two things, split it.                                                                                                                                                               |
| **No hardcoded strings**               | All user-facing text uses i18n translation keys. No exceptions.                                                                                                                                                                                 |
| **No magic numbers**                   | All numeric values (sizes, limits, durations, thresholds) must be named constants in `packages/shared/lib/constants.ts`.                                                                                                                        |
| **Reusable components in shared**      | If a component, hook, or utility is used by both apps, it lives in `packages/shared/`. Never duplicate logic.                                                                                                                                   |
| **Design tokens, not raw values**      | Colors, spacing, typography, radii, shadows — all defined as tokens. No raw hex codes or pixel values in components. Mobile uses NativeWind theme config. Admin uses Tailwind theme config. Both source from the same shared token definitions. |
| **Props interfaces, not inline types** | Every component has an explicit `Props` interface or type. No anonymous inline types.                                                                                                                                                           |
| **Single responsibility**              | Each file does one thing. Each function does one thing. Each hook does one thing.                                                                                                                                                               |
| **Colocation**                         | Tests, types, and utilities live next to the code they serve, not in separate trees.                                                                                                                                                            |
| **Explicit exports**                   | No barrel files (`index.ts` re-exporting everything). Import directly from the source file.                                                                                                                                                     |
| **Error boundaries**                   | Every route/screen has an error boundary. Errors are caught, not propagated to blank screens.                                                                                                                                                   |
| **Safe async**                         | All async operations (API calls, uploads, storage) wrapped in standardized error handling. No unhandled promise rejections. Use a shared `safeAsync` utility that catches, logs, and returns typed `Result<T, Error>`.                          |
| **Loading states**                     | Every async operation shows a loading state. No layout shift on load. Skeleton screens preferred over spinners.                                                                                                                                 |
| **Empty states**                       | Every list/feed has a designed empty state with a clear call-to-action. Never show a blank screen.                                                                                                                                              |
| **Dev-only logging**                   | Use shared `logger` utility (not `console.log`). Tagged logs: `logger.info('EventCard', 'message', data)`. Active in dev mode, stripped from production. Zero production overhead.                                                              |

### Developer Menu (Dev/Staging Builds Only)

Both apps include a developer menu, accessible from settings, visible only in `__DEV__` or staging builds. Never shipped to production.

**Purpose:** Accelerate development and testing by allowing instant state manipulation without manual data setup.

| Capability                 | Description                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Role switcher**          | Instantly view the app as player, staff, entity, or admin. No re-login needed.                                                     |
| **Language switcher**      | Quick-toggle between CA/ES/EN/AR/FA. Instant RTL/LTR flip for testing.                                                             |
| **State simulator**        | Trigger: empty states, error states, loading states, offline mode, slow network.                                                   |
| **Data seeding**           | Pre-populate: events, announcements, forum posts, attendance records, conversations. "Seed 10 events", "Seed 50 forum posts", etc. |
| **Environment info**       | View: Supabase URL, R2 bucket, build version, current user ID, session info, device info.                                          |
| **Cache controls**         | Clear React Query cache, clear MMKV storage, force refetch all queries.                                                            |
| **Push notification test** | Trigger a local push notification without sending a real one.                                                                      |
| **Feature flags**          | Toggle experimental features on/off (future-proofing).                                                                             |
| **Network inspector**      | View recent Supabase queries and R2 uploads with timing and response data.                                                         |
| **Log viewer**             | In-app log viewer showing all `logger.*` output with filtering by tag and level.                                                   |

**Implementation:** The dev menu component lives in `packages/shared/` and is conditionally rendered. It is tree-shaken from production builds via `__DEV__` checks.

### Logger Utility

```ts
// packages/shared/lib/logger.ts
const isDev = __DEV__ || process.env.NODE_ENV === 'development';

export const logger = {
  info: (tag: string, message: string, data?: unknown) => {
    if (isDev) console.log(`[${tag}]`, message, data ?? '');
  },
  warn: (tag: string, message: string, data?: unknown) => {
    if (isDev) console.warn(`[${tag}]`, message, data ?? '');
  },
  error: (tag: string, message: string, error?: unknown) => {
    if (isDev) console.error(`[${tag}]`, message, error ?? '');
    // Future: send to crash reporting service in production
  },
};
```

Usage: `logger.info('useEvents', 'Fetched events', { count: events.length })` — searchable by tag, filterable by level, zero production impact.

### Shared (Both Apps)

- **TypeScript** everywhere (strict mode)
- **Functional components** with hooks
- **i18n**: never hardcode user-facing strings — always use translation keys (5 languages)
- **Naming**: `camelCase` for variables/functions, `PascalCase` for components, `snake_case` for database columns
- **File naming**: `kebab-case.tsx` for component files in both apps
- **RTL-ready from day one**: use `start`/`end` instead of `left`/`right` in all styles

### Design Tokens (Shared Source of Truth)

Both apps consume the same token definitions. Tokens are defined in `packages/shared/lib/tokens.ts`:

```ts
// packages/shared/lib/tokens.ts
export const tokens = {
  colors: {
    primary: { DEFAULT: '#0077B6', light: '#4DA8DA', dark: '#005A8C' },
    secondary: { DEFAULT: '#FFD166', light: '#FFE08A', dark: '#E6B84D' },
    success: '#06D6A0',
    warning: '#FFD166',
    error: '#EF476F',
    neutral: { 50: '#F8FAFC', 100: '#F1F5F9', /* ... */ 900: '#0F172A' },
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, '2xl': 48 },
  radius: { sm: 8, md: 12, lg: 16, xl: 24, full: 9999 },
  fontSize: { xs: 12, sm: 14, md: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30 },
  tapTarget: { min: 48, recommended: 56 },
  upload: { maxImageBytes: 1_048_576, maxVideoBytes: 10_485_760 }, // 1MB, 10MB
  forum: { autoHideFlagThreshold: 3 },
} as const;
```

NativeWind (`tailwind.config.ts` in mobile) and Tailwind (`tailwind.config.ts` in admin) both extend from these tokens. White-label overrides (from `organizations` table) replace `primary`/`secondary` at runtime.

### Mobile App (Expo)

- **NativeWind** for styling (Tailwind classes sourced from shared tokens)
- **Images**: use `expo-image` (not `<Image>` from RN)
- **Lists**: use `FlashList` for long lists (not `FlatList`)
- **Pressable**: use `Pressable` (not `TouchableOpacity`)
- **Styles**: never inline style objects — use NativeWind classes or hoisted `StyleSheet.create`

### Admin App (Next.js)

- **shadcn/ui** components as the base design system
- **Tailwind CSS** for custom styling (sourced from shared tokens)
- **File naming**: Next.js App Router conventions (`page.tsx`, `layout.tsx`)
- **Server Components** where possible, Client Components only when needed

### Example — Mobile Component (Expo)

```tsx
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

export function EventCard({ event }: { event: Event }) {
  const { t, i18n } = useTranslation();
  const title = event.title[i18n.language] ?? event.title.ca;

  return (
    <Pressable
      className="bg-white rounded-2xl p-4 mb-3 shadow-sm"
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <Text className="text-lg font-bold text-start">{title}</Text>
      <Text className="text-sm text-gray-500 mt-1">
        {formatDate(event.starts_at, i18n.language)}
      </Text>
    </Pressable>
  );
}
```

### Example — Admin Component (Next.js + shadcn)

```tsx
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';

export function FlaggedPostCard({ flag }: { flag: ForumFlag }) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{flag.post.content.slice(0, 100)}</span>
          <Badge variant="destructive">{t(`flag.reason.${flag.reason}`)}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {t('flag.reported_by', { name: flag.flagged_by.first_name })}
        </p>
      </CardContent>
    </Card>
  );
}
```

---

## Testing Strategy

| App              | Framework                            | Focus                                  |
| ---------------- | ------------------------------------ | -------------------------------------- |
| **Mobile**       | Jest + React Native Testing Library  | Components, hooks, user flows          |
| **Admin**        | Jest + React Testing Library         | Data tables, forms, moderation flows   |
| **Shared**       | Jest                                 | Hooks, utilities, data transformations |
| **E2E (future)** | Maestro (mobile), Playwright (admin) | Critical user flows                    |

- **Coverage target**: 70% for MVP (focus on business logic, not UI layout)
- **Priority**: auth flows, attendance marking, forum moderation, data export, RLS policies

---

## Boundaries

### Always do:

- Use translation keys for all user-facing text (5 languages: CA, ES, EN, AR, FA)
- Use `start`/`end` instead of `left`/`right` in styles (RTL support for Arabic/Farsi)
- Apply RLS policies on every new table
- Encrypt sensitive fields at rest via pgcrypto: `document_number`, `phone`, `address`, `postal_code` (BYTEA columns with `pgp_sym_encrypt`/`pgp_sym_decrypt`)
- Validate all user input on both client and server
- Compress images client-side before uploading to R2
- Run `bunx tsc --noEmit` before committing
- Test with RTL layout enabled (Arabic/Farsi)
- Include accessibility attributes (roles, labels) on all interactive elements
- Follow decolonial design principles in imagery and visual language

### Ask first:

- Adding new dependencies to either app
- Changing database schema after initial migration
- Adding a new user role
- Integrating external services
- Changing the auth flow
- Adding new forum categories
- Changing upload size limits

### Never do:

- Store secrets in client code
- Commit `.env` files
- Make the app publicly available on app stores (closed-access distribution)
- Store unencrypted document numbers
- Skip RGPD terms acceptance during onboarding
- Hardcode strings in components (any language)
- Use `left`/`right` in styles (use `start`/`end`)
- Allow unmoderated user-generated content (forums must have flagging)
- Allow video uploads exceeding 10MB

---

## Implementation Plan

### Phase 1: Monorepo Scaffold, Auth & Infrastructure (Sprint 1)

1. Initialize monorepo structure (apps/mobile, apps/admin, packages/shared)
2. Set up Expo project with TypeScript, NativeWind, Expo Router
3. Set up Next.js project with TypeScript, Tailwind CSS, shadcn/ui
4. Set up shared package with Supabase client, types, i18n config
5. Set up Supabase project (EU — Frankfurt), initial migration (`organizations`, `profiles`)
6. Configure i18n with react-i18next (CA, ES, EN, AR, FA) with full RTL support
7. Set up Cloudflare R2 bucket + presigned URL upload flow
8. Set up Cloudflare deployment: Workers (via OpenNext) for admin, Pages for player web
9. Implement auth flow: magic link login (both apps) + admin-created account fallback
10. Create layout shells: tab navigation (mobile) + sidebar navigation (admin) + entity portal layout
11. Set up push notification token registration (mobile)
12. Set up pre-commit hooks (prettier, eslint, tsc) + CI/CD pipeline
13. Verify: mobile app + player web + admin web all running, auth works, RTL toggles correctly

### Phase 2: Onboarding & Profiles (Sprint 1-2)

1. Build multi-step onboarding wizard (personal data → documentation → logistics → terms acceptance)
2. Create profile view/edit screen for players (mobile)
3. Admin: participant data table with search/filter/sort (shadcn data table, PostgreSQL full-text search)
4. Admin: participant detail view (profile, notes, activity timeline)
5. Admin: create participant account directly (for no-email users)
6. Admin: invite participant flow (magic link, optional pre-filled entity)
7. Admin: deactivate / delete participant (RGPD)
8. Admin: equipment delivery tracking (record item, size, date, who delivered — per participant)

### Phase 3: CMS — Events, Announcements & Knowledge Base (Sprint 2)

1. Admin: announcements CRUD (category: info/training/social/urgent, multilingual editor + auto-translation, image upload to R2, pin/unpin)
2. Admin: events CRUD (categories, recurrence, location with map link, multilingual + auto-translate)
3. Admin: event categories management (CRUD, reorder, icon/color picker)
4. Admin: knowledge base CRUD (rights & asylum, digital literacy, gender training — multilingual + auto-translate)
5. Scheduled publishing: `published_at`/`expires_at` on announcements, events, knowledge articles
6. Player: home screen with announcements feed (pinned items, categories)
7. Player: events screen — calendar grid view + chronological list view, category filters
8. Player: event detail screen with signup ("I'm interested" / "I'll attend")
9. Player: knowledge base browsing (by category, article detail)
10. Player: submit participant story (text + images → staff reviews/translates → publishes to knowledge base)
11. Push notifications on new announcements/events
12. Auto-translation worker (Cloudflare Worker)

### Phase 4: Attendance Tracking (Sprint 2-3)

1. Admin: attendance overview (list of events with attendance status)
2. Coach: in-situ attendance screen (expected participants, tap to mark — works on mobile, offline-tolerant)
3. Real-time sync (Supabase Realtime) so multiple staff see updates
4. Player: attendance history visible on profile
5. Admin: attendance stats on dashboard

### Phase 5a: Services Directory & Entity Portal (Sprint 3-4)

1. Admin: service categories setup (8 default categories with metadata schemas)
2. Admin: services CRUD with hybrid schema (shared columns + category-specific JSONB metadata)
3. Admin: service category management (CRUD, reorder, metadata schema config)
4. Admin: entity submission review queue (approve/reject + comments + `is_internal` staff-only notes)
5. Entity portal: full CRUD submission dashboard (submit, edit, delete, resubmit structured services)
6. Entity portal: smart contact reuse with autocomplete from previous submissions
7. Entity portal: submission comments thread (entity ↔ staff)
8. Player: services tab with category browsing + category-specific filters (GIN-indexed JSONB)
9. Player: service detail screen (images with alt text, contact info, metadata, mark interest)
10. Service images: separate table with ordering + multilingual alt text (WCAG AA)

### Phase 5b: Messaging (Sprint 4)

1. Player/Entity ↔ Staff: direct messaging with Supabase Realtime
2. Admin: conversations management (view all, assign to staff, filter unread)
3. Player/Entity: unread message badge

### Phase 6: Community Forum & Media Sharing (Sprint 4-5)

1. Forum: category-based community board (housing, jobs, recommendations, general)
2. Player: create posts (text + optional photo), reply to posts
3. Player: flag posts/replies (one tap, select reason, optional comment)
4. Auto-hide: posts with 3+ flags from different users auto-hidden pending staff review
5. Admin: flagged content queue with moderation tools (dismiss, hide, delete, contact user, ban from forum)
6. Admin: pin/unpin posts, manage forum categories
7. Staff gets push notification when content is flagged
8. Media gallery: upload photos/videos (compressed, max 10MB video), privacy controls
9. Posts always show first name (not anonymous)

### Phase 7: Entity Portal — Referrals & Tracking (Sprint 5)

1. Entity: dashboard with overview of referred participants
2. Entity: submit new participant referral
3. Entity: track referred participant status
4. Entity: submit status updates on referred participants
5. Entity: view upcoming events (read-only)
6. Entity: impact stats for their referrals
7. Admin: manage entities (add/remove, generate access links)
   (Note: entity service submissions and messaging are already built in Phases 5a/5b)

### Phase 8: Mentoring, Feedback & Surveys (Sprint 5-6)

1. Player: request mentoring session (topic selection including gender-specific topics, preferred date/time)
2. Admin: mentoring requests dashboard (view, schedule, assign staff, mark completed)
3. Player: feedback drawer (propose activity, share idea, report problem, general feedback)
4. Admin: feedback inbox (filter by type, mark read/in-progress/resolved, respond via chat)
5. Admin: notification templates (reusable, multilingual + auto-translate)
6. Admin: targeted push notifications (filter by entity, event, interest, custom groups)
7. Surveys & polls: staff creates from dashboard (linked to event or standalone, with `published_at` scheduling), distributes via push notification or in-app prompt, players respond, staff sees aggregated results + individual answers, export as CSV
8. **Note:** Self-management groups may be added in a future phase. Currently, the feedback drawer serves as the channel for engaged players to propose activities, share ideas, and flag problems directly to staff. This may evolve into a full group feature based on client feedback.

### Phase 9: Analytics, Reporting, Internal Tools & Polish (Sprint 6)

1. Admin: impact dashboard (attendance rates, participation by category, demographics, trends, forum activity)
2. Admin: report generator (configurable date ranges, filters)
3. Admin: export data as CSV/Excel (participants, attendance, events, forum, surveys)
4. Admin: audit log (who changed what, when)
5. Admin: organization settings (branding, languages, contact info)
6. Admin: internal document management (insurance, inventory, forms)
7. Offline caching with React Query persistence + MMKV
8. Client-side image compression optimization
9. UI polish: loading states, empty states, error handling, responsive refinements
10. Accessibility audit (WCAG AA, screen reader testing, RTL testing with Arabic/Farsi)
11. Social media sharing (share activities/updates for visibility — lower priority)
12. Web deployment finalization (Cloudflare Workers via OpenNext + Pages, domain setup)

---

## Verification

To confirm the MVP is working end-to-end:

1. **Auth flow (magic link)**: Staff sends invite → player opens link → creates account → completes onboarding → lands on home screen
2. **Auth flow (admin-created)**: Admin creates account → gives credentials to player → player logs in → completes onboarding
3. **Info board**: Staff creates announcement in Catalan → auto-translation generates ES/EN/AR/FA → staff reviews → player sees it on home screen with push notification
4. **Events**: Staff creates training event → player sees it on calendar (grid) and list view → taps "interested" → staff sees signup
5. **Attendance**: Coach opens attendance on mobile → marks players present/absent → works offline → syncs when online → data appears in participant profile
6. **Knowledge base**: Staff publishes rights article → player browses by category → reads in their language
7. **Forum**: Player creates post → other player replies → third player flags reply → auto-hides after 3 flags → staff reviews in moderation queue
8. **Feedback**: Player submits activity proposal via feedback drawer → staff sees in inbox → marks as in-progress
9. **Entity referral**: Entity submits referral → admin completes onboarding → entity sees participant status
10. **Languages**: Switch app between CA/ES/EN/AR/FA — all UI text changes, layout flips for RTL, content shows in selected language
11. **Admin dashboard**: After a week of data, dashboard shows attendance rates, participation charts, forum activity
12. **RGPD**: Player can view all their stored data. Admin can fully delete a player's data on request.
13. **Media**: Player uploads photo (auto-compressed) → appears in gallery → stored on R2. Video upload respects 10MB limit.
14. **Export**: Staff exports participant data as CSV with date range filter.

**Build verification:**

```
bun run typecheck && bun run test && bun run build:admin && bunx eas build --platform android --profile preview
```
