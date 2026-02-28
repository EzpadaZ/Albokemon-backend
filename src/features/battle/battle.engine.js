// src/features/battle/battle.engine.js
export function applyAttack(state, attackerId) {
    const pids = Object.keys(state.players);
    const defenderId = pids.find((id) => id !== attackerId);

    const atk = Number(state.active[attackerId]?.attack ?? 0);
    const def = Number(state.active[defenderId]?.defense ?? 0);

    let damage = atk - def;
    if (damage < 1) damage = 1;

    const before = Number(state.active[defenderId].currentHp ?? 0);
    const after = Math.max(0, before - damage);
    state.active[defenderId].currentHp = after;

    const events = [
        { type: "hit", from: attackerId, to: defenderId, damage, hpAfter: after },
    ];

    if (after === 0) {
        events.push({ type: "ko", who: defenderId });

        // ✅ try to auto-switch defender to next pokemon
        const defPlayer = state.players[defenderId];
        const nextIndex = (defPlayer.activeIndex ?? 0) + 1;

        if (nextIndex < defPlayer.team.length) {
            defPlayer.activeIndex = nextIndex;

            const nextPoke = defPlayer.team[nextIndex];
            state.active[defenderId] = {
                ...nextPoke,
                currentHp: Number(nextPoke.hp ?? 0),
            };

            events.push({
                type: "switch",
                who: defenderId,
                activeIndex: nextIndex,
                pokemon: { id: nextPoke.id, name: nextPoke.name, sprite: nextPoke.sprite },
            });

            // ✅ continue battle: next turn belongs to defender (simple rule)
            state.turn += 1;
            state.turnUserId = defenderId;
            return events;
        }

        // ✅ no more pokemons => attacker wins
        state.phase = "FINISHED";
        state.winnerId = attackerId;
        events.push({ type: "win", winnerId: attackerId, loserId: defenderId });
        return events;
    }

    // normal turn advance
    state.turn += 1;
    state.turnUserId = defenderId;
    return events;
}