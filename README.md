# Albokemon Backend (Socket.IO)

Small real-time backend for a turn-based “Pokémon-style” battler.
Current scope:
- Login (guest name)
- Lobby (connected users)
- Match invites + accept/decline
- Match room creation (battle logic comes later)

---

## Architecture

This project uses a **feature-based / vertical-slice architecture** with a thin Socket.IO transport layer:

- `src/index.js`  
  **Composition root / bootstrap**. Creates the HTTP server + Socket.IO instance and registers handlers.

- `src/socket/*`  
  **Transport layer**. Socket.IO wiring + event name constants + handler registration.

- `src/features/*`  
  **Vertical slices** (feature modules) that own:
  - `*.socket.js` → socket event handlers (transport-facing)
  - `*.store.js`  → in-memory state (presence, invites, matches)
  - `*.service.js` (optional) → pure business logic helpers

- `src/shared/*`  
  Cross-cutting utilities (logger, ids, errors, etc).

This keeps Socket.IO plumbing isolated while each feature stays cohesive and easy to extend.

---

## Feature Overview

### Auth
Handles guest login by name. Server assigns a unique user id.
If a name is already in use, server can auto-suffix it (`Name (2)`, `Name (3)`, ...).

### Lobby
Tracks connected/logged-in users in memory. Provides:
- a one-time snapshot list (`lobby/list` → `lobby/users`)
- push updates whenever users connect/disconnect (`lobby/updated`)

### Match
Allows a user to invite another user to a match. Uses:
- in-memory pending invites
- in-memory active match map (prevents double matches)
- match room: `match_<uuid>`

## MongoDB persistence
- Store users + assigned Pokémon (cache)
- Store battles/matches (history)
- Store events/telemetry (analytics/debugging)

---

## Event Protocol

### Auth
**Client → Server**
- `auth/login`  
  Payload: `{ name: string }`

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
  Payload (current implementation): `{ targetUser: string }`  
  *(recommended rename: `{ targetUserId: string }`)*

- `match/accept`  
  Payload: `{ fromUserId: string }`

- `match/decline`  
  Payload: `{ fromUserId: string }`

**Server → Client**
- `match/invite` (sent to target user)  
  Payload: `{ fromUserId: string, fromName: string }`

- `match/start` (sent to both users in match room)  
  Payload: `{ matchId: string, roomId: string, p1: {id: string}, p2: {id: string} }`
  *(names can be included if desired)*

- `match/declined` (optional; decline/offline/expired notifications)  
  Payload: `{ byUserId: string, reason?: "declined" | "offline" | "expired" }`

- `err`  
  Payload: `{ code: string, msg: string }`

---

## Pending Features (Planned)
- **Battle system**
  - Turn-based actions (moves), damage calculation, status, win/lose state machine.
  - Authoritative server resolution + event log for client animations.

---

## Notes

- State is currently **in-memory** (suitable for local dev / MVP). For production scaling you’d move:
  - lobby presence → Redis or a shared presence service
  - match invites/matches → Redis/DB + sticky sessions or Socket.IO adapter
- Client should treat `lobby/list` as a “snapshot” request, and rely on `lobby/updated` for live changes.
- Match invites should be cleared on disconnect and/or expired via TTL to avoid stale entries.