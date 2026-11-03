// Player profiles stored in the Supabase "profiles" table (one row per user).
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
  const PLACEHOLDER_AVATAR =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#073f28"/>' +
        '<circle cx="48" cy="38" r="18" fill="#e8c15a"/><path d="M14 92c4-22 18-32 34-32s30 10 34 32" fill="#e8c15a"/></svg>'
    );

  const el = {
    tabs: document.querySelectorAll(".tab"),
    views: { table: $("view-table"), profile: $("view-profile"), players: $("view-players"), admin: $("view-admin") },
    nudge: $("profile-nudge"),
    status: $("profile-status"),
    card: $("profile-card"),
    pcAvatar: $("pc-avatar"),
    pcName: $("pc-name"),
    pcUsername: $("pc-username"),
    pcBio: $("pc-bio"),
    pcMeta: $("pc-meta"),
    edit: $("edit-profile"),
    form: $("profile-form"),
    formTitle: $("form-title"),
    avatar: $("pf-avatar"),
    preview: $("pf-preview"),
    display: $("pf-display"),
    username: $("pf-username"),
    bio: $("pf-bio"),
    bioCount: $("pf-bio-count"),
    error: $("pf-error"),
    save: $("pf-save"),
    cancel: $("pf-cancel"),
    file: $("pf-file"),
    fileLabel: $("pf-file-label"),
  };

  let user = null;
  let profile = null;
  let uploads = []; // storage paths uploaded during the current edit

  const BUCKET = "avatars";
  const AVATAR_SIZE = 256;

  const auth = () => window.bjAuth;

  // ---------- Tabs ----------

  function showView(name) {
    const tab = $(`tab-${name}`);
    if (!el.views[name] || !tab || tab.hidden) name = "table"; // e.g. Admin tab for non-admins
    for (const [key, view] of Object.entries(el.views)) view.hidden = key !== name;
    el.tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.view === name)));
    if (location.hash !== `#${name}`) history.replaceState(null, "", name === "table" ? location.pathname : `#${name}`);
    if (user) document.dispatchEvent(new CustomEvent("view:shown", { detail: name }));
  }

  el.tabs.forEach((t) => t.addEventListener("click", () => showView(t.dataset.view)));
  document.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => showView(b.dataset.goto)));
  window.addEventListener("hashchange", () => showView(location.hash.slice(1)));
  window.bjShowView = (name) => showView(name);

  // ---------- Helpers ----------

  function setStatus(text, kind = "") {
    el.status.textContent = text;
    el.status.className = `profile-status ${kind}`;
  }

  function suggestUsername(u) {
    const base = (u.email || "player").split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "_");
    return (base.length >= 3 ? base : `${base}_player`).slice(0, 20);
  }

  function setImg(img, url) {
    img.onerror = () => { img.onerror = null; img.src = PLACEHOLDER_AVATAR; };
    img.src = url || PLACEHOLDER_AVATAR;
  }

  function applyIdentity() {
    if (!user) return;
    if (profile) auth().setIdentity(profile.display_name, profile.avatar_url || auth().googleIdentity(user).picture);
    else {
      const g = auth().googleIdentity(user);
      auth().setIdentity(g.fullName, g.picture);
    }
  }

  // ---------- Rendering ----------

  function renderCard() {
    el.form.hidden = true;
    el.card.hidden = false;
    setImg(el.pcAvatar, profile.avatar_url);
    el.pcAvatar.alt = profile.display_name;
    el.pcName.textContent = profile.display_name;
    el.pcUsername.textContent = `@${profile.username}`;
    el.pcBio.textContent = profile.bio || "";
    el.pcMeta.textContent = `Member since ${new Date(profile.created_at).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    })}`;
  }

  function renderForm() {
    const editing = Boolean(profile);
    const g = auth().googleIdentity(user);
    el.card.hidden = true;
    el.form.hidden = false;
    el.formTitle.textContent = editing ? "Edit your profile" : "Create your profile";
    el.save.textContent = editing ? "Save changes" : "Create profile";
    el.cancel.hidden = !editing;
    el.display.value = editing ? profile.display_name : g.fullName.slice(0, 50);
    el.username.value = editing ? profile.username : suggestUsername(user);
    el.bio.value = editing ? profile.bio || "" : "";
    el.avatar.value = editing ? profile.avatar_url || "" : g.picture.startsWith("https://") ? g.picture : "";
    el.error.textContent = "";
    [el.display, el.username, el.avatar].forEach((i) => i.removeAttribute("aria-invalid"));
    updatePreview();
    updateBioCount();
  }

  function render() {
    el.nudge.hidden = !user || Boolean(profile);
    if (profile) renderCard();
    else renderForm();
    applyIdentity();
  }

  function updatePreview() {
    const url = el.avatar.value.trim();
    setImg(el.preview, url.startsWith("https://") ? url : "");
  }

  function updateBioCount() {
    el.bioCount.textContent = String(el.bio.value.length);
  }

  // ---------- Avatar uploads ----------

  // Storage path for an avatar URL in our bucket, or null for other URLs.
  function storagePath(url) {
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const i = url ? url.indexOf(marker) : -1;
    return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length));
  }

  // Center-crop and shrink the image to a square JPEG.
  async function toSquareJpeg(file) {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = AVATAR_SIZE;
    canvas
      .getContext("2d")
      .drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    bitmap.close?.();
    return new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't process image"))), "image/jpeg", 0.88)
    );
  }

  async function uploadAvatar() {
    const file = el.file.files[0];
    el.file.value = "";
    if (!file) return;
    el.error.textContent = "";
    if (!file.type.startsWith("image/")) {
      el.error.textContent = "Please choose an image file.";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      el.error.textContent = "That image is over 10 MB. Please choose a smaller one.";
      return;
    }

    el.fileLabel.textContent = "Uploading…";
    el.file.disabled = el.save.disabled = true;
    try {
      const blob = await toSquareJpeg(file);
      const path = `${user.id}/${Date.now()}.jpg`;
      const storage = auth().client.storage.from(BUCKET);
      const { error } = await storage.upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
      if (error) throw error;
      uploads.push(path);
      el.avatar.value = storage.getPublicUrl(path).data.publicUrl;
      el.avatar.removeAttribute("aria-invalid");
      updatePreview();
    } catch (err) {
      console.error(err);
      el.error.textContent = "Couldn't upload that photo. Try a different image.";
    } finally {
      el.fileLabel.textContent = "Upload a photo";
      el.file.disabled = el.save.disabled = false;
    }
  }

  // Delete uploaded files that are no longer used by the profile.
  function cleanUpUploads(keepUrl, previousUrl) {
    const keep = storagePath(keepUrl);
    const stale = uploads.filter((p) => p !== keep);
    const prev = storagePath(previousUrl);
    if (prev && prev !== keep) stale.push(prev);
    uploads = [];
    if (stale.length) {
      auth().client.storage.from(BUCKET).remove(stale).then(({ error }) => error && console.error(error));
    }
  }

  // ---------- Data ----------

  async function loadProfile() {
    setStatus("Loading your profile…");
    el.card.hidden = el.form.hidden = true;
    const { data, error } = await auth()
      .client.from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    if (error) {
      console.error(error);
      setStatus("Couldn't load your profile. Refresh to try again.", "");
      return;
    }
    profile = data;
    setStatus(profile ? "" : "Welcome! Set up your player profile to get started.");
    render();
    // First time here? Take the player straight to profile setup.
    if (!profile) showView("profile");
  }

  function validate() {
    const values = {
      display_name: el.display.value.trim(),
      username: el.username.value.trim().toLowerCase(),
      bio: el.bio.value.trim() || null,
      avatar_url: el.avatar.value.trim() || null,
    };
    el.username.value = values.username;
    const problems = [];
    const flag = (input, bad) => input.setAttribute("aria-invalid", String(bad));

    flag(el.display, !values.display_name);
    if (!values.display_name) problems.push("Enter a display name.");

    const badUser = !USERNAME_RE.test(values.username);
    flag(el.username, badUser);
    if (badUser) problems.push("Username must be 3–20 lowercase letters, numbers or underscores.");

    const badAvatar = values.avatar_url !== null && !/^https:\/\/\S+$/.test(values.avatar_url);
    flag(el.avatar, badAvatar);
    if (badAvatar) problems.push("Avatar URL must start with https://");

    return { values, problems };
  }

  async function save(e) {
    e.preventDefault();
    const { values, problems } = validate();
    if (problems.length) {
      el.error.textContent = problems.join(" ");
      return;
    }
    el.error.textContent = "";
    el.save.disabled = true;
    const creating = !profile;

    const query = creating
      ? auth().client.from("profiles").insert({ id: user.id, ...values })
      : auth().client.from("profiles").update(values).eq("id", user.id);
    const { data, error } = await query.select().single();
    el.save.disabled = false;

    if (error) {
      console.error(error);
      if (error.code === "23505") {
        el.username.setAttribute("aria-invalid", "true");
        el.error.textContent = "That username is taken. Try another one.";
      } else {
        el.error.textContent = "Couldn't save your profile. Please try again.";
      }
      return;
    }
    const previousUrl = profile ? profile.avatar_url : null;
    profile = data;
    cleanUpUploads(profile.avatar_url, previousUrl);
    setStatus(creating ? "Profile created! Welcome to the table." : "Profile saved.", "ok");
    render();
  }

  // ---------- Events ----------

  el.form.addEventListener("submit", save);
  el.edit.addEventListener("click", () => {
    setStatus("");
    renderForm();
  });
  el.cancel.addEventListener("click", () => {
    setStatus("");
    cleanUpUploads(profile && profile.avatar_url, null);
    renderCard();
  });
  el.avatar.addEventListener("input", updatePreview);
  el.file.addEventListener("change", uploadAvatar);
  el.bio.addEventListener("input", updateBioCount);
  el.username.addEventListener("input", () => {
    const pos = el.username.selectionStart;
    el.username.value = el.username.value.toLowerCase();
    el.username.setSelectionRange(pos, pos);
  });

  document.addEventListener("auth:signed-in", (e) => {
    user = e.detail;
    profile = null;
    showView(location.hash.slice(1) || "table");
    loadProfile();
  });

  document.addEventListener("auth:signed-out", () => {
    uploads = [];
    user = null;
    profile = null;
    el.nudge.hidden = true;
    showView("table");
  });

  showView(location.hash.slice(1) || "table");
})();
