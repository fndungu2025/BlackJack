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
name, a unique username, an optional bio and a profile photo. The photo can be
uploaded (cropped to a 256px square and stored in the Supabase Storage bucket
`avatars`) or given as an image URL; it defaults to their Google photo. New
players are taken to the Profile tab automatically the first time they sign in.

The **Players** tab lists everyone who has made a profile, ranked by bankroll,
with their hands played and win rate.

## Saved bankroll

Each player's bankroll and record are stored in their account (`player_stats`),
so they follow the player to any device. The first time someone signs in, their
account starts with the bankroll already saved in that browser.

## Database

| Table / bucket | Who can read | Who can change |
| --- | --- | --- |
| `profiles` | any signed-in player | only the owner |
| `player_stats` | any signed-in player | only the owner |
| `avatars` bucket | public image links | only the owner (files in a folder named after their user id) |

Signed-out visitors can't read either table. The SQL is in `supabase/migrations/`
and has already been applied to the project. Because the game runs in the
browser, a determined player could edit their own bankroll; the leaderboard is
for fun, not for anything of value.

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
