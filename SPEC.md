# Spec & Plan: App Ramassa

> [!note] Amended 2026-07-17 (ADR-016 / RAPP-71): the admin + entity portal framework is **TanStack Start** (was Next.js + OpenNext). References below have been updated; the detailed admin route tree keeps its old naming and is mapped to TanStack Router conventions at scaffold (RAPP-8).

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

| App                       | Technology                 | Purpose                                          | Primary Users   |
| ------------------------- | -------------------------- | ------------------------------------------------ | --------------- |
| **Mobile + Player Web**   | Expo (React Native)        | Mobile app (Android/iOS) + player web experience | Players         |
| **Admin + Entity Portal** | TanStack Start + shadcn/ui | Staff CMS, entity portal, desktop-optimized      | Staff, Entities |
| **Shared Package**        | TypeScript                 | Supabase client, types, hooks, i18n, constants   | Both apps       |

**Why this split:**

- Expo excels at mobile + simple web screens (player-facing)
- TanStack Start + shadcn/ui excels at desktop admin interfaces (data tables, forms, dashboards, charts)
- Shared package prevents business logic duplication (Supabase queries, types, translations)
- Each tool is used for what it does best — no fighting the framework

### Infrastructure — Two Providers Only

| Service                                         | Provider                                | Purpose                             | Cost             |
| ----------------------------------------------- | --------------------------------------- | ----------------------------------- | ---------------- |
| **Database + Auth + Realtime + Edge Functions** | Supabase (EU — Frankfurt)               | Core backend                        | $25/month (Pro)  |
| **Media Storage**                               | Cloudflare R2                           | Photos, videos, documents           | Free tier (10GB) |
| **Web Hosting (Admin)**                         | Cloudflare Workers (native Vite plugin) | TanStack Start admin app            | Free             |
| **Web Hosting (Player)**                        | Cloudflare Pages                        | Expo web export                     | Free             |
| **Serverless Processing**                       | Cloudflare Workers                      | Image compression, auto-translation | Free tier        |
| **Mobile Builds**                               | EAS (Expo)                              | Android/iOS builds                  | Free tier        |

**Total infrastructure cost: ~$25/month** at current scale (50-200 users).

**Why Cloudflare R2 instead of Supabase Storage:**

- 10GB free (vs 1GB on Supabase)
- Zero egress fees — every image load in the forum/gallery is free bandwidth
- $0.015/GB/month beyond free tier (vs $0.021 on Supabase)
- Same Cloudflare network as Pages hosting = fast delivery

---

### Platform Strategy

| Platform          | Technology                 | Primary Users       | Purpose                                                                                      |
| ----------------- | -------------------------- | ------------------- | -------------------------------------------------------------------------------------------- |
| **Android app**   | Expo (React Native)        | Players (primary)   | Main interface for participants. Most users are on Android.                                  |
| **iOS app**       | Expo (React Native)        | Players (secondary) | Same features as Android. Secondary priority.                                                |
| **Player web**    | Expo Web (same codebase)   | Players             | Browser fallback for players who can't/won't install the app.                                |
| **Admin web**     | TanStack Start + shadcn/ui | Staff               | Full CMS: content management, participant management, analytics, reports. Desktop-optimized. |
| **Entity portal** | TanStack Start + shadcn/ui | Social entities     | Referrals, course submissions, impact tracking. Desktop-optimized.                           |

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

**Interface:** TanStack Start admin web app (desktop) + Expo mobile app for field work (attendance)
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

| Capability                      | Description                                                                                                                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **View all participants**       | Searchable, filterable table (shadcn data table) of all players in the org. Filter by entity, nationality, active/inactive, has dependents. Full-text search (PostgreSQL).               |
| **View participant detail**     | Full profile, attendance history, event signups, chat history, forum activity, feedback submissions, reference entity info.                                                              |
| **Edit participant profiles**   | Update any field. Add notes. Change status (active/inactive).                                                                                                                            |
| **Create participant accounts** | Create accounts directly (for users without email: generate an unroutable internal identifier + set a one-time password, shown once and stored nowhere readable). No SMS/messaging cost. |
| **Invite new participants**     | Generate invite link (magic link via email, with optional pre-filled reference entity). Share link directly or via entity.                                                               |
| **Deactivate participants**     | Soft-delete: mark inactive without destroying data (RGPD: keep for reporting, anonymize on request).                                                                                     |
| **Delete participants**         | Full RGPD deletion on request. Remove all personal data.                                                                                                                                 |
| **Reset passwords**             | Reset password for admin-created accounts (fallback auth).                                                                                                                               |
| **Assign equipment**            | Record clothing size, shoe size (on profile). Track deliveries: item, size, date, who delivered (via `equipment_deliveries` table). View delivery history per participant.               |

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

**Interface:** TanStack Start admin web app (entity portal section, desktop)
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

| User type                     | Auth method           | Details                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Players (with email)**      | Magic link            | Player enters email → receives link → taps → logged in. No password to remember. Free (Supabase email).                                                                                                                                                                                                                                                                     |
| **Players (no email — rare)** | Admin-created account | Staff creates account with an internal login identifier (`name.<id>@ramassa.invalid`, GENERATED server-side so staff never type it) + password. Gives credentials to player in person. Staff can reset the password. The domain is reserved by RFC 2606 and can never receive mail, because there is no inbox to receive it — see ADR-005 (amended 2026-08-01) and ADR-022. |
| **Staff / Admin**             | Magic link            | All staff have email. Magic link is simplest.                                                                                                                                                                                                                                                                                                                               |
| **Entity users**              | Magic link            | All entity contacts have email.                                                                                                                                                                                                                                                                                                                                             |

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
- [ ] Web admin is responsive and desktop-optimized (TanStack Start + shadcn/ui)
- [ ] Player web is responsive and mobile-friendly (Expo Web)
- [ ] RGPD-compliant: terms acceptance, data viewing, deletion request
- [ ] WCAG AA accessibility compliance on all player-facing screens
- [ ] Impact data exportable (attendance rates, participation by activity type, referral entity breakdown)
- [ ] All media stored on Cloudflare R2 with client-side compression before upload

---

## Tech Stack

