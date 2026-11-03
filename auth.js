// Google sign-in via Supabase Auth.
(() => {
  "use strict";

  const SUPABASE_URL = "https://noqaypbuqiopetudsqgi.supabase.co";
  // Publishable key: safe to ship in browser code (access is governed by RLS).
  const SUPABASE_KEY = "sb_publishable_wbOuz7kojhSL1ii5QoOIbw_jSMJU9M5";

  const $ = (id) => document.getElementById(id);
  const loginView = $("login");
  const tableView = $("table");
  const loginError = $("login-error");
  const googleBtn = $("google-login");

  if (!window.supabase) {
    loginView.hidden = false;
    loginError.textContent = "Couldn't load the sign-in service. Check your connection and refresh.";
    googleBtn.disabled = true;
    return;
  }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true },
  });

  window.bjAuth = { client, setIdentity: (name, picture) => setIdentity(name, picture), googleIdentity: (u) => googleIdentity(u) };

  function greetingFor(date = new Date()) {
    const h = date.getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }

  // Update the header greeting and avatar. Profile code calls this too, so a
  // saved profile's name and picture replace the Google ones.
  function setIdentity(fullName, picture) {
    const firstName = fullName.split(" ")[0];
    $("greeting").textContent = `${greetingFor()}, ${firstName}!`;
    $("greeting").title = fullName;

    const avatar = $("avatar");
    const initials = $("initials");
    initials.textContent = fullName
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    const showInitials = () => {
      avatar.hidden = true;
      initials.hidden = false;
    };
    if (picture) {
      avatar.onerror = showInitials;
      avatar.src = picture;
      avatar.alt = fullName;
      avatar.hidden = false;
      initials.hidden = true;
    } else {
      showInitials();
    }
  }

  function googleIdentity(user) {
    const meta = user.user_metadata || {};
    return {
      fullName: meta.full_name || meta.name || user.email || "Player",
      picture: meta.avatar_url || meta.picture || "",
    };
  }

  let currentUserId = null;

  function showUser(user) {
    const { fullName, picture } = googleIdentity(user);
    if (currentUserId !== user.id) setIdentity(fullName, picture);

    loginView.hidden = true;
    tableView.hidden = false;

    if (currentUserId !== user.id) {
      currentUserId = user.id;
      // Defer so listeners can call Supabase outside the auth callback.
      setTimeout(() => document.dispatchEvent(new CustomEvent("auth:signed-in", { detail: user })), 0);
    }
  }

  function showLogin() {
    if (currentUserId) {
      currentUserId = null;
      document.dispatchEvent(new CustomEvent("auth:signed-out"));
    }
    tableView.hidden = true;
    loginView.hidden = false;
    googleBtn.disabled = false;
  }

  function render(session) {
    if (session?.user) showUser(session.user);
    else showLogin();
  }

  googleBtn.addEventListener("click", async () => {
    loginError.textContent = "";
    googleBtn.disabled = true;
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (error) {
      loginError.textContent = error.message;
      googleBtn.disabled = false;
    }
  });

  $("logout").addEventListener("click", async () => {
    await client.auth.signOut();
    showLogin();
  });

  // Surface OAuth errors returned in the redirect URL (e.g. user cancelled).
  const params = new URLSearchParams(window.location.search + window.location.hash.replace(/^#/, "&"));
  if (params.get("error_description")) {
    loginError.textContent = params.get("error_description");
  }

  client.auth.onAuthStateChange((_event, session) => {
    render(session);
    // Tidy up ?code=… / #access_token=… left behind by the OAuth redirect.
    if (session && /[?#&](code|access_token)=/.test(window.location.href)) {
      history.replaceState(null, "", window.location.pathname);
    }
  });

  client.auth.getSession().then(({ data }) => render(data.session));
})();
