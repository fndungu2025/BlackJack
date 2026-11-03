// Blackjack powered by the Deck of Cards API (https://deckofcardsapi.com/)
(() => {
  "use strict";

  const API = "https://deckofcardsapi.com/api/deck";
  const CARD_BACK = "https://deckofcardsapi.com/static/img/back.png";
  const DECK_COUNT = 6;
  const RESHUFFLE_AT = 52; // reshuffle the shoe when fewer cards than this remain
  const STARTING_BANKROLL = 1000;
  const STORAGE_KEY = "blackjack-bankroll";

  // ---------- Game logic (pure) ----------

  function cardValue(card) {
    if (card.value === "ACE") return 11;
    if (["KING", "QUEEN", "JACK"].includes(card.value)) return 10;
    return parseInt(card.value, 10);
  }

  // Returns { total, soft } where soft means an ace is still counted as 11.
  function handScore(cards) {
    let total = 0;
    let aces = 0;
    for (const c of cards) {
      total += cardValue(c);
      if (c.value === "ACE") aces++;
    }
    while (total > 21 && aces > 0) {
      total -= 10;
      aces--;
    }
    return { total, soft: aces > 0 };
  }

  const isBlackjack = (cards) => cards.length === 2 && handScore(cards).total === 21;

  // ---------- API ----------

  async function api(path) {
    const res = await fetch(`${API}/${path}`);
    if (!res.ok) throw new Error(`Deck API error: ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Deck API request failed");
    return data;
  }

  // ---------- State ----------

  const state = {
    deckId: null,
    remaining: 0,
    bankroll: loadBankroll(),
    bet: 0,
    baseBet: 0, // bet placed before any double down, reused for the next hand
    player: [],
    dealer: [],
    phase: "betting", // betting | playing | dealer | done
    busy: false,
  };

  function loadBankroll() {
    try {
      const v = parseInt(localStorage.getItem(STORAGE_KEY), 10);
      return Number.isFinite(v) ? v : STARTING_BANKROLL;
    } catch {
      return STARTING_BANKROLL;
    }
  }

  function saveBankroll() {
    try { localStorage.setItem(STORAGE_KEY, String(state.bankroll)); } catch { /* ignore */ }
  }

  async function ensureShoe() {
    if (!state.deckId) {
      const data = await api(`new/shuffle/?deck_count=${DECK_COUNT}`);
      state.deckId = data.deck_id;
      state.remaining = data.remaining;
    } else if (state.remaining < RESHUFFLE_AT) {
      // Return all cards to the shoe and reshuffle.
      const data = await api(`${state.deckId}/shuffle/`);
      state.remaining = data.remaining;
      setMessage("Shuffling the shoe…");
    }
  }

  async function draw(count) {
    const data = await api(`${state.deckId}/draw/?count=${count}`);
    state.remaining = data.remaining;
    return data.cards;
  }

  // ---------- DOM ----------

  const $ = (id) => document.getElementById(id);
  const el = {
    bankroll: $("bankroll"),
    bet: $("bet"),
    remaining: $("remaining"),
    dealerCards: $("dealer-cards"),
    playerCards: $("player-cards"),
    dealerScore: $("dealer-score"),
    playerScore: $("player-score"),
    message: $("message"),
    chips: document.querySelectorAll(".chip"),
    clearBet: $("clear-bet"),
    deal: $("deal"),
    hit: $("hit"),
    stand: $("stand"),
    double: $("double"),
    next: $("next"),
    reset: $("reset"),
  };

  const money = (n) => `$${n.toLocaleString()}`;

  function setMessage(text, kind = "") {
    el.message.textContent = text;
    el.message.className = `message ${kind}`;
  }

  function renderHand(container, cards, hideHole) {
    container.replaceChildren(
      ...cards.map((card, i) => {
        const img = document.createElement("img");
        img.className = "card";
        const hidden = hideHole && i === 1;
        img.src = hidden ? CARD_BACK : card.image;
        img.alt = hidden ? "Face-down card" : `${card.value} of ${card.suit}`;
        return img;
      })
    );
  }

  function scoreLabel(cards) {
    if (!cards.length) return "";
    const { total, soft } = handScore(cards);
    return soft && total < 21 ? `${total - 10} / ${total}` : String(total);
  }

  function render() {
    const hideHole = state.phase === "playing";
    renderHand(el.playerCards, state.player, false);
    renderHand(el.dealerCards, state.dealer, hideHole);

    el.playerScore.textContent = scoreLabel(state.player);
    el.dealerScore.textContent = hideHole
      ? state.dealer.length ? String(handScore([state.dealer[0]]).total) : ""
      : scoreLabel(state.dealer);

    el.bankroll.textContent = money(state.bankroll);
    el.bet.textContent = money(state.bet);
    el.remaining.textContent = state.deckId ? state.remaining : "–";

    const betting = state.phase === "betting";
    const playing = state.phase === "playing";
    const done = state.phase === "done";
    const broke = done && state.bankroll < 5;

    el.chips.forEach((c) => {
      c.hidden = !betting;
      c.disabled = state.busy || Number(c.dataset.amount) > state.bankroll - state.bet;
    });
    el.clearBet.hidden = !betting;
    el.clearBet.disabled = state.busy || state.bet === 0;
    el.deal.hidden = !betting;
    el.deal.disabled = state.busy || state.bet === 0;

    el.hit.hidden = el.stand.hidden = el.double.hidden = !playing;
    el.hit.disabled = el.stand.disabled = state.busy;
    el.double.disabled =
      state.busy || state.player.length !== 2 || state.bankroll < state.bet * 2;

    el.next.hidden = !done || broke;
    el.reset.hidden = !(betting || done) || !(broke || betting);
  }

  async function run(fn) {
    if (state.busy) return;
    state.busy = true;
    render();
    try {
      await fn();
    } catch (err) {
      console.error(err);
      setMessage("Couldn't reach the Deck of Cards API. Check your connection and try again.", "lose");
      // Roll back an in-progress hand so the bet isn't lost on a network error.
      if (state.phase !== "betting" && state.phase !== "done") {
        state.player = [];
        state.dealer = [];
        state.phase = "betting";
      }
    } finally {
      state.busy = false;
      render();
    }
  }

  // ---------- Actions ----------

  function addChip(amount) {
    if (state.phase !== "betting" || state.bet + amount > state.bankroll) return;
    state.bet += amount;
    setMessage(`Bet ${money(state.bet)}. Press Deal when ready.`);
    render();
  }

  function clearBet() {
    state.bet = 0;
    setMessage("Place your bet to begin.");
    render();
  }

  const deal = () =>
    run(async () => {
      await ensureShoe();
      const cards = await draw(4);
      state.baseBet = state.bet;
      state.player = [cards[0], cards[2]];
      state.dealer = [cards[1], cards[3]];
      state.phase = "playing";
      setMessage("Hit or stand?");

      if (isBlackjack(state.player) || isBlackjack(state.dealer)) {
        settle();
      }
    });

  const hit = () =>
    run(async () => {
      const [card] = await draw(1);
      state.player.push(card);
      const { total } = handScore(state.player);
      if (total > 21) settle();
      else if (total === 21) await dealerPlay();
    });

  const stand = () => run(dealerPlay);

  const doubleDown = () =>
    run(async () => {
      state.bet *= 2;
      const [card] = await draw(1);
      state.player.push(card);
      if (handScore(state.player).total > 21) settle();
      else await dealerPlay();
    });

  async function dealerPlay() {
    state.phase = "dealer";
    render();
    while (handScore(state.dealer).total < 17) {
      await pause(450);
      const [card] = await draw(1);
      state.dealer.push(card);
      render();
    }
    settle();
  }

  function settle() {
    const p = handScore(state.player).total;
    const d = handScore(state.dealer).total;
    const pBJ = isBlackjack(state.player);
    const dBJ = isBlackjack(state.dealer);
    let delta = 0;
    let text;
    let kind = "";

    if (pBJ && dBJ) {
      text = "Both have Blackjack — push.";
    } else if (pBJ) {
      delta = Math.floor(state.bet * 1.5);
      text = `Blackjack! You win ${money(delta)}.`;
      kind = "win";
    } else if (dBJ) {
      delta = -state.bet;
      text = "Dealer has Blackjack. You lose.";
      kind = "lose";
    } else if (p > 21) {
      delta = -state.bet;
      text = `Bust with ${p}. You lose ${money(state.bet)}.`;
      kind = "lose";
    } else if (d > 21) {
      delta = state.bet;
      text = `Dealer busts with ${d}. You win ${money(delta)}!`;
      kind = "win";
    } else if (p > d) {
      delta = state.bet;
      text = `${p} beats ${d}. You win ${money(delta)}!`;
      kind = "win";
    } else if (p < d) {
      delta = -state.bet;
      text = `Dealer's ${d} beats your ${p}. You lose ${money(state.bet)}.`;
      kind = "lose";
    } else {
      text = `Push at ${p}.`;
    }

    state.bankroll += delta;
    saveBankroll();
    state.phase = "done";
    if (state.bankroll < 5) text += " You're out of chips — reset to keep playing.";
    setMessage(text, kind);
  }

  function nextHand() {
    state.player = [];
    state.dealer = [];
    state.phase = "betting";
    // Repeat the previous (pre-double) bet if it's still affordable.
    state.bet = Math.min(state.baseBet, state.bankroll);
    setMessage(state.bet ? `Bet ${money(state.bet)}. Press Deal when ready.` : "Place your bet to begin.");
    render();
  }

  function resetBankroll() {
    state.bankroll = STARTING_BANKROLL;
    state.bet = 0;
    state.player = [];
    state.dealer = [];
    state.phase = "betting";
    saveBankroll();
    setMessage("Bankroll reset. Place your bet to begin.");
    render();
  }

  const pause = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- Wire up ----------

  el.chips.forEach((c) => c.addEventListener("click", () => addChip(Number(c.dataset.amount))));
  el.clearBet.addEventListener("click", clearBet);
  el.deal.addEventListener("click", deal);
  el.hit.addEventListener("click", hit);
  el.stand.addEventListener("click", stand);
  el.double.addEventListener("click", doubleDown);
  el.next.addEventListener("click", nextHand);
  el.reset.addEventListener("click", resetBankroll);

  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea")) return;
    const key = e.key.toLowerCase();
    if (state.phase === "playing") {
      if (key === "h") hit();
      else if (key === "s") stand();
      else if (key === "d" && !el.double.disabled) doubleDown();
    } else if (state.phase === "betting" && key === "enter" && state.bet > 0) {
      deal();
    } else if (state.phase === "done" && key === "enter" && !el.next.hidden) {
      nextHand();
    }
  });

  render();
  // Warm up the shoe in the background so the first deal is fast.
  run(ensureShoe).then(() => {
    if (state.deckId && state.phase === "betting" && state.bet === 0) setMessage("Place your bet to begin.");
  });
})();