| Layer                    | Technology                                     | Why                                                                        |
| ------------------------ | ---------------------------------------------- | -------------------------------------------------------------------------- |
| **Mobile App**           | Expo SDK 52+ / React Native                    | Cross-platform (Android + iOS). OTA updates via EAS.                       |
| **Player Web**           | Expo Web (same codebase)                       | Players access via browser. Simple screens that work well on RN Web.       |
| **Admin Web**            | TanStack Start (TanStack Router) + shadcn/ui   | Desktop-optimized CMS. Data tables, forms, dashboards, charts.             |
| **Admin Styling**        | Tailwind CSS + shadcn/ui                       | Polished, accessible component library.                                    |
| **Mobile Styling**       | NativeWind (Tailwind for RN)                   | Utility-first, RTL-ready (`start`/`end`). Fast iteration.                  |
| **Backend**              | Supabase (EU — Frankfurt)                      | Auth, PostgreSQL, Realtime, Edge Functions. EU-hosted. RGPD.               |
| **Database**             | PostgreSQL (via Supabase)                      | Relational model. SQL for reporting. Row-Level Security. Full-text search. |
| **Auth**                 | Supabase Auth                                  | Magic links (email) + password fallback. Free.                             |
| **Media Storage**        | Cloudflare R2                                  | Zero egress fees. 10GB free. Upload via presigned URLs.                    |
| **Web Hosting (Admin)**  | Cloudflare Workers (`@cloudflare/vite-plugin`) | Free. `nodejs_compat` runtime for TanStack Start.                          |
| **Web Hosting (Player)** | Cloudflare Pages                               | Free. Static Expo web export.                                              |
| **Serverless**           | Cloudflare Workers                             | Image compression, auto-translation. Free tier.                            |
| **Push Notifications**   | Expo Push API + Supabase Edge Functions        | Store push tokens. Trigger from Edge Functions.                            |
| **i18n**                 | react-i18next + expo-localization              | CA, ES, EN, AR, FA. Full RTL support. Shared translation files.            |
| **State/Cache**          | TanStack React Query + MMKV (mobile)           | Offline resilience. Optimistic updates. Persistent cache.                  |
| **Navigation (Mobile)**  | Expo Router (file-based)                       | Deep linking. Convention over configuration.                               |
| **Navigation (Admin)**   | TanStack Router (file routes)                  | File-based routing, fully typed. Server functions where beneficial.        |
| **Search**               | PostgreSQL full-text search                    | Built into Supabase. No external service needed at this scale.             |
| **Auto-Translation**     | Cloudflare Worker + translation API            | Staff writes once, system suggests 4 translations. Cents/month.            |

---

## Commands

```
# Monorepo root
bun install                                    # Install all dependencies

# Mobile app (Expo)
bun run dev:mobile                             # bunx expo start
bun run build:android                          # bunx eas build --platform android --profile preview
bun run test:mobile                            # bun test (mobile app tests)

# Admin app (TanStack Start)
bun run dev:admin                              # vite dev
bun run build:admin                            # vite build
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

    admin/                            # TanStack Start app (Staff CMS + Entity Portal; ADR-016)
      src/routes/                     # TanStack Router file routes. NOTE (2026-07-17): the tree below
                                      # is still written in the old Next.js App Router naming; map it to
                                      # TanStack Router file-route conventions at scaffold (RAPP-8) per
                                      # the official docs. Areas and screens are unchanged.
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
-- Append-only (no UPDATE/DELETE policies; INSERT pins actor_id to the caller).
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  actor_id UUID REFERENCES profiles(id) NOT NULL,
  action TEXT NOT NULL,                    -- 'profile.view_sensitive', 'profile.update', 'event.create', etc.
  target_type TEXT NOT NULL,               -- 'profile', 'event', 'forum_post', etc.
  target_id UUID NOT NULL,
  changes JSONB,                           -- ordinary field: {"field": {"old": "...", "new": "..."}}
                                           -- ENCRYPTED field (document_number, phone, address,
                                           -- postal_code): {"field": {"changed": true}} — values of
                                           -- encrypted columns NEVER enter this table, or it becomes
                                           -- a plaintext mirror of what pgcrypto protects. Decided by
                                           -- Fabián 2026-08-01; rationale + pgTAP pin in ADR-021.
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

### Admin App (TanStack Start)

- **shadcn/ui** components as the base design system
- **Tailwind CSS** for custom styling (sourced from shared tokens)
- **File naming**: TanStack Router file-route conventions (verify against https://tanstack.com/router/latest at scaffold; do not code from memory)
- **Server functions** for privileged operations (RGPD-sensitive reads/writes); regular client components everywhere else (no RSC model)

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

### Example — Admin Component (TanStack Start + shadcn)

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
3. Set up TanStack Start project with TypeScript, Tailwind CSS, shadcn/ui
4. Set up shared package with Supabase client, types, i18n config
5. Set up Supabase project (EU — Frankfurt), initial migration (`organizations`, `profiles`)
6. Configure i18n with react-i18next (CA, ES, EN, AR, FA) with full RTL support
7. Set up Cloudflare R2 bucket + presigned URL upload flow
8. Set up Cloudflare deployment: Workers (native via `@cloudflare/vite-plugin`) for admin, Pages for player web
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
12. Web deployment finalization (Cloudflare Workers + Pages, domain setup)

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

## Onboarding V2 update (2026-10-08)

Following the meeting decision, all players use email login. After language selection,
Continue opens the email form directly. Email submission sends a one-time verification
code; successful verification still passes through the existing profile and terms gate.
The first-use/account choice, registration-method choice, and team-issued access-code
login screens are retired. Back from email returns to language selection; Back from
email-code entry returns to the email form.

The intended download route is Google Play or the App Store, so the team expects most
users to already have an email address associated with their store account. For users
without one, the NGO or referring organization will help create one. This is an
operational assumption about likely email access, not a universal email requirement
for every store account.

The canvas preserves V1 as a historical snapshot and V2 as the agreed flow. Existing
dashboard account provisioning and database records are outside this mobile navigation
change (RAPP-140).

## Invitations create the account (2026-10-10, RAPP-224 and RAPP-227)

This supersedes the "Players (no email — rare)" admin-created row in the authentication table above.

- Every player joins by invitation with her own email. A player without an email gets help creating one first. The admin-created account with an access code is removed: the admin no longer creates code accounts or resets codes, and the `create_participant_account` and `reset_participant_password` functions are dropped.
- A player invitation now creates her empty auth account in Postgres at once (the pattern staff and entity invitations already use, ADR-022), because players request codes with `shouldCreateUser: false` and an invitation that only wrote a row left her refused ("Signups not allowed for otp"). Her profile is still written by the onboarding wizard, with her own consent.
- An invitation opened from a partner entity's referral carries the referral; it is linked to her profile when the wizard creates it.

## Staff and entity invitation email (2026-10-10, RAPP-225)

- A staff or entity invitation sends an invitation email: who invited the person, for which organization (and entity, for a collaborator), a button to the login, and the six-digit code. It is in the organization's language when the staff side offers it (CA, ES, EN), otherwise Catalan.
- It is the same auth template as the sign-in code email. The invitation writes `invitation` into the account's user metadata, the template and subject show the invitation wording while that key exists, and her first sign-in removes it. No service-role key and no second mail sender (ADR-022).
- The admin login has an "I already have a code" step (email and code together, no email sent). The invitation button opens it directly with `/login?code=1`, so the invitation's own code signs her in.
- Production: the template and subject live in `supabase/config.toml` and `supabase/templates/magic_link.html`, and the button uses the auth Site URL, which must be the admin address.

## Team permissions (2026-10-10, RAPP-229, part of RAPP-211)

- Team access is moving from the two fixed roles (`staff`, `admin`) to 42 explicit permissions, one toggle each, with presets. The catalog is `packages/shared/permissions/catalog.ts` and `public.permissions`, kept equal by a parity test.
- Every organization has three built-in presets (Coach, Staff, Admin), editable, with "Restore default", and can create its own. Toggles are per person; `team_member_access.preset_id` records the preset last applied.
- `has_permission(code)` is the one helper access rules will call. Safety rules: `team.manage` is required to change access, nobody changes a toggle they do not hold, the organization keeps at least one `team.manage` holder, built-in presets cannot be deleted, and every change is audited.
- This step changes nobody's access: no access rule reads permissions yet, and a person's toggles follow their role (staff get Staff, admins get Admin). RAPP-230 moves every rule to `has_permission`.

## Protected profile columns (2026-10-10, RAPP-239)

- A client cannot insert a profile directly, and cannot change `id`, `org_id`, `role`, `is_active`, `is_forum_banned`, `anonymized_at`, `terms_accepted_at`, `media_consent_at`, `collaborating_entity_id` or `created_at` with a direct write. Each changes only through its own database action (onboarding, the profile and participant edits, activation, the forum ban, role changes, erasure). Before this, a staff member could make herself admin with one API call.
- Enforced by the `profiles_guard_privileged_columns` trigger. The five actions that write profiles with the caller's rights mark their one write as trusted for that statement only.

## Team access rules read permissions (2026-10-10, RAPP-230, part of RAPP-211)

- Every row policy and function that checked `staff`/`admin` now checks the permission that names its job (`has_permission`, or `is_team_member()` for organization reference data every job needs). `is_staff_or_admin()` and `is_admin()` are dropped.
- Staff and admins keep their access, with the exceptions decided on 2026-10-10: today's staff keep the sensitive fields and RGPD erasure as an adjustment while new staff start without them; internal documents, the audit log and entity invitations are admin only, as the web admin always showed them; permanent deletion needs `rgpd.erase` and `team.manage`.
- New separations: publishing, scheduling and unpublishing need the "publish" permission of the content type; approving or rejecting an entity's service needs `services.review`; organization details need `settings.organization` and logo and colours `settings.branding`; exports need the dataset's own permission (a full participant export also needs `participants.view_sensitive`).
- `get_participant_profile` returns Personal fields only with `participants.view_personal` and decrypts Sensitive fields only with `participants.view_sensitive`; `update_participant_profile` keeps the stored Sensitive values for an editor without it. Direct reads of `profiles` columns are still row-level only (RAPP-240).
- Alerts and assignments go to the holders of the job's permission (forum flags, referral updates, conversations, mentoring).

## Participant field levels on every read (2026-10-10, RAPP-240, part of RAPP-211)

- Signed-in users select only the Basic and system columns of `profiles`. The Personal fields (date of birth, place of birth, nationality, city, document type, dependants, referring-entity contact), the four encrypted Sensitive fields and the search document are not readable directly by anyone, not even an admin.
- Those fields are read through functions that check the permission per caller and scope the organization themselves: `get_participant_profile`, `update_participant_profile`, `list_participants` (the roster), `get_conversation_peer` (the inbox header), `list_staff_conversations`, `participant_filter_options`, `create_data_export` and `get_impact_report` (aggregates only). A player's own onboarding, profile read and edit read only her own row.
- Without `participants.view_personal`, the roster leaves the Personal fields empty, ignores the nationality and dependants filters and the city and nationality sorts, and searches names and referring entity only, so a search cannot reveal a Personal field.

## Team screen and permission-based web admin (2026-10-10, RAPP-231, part of RAPP-211)

- Settings > Team replaces Settings > Staff. It lists each team member with her access ("Coach", "Coach, adjusted" when her toggles differ from the preset last applied, or "Custom"), invites with a preset, edits one person's toggles grouped by area (each area has a select-all), and manages presets: create, edit, rename, delete (organization presets) and "Restore default" (built-in). Saving a preset that people use asks "Apply the changes to the N people who use it?" with everyone, some or nobody; nobody's access changes without that choice.
- A toggle the reader does not hold is shown but locked, as the database requires. Errors from the safety rules are shown in plain words inside the open dialog.
- The web admin's menu, its Settings and Data guards, each Settings tab and the permanent erasure button follow the reader's permissions (`my_permissions`, loaded into the shared auth context) instead of the admin role. Organization details and branding are separate fields in the same form.
- Removing a team member keeps at least one active `team.manage` holder.

## App areas by account type (2026-10-11, RAPP-232, part of RAPP-211)

- The app routes by account type: a player gets the five tabs, a team member the team screens her permissions open (attendance with `attendance.mark` or `attendance.reports`, messages with `messages.inbox`, otherwise a notice pointing to the web dashboard), and an entity contact a notice that her partner portal is on the web. An entity contact or an unknown account never lands in the player tabs.
- Just after signing in, the screens wait for the account type before mounting. If the account cannot be checked and the device remembers nothing for it, a retry screen shows.
- The device remembers each user's area and permissions (a navigation hint only), so an offline cold start still opens attendance. It replaces the earlier attendance-coach cache.

## Second factor for team members and entity contacts (2026-10-11, RAPP-233, part of RAPP-211)

- Every team member and entity contact verifies her session with an authenticator app (TOTP) before her area opens, in the web admin and in the app. Without one, she sets one up on that screen (a QR code and the secret as text in the web admin; a link that opens the authenticator, and the secret, in the app). Players sign in with the email code alone.
- The database enforces it: `has_permission`, `my_permissions`, `is_team_member` and `current_collaborating_entity_id` hold only for an `aal2` session, and `current_app_role()` returns nothing for a staff, admin or entity session below `aal2`, so every role check fails closed. The media and translation Workers read permissions through `my_permissions()`, so the rule reaches them too.
- Recovery: a person with `team.manage` resets a team member's lost authenticator from the Team screen, and a person with `entities.manage` an entity collaborator's from the entity panel (`reset_second_factor`). It removes the factor and ends her sessions; nobody resets her own.
- The Workers now decide by permission instead of role (they were missed by RAPP-230): team upload folders need their content or settings permission, the participant media purge needs `rgpd.erase` and `team.manage`, and translation needs a content-editing permission.

## App lock (2026-10-11, RAPP-236, part of RAPP-211)

- Optional for every account and kept on the device, per person: a shared phone keeps each person's own choice. On by default for team members, after 1 minute in the background; off by default for players and entity contacts. Choices: immediately, 1, 5 or 15 minutes.
- When it is on, the app locks at every cold start and after the chosen time in the background, and opens with Face ID, a fingerprint or the device passcode (`expo-local-authentication`). It asks at once when the lock screen appears; after a cancel, an Unlock button asks again. Sign-out is always on the lock screen.
- While the app is not in the front, the same cover hides the screens, so the app switcher's snapshot shows no data. Signing in just now does not lock.
- A native `Modal` is drawn above every view, the cover included, so every Modal in the app hides while the lock covers the app and comes back after unlock. A contract test (`app-lock-modal-contract.test.ts`) fails on a Modal that does not.
- Turning the lock on or off asks for Face ID, a fingerprint or the passcode first. A phone with no passcode, and the web, have no lock; the settings screen says why.
- Settings: the App lock screen, from the player profile, the team attendance and messages headers, and the team and entity notice screens.

## Cache rules, offline outbox and live permissions (2026-10-11, RAPP-237, part of RAPP-211)

- **Disk cache:** the app saves to disk only organization content shown to players (an allow-list, `PERSISTED_QUERY_ROOTS`, held by a contract test). Queries with decrypted personal fields stay in memory. The whole cache, and its copy on disk, is emptied on sign-out, on a remote sign-out, when another person signs in, and when the person's permissions change.
- **Live permissions:** every permission write moves the person's `team_member_access` row, and that table is in the Realtime publication. The shared auth context listens to the person's own row and reloads her permissions, so menus and screens follow at once, on the web and in the app. The permission rows are not published: a removal is a DELETE, which Realtime cannot filter.
- **Offline outbox:** one shared core (`@ramassa/shared/offline`) for attendance and messages. Every change has an idempotency key (attendance: one per person per session, latest `marked_at` wins; messages: the id the phone makes). A failure that may pass is retried with a growing delay up to 30 seconds. A refusal (no permission, a broken rule, a missing record: AUTH-3, AUTH-9, DB-2, EVENTS-1, VALIDATION-1, mapped from the PostgreSQL code) stays on screen with a plain reason, Try again and Remove. It is never dropped silently.

## Team shell (2026-10-12, RAPP-245, part of RAPP-212)

- The team area has its own shell in the app (`(app)/(team)`), laid out by `teamLayout` from the person's areas and the screen width:
  - **tablet** (768 points and wider): a sidebar with every area she may open, beside the open screen. Today and Messages show their list and the open item side by side.
  - **phone with one or two areas:** a start screen with one large button per area, then Settings and sign-out. Each area screen has a "Back to the start" link.
  - **phone with three or more areas:** native bottom tabs (Today, Participants, Content, Messages, More), each only when her permissions open it.
- Areas join as their screens arrive: attendance (Today) and messages now, participants in RAPP-247, material from RAPP-248. More holds Settings and sign-out, and later the rest.
- A session sheet or a conversation opens over the shell on a phone. The iOS app supports iPad (`supportsTablet`).
- Every Realtime subscription has its own channel name (`realtimeTopic`): supabase-js reuses a channel of the same name, and a second listener on it threw, which crashed a screen where two parts both wanted the unread count.

## Today (2026-10-12, RAPP-246, part of RAPP-212)

- In the tab and sidebar layouts, the team's first screen is Today: what needs doing now, one section per area the person may use (`todaySections`), field work first. Now: the unread conversations (one tap to Messages) and today's sessions (one tap to take attendance; on a tablet the sheet opens beside the list).
- In the large-button layout the Attendance button opens the same screen as plain Attendance.
- Each later phase adds its own section (participants and material in phase 2, the review queue, forum reports, mentoring and deletion requests in phases 3 to 5). No section points to the web admin, because the app ships only when every phase is done.

## Quick participant lookup (2026-10-12, RAPP-247, part of RAPP-212)

- A Participants area in the team shell for `participants.view`: type at least two letters of a name, town or entity (`list_participants`), and open her card (`get_participant_profile`). On a phone the card is its own screen; on a tablet it opens beside the results.
- The card shows a row only when the database returned a value: language, phone, town, entity, clothing and shoe size, and whether she is active. So it shows exactly what the person's field levels allow (RAPP-240). Opening a card writes an audit row, so it is not fetched again for five minutes.
- Both reads stay in memory: `participants` is not on the disk allow-list.
- With attendance, participants and messages, a staff member has three areas, so a phone now shows the tabs.
- 2026-10-13: the two-letter lookup gave way to the full list, see "Participant list" (RAPP-280).

## Material stock ledger (2026-10-12, RAPP-248, part of RAPP-212)

- Stock is never a typed count. Every change is a movement in `stock_movements` (arrival, handover, return, checkout, check-in, write-off, correction), signed: what comes in is positive, what goes out negative, a correction either way. The stock of an item in a size is the sum of its movements (`stock_levels()`).
- `equipment_item_types` is the material catalog per organization: a key, a kind (player kit, which gets a unit code at handover, or counted team equipment), its sizes, a default value for donated arrivals, and later names for types staff add. Every organization starts with the twelve built-in items, by trigger when it is created.
- Every handover recorded in `equipment_deliveries` becomes a -1 movement through a trigger, and the earlier ones were backfilled, so stock starts true. Movements are append-only: no client inserts, changes or deletes one.
- Holders of any `equipment.*` permission read the ledger and the stock; `participants.view` also reads the catalog. Erasing a woman clears her link on the movement and keeps its quantity, so stock stays right.
- Arrivals, the phone handover with signature, counts, checkouts and the item editor are RAPP-249 to RAPP-253.

## Handover with signature and returns: database (2026-10-12, RAPP-249, part of RAPP-212)

- `record_equipment_handover()` is the one way the phone records a handover, for `equipment.handover`: her, the item type, a size from the type's sizes, given or lent, and her signature. The record is final once saved.
- Handovers save offline and go out later, so the phone makes the record's id and sends the time of the handover at the pitch. Sending the same id again returns the saved record and saves nothing twice. A time in the future, or more than 60 days back, is refused.
- The signature is the stroke data of her finger on the staff device, stored on the handover record (`signature`), with the language of the statement she signed under. When she refuses or cannot sign, the record says so with a reason. The database refuses a record that is signed without strokes, or refused without a reason. Handovers recorded before this, or on the web admin, read "not collected".
- Player kit gets the next unit code of its type at handover (boots B-0001, shin pads SP, socks SO, shorts SH, jersey J, tracksuit T, coat C, gloves G, water bottle WB, rucksack R, other O). Balls get none.
- Stock never blocks a handover. When one takes an item below zero, it is saved and one open alert (`stock_alerts`, one per item and size) asks for a count. `equipment.count` and `equipment.handover` holders read the alerts.
- `record_equipment_return()` takes a lent item back once, graded new, good, worn or unusable. An unusable item comes back and is written off in the same step, so stock does not count it.
- `participant_material()` lists what she received, with the return and its grade.
- Erasing her deletes her handover records and their signatures. The movements stay without her name, so stock stays right.

## Handover with signature and returns: phone (2026-10-12, RAPP-249, part of RAPP-212)

- Her card has a "Hand over material" button for `equipment.handover` and a Material section for everyone who opens the card: what she received, given or lent, the date, the unit code, a signature that is missing, and the return with its grade.
- The handover screen has two steps. First the item, the size and given or lent; her size from her profile is chosen for her when the item comes in it (shoe size for boots, clothing size for the rest). Then the statement in her language, which staff can switch to another of the five, and the signature pad for her finger. When she does not sign, staff choose "refuses" or "cannot" and write the reason. Save stays off until there is a signature or a reason.
- Saving puts the handover in the encrypted offline outbox (`ramassa.handover-outbox.v1`) and sends it at once when there is signal. Without signal the screen says it is saved on the phone, her card shows it as waiting, and a worker sends it on reconnect. A refused handover stays on her card with Try again and Remove.
- After saving, the screen shows the unit code to write on the item, and says when stock went below zero.
- A lent item gets "Record the return" on her card: New, Good, Worn or Unusable. Returns need a connection.
- Today has a Material section for `equipment.count` and `equipment.handover`: one line per item and size below zero. The count screen follows in the stock count work.
- The signature pad draws with `react-native-svg`, so the native app needs a rebuild.

## Goods received: arrivals, database (2026-10-12, RAPP-250, part of RAPP-212)

- An arrival is a goods received note (`equipment_arrivals`): when it came, who received it, the source (donation, purchase or sponsor) with an optional name, problems noted, and for a purchase the total cost from the receipt. `record_equipment_arrival()` saves it for `equipment.receive`.
- Each line (item type, a size from its sizes, a quantity from 1 to 10,000) becomes a +quantity arrival movement linked to the arrival, so stock stays the sum of the ledger. A donated line takes the item type's default value unless staff type one; a purchased line records the price typed.
- The phone makes the arrival's id, so a save sent again after a lost answer saves nothing twice. Arrivals need a connection.
- Photos of the goods and of the delivery note or receipt (`equipment_arrival_photos`, up to ten) go to a staff-only `stock` upload folder that only `equipment.receive` can write. The arrival accepts only keys this person uploaded to this organization's stock folder. The media worker serves a stock photo only after `can_read_stock_object()` ties it to an arrival the caller may read.
- Holders of `equipment.receive`, `equipment.count` or `equipment.items` read arrivals and their photos. Arrivals hold no participant data.

## Stock and goods received: phone (2026-10-12, RAPP-250, part of RAPP-212)

- A Stock area opens for `equipment.receive`, `equipment.count` or `equipment.items`. As in the design ("More: ... stock"), it has no tab or sidebar entry of its own: it opens from More, from a large button on the simple home, and from Today's Material section. It counts as an area, so a person whose only job is stock gets the simple home. A handover alone does not open it: coaches hand material out from the participant card.
- Stock lists each item, in the reader's alphabetical order, with each size and its quantity. A quantity below zero shows in red with "Below zero. Count it." The goods received lately follow, with source, date, lines, total paid, problems and photos.
- "Record goods received" (for `equipment.receive`) opens the form: donation, purchase or sponsor, and who gave it, the shop or the sponsor. Each item line has an item, a size, a quantity with minus and plus, and a value. A donation or sponsorship pre-fills the item's usual value; a purchase starts empty for the price. Two lines with the same item, size and value join into one. A purchase also records the total paid. Problems noted are free text.
- Photos: "Photograph the goods", "Photograph the receipt" (camera) or "Choose from photos". Each uploads as it is added, to the staff-only stock folder. Save waits until the uploads finish.
- Save needs a connection, and the screen says so when there is none. The form makes the arrival's id once, so a second press after a lost answer saves nothing twice.
- The app asks for the camera only when someone takes a photo; Android drops the microphone permission that the picker would add.

## Stock counts and corrections (2026-10-12, RAPP-251, part of RAPP-212)

- A count records what is on the shelf for one item type, every size once (`stock_counts`, with what the ledger expected and what was counted per size). `record_stock_count()` saves it for `equipment.count`; the phone makes its id, so a resend saves nothing twice.
- Where the shelf and the ledger differ, the difference becomes a `correction` movement with a reason from a fixed list: lost, damaged and thrown away, found, counted wrong before, handed over without a record, or other, plus an optional note. A difference without a reason is refused. Every count writes a `stock.count` audit entry with the lines, the reason and the number of corrections.
- A count answers the item's open stock alerts.
- Today asks whoever holds `equipment.count` for one small count a month (a cycle count): until an item has been counted this month (Madrid time), it shows the item with stock that was counted longest ago, never-counted first. One tap opens its count.
- The count screen is blind: staff type what is on the shelf, size by size, before the app shows its own numbers. Then it lists the differences and asks for the reason. Stock shows a Count button on each item for `equipment.count`.

## Staff checkout and check-in (2026-10-12, RAPP-252, part of RAPP-212)

- Material for a normal session is never recorded. A longer loan to a staff member is (a trip, a tournament): `staff_checkouts` holds the item, size, quantity, who has it, who handed it out, the return date and a note. `record_staff_checkout()` takes the pieces out of stock with a `checkout` movement; the phone makes the id, so a resend saves nothing twice. Material goes to active staff and admins only (`checkout_recipients()`).
- `record_staff_checkin()` records how many came back and their condition (new, good, worn, unusable). Returned pieces come back with a `checkin` movement; unusable ones are written off at once; pieces that did not come back stay out of stock as lost, and the checkout keeps how many returned. A checkout is checked in once.
- The storeroom runs checkouts: `equipment.receive` or `equipment.count`. It reads every open checkout; a staff member reads the ones she has (`open_staff_checkouts()`, with the name and whether it is late).
- Stock has "Check out to a staff member" (item, size, quantity, person, back by tomorrow, in 3 days, in a week or in two weeks, note) and a Checked out list: late ones in red, each with Check in (how many came back, the condition, and how many are missing).
- Today shows a late-checkout card: every late one for the storeroom, which opens Stock, and her own for the staff member who has the material.

## Item types management (2026-10-13, RAPP-253, part of RAPP-212)

- Holders of `equipment.items` keep the material catalog from Stock, Items: the twelve built-in items and any the team adds. `save_item_type()` creates or updates one and writes a `stock.item_save` audit entry.
- A custom item has a name in Catalan (required) and, when given, Spanish, English, Arabic and Farsi; the app falls back to Catalan. Its key is generated (`custom_…`). Built-in items keep the app's translated name, their kind and their code letters; their sizes, usual value and whether they are in use can change.
- Each item has its sizes (none for a sizeless item), player kit or team equipment, the usual value of one donated piece (pre-filled on donations), and, for player kit, one to three code letters for unit codes. Two items cannot share code letters.
- A size that still has stock cannot be removed; the editor names the size. An item that is no longer used is switched off: it leaves the pickers (handover, goods received, checkout) and keeps its history.
- Handovers may be of any item in the organization's catalog; the delivery item check gave way to the ledger trigger, which refuses an item the organization does not have. Every screen shows a custom item by its own name (`useItemLabel`), and the handover statement uses the name in her language.
- The web admin's equipment log still labels items through the built-in translations only.

## Desktop to phone photo handoff (2026-10-13, RAPP-254, part of RAPP-212)

- On the web admin's internal documents tab, "Take photo with phone" asks for the document's name and shows a QR code. Behind it is a `photo_handoffs` row: single use, bound to the person who asked (only she reads it), valid ten minutes. `create_photo_handoff()` requires the target's own permission (`settings.documents` for internal documents).
- The QR code opens `/photo-handoff/<id>` on the web admin, in the phone's browser. Signed in as the same person, the page offers "Open in the Ramassà app" (`ramassa://photo-handoff/<id>`) or "Take the photo here" with the phone's camera. The app screen takes or chooses the photo the same way.
- The photo goes to the documents folder through the media worker, and `complete_photo_handoff()` registers it with `register_internal_document()`: the same checks as an upload at the desk. Photos only (JPEG, PNG, WebP). Someone else's code reads as no code; an expired or used code is refused.
- The desk hears of the completion through Realtime (with a slow poll as a fallback), says the photo arrived and refreshes the list. The document is registered even if the desk closed the dialog.
- Internal documents are the first target; receipts and the gallery can reuse the same handoff. Never photos of players.

## Participant list (2026-10-13, RAPP-280, part of RAPP-213)

- The Participants area lists every participant the person may see, with no search needed (`list_participants`, 25 a page, more pages load on scroll). The total shows above the list.
- The search field finds a name, town or entity. Chips filter by status (all, active, inactive). A filter sheet holds entity, nationality and dependants (each only when `participant_filter_options()` returns values) and the sort: name, town, nationality, entity or date joined, up or down. The Filters button shows how many sheet filters are on, and one action clears them all.
- A phone shows cards (name, town, entity, an inactive badge) and opens the card screen. A tablet shows a table: name, town and entity, plus status and date joined when the list pane is wide enough. Each column header sorts, and a second tap turns the order. The card opens beside the table.
- A new search, filter or sort starts the list at the top. The list stays in memory: `participants` is not on the disk allow-list.

## Participant record on the phone (2026-10-13, RAPP-281, part of RAPP-213)

- The participant card shows her whole record, as the web admin does, within the reader's field levels: Basic fields for everyone with `participants.view`, Personal fields with `participants.view_personal`, and document number, phone, address and postal code with `participants.view_sensitive`. A field above the reader's level does not show. A field she may see that is empty says "Not filled in". The card also shows the date she joined, whether she has forum access, and that each look is logged.
- "Edit the record" (for `participants.view_personal`, the level `update_participant_profile` requires) opens a form with the same fields, pickers and rules as her own edit screen, plus date of birth, app language, referring entity and its contact. Without `participants.view_sensitive` the form leaves out the four encrypted fields and does not ask for the document number (`profileEditWithoutSensitiveSchema`); the database keeps the stored values. The screen closes only when the save succeeds.
- "Deactivate" and "Reactivate" need `participants.deactivate`; the phone asks before it deactivates. "Disable forum posting" and "Enable forum posting" need `forum.moderate`. Each write reloads the card and the list.

## Participant notes on the phone (2026-10-13, RAPP-282, part of RAPP-213)

- The participant card shows the team's notes about her (`participant_notes`), newest first, each with its author and the date and time in Madrid. They are the same notes as in the web admin, and they need `participants.notes` to read and to add. Without it the card has no notes section.
- "Add a note" opens a sheet with the text field above the keyboard, the reminder that notes cannot be edited or deleted, and Add and Cancel. An empty note or one over 4,000 characters is refused with a message (`participantNoteSchema`). After a save the sheet closes and the note is first in the list.
- Like every native sheet, it hides while the app lock covers the app.

## Participant activity and material history (2026-10-13, RAPP-283, part of RAPP-213)

- `participant_activity()` now also returns her attendance marks (at the session's start, with the event title) and her event sign-ups (with the event title). Their detail is the stored status code (present, absent, excused; interested, confirmed, cancelled), which the screens show in words (`activityDetailKey`). The function still runs with the caller's rights, so each table's policies decide what a reader sees. The web admin timeline shows the same words.
- The participant card has an Activity section: everything or one source at a time (the web admin's filters), newest first, the first 10 at once and the rest on request.
- Each item in her material opens its details (`participant_material_detail()`, same reach as `participant_material()`): who handed it over, the note, her signature drawn from the stored strokes or the reason she did not sign, the statement language, and who recorded the return.

## Participant invites on the phone (2026-10-13, RAPP-284, part of RAPP-213)

- Holders of `participants.invite` open Invitations from the Participants screen: every invite of the organization, newest first, with its address, referring entity, who sent it and when, and whether it is pending (open until a date), accepted or expired.
- "Invite a participant" opens a sheet with her email (the login schema) and an optional referring entity. The entity is chosen from the entities the organization already uses, or "Other" with a name, so one entity is not typed in several spellings. The sheet then says what she does next and until when the invite is open. An address that already has an account is refused with its own message.
- An invite sends no email: it records her address and the empty account that lets her first code request succeed. So "resend" is `renew_participant_invite()`: an open invite, even an expired one, gets 30 more days. `revoke_participant_invite()` cancels an open invite and removes the empty account when nothing else needs it (no profile, no other open participant, staff or entity invitation for the address), so the address can no longer sign in. Both need `participants.invite` in the invite's organization, refuse a used invite, are rate-limited, and are audited without the address. Cancelling asks first.

## Deletion requests and GDPR actions on the phone (2026-10-13, RAPP-286, part of RAPP-213)

- Holders of `rgpd.erase` open "Deletion requests" from the Participants screen: each open request with her name, her reason in her words, and the date, and a link to her record. An anonymized participant shows as "Anonymized participant". The web admin queue now shows the name too, where it showed the profile id.
- Her card ends with the GDPR section (for `rgpd.erase`): her open request when she has one, Anonymize, and Erase everything for holders of `team.manage` as well (the database requires both). Each opens a sheet that lists what the action does, says it cannot be undone, and asks for its word to be typed. Erasing follows ADR-023: the media worker purges her files and writes the receipt, then `delete_participant_permanently()` removes the record. After an erasure the card closes.
- The phone's step-up check (`StepUpProvider`): first the device (biometrics or passcode, when the phone has one), then an authenticator code when the session has none from the last 10 minutes. When the database still refuses with AUTH-9, the code is asked once more and the action runs again. The web build asks only for the code. A cancelled step-up changes nothing.

## Content area and announcements list on the phone (2026-10-13, RAPP-340, part of RAPP-214)

- A Content area joins the team shell (a tab between Participants and Messages, a sidebar entry on a tablet, a button on the large-button home). It opens with `announcements.edit` or `announcements.publish`; the other content types widen it as phase 4 adds them, so nobody gets an empty screen.
- Announcements list: status chips (all, draft, published, scheduled, expired, the web admin's filter), the total, pages that load on scroll, and each row's title, category, date, status and whether it is pinned. On a phone a row opens its own screen; on a tablet it opens beside the list.
- One announcement shows its status, category, publication and expiry, and the Catalan text. Pin and unpin are there for anyone who reads it; Delete is for `announcements.publish` holders, as the database requires, and asks first. The editor comes in RAPP-341.

## Service categories on the phone (2026-10-14, RAPP-347, part of RAPP-214)

- "Manage categories" in the services list opens the categories for `services.edit` holders: in the order players see them, with how many own fields each has, Move up and Move down, and New, Edit and Delete. A category that still has services cannot be deleted; the database refuses it.
- The category editor has the Catalan name with its translations (all five approved), the slug (made from a new category's name until she edits it), an icon and a colour as choices (a stored value outside them stays selectable), and the category's own fields.
- The fields replace the web admin's schema JSON with controls. Each field is a card (name, key, type, required) with Move up, Move down, Edit and Remove; Edit opens it in a sheet: the Catalan name with its translations, the key (made from a new field's name; a stored field keeps its key, because services store their answers under it), the type (one option, several options, yes or no, number, text, date), required, filterable, a select's options and a number's minimum. A card says when a field still lacks data or translations.
- A stored field whose Catalan name is unchanged keeps its five stored names, so editing a category does not ask for every name to be approved again. A changed or new name needs its translations.
- Saving an edit first asks the database how many stored services the new fields would make invalid (`count_services_incompatible_with_category_schema`), and stops with that count, as the web admin does. Both apps store the same shape (`serviceMetadataSchemaDefinitionSchema`).
- Option labels: an option is a short key, and the text players see comes from the app's translations (`services:option.<key>`), on the web admin too. A new key shows as typed until its translation is added; the editor says so.

## Services directory on the phone (2026-10-14, RAPP-344, part of RAPP-214)

- The Content area shows services for `services.edit` or `services.publish` holders. The list has the web admin's status and category filters. Each row shows category, availability and how many players are interested. On a tablet a service opens beside the list.
- One service shows its status, category, description, provider, place, cost, contact, schedule, link, availability, the category's extra fields (option labels and yes or no in the screen language), its photos, and the publication. Delete is for `services.publish` holders and asks first.
- The editor has the web admin's fields: category, the Catalan title and description with their translation review, provider, place, cost (an amount for paid and subsidized services), contact, schedule, link, availability, the category's extra fields as touch controls (chips for a select, toggling chips for a list, a switch for yes or no, the native date picker for a date, number and text fields), and up to twelve photos, each with a description and its translations, Move up, Move down and Remove. Photos are compressed and uploaded to `services` at save. Changing the category starts its extra fields again.
- Publishing needs the title, the description and every photo description approved. The form is kept on the device from the first change (`service-draft.ts`); a chosen photo is not kept. Without `services.publish` the publication is read-only and kept as stored, as the permission screen describes.
- The extra-field helpers (`serviceMetadataDefaults`, `normalizedServiceMetadata`) moved from the web admin into `@ramassa/shared/services`.
- The app's web build compresses photos with `fetch` in place of expo-file-system, which has no web support. Before, every photo upload in the web build failed, so the browser specs could not cover one.
- Service categories, with a native editor for their extra-field schema, follow in their own slice.

## Knowledge base on the phone (2026-10-14, RAPP-343, part of RAPP-214)

- The Content area shows the knowledge base for `knowledge.edit` or `knowledge.publish` holders. The list has the web admin's filters (all content, staff resources, participant stories, and a story's review state). Each row shows category, type, status and, for a story, the author's first name. On a tablet a resource opens beside the list.
- One resource shows its status, the blocks as a player reads them, a story's photos and recorded publication consent, and the reviewer's note. A story sent for review gets Start review. Delete is for `knowledge.publish` holders and asks first.
- The block editor works on the shared block schema. The source blocks (Catalan, or a story's own language) show as cards with Move up, Move down, Edit and Remove; Edit opens one block at a time in a sheet (a paragraph, or a step with title, instructions, an optional photo and its description). Up and Down replace dragging, so reordering works with one tap and with VoiceOver and TalkBack. A step photo is compressed and uploaded to `knowledge-base` at save.
- "Generate translations" drafts the title and every block in the four other languages. One tab per language shows whether its body is approved; the open tab holds that language's blocks to correct (right to left for Arabic and Farsi) and Approve. A change to the source blocks drops the translations, which must be generated again, as on the web admin. Publishing needs the title drafts and every body approved. Only approved translations are stored.
- A story in review can be published, returned for changes or declined, with a message to the participant. The form is kept on the device from the first change (`knowledge-draft.ts`); a chosen step photo is not kept. Without `knowledge.publish` the publication is read-only.
- Shared changes: the body translation, step-image and story-state helpers moved to `@ramassa/shared/knowledge` for both apps. A published story now stays published when its text is corrected and saved again (before, that save failed the story-state check). The knowledge strings gain the Scheduled and Expired states, which the web admin's status badge also uses.

## Events on the phone (2026-10-14, RAPP-342, part of RAPP-214)

- The Content area holds the content types a person manages (`contentKinds`): announcements with `announcements.edit` or `announcements.publish`, events with `events.edit` or `events.publish`. With more than one, chips at the top switch between their lists. The Content area opens for either type.
- The events list has the web admin's status and category filters. Each row shows the category, the start in Madrid time, the repetition ("Every week, 6 sessions") and the places taken. On a tablet an event opens beside the list.
- One event shows its schedule, the place with its map link, places and sign-up mode, the publication, the description, and the sessions the database made from the schedule. Delete is for `events.publish` holders and asks first.
- The editor has the web admin's fields: category, the Catalan title and an optional description with their translation review, place and map link, the schedule (once, or weekly every 1 to 4 weeks with up to 52 sessions), places, sign-up mode, and the publication. Times are Madrid times: the date and time pickers show and set the Madrid wall clock, whatever time zone the phone is set to. Publishing needs every translation approved. The form is kept on the device from her first change (`event-draft.ts`), as the announcement editor does. Without `events.publish` the publication is read-only.
- Event categories (for `events.edit`): the list in the order players see it, Up and Down to reorder, and New, Edit and Delete. A category is saved only with all five names approved. A category that still has events cannot be deleted.
- The shared content schemas (announcements, events, knowledge, services, surveys) accept times with an offset (`+00:00`), as the database returns them, so an edit that keeps a stored time saves. Before, the phone could not save an edited event (the check refused its stored start). The web admin sends the stored publication time of a live item in the same form.

## Announcement editor on the phone (2026-10-13, RAPP-341, part of RAPP-214)

- "New announcement" (in the list) and "Edit" (on one announcement) open the editor with the web admin's fields and rules: category, the Catalan title and text, an optional photo with its description, pinning, and the publication (draft, now, or scheduled, with an optional expiry). The photo is compressed and uploaded to the `announcements` folder when she saves.
- Translations: "Generate translations" asks the translation Worker for machine drafts of each text. Under each text a row of language tabs (ES, EN, AR, FA) shows the state of each draft (needs review, approved, rejected); the open tab holds the draft to correct, right to left for Arabic and Farsi, with Approve, Reject and Approve all. Publishing needs every draft approved, as on the web admin.
- The Worker call is shared by the web admin and the phone (`@ramassa/shared/translation/client`); the phone has the Worker address (`EXPO_PUBLIC_TRANSLATION_WORKER_URL`).
- The text is kept on the device, encrypted, from her first change (`announcement-draft.ts`), and offered again when she comes back ("Your unsaved text was kept on this phone"). It is removed once the save succeeds. A chosen photo that is not uploaded yet is not kept, and kept translations need approving again. Because nothing is lost, the editor asks no question when she leaves.
- Without `announcements.publish` the editor shows the publication read-only and keeps it as stored, because the database refuses any change to it.

## Staff-side languages (2026-10-11, RAPP-238, part of RAPP-211)

- The staff side (the web admin, the team screens and the entity screens) is in Catalan, Spanish or English (`STAFF_LANGUAGES`). Player screens keep all five languages and right-to-left. Content stays five-language everywhere: this is the language of the screens themselves.
- A saved or browser language outside the three opens the staff side in Catalan (`staffLanguageFor`), on the admin's server render and in the browser alike.
- The admin has a language picker (Català, Español, English) in the staff sidebar, in the entity header and on the login page. The choice is saved in the `ramassa.language` cookie and applies at once.
- In the app, a team member or entity contact with Arabic or Farsi saved gets Catalan. Because the layout direction flips, that one switch restarts the app. Their Settings screen (with the app lock) offers the three languages.

## Remote sign-out (2026-10-11, RAPP-234, part of RAPP-211)

- "Sign out everywhere" ends every session of a person at once, on every device: anyone for herself, a `team.manage` holder for a team member (Team screen), an `entities.manage` holder for an entity contact. Audited as `sessions.sign_out_everywhere`.
- It sets `profiles.sessions_valid_after` and deletes the refreshable sessions. The access helpers (`has_permission`, `my_permissions`, `is_team_member`, `current_app_role`, `current_collaborating_entity_id`) deny a token issued before that time at once, the immediate-deny pattern of ADR-025. The column is protected from direct writes (RAPP-239).
- Both apps ask `my_session_is_current()` on sign-in and when they come back to the front (at most every 30 seconds), and sign out on that device when it answers no.

## Step-up checks (2026-10-11, RAPP-235, part of RAPP-211)

- The risky actions need an authenticator code from the last 10 minutes, even in a verified session: RGPD deletion requests, anonymization and permanent erasure (including the media sweep), permission, preset and role changes, removing a team member, new team and entity accounts, activating or deactivating an entity contact, second-factor resets, and every data export.
- The database enforces it: each of these functions calls `private.require_recent_second_factor()` first, which reads the most recent `totp` time from the token's `amr` claim and raises `step_up_required` (42501) when it is older. The service role and contexts with no signed-in user are not asked. The media Worker checks the same time before an erasure sweep.
- The web admin reads the same time from its token before the action and opens a code prompt when it is older than 9 minutes, so the person is asked first. A refusal from the database (AUTH-9) opens the prompt once more and repeats the action. Cancelling shows AUTH-9.
- The app's device check (biometrics or passcode) comes with its first risky screen; the app has none in phase 1.
