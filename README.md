# Blackjack

A browser Blackjack game built with plain HTML, CSS and JavaScript, using the free
[Deck of Cards API](https://deckofcardsapi.com/) for shuffling, dealing and card images.
No build step and no dependencies.

## Sign in with Google

Players sign in with Google through Supabase Auth (project `noqaypbuqiopetudsqgi`)
before they reach the table. Once signed in, the header greets them by first name
with their Google profile picture (or their initials if the picture can't load).
The Supabase URL and publishable key are in `auth.js`; the publishable key is
meant to be public.

**Supabase setup checklist** (Dashboard → Authentication):

1. **Sign In / Providers → Google**: enabled, with your Google OAuth client ID and secret.
   In Google Cloud Console, the OAuth client's authorized redirect URI must be
   `https://noqaypbuqiopetudsqgi.supabase.co/auth/v1/callback`.
2. **URL Configuration**: set **Site URL** to your Netlify URL
   (e.g. `https://your-site.netlify.app`) and add it to **Redirect URLs**, plus
   `http://localhost:8000` for local testing. If a URL isn't listed, Supabase
   sends users to the Site URL after login instead.

## Player profiles

Signed-in players get a **Profile** tab where they create a profile: display
name, a unique username, an optional bio and an avatar image URL (prefilled from
Google). New players are taken to the Profile tab automatically the first time
they sign in. Once saved, the header greeting uses their profile name and picture.

Profiles are stored in the `public.profiles` table in Supabase. Row Level Security
lets each user read, create, edit and delete only their own row; signed-out
visitors can't read the table at all. The SQL is in
`supabase/migrations/20261103000000_create_profiles.sql` and has already been
applied to the project.

## Rules

- 6-deck shoe, reshuffled when fewer than 52 cards remain
- Blackjack pays 3:2
- Dealer stands on all 17s
- Double down on any first two cards
- Start with a $1,000 bankroll (saved in your browser); reset any time

Keyboard: `H` hit, `S` stand, `D` double, `Enter` deal / next hand.

## How it uses the API

| Action | Endpoint |
| --- | --- |
| New shoe | `GET /api/deck/new/shuffle/?deck_count=6` |
| Deal / hit | `GET /api/deck/<deck_id>/draw/?count=N` |
| Reshuffle | `GET /api/deck/<deck_id>/shuffle/` |

Card faces come from each card's `image` field; the face-down card uses
`https://deckofcardsapi.com/static/img/back.png`.

## Run locally

Serve the folder (Google sign-in won't work from a `file://` page):

```bash
python3 -m http.server 8000
```

## Deploy to Netlify

The site is static. In Netlify, import the repo (branch `main`), leave the build
command empty and set the publish directory to `.` (already set in `netlify.toml`).
You can also drag and drop the folder onto Netlify's deploy page.
