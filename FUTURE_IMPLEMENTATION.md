# Future Implementation Steps

The map editor and collision system provide a foundation, but competitive multiplayer requires the server—not the browser—to own the match state. The phases below are ordered to establish trustworthy networking before expanding the game content.

## Phase 5: Server-Authoritative Multiplayer

This is the highest-priority milestone.

- Have clients send destinations or inputs instead of positions.
- Make the server own player positions, movement speed, collisions, health, damage, and cooldowns.
- Run the server simulation at a fixed tick rate.
- Broadcast periodic state snapshots to clients.
- Add client-side prediction, interpolation, and server reconciliation.
- Associate players with their socket or authenticated player ID.
- Send connection IDs only to the corresponding socket.
- Remove players and release match resources when they disconnect.
- Load map boundaries and walls into the server simulation.
- Share collision rules between the editor preview, client, and server without trusting client results.

The current position event must be replaced before the game can be competitive. Accepting coordinates reported by clients allows a modified client to teleport or ignore collisions.

## Phase 6: Matches and Rooms

- Create a separate Socket.IO room and state container for each match.
- Add a lobby, ready state, and match countdown.
- Assign players to teams.
- Add team-specific spawn points.
- Define match start, active, finished, and abandoned states.
- Add a match timer, scoreboard, and win/loss condition.
- Support rematches or returning to the lobby.
- Add a reconnection grace period and restore the player's current match state.
- Add spectator handling after the basic match lifecycle works.

Start with `1v1` or `2v2`. Larger matches will make networking, balancing, and testing substantially harder.

## Phase 7: Minimal MOBA Gameplay

- Add two teams with visually distinct players.
- Add health, death, respawning, and temporary invulnerability after spawning.
- Add a basic attack.
- Add two or three abilities with server-controlled cooldowns.
- Add server-side hit detection and damage validation.
- Add one clear objective, such as destroying a base or reaching a score target.
- Add a HUD for health, cooldowns, score, teams, and match time.
- Establish movement speed, attack range, damage, and cooldown configuration.

Items, minions, progression systems, and multiple heroes should wait until a small match with one character is consistently fun.

## Phase 8: Simple In-Game Chat

- Add match-wide and team chat channels.
- Attach usernames on the server rather than accepting a username with each message.
- Limit message length and validate every message.
- Render messages as text, never executable HTML.
- Add per-user chat rate limits and spam protection.
- Add mute controls.
- Add basic profanity filtering and player reporting.
- Optionally retain a short recent-message history for reconnecting players.
- Keep chat events separate from gameplay events and rate limits.

## Phase 9: Accounts and Competitive Identity

- Add registration and login, or use an external identity provider.
- Give every account a stable, non-sequential public player ID.
- Add unique display names and moderation rules.
- Store match history, wins, losses, and abandonment records.
- Add an initial MMR or Elo-style rating.
- Separate ranked and unranked matchmaking.
- Add leaver penalties only after reconnection is reliable.
- Add password recovery, session expiration, and logout invalidation if passwords are managed locally.

## Phase 10: Persistence and Matchmaking

Use a relational database such as PostgreSQL for:

- Accounts and authentication identities.
- Ratings and match results.
- Map definitions and map versions.
- Reports, mutes, suspensions, and bans.

Redis can be introduced when needed for:

- Matchmaking queues.
- Presence and short-lived session data.
- Active match discovery.
- Coordinating Socket.IO across multiple game-server processes.

Avoid making a database the source of truth for every simulation tick. Active match state should remain in the authoritative game process and persist only meaningful events or final results.

## Phase 11: Security and Anti-Cheat

- Use HTTPS and secure WebSockets in production.
- Authenticate every socket connection.
- Validate the allowed origin during connection setup.
- Authorize every event against the player's identity, team, and current match.
- Treat all client messages as untrusted input.
- Validate message schemas, types, ranges, and sizes.
- Rate-limit movement, abilities, matchmaking, authentication, and chat separately.
- Reject impossible movement, cooldown use, damage, and match-state transitions.
- Limit simultaneous connections per account and IP.
- Add heartbeat and idle-connection cleanup.
- Log authentication failures, invalid commands, rate-limit events, and abnormal disconnects without logging credentials or session tokens.

Relevant guidance: [OWASP WebSocket Security](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html).

## Phase 12: Reliability and Competitive Quality

- Display network latency and connection state.
- Recover gracefully from temporary disconnections.
- Add AFK detection.
- Handle server shutdowns without silently losing match results.
- Add structured logs and production error reporting.
- Monitor simulation tick duration, active matches, message rates, memory, and disconnects.
- Add automated load tests with simulated players.
- Test under latency, jitter, packet loss, and reconnect scenarios.
- Add regional servers only when player latency measurements justify them.
- Add replay or command-history storage for debugging disputed matches and cheating reports.

## Testing Requirements

Automated tests should cover at least:

- Movement and collision agreement between client and server.
- Map boundaries, individual walls, intersections, endpoints, and sliding.
- Invalid or malicious movement commands.
- Ability range, damage, cooldowns, death, and respawn.
- Match state transitions and win conditions.
- Joining, leaving, disconnecting, and reconnecting.
- Team and match chat isolation.
- Chat validation, escaping, muting, and rate limiting.
- Concurrent matches without state leaking between rooms.
- Server behavior under expected and excessive message rates.

## Immediate Server Cleanup

Before implementing new game content:

- Replace the global players array with per-match state.
- Stop accepting client-provided positions as truth.
- Replace sequential broadcast IDs with socket-scoped or authenticated IDs.
- Remove players on the Socket.IO `disconnect` event.
- Validate every incoming socket payload.
- Remove continuous position logging from production.
- Keep map editing endpoints restricted to authorized users before public deployment.

## Recommended Delivery Order

1. Authoritative movement and server-side map collision.
2. Client snapshots, interpolation, prediction, and reconciliation.
3. Match rooms, teams, lifecycle, and reconnect support.
4. One complete combat objective with health and respawning.
5. Simple team and match chat.
6. Accounts, match history, and unranked matchmaking.
7. Rating, ranked matchmaking, moderation, and operations.

Socket.IO remains suitable for this stage because it provides bidirectional low-latency communication, automatic reconnection, and options for scaling across servers. See the [Socket.IO documentation](https://socket.io/) for its current deployment and adapter guidance.
