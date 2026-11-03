# Blackjack

A browser Blackjack game built with plain HTML, CSS and JavaScript, using the free
[Deck of Cards API](https://deckofcardsapi.com/) for shuffling, dealing and card images.
No build step and no dependencies.

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

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

## Deploy to Netlify

The site is static. In Netlify, import the repo (branch `main`), leave the build
command empty and set the publish directory to `.` (already set in `netlify.toml`).
You can also drag and drop the folder onto Netlify's deploy page.
