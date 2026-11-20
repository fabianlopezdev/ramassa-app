# Tester ground (RAPP-885)

Four people at Ramassà try the player side of the app on staging. Each signs in with her own test
account and finds every tab full of dummy data, with numbers on the tabs and "Nou" on new cards. This
tool creates the accounts, publishes the content, makes things new again for one tester, and removes
everything when the test is over.

The data is temporary. Every row has a fixed id (`gid()` in `lib/ground.ts`), so `seed` can run again
safely and `remove` deletes exactly what was created.

## Commands

From the repository root:

| Command                                                    | What it does                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------------- |
| `bun run tester-ground seed`                               | Creates the accounts and publishes every module's content.            |
| `bun run tester-ground renew 4`                            | Makes things new again for tester 4 (`1` to `4`, or `all`).           |
| `bun run tester-ground remove`                             | Deletes everything `seed` created, accounts last.                     |
| `bun run tester-ground print seed`                         | Writes the SQL of `seed` to `./tester-ground-seed.sql`, runs nothing. |
| `bun run tester-ground print renew 2 --out /tmp/renew.sql` | The same for any command, to a file you name.                         |

`renew` first deletes what that tester opened or visited (the Home seen items and the tab news:
`announcement_reads`, `event_reads`, `forum_post_reads`, `media_item_reads`, `knowledge_article_reads`,
`service_reads`, `mentoring_request_reads`, `feedback_submission_reads`, `list_visits`), then runs each
module's own `renew`, which puts back what was addressed to her or waited for her.

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

The accounts module (order 10) creates eleven accounts in the `ramassa` organization. All of them
joined 30 days before the run, and all are test accounts.

| Account                                       | Role   | Sign-in address             |
| --------------------------------------------- | ------ | --------------------------- |
| Amal Prova (tester 1)                         | player | `prova1@example.test`       |
| Leila Prova (tester 2)                        | player | `prova2@example.test`       |
| Olena Prova (tester 3)                        | player | `prova3@example.test`       |
| Mariama Prova (tester 4)                      | player | `prova4@example.test`       |
| Samira, Yasmin, Oksana, Fatou, Carolina, Hawa | player | `companya1..6@example.test` |
| Júlia Soler (the team member)                 | staff  | `equip.prova@example.test`  |

- The players have a finished profile: terms accepted and signed for every terms version of the
  organization (the draft included, which a test player is shown), the forms after Onboarding done,
  and a few profile answers in Catalan. A tester who signs in lands on Inici.
- The companions write in the forum, the gallery and the stories, so the testers see other people.
  They are test accounts because a test player only sees what test accounts and the team wrote.
- Júlia publishes the content and answers the chat, the mentoring and the suggestions. She has the
  built-in staff permissions.
- Testers have no profile photo; the companions and Júlia do.

The other modules (Inici, Activitats, Comunitat, Ajuda, Contacte) add each tab's content. See each
module file for what it creates.

## How the testers sign in

1. Open the staging build of the app.
2. Type the address of the account, for example `prova1@example.test`.
3. Type the staging fixed sign-in code for test accounts (ask the Ramassà app team; it is not written
   here). These addresses receive no email, so the fixed code is the only way in.

The fixed code is described in `supabase/functions/test-sign-in/README.md`.

## Removing everything

`bun run tester-ground remove` (with `--staging --yes` on staging) deletes every module's rows in
reverse order, then the accounts and what hangs from them, including their audit trail. Run it when
the test is over.
