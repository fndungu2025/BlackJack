// Saves each player's bankroll and hand counts to Supabase ("player_stats"),
// and renders the Players tab (all profiles, ranked by bankroll).
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const auth = () => window.bjAuth;
  const game = () => window.bjGame;
  const money = (n) => `$${n.toLocaleString()}`;

  // ---------- Bankroll sync ----------

  let user = null;
  let stats = null; // { bankroll, hands_played, hands_won } once loaded
  let loadToken = 0;
  let pending = { played: 0, won: 0 }; // hands finished before stats loaded
  let saveChain = Promise.resolve();

  function save() {
    if (!user || !stats) return;
    const uid = user.id;
    const values = { bankroll: stats.bankroll, hands_played: stats.hands_played, hands_won: stats.hands_won };
    saveChain = saveChain
      .then(async () => {
        const { error } = await auth().client.from("player_stats").update(values).eq("id", uid);
        if (error) console.error("Couldn't save stats", error);
      })
      .catch(() => {});
  }

  async function loadStats() {
    const token = ++loadToken;
    const uid = user.id;
    const localBefore = game().getBankroll();
    pending = { played: 0, won: 0 };

    const { data, error } = await auth()
      .client.from("player_stats")
      .select("bankroll, hands_played, hands_won")
      .eq("id", uid)
      .maybeSingle();
    if (token !== loadToken) return; // signed out or switched accounts meanwhile
    if (error) {
      console.error("Couldn't load stats; playing with the bankroll saved in this browser.", error);
      return;
    }

    if (!data) {
      // First time: start the account with this browser's current bankroll.
      const row = {
        id: uid,
        bankroll: game().getBankroll(),
        hands_played: pending.played,
        hands_won: pending.won,
      };
      const { error: insertError } = await auth().client.from("player_stats").insert(row);
      if (token !== loadToken) return;
      if (insertError) {
        console.error("Couldn't create stats", insertError);
        return;
      }
      stats = { bankroll: row.bankroll, hands_played: row.hands_played, hands_won: row.hands_won };
      return;
    }

    const adopt = () => {
      // Keep the result of any hands played while we were loading.
      const bankroll = Math.max(0, data.bankroll + (game().getBankroll() - localBefore));
      if (!game().setBankroll(bankroll)) return false;
      stats = {
        bankroll,
        hands_played: data.hands_played + pending.played,
        hands_won: data.hands_won + pending.won,
      };
      if (pending.played || bankroll !== data.bankroll) save();
      return true;
    };

    if (!adopt()) {
      // A hand is in progress; take over the saved bankroll when it ends.
      document.addEventListener(
        "game:hand-finished",
        () => setTimeout(() => token === loadToken && adopt(), 0),
        { once: true }
      );
    }
  }

  document.addEventListener("game:hand-finished", (e) => {
    if (!user) return;
    if (!stats) {
      pending.played++;
      if (e.detail.won) pending.won++;
      return;
    }
    stats.bankroll = e.detail.bankroll;
    stats.hands_played++;
    if (e.detail.won) stats.hands_won++;
    save();
  });

  document.addEventListener("game:bankroll-reset", (e) => {
    if (!stats) return;
    stats.bankroll = e.detail.bankroll;
    save();
  });

  // ---------- Players tab ----------

  const list = $("players-list");
  const status = $("players-status");

  function avatarFor(p) {
    if (p.avatar_url) {
      const img = document.createElement("img");
      img.className = "player-avatar";
      img.src = p.avatar_url;
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.onerror = () => img.replaceWith(initialsFor(p));
      return img;
    }
    return initialsFor(p);
  }

  function initialsFor(p) {
    const span = document.createElement("span");
    span.className = "player-avatar initials";
    span.textContent = p.display_name
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    return span;
  }

  function row(p, rank) {
    const li = document.createElement("li");
    li.className = "player" + (user && p.id === user.id ? " me" : "");

    const rankEl = document.createElement("span");
    rankEl.className = "player-rank";
    rankEl.textContent = `#${rank}`;

    const info = document.createElement("div");
    info.className = "player-info";
    const name = document.createElement("strong");
    name.textContent = p.display_name + (user && p.id === user.id ? " (you)" : "");
    const handle = document.createElement("span");
    handle.className = "player-handle";
    handle.textContent = `@${p.username}`;
    info.append(name, handle);
    if (p.bio) {
      const bio = document.createElement("p");
      bio.className = "player-bio";
      bio.textContent = p.bio;
      info.append(bio);
    }

    const numbers = document.createElement("div");
    numbers.className = "player-numbers";
    const bank = document.createElement("strong");
    bank.textContent = p.stats ? money(p.stats.bankroll) : "—";
    const record = document.createElement("span");
    if (p.stats && p.stats.hands_played) {
      const rate = Math.round((p.stats.hands_won / p.stats.hands_played) * 100);
      record.textContent = `${p.stats.hands_played} hands · ${rate}% won`;
    } else {
      record.textContent = "No hands yet";
    }
    numbers.append(bank, record);

    li.append(rankEl, avatarFor(p), info, numbers);
    return li;
  }

  async function loadPlayers() {
    if (!user) return;
    status.textContent = "Loading players…";
    const client = auth().client;
    const [profiles, allStats] = await Promise.all([
      client.from("profiles").select("id, username, display_name, avatar_url, bio").limit(500),
      client.from("player_stats").select("id, bankroll, hands_played, hands_won").limit(500),
    ]);
    if (profiles.error || allStats.error) {
      console.error(profiles.error || allStats.error);
      status.textContent = "Couldn't load players. Try again in a moment.";
      return;
    }
    const byId = new Map(allStats.data.map((s) => [s.id, s]));
    const players = profiles.data
      .map((p) => ({ ...p, stats: byId.get(p.id) || null }))
      .sort((a, b) => (b.stats?.bankroll ?? -1) - (a.stats?.bankroll ?? -1) || a.display_name.localeCompare(b.display_name));

    list.replaceChildren(...players.map((p, i) => row(p, i + 1)));
    status.textContent = players.length
      ? `${players.length} player${players.length === 1 ? "" : "s"}, ranked by bankroll.`
      : "No players have made a profile yet. Be the first!";
  }

  $("players-refresh").addEventListener("click", loadPlayers);
  document.addEventListener("view:shown", (e) => {
    if (e.detail === "players") loadPlayers();
  });

  // ---------- Auth ----------

  document.addEventListener("auth:signed-in", (e) => {
    user = e.detail;
    stats = null;
    loadStats();
  });

  document.addEventListener("auth:signed-out", () => {
    user = null;
    stats = null;
    loadToken++;
    list.replaceChildren();
  });
})();
