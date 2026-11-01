const DEFAULT_STATE = null;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function setWinner(m) {
  let sa = 0, sb = 0;
  for (const s of m.sets || []) {
    if (s[0] === "" || s[1] === "") continue;
    if (Number(s[0]) > Number(s[1])) sa++;
    else if (Number(s[1]) > Number(s[0])) sb++;
  }
  return sa > sb ? 0 : sb > sa ? 1 : -1;
}

function computeStandings(state) {
  const out = state.players.map((p, i) => ({
    player_id: p.id || "p" + i,
    name: p.name,
    sets: 0,
    sets_lost: 0,
    matches: 0,
    wins: 0,
    losses: 0,
    games: 0,
    games_lost: 0,
  }));
  for (const r of state.rounds || []) {
    for (const m of r.matches || []) {
      const w = setWinner(m);
      if (w === -1) continue;
      for (const s of m.sets || []) {
        if (s[0] === "" || s[1] === "" || s[0] === s[1]) continue;
        const a = Number(s[0]);
        const b = Number(s[1]);
        for (const i of m.a) {
          out[i].games += a;
          out[i].games_lost += b;
          if (a > b) out[i].sets++;
          else out[i].sets_lost++;
        }
        for (const i of m.b) {
          out[i].games += b;
          out[i].games_lost += a;
          if (b > a) out[i].sets++;
          else out[i].sets_lost++;
        }
      }
      for (const i of m.a) {
        out[i].matches++;
        if (w === 0) out[i].wins++;
        else out[i].losses++;
      }
      for (const i of m.b) {
        out[i].matches++;
        if (w === 1) out[i].wins++;
        else out[i].losses++;
      }
    }
  }
  out.sort((a, b) =>
    b.sets - a.sets ||
    (b.games - b.games_lost) - (a.games - a.games_lost) ||
    b.wins - a.wins ||
    a.name.localeCompare(b.name, "es")
  );
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API: load state
    if (url.pathname === "/api/state" && request.method === "GET") {
      const row = await env.DB.prepare(
        "SELECT data FROM state WHERE id = 'main'"
      ).first();
      if (!row) return json(null);
      try {
        return json(JSON.parse(row.data));
      } catch {
        return json(null);
      }
    }

    // API: save state
    if (url.pathname === "/api/state" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ ok: false, error: "invalid json" }, 400);
      }
      const data = JSON.stringify(body);
      await env.DB.prepare(
        "INSERT INTO state (id, data, updated_at) VALUES ('main', ?, datetime('now')) " +
          "ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
      )
        .bind(data)
        .run();

      // recompute and store standings
      const standings = computeStandings(body);
      const stmts = [env.DB.prepare("DELETE FROM standings")];
      for (const s of standings) {
        stmts.push(
          env.DB.prepare(
            "INSERT INTO standings (player_id, name, sets, sets_lost, matches, wins, losses, games, games_lost, updated_at) " +
              "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))"
          ).bind(
            s.player_id,
            s.name,
            s.sets,
            s.sets_lost,
            s.matches,
            s.wins,
            s.losses,
            s.games,
            s.games_lost
          )
        );
      }
      await env.DB.batch(stmts);

      return json({ ok: true, standings });
    }

    // API: load standings
    if (url.pathname === "/api/standings" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT * FROM standings ORDER BY sets DESC, (games - games_lost) DESC, wins DESC, name ASC"
      ).all();
      return json(results || []);
    }

    // Static assets
    let response = await env.ASSETS.fetch(request);
    if (response.status === 404) {
      response = await env.ASSETS.fetch(
        new Request(new URL("/index.html", request.url), request)
      );
    }
    return response;
  },
};
