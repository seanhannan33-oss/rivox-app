// The admin page. Static HTML: no member data and no secrets are in it.
// It asks for the admin token, keeps it in memory for that tab only, and calls /admin/drops.
export const ADMIN_PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Rivox app admin</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #071224; color: #fff; font: 16px/1.5 -apple-system, system-ui, "Segoe UI", sans-serif; }
  .bar { height: 6px; background: #ED145B; }
  main { max-width: 640px; margin: 0 auto; padding: 24px 20px 64px; }
  h1 { font-size: 28px; margin: 8px 0 4px; }
  h2 { font-size: 18px; margin: 32px 0 12px; }
  p.sub { color: #CBD5E0; margin: 0 0 16px; }
  label { display: block; font-size: 12px; font-weight: 700; letter-spacing: 1px; color: #A0AEC0; margin: 16px 0 6px; }
  input, select, textarea { width: 100%; background: #1C2638; color: #fff; border: 1px solid #2C3A52; border-radius: 12px; padding: 12px 14px; font: inherit; }
  textarea { min-height: 84px; resize: vertical; }
  input:focus, select:focus, textarea:focus, button:focus-visible { outline: 2px solid #FFE500; outline-offset: 2px; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media (max-width: 520px) { .row { grid-template-columns: 1fr; } }
  button { font: inherit; font-weight: 800; border: 0; border-radius: 12px; min-height: 48px; padding: 0 18px; cursor: pointer; }
  .primary { background: #FFE500; color: #071224; width: 100%; margin-top: 20px; }
  .ghost { background: transparent; color: #FFE500; border: 2px solid #FFE500; }
  .danger { background: transparent; color: #ED145B; border: 2px solid #ED145B; }
  button:disabled { opacity: .5; cursor: default; }
  .hint { font-size: 13px; color: #A0AEC0; margin: 6px 0 0; }
  .msg { margin: 14px 0 0; font-weight: 700; min-height: 24px; }
  .msg.bad { color: #ED145B; } .msg.good { color: #FFE500; }
  .card { background: #1C2638; border: 1px solid #2C3A52; border-radius: 16px; padding: 16px; margin-bottom: 12px; }
  .tag { font-size: 11px; font-weight: 800; letter-spacing: 1px; color: #A0AEC0; }
  .tag b { color: #FFE500; } .tag i { color: #ED145B; font-style: normal; }
  .card h3 { margin: 6px 0 4px; font-size: 20px; }
  .card p { margin: 0 0 8px; color: #CBD5E0; }
  .card a { color: #FFE500; word-break: break-all; font-size: 13px; }
  .actions { display: flex; gap: 8px; margin-top: 12px; }
  .box { background: #0B1830; border: 1px dashed #2C3A52; border-radius: 12px; padding: 12px 14px 14px; margin-top: 16px; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<div class="bar"></div>
<main>
  <h1>Rivox app admin</h1>
  <p class="sub">Post deals and flavor drops to the Drops tab.</p>

  <section id="gate">
    <label for="token">ADMIN TOKEN</label>
    <input id="token" type="password" autocomplete="off" spellcheck="false">
    <p class="hint">The ADMIN_TOKEN value from the server settings. It stays in this tab only and is gone when you close it.</p>
    <button class="primary" id="unlock">UNLOCK</button>
    <p class="msg bad" id="gateMsg" role="alert"></p>
  </section>

  <section id="app" hidden>
    <h2 id="formTitle">New drop</h2>
    <div class="row">
      <div>
        <label for="kind">TYPE</label>
        <select id="kind"><option value="deal">App-only deal</option><option value="flavor">Flavor drop</option></select>
      </div>
      <div>
        <label for="audience">WHO SEES IT</label>
        <select id="audience"><option value="all">Every member</option><option value="no_curfew">No Curfew subscribers</option><option value="pouches">Pouch subscribers</option></select>
      </div>
    </div>
    <label for="title">HEADLINE (60 max)</label>
    <input id="title" maxlength="60">
    <label for="body">DETAILS (240 max)</label>
    <textarea id="body" maxlength="240"></textarea>
    <label for="cta">BUTTON TEXT (28 max)</label>
    <input id="cta" maxlength="28" value="CLAIM IT">

    <div class="box">
      <div class="tag">LINK BUILDER: DISCOUNT THAT APPLIES ITSELF</div>
      <div class="row">
        <div><label for="code">SHOPIFY DISCOUNT CODE</label><input id="code" autocapitalize="characters" spellcheck="false"></div>
        <div><label for="path">SEND THEM TO</label><input id="path" placeholder="/products/..." spellcheck="false"></div>
      </div>
      <p class="hint">Create the discount in Shopify first. Tapping the link applies it, then lands them on that page.</p>
    </div>
    <label for="url">LINK</label>
    <input id="url" inputmode="url" spellcheck="false" placeholder="https://rivoxlabs.com/...">

    <div class="row">
      <div><label for="startsAt">STARTS (blank = now)</label><input id="startsAt" type="datetime-local"></div>
      <div><label for="endsAt">ENDS (blank = until removed)</label><input id="endsAt" type="datetime-local"></div>
    </div>
    <label style="display:flex;align-items:center;gap:10px;margin-top:20px;letter-spacing:0;font-size:15px;color:#fff;font-weight:600">
      <input id="alsoPush" type="checkbox" style="width:22px;height:22px;flex:none"> Also send a push about it
    </label>
    <p class="hint">Sends the headline and details to the phones of everyone who sees this drop. Goes out when you post, so leave it off for a scheduled drop.</p>
    <button class="primary" id="save">POST IT</button>
    <button class="ghost" id="cancel" hidden style="width:100%;margin-top:8px">CANCEL EDIT</button>
    <p class="msg" id="formMsg" role="status"></p>

    <h2>Posted</h2>
    <div id="list"></div>
    <p class="hint" id="empty" hidden>Nothing posted yet.</p>

    <h2>Send a push</h2>
    <p class="sub">Straight to members' lock screens. Use it like you mean it.</p>
    <label for="pAudience">WHO GETS IT</label>
    <select id="pAudience"><option value="all">Every member</option><option value="no_curfew">No Curfew subscribers</option><option value="pouches">Pouch subscribers</option></select>
    <label for="pTitle">TITLE (50 max)</label>
    <input id="pTitle" maxlength="50">
    <label for="pBody">MESSAGE (150 max)</label>
    <textarea id="pBody" maxlength="150"></textarea>
    <label for="pTab">A TAP OPENS</label>
    <select id="pTab"><option value="drops">Drops</option><option value="today">Today</option></select>
    <button class="primary" id="pSend">CHECK WHO GETS IT</button>
    <button class="ghost" id="pCancel" hidden style="width:100%;margin-top:8px">CANCEL</button>
    <p class="msg" id="pMsg" role="status"></p>
    <p class="hint" id="whoami" style="margin-top:32px"></p>
  </section>
</main>
<script>
(function () {
  var token = "", editing = null, drops = [];
  var $ = function (id) { return document.getElementById(id); };
  var SITE = "https://rivoxlabs.com";

  function api(method, path, body) {
    return fetch(path, {
      method: method,
      headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.message || (res.status === 401 ? "Wrong token." : "Something broke. Try again."));
        return data;
      });
    });
  }

  function toLocalInput(ms) {
    if (!ms) return "";
    var d = new Date(ms), p = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function fromLocalInput(v) { return v ? new Date(v).toISOString() : null; }
  function when(ms) { return new Date(ms).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function render() {
    var list = $("list");
    list.replaceChildren();
    $("empty").hidden = drops.length > 0;
    drops.forEach(function (d) {
      var card = el("div", "card");
      var tag = el("div", "tag");
      var state = d.live ? el("b", "", "LIVE") : el("i", "", d.startsAt > Date.now() ? "SCHEDULED" : "ENDED");
      tag.append(state, " · " + (d.kind === "deal" ? "APP-ONLY DEAL" : "FLAVOR DROP") + " · " +
        (d.audience === "all" ? "EVERY MEMBER" : d.audience === "no_curfew" ? "NO CURFEW" : "POUCHES"));
      var link = el("a", "", d.url);
      link.href = d.url; link.target = "_blank"; link.rel = "noopener noreferrer";
      var times = el("p", "hint", "Starts " + when(d.startsAt) + (d.endsAt ? " · Ends " + when(d.endsAt) : " · No end date"));
      var actions = el("div", "actions");
      var edit = el("button", "ghost", "EDIT");
      edit.onclick = function () { startEdit(d); };
      var del = el("button", "danger", "REMOVE");
      del.onclick = function () {
        if (del.dataset.sure !== "1") { del.dataset.sure = "1"; del.textContent = "TAP AGAIN TO REMOVE"; return; }
        del.disabled = true;
        api("DELETE", "/admin/drops/" + encodeURIComponent(d.id)).then(load).catch(function (e) { say("formMsg", e.message, false); });
      };
      actions.append(edit, del);
      card.append(tag, el("h3", "", d.title), el("p", "", d.body), el("p", "hint", "Button: " + d.cta), link, times, actions);
      list.append(card);
    });
  }

  function say(id, text, good) { var m = $(id); m.textContent = text; m.className = "msg " + (good ? "good" : "bad"); }

  function load() {
    return api("GET", "/admin/drops").then(function (data) { drops = data.drops || []; render(); });
  }

  function reset() {
    editing = null;
    ["title", "body", "code", "path", "url", "startsAt", "endsAt"].forEach(function (id) { $(id).value = ""; });
    $("cta").value = "CLAIM IT"; $("kind").value = "deal"; $("audience").value = "all";
    $("formTitle").textContent = "New drop"; $("save").textContent = "POST IT"; $("cancel").hidden = true;
    $("alsoPush").checked = false; $("alsoPush").disabled = false;
  }

  function startEdit(d) {
    editing = d.id;
    $("kind").value = d.kind; $("audience").value = d.audience; $("title").value = d.title; $("body").value = d.body;
    $("cta").value = d.cta; $("url").value = d.url; $("code").value = ""; $("path").value = "";
    $("startsAt").value = toLocalInput(d.startsAt); $("endsAt").value = toLocalInput(d.endsAt);
    $("formTitle").textContent = "Edit drop"; $("save").textContent = "SAVE CHANGES"; $("cancel").hidden = false;
    $("alsoPush").checked = false; $("alsoPush").disabled = true;
    say("formMsg", "", true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function buildLink() {
    var code = $("code").value.trim(), path = $("path").value.trim();
    if (!code) return;
    if (path && path.charAt(0) !== "/") path = "/" + path;
    $("url").value = SITE + "/discount/" + encodeURIComponent(code) + (path ? "?redirect=" + encodeURIComponent(path) : "");
  }
  $("code").addEventListener("input", buildLink);
  $("path").addEventListener("input", buildLink);
  $("kind").addEventListener("change", function () {
    if (!editing && ($("cta").value === "CLAIM IT" || $("cta").value === "GET FIRST TINS")) {
      $("cta").value = $("kind").value === "deal" ? "CLAIM IT" : "GET FIRST TINS";
    }
  });

  $("unlock").onclick = function () {
    token = $("token").value.trim();
    if (!token) return say("gateMsg", "Enter the token.", false);
    $("unlock").disabled = true;
    load().then(function () {
      $("token").value = ""; $("gate").hidden = true; $("app").hidden = false;
      api("GET", "/admin/whoami").then(function (w) {
        $("whoami").textContent = "Server sees you at " + (w.ip || "an unknown address") + " (" + w.forwarded + " forwarded, trusting " + w.trustedHops + "). This should match your own IP address.";
      }).catch(function () {});
    }).catch(function (e) { token = ""; say("gateMsg", e.message, false); })
      .finally(function () { $("unlock").disabled = false; });
  };
  $("token").addEventListener("keydown", function (e) { if (e.key === "Enter") $("unlock").click(); });

  $("cancel").onclick = function () { reset(); say("formMsg", "", true); };

  // Push: first tap counts the phones, second tap sends. Editing anything resets it.
  var pushArmed = false;
  function pushBody() {
    return { title: $("pTitle").value, body: $("pBody").value, audience: $("pAudience").value, tab: $("pTab").value };
  }
  function disarm() { pushArmed = false; $("pSend").textContent = "CHECK WHO GETS IT"; $("pCancel").hidden = true; }
  ["pTitle", "pBody", "pAudience", "pTab"].forEach(function (id) { $(id).addEventListener("input", disarm); });
  $("pCancel").onclick = function () { disarm(); say("pMsg", "", true); };
  $("pSend").onclick = function () {
    var body = pushBody();
    $("pSend").disabled = true;
    if (!pushArmed) {
      body.preview = true;
      api("POST", "/admin/push", body).then(function (r) {
        if (r.phones === 0) { say("pMsg", "No phones would get this. Nobody in that group has alerts on yet.", false); return; }
        pushArmed = true;
        $("pSend").textContent = "SEND TO " + r.phones + (r.phones === 1 ? " PHONE" : " PHONES"); $("pCancel").hidden = false;
        say("pMsg", "This can't be unsent.", true);
      }).catch(function (e) { say("pMsg", e.message, false); })
        .finally(function () { $("pSend").disabled = false; });
      return;
    }
    api("POST", "/admin/push", body).then(function (r) {
      disarm(); $("pTitle").value = ""; $("pBody").value = "";
      say("pMsg", "Sent to " + r.sent + (r.sent === 1 ? " phone" : " phones") + (r.failed ? ". " + r.failed + " failed." : "."), r.failed === 0);
    }).catch(function (e) { say("pMsg", e.message, false); })
      .finally(function () { $("pSend").disabled = false; });
  };

  $("save").onclick = function () {
    var body = {
      kind: $("kind").value, audience: $("audience").value, title: $("title").value, body: $("body").value,
      cta: $("cta").value, url: $("url").value,
      startsAt: fromLocalInput($("startsAt").value), endsAt: fromLocalInput($("endsAt").value)
    };
    $("save").disabled = true;
    var wasEdit = editing;
    (wasEdit ? api("PUT", "/admin/drops/" + encodeURIComponent(wasEdit), body) : api("POST", "/admin/drops", body))
      .then(function () {
        var push = !wasEdit && $("alsoPush").checked;
        reset();
        say("formMsg", wasEdit ? "Saved." : "Posted. Members see it now, or when it starts.", true);
        if (!push) return load();
        return api("POST", "/admin/push", { title: body.title.slice(0, 50), body: body.body.slice(0, 150), audience: body.audience, tab: "drops" })
          .then(function (r) { say("formMsg", "Posted, and pushed to " + r.sent + (r.sent === 1 ? " phone." : " phones."), true); })
          .catch(function (e) { say("formMsg", "Posted, but the push failed: " + e.message, false); })
          .then(load);
      })
      .catch(function (e) { say("formMsg", e.message, false); })
      .finally(function () { $("save").disabled = false; });
  };
})();
</script>
</body>
</html>`;
