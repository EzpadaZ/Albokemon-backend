# Albokemon Backend (Socket.IO)

Small real-time backend for a turn-based “Pokémon-style” battler.

Current scope:
- Guest login (unique name + user id)
- Lobby (connected users + live updates)
- Match invites + accept/decline
- Battle (MVP): assign Pokémon, turn order, attack-only, win/lose
- MongoDB persistence:
  - `matches` (match history + teams + winner + event log)
  - `login_history` (login metadata history)

---

## Architecture

This project uses a **feature-based / vertical-slice architecture** with a thin Socket.IO transport layer:

- `app.js`  
  Composition root / bootstrap. Creates Express HTTP server + Socket.IO instance, registers handlers, and initializes Mongo.

- `src/socket/*`  
  Transport layer. Socket.IO wiring + event constants + handler registration.

- `src/features/*`  
  Vertical slices (feature modules) that own:
  - `*.socket.js` → socket event handlers
  - `*.store.js`  → in-memory state (lobby, invites, matches, battles)
  - `*.service.js` (optional) → pure business logic helpers (e.g. Pokémon API)

- `src/shared/*`  
  Cross-cutting utilities (logger, mongo connection, etc).

This keeps Socket.IO plumbing isolated while each feature stays cohesive and easy to extend.

---

## Feature Overview

### Auth
- `auth/login` creates a user with a unique name.
- If the requested name already exists, it is auto-suffixed: `Name (2)`, `Name (3)`, etc.
- Saves an append-only login record in Mongo: `login_history`
  - includes client-provided `metadata` (sanitized + size-capped)

### Lobby
Tracks connected/logged-in users in memory.
- Snapshot request: `lobby/list` → `lobby/users`
- Live broadcast: `lobby/updated` on connect/disconnect

### Match
- Users can invite others and accept/decline.
- On accept:
  - Creates a match room: `match_<uuid>`
  - Assigns 3 Pokémon to each player from an external Pokémon API
  - Creates initial battle state and emits `match/start` and initial `battle/state`
- If Pokémon assignment fails:
  - Both clients receive an `err` and `match/declined` (reason: `error`)
  - Match is rolled back (no “stuck waiting”)

### Battle (MVP)
- Attack-only turn system
- First turn is assigned by **higher Speed stat** of the active Pokémon
- Server enforces sequential turns (rejects out-of-turn attacks)
- Emits `battle/state` with:
  - authoritative `state`
  - per-turn `events` (hit/ko/switch/win/etc)
- On disconnect mid-battle:
  - Remaining player wins
  - Final state is broadcast

---

## MongoDB Persistence

### `matches`
Stores match history and the final battle log (buffered in memory and written at match end).

- `_id`: `matchId`
- `roomId`
- `challengerName`, `challengedName`
- `cdate`, `udate`
- `winnerId`, `endReason`
- `challengerPokedex`, `challengedPokedex`
- `fasterPokemon` (who had the faster active Pokémon)
- `firstTurn` (first turn **name**)
- `events` (ordered, each with `ts`)

### `login_history`
Append-only history of logins.
- `userId`, `name`, `cdate`, `ip`
- `metadata` (sanitized / capped)

---

## Event Protocol

### Auth
**Client → Server**
- `auth/login`  
  Payload: `{ name: string, metadata?: object }`

**Server → Client**
- `auth/ok`  
  Payload: `{ user: { id: string, name: string } }`

- `err`  
  Payload: `{ code: string, msg: string }`

---

### Lobby
**Client → Server**
- `lobby/list`  
  Payload: `{}`

**Server → Client**
- `lobby/users` (reply to `lobby/list`)  
  Payload: `{ users: Array<{ id: string, name: string }> }`

- `lobby/updated` (broadcast)  
  Payload: `{ users: Array<{ id: string, name: string }> }`

---

### Match
**Client → Server**
- `match/request`  
  Payload: `{ targetUserId: string }`

- `match/accept`  
  Payload: `{ fromUserId: string }`

- `match/decline`  
  Payload: `{ fromUserId: string }`

**Server → Client**
- `match/invite` (sent to target user)  
  Payload: `{ fromUserId: string, fromName: string }`

- `match/start` (sent to both users in match room)  
  Payload:
  ```json
  {
    "matchId": "string",
    "roomId": "string",
    "p1": { "id": "string", "name": "string" },
    "p2": { "id": "string", "name": "string" },
    "pokemonByPlayerId": {
      "<playerId>": [ { "id": 1, "name": "...", "hp": 45, "attack": 49, "defense": 49, "speed": 45, "sprite": "..." } ]
    }
  }
  ```
- `match/declined`  
  Payload: `{ byUserId: string, reason?: "declined" | "offline" | "error" }`

- `err`  
  Payload: `{ code: string, msg: string }`

---

## Battle

### Client → Server
- `battle/sync`  
  Payload: `{ matchId: string }`

- `battle/attack`  
  Payload: `{ matchId: string }`

### Server → Client
- `battle/state`  
  Payload: `{ matchId: string, state: object, events: Array<object> }`

- `err`  
  Payload: `{ code: string, msg: string }`

---

## Pending Features (if i had time)

- Multiple moves / move selection  
- More robust persistence (e.g. store every action incrementally if needed)  
- Scaling considerations (Redis adapter, shared presence, etc.)

---

## Notes

- Lobby/match/battle state is currently **in-memory** (fine for MVP). Production scaling would require shared state (Redis, adapters, etc).
- `battle/sync` exists so clients can recover if they miss the initial `battle/state` broadcast.
- Pokémon API calls may time out; match accept handles this by notifying both players and rolling back.