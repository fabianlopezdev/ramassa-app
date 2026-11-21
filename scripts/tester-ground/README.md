# Tester ground (RAPP-885)

Four people at AE Ramassà try the player side of the app on staging, and the app team has a fifth
account to try it first. Each signs in with her own test
account and starts from Onboarding, as a new player does. When she finishes it she lands on Inici, and
every tab is full of dummy data, with numbers on the tabs and "Nou" on new cards. This tool creates the
accounts, publishes the content, makes things new again for one tester, puts a tester back to the
start of Onboarding, and removes everything when the test is over.

The data is temporary. Every row has a fixed id (`gid()` in `lib/ground.ts`), so `seed` can run again
safely and `remove` deletes exactly what was created.

## Commands

From the repository root:

| Command                                                  | What it does                                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `bun run tester-ground seed`                             | Creates the accounts and publishes every module's content.                          |
| `bun run tester-ground renew 4`                          | Makes things new again for tester 4 (`1` to `5`, or `all`). She stays where she is. |
| `bun run tester-ground restart 4`                        | Puts tester 4 back to the start of Onboarding, with everything new again.           |
| `bun run tester-ground remove`                           | Deletes everything `seed` created and what the testers made, accounts last.         |
| `bun run tester-ground print seed`                       | Writes the SQL of `seed` to `./tester-ground-seed.sql`, runs nothing.               |
| `bun run tester-ground print restart 2 --out /tmp/r.sql` | The same for any command, to a file you name.                                       |

`renew` first deletes what that tester opened or visited (the Home seen items and the tab news:
`announcement_reads`, `event_reads`, `forum_post_reads`, `media_item_reads`, `knowledge_article_reads`,
`service_reads`, `mentoring_request_reads`, `feedback_submission_reads`, `list_visits`), then runs each
module's own `renew`, which puts back what was addressed to her or waited for her. A tester who has
finished Onboarding stays a player. Run it once after a tester finished Onboarding to give her the chat
(see below).

`restart` does what the design sandbox's "start again" switch does, and more: her role goes back to
invited, her terms, consents, signatures and answers go (her names stay, as on the day she was
invited), her invitation is open again, and everything she made in the app goes (posts, photos,
stories, messages, sign-ups, saved interests, requests, suggestions, form and survey answers). It also
records a new scenario stamp, so the app drops an Onboarding draft kept on her phone. Then it runs
`renew` for her. On her phone she signs out and in again, or reopens the app, to be sent to Onboarding.

### Where it runs

- **Local (default):** the database in `TESTER_GROUND_DB_URL`, by default
  `postgresql://postgres:postgres@127.0.0.1:55322/postgres`. Only a local host is accepted. The whole
  command runs in one transaction.
- **Staging:** add `--staging --yes`. The SQL goes through `supabase db query --linked -f`, and only
  when the linked project of the checkout is the staging project; any other project is refused. Run it
  from a checkout that is linked to staging, or point `TESTER_GROUND_SUPABASE_WORKDIR` at one. The file
  reaches the database as one message, which Postgres runs as one transaction: a failing statement
  leaves nothing behind.

### Images

The modules name stock images with tokens. The runner fills them in from `images/manifest.json`
(written by the image upload step). A staging run stops before any SQL runs when the manifest is
missing or lacks an image. A local run uses fixed placeholders when the manifest is missing, or always
with `--placeholders`.

## What `seed` creates

The accounts module (order 10) creates twelve accounts in the `ramassa` organization, all of them test
accounts.

| Account                                       | Role at seed | Sign-in address             |
| --------------------------------------------- | ------------ | --------------------------- |
| Amal Prova (tester 1)                         | invited      | `prova1@example.test`       |
| Leila Prova (tester 2)                        | invited      | `prova2@example.test`       |
| Olena Prova (tester 3)                        | invited      | `prova3@example.test`       |
| Mariama Prova (tester 4)                      | invited      | `prova4@example.test`       |
| Noor Prova (tester 5, the app team's own)     | invited      | `prova5@example.test`       |
| Samira, Yasmin, Oksana, Fatou, Carolina, Hawa | player       | `companya1..6@example.test` |
| Júlia Soler (l'equip tècnic)                  | staff        | `equip.prova@example.test`  |

- **The testers** are test players invited by l'equip tècnic two hours before the run, as the invitation
  form makes one with "Test player" ticked: an open invitation and a profile with her names and
  nothing else. She goes through the whole Onboarding the club designed on staging, terms included.
  Her names are already filled in on the first screen, as for any invited player.
- **The invitation stays open for a year.** The nightly job `ramassa-purge-unjoined-participants`
  deletes an invited profile only when her address has no open invitation, so a tester who has not
  signed in yet is kept for a year after the last `seed` or `restart`.
- **What counts as new** is what was published after she was invited (`profiles.created_at`, which
  finishing Onboarding does not change). Everything new is dated minutes before the run and everything
  old days before it, so whenever she finishes Onboarding the new things are still new.
- **The companions** joined 30 days before the run and write in the forum, the gallery and the stories.
  They are test accounts because a test player only sees what test accounts and l'equip tècnic wrote.
- **Júlia** publishes the content and answers the chat, the mentoring and the suggestions. She has the
  built-in staff permissions.
- Testers have no profile photo; the companions and Júlia do.

The other modules (Inici, Activitats, Comunitat, Ajuda, Contacte) add each tab's content. A tester has
no history of her own: no post, sign-up, attendance, saved interest, started survey or form put off.
What waits for her was done by l'equip tècnic minutes before: three forms and two surveys, one
mentoring request just scheduled and one suggestion just answered.

### The chat

The database lets a chat exist only for a player, so a tester who has not finished Onboarding has no
chat. After she finishes, `bun run tester-ground renew <n>` writes two unread messages from Júlia in
her chat. Someone in l'equip tècnic can also write to her from the staff side instead.

## How the testers sign in

1. Open the staging build of the app.
2. Type the address of the account, for example `prova1@example.test`.
3. Type the staging fixed sign-in code for test accounts (ask the app team; it is not written here).
   These addresses receive no email, so the fixed code is the only way in.
4. She goes through Onboarding, then lands on Inici.

The fixed code is described in `supabase/functions/test-sign-in/README.md`.

## Removing everything

`bun run tester-ground remove` (with `--staging --yes` on staging) deletes every module's rows in
reverse order, what the testers made while testing, the staff notices their actions raised, their
invitations, then the accounts and what hangs from them, including their audit trail. Run it when the
test is over. Photos a tester uploaded stay in storage.
