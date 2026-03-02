const battles = new Map(); // matchId -> state

export function createBattle({ matchId, roomId, p1, p2, p1Team, p2Team }) {
    // Active = slot 0 only (MVP)
    const p1Active = p1Team[0];
    const p2Active = p2Team[0];

    const state = {
        matchId,
        roomId,
        phase: "ACTIVE", // ACTIVE | FINISHED
        turn: 1,
        turnUserId: p1.id, // placeholder, its calculated below.
        players: {
            [p1.id]: { id: p1.id, name: p1.name, team: p1Team, activeIndex: 0 },
            [p2.id]: { id: p2.id, name: p2.name, team: p2Team, activeIndex: 0 },
        },
        active: {
            [p1.id]: {
                ...p1Team[0],
                maxHp: Number(p1Team[0].hp ?? 0),
                currentHp: Number(p1Team[0].hp ?? 0),
            },
            [p2.id]: {
                ...p2Team[0],
                maxHp: Number(p2Team[0].hp ?? 0),
                currentHp: Number(p2Team[0].hp ?? 0),
            },
        },
        winnerId: null,
        eventsLog: []
    };

    // after you compute p1Active and p2Active
    const p1Speed = Number(p1Active.speed ?? 0);
    const p2Speed = Number(p2Active.speed ?? 0);

    const firstTurnUserId =
        p1Speed > p2Speed ? p1.id :
            p2Speed > p1Speed ? p2.id :
                p1.id; // tie-breaker (or random)

    state.turnUserId = firstTurnUserId;

    battles.set(matchId, state);
    return state;
}

export function getBattle(matchId) {
    return battles.get(matchId);
}

export function deleteBattle(matchId) {
    battles.delete(matchId);
}