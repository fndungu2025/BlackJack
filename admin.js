// Admin tab: only shown to users with the 'admin' role. The database enforces
// the role too (row level security and admin_list_users), so hiding the tab is
// only a convenience. Players can't reach admin data even if they un-hide it.
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const auth = () => window.bjAuth;
  const STARTING_BANKROLL = 1000;
  const BUCKET_MARKER = "/storage/v1/object/public/avatars/";

  const el = {
    tab: $("tab-admin"),
    badge: $("role-badge"),
    tiles: $("admin-tiles"),
    search: $("admin-search"),
    status: $("admin-status"),
    list: $("admin-users"),
    refresh: $("admin-refresh"),
  };

  let user = null;
  let users = [];

  const money = (n) => `$${n.toLocaleString()}`;
  const date = (d) =>
    d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "never";

  function node(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function setStatus(text) {
    el.status.textContent = text;
  }

  // ---------- Role check ----------

  async function checkRole() {
    const uid = user.id;
    const { data, error } = await auth().client.rpc("is_admin");
    if (!user || user.id !== uid) return;
    const admin = !error && data === true;
    if (error) console.error("Couldn't check role", error);
    el.tab.hidden = !admin;
    el.badge.hidden = !admin;
  }

  // ---------- Rendering ----------

  function renderTiles() {
    const profiles = users.filter((u) => u.username).length;
    const admins = users.filter((u) => u.role === "admin").length;
    const hands = users.reduce((sum, u) => sum + (u.hands_played || 0), 0);
    const tiles = [
      [users.length, "accounts"],
      [profiles, "profiles created"],
      [admins, admins === 1 ? "admin" : "admins"],
      [hands.toLocaleString(), "hands played"],
    ];
    el.tiles.replaceChildren(
      ...tiles.map(([value, label]) => {
        const t = node("div", "tile");
        t.append(node("strong", "", String(value)), node("span", "", label));
        return t;
      })
    );
  }

  function avatar(u) {
    const name = u.display_name || u.full_name || u.email || "?";
    const initials = node(
      "span",
      "player-avatar initials",
      name
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    );
    if (!u.avatar_url) return initials;
    const img = node("img", "player-avatar");
    img.src = u.avatar_url;
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    img.onerror = () => img.replaceWith(initials);
    return img;
  }

  function userRow(u) {
    const isMe = u.id === user.id;
    const li = node("li", "admin-user" + (u.role === "admin" ? " is-admin" : ""));

    const details = node("div", "details");
    details.append(
      node("strong", "", (u.display_name || u.full_name || "Unnamed") + (isMe ? " (you)" : "")),
      node("span", "muted", u.username ? `@${u.username}` : "No profile yet"),
      node("span", "", u.email || "no email"),
      node("span", "muted", `Joined ${date(u.signed_up_at)} · Last sign-in ${date(u.last_sign_in_at)}`),
      node(
        "span",
        "muted",
        u.bankroll === null || u.bankroll === undefined
          ? "Hasn't played yet"
          : `Bankroll ${money(u.bankroll)} · ${u.hands_played} hands · ${u.hands_won} won`
      )
    );
    if (u.bio) details.append(node("span", "muted", `“${u.bio}”`));

    const controls = node("div", "controls");

    const role = node("select");
    role.setAttribute("aria-label", `Role for ${u.email}`);
    for (const r of ["player", "admin"]) {
      const o = node("option", "", r === "admin" ? "Admin" : "Player");
      o.value = r;
      o.selected = u.role === r;
      role.append(o);
    }
    role.disabled = isMe; // admins can't change their own role (prevents lockout)
    if (isMe) role.title = "You can't change your own role.";
    role.addEventListener("change", () => changeRole(u, role));
    controls.append(role);

    if (u.bankroll !== null && u.bankroll !== undefined) {
      const reset = node("button", "btn ghost small", "Reset bankroll");
      reset.addEventListener("click", () => resetBankroll(u, reset));
      controls.append(reset);
    }
    if (u.username) {
      const del = node("button", "btn ghost small danger", "Delete profile");
      del.addEventListener("click", () => deleteProfile(u, del));
      controls.append(del);
    }

    li.append(avatar(u), details, controls);
    return li;
  }

  function renderList() {
    const q = el.search.value.trim().toLowerCase();
    const shown = q
      ? users.filter((u) =>
          [u.email, u.username, u.display_name, u.full_name].some((v) => v && v.toLowerCase().includes(q))
        )
      : users;
    el.list.replaceChildren(...shown.map(userRow));
    if (q) setStatus(`${shown.length} of ${users.length} accounts match.`);
  }

  // ---------- Data ----------

  async function load(message = "") {
    setStatus("Loading accounts…");
    const { data, error } = await auth().client.rpc("admin_list_users");
    if (error) {
      console.error(error);
      setStatus(error.code === "42501" ? "You don't have admin access." : "Couldn't load accounts. Try again.");
      return;
    }
    users = data;
    setStatus(message);
    renderTiles();
    renderList();
  }

  async function changeRole(u, select) {
    const role = select.value;
    select.disabled = true;
    const { error } = await auth()
      .client.from("user_roles")
      .upsert({ user_id: u.id, role }, { onConflict: "user_id" });
    select.disabled = false;
    if (error) {
      console.error(error);
      select.value = u.role;
      setStatus(`Couldn't change ${u.email}'s role.`);
      return;
    }
    u.role = role;
    setStatus(`${u.display_name || u.email} is now ${role === "admin" ? "an admin" : "a player"}.`);
    renderTiles();
    select.closest(".admin-user").classList.toggle("is-admin", role === "admin");
  }

  async function resetBankroll(u, button) {
    if (!confirm(`Reset ${u.display_name || u.email}'s bankroll to ${money(STARTING_BANKROLL)}?`)) return;
    button.disabled = true;
    const { error } = await auth()
      .client.from("player_stats")
      .update({ bankroll: STARTING_BANKROLL })
      .eq("id", u.id);
    button.disabled = false;
    if (error) {
      console.error(error);
      setStatus("Couldn't reset that bankroll.");
      return;
    }
    if (u.id === user.id) window.bjGame?.setBankroll(STARTING_BANKROLL);
    await load(`Reset ${u.display_name || u.email}'s bankroll.`);
  }

  async function deleteProfile(u, button) {
    if (!confirm(`Delete @${u.username}'s profile? They can create a new one next time they sign in.`)) return;
    button.disabled = true;
    const { error } = await auth().client.from("profiles").delete().eq("id", u.id);
    button.disabled = false;
    if (error) {
      console.error(error);
      setStatus("Couldn't delete that profile.");
      return;
    }
    // Remove their uploaded photo too, if it was stored with us.
    const i = u.avatar_url ? u.avatar_url.indexOf(BUCKET_MARKER) : -1;
    if (i !== -1) {
      const path = decodeURIComponent(u.avatar_url.slice(i + BUCKET_MARKER.length));
      auth().client.storage.from("avatars").remove([path]).then(({ error: e }) => e && console.error(e));
    }
    await load(`Deleted @${u.username}'s profile.`);
  }

  // ---------- Events ----------

  el.search.addEventListener("input", () => {
    if (!el.search.value.trim()) setStatus("");
    renderList();
  });
  el.refresh.addEventListener("click", () => load());
  document.addEventListener("view:shown", (e) => {
    if (e.detail === "admin") load();
  });

  document.addEventListener("auth:signed-in", (e) => {
    user = e.detail;
    checkRole();
  });

  document.addEventListener("auth:signed-out", () => {
    user = null;
    users = [];
    el.tab.hidden = true;
    el.badge.hidden = true;
    el.list.replaceChildren();
    el.tiles.replaceChildren();
  });
})();
