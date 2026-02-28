const BASE = process.env.POKE_API;

function requireBase() {
    if (!BASE) throw new Error("Missing env POKEMON_API_BASE");
}

async function fetchJson(url, { timeoutMs = 5000 } = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        return await res.json();
    } finally {
        clearTimeout(t);
    }
}

function sampleN(arr, n) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, n);
}

function normalizeDetail(resp) {
    if (!resp?.success || !resp?.data) throw new Error("Pokemon detail invalid");
    const p = resp.data;

    return {
        id: p.id,
        name: p.name,
        type: p.type ?? [],
        hp: Number(p.hp ?? 0),
        attack: Number(p.attack ?? 0),
        defense: Number(p.defense ?? 0),
        speed: Number(p.speed ?? 0),
        sprite: p.sprite, // gif url
    };
}

export async function assignPokemonsForMatch() {
    requireBase();

    // /list -> { success, total, data: [{id,name,sprite}, ...] }
    const listResp = await fetchJson(`${BASE}/list`, { timeoutMs: 5000 });
    const list = listResp?.data;

    if (!listResp?.success || !Array.isArray(list) || list.length < 6) {
        throw new Error("Pokemon list invalid/too small");
    }

    const picked = sampleN(list, 6); // each has id/name/sprite
    const ids = picked.map((p) => p.id);

    // /list/:id -> { success, data: {...full detail...} }
    const details = await Promise.all(
        ids.map((id) => fetchJson(`${BASE}/list/${id}`, { timeoutMs: 5000 }))
    );

    const pokemon = details.map(normalizeDetail);

    return {
        p1Team: pokemon.slice(0, 3),
        p2Team: pokemon.slice(3, 6),
    };
}