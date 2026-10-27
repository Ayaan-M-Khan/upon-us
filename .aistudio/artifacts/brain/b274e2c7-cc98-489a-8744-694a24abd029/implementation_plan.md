# Upon-Us: Interactive Mini-Games, Sound Synthesis, Ghost Mechanics & Lobby Controls

This update introduces four authentic interactive 2D task mini-games, procedural Web Audio SFX without external audio files, full ghost privileges (wall noclip, task completion, and haunt-only chat), deep host lobby configuration, and interior prop collision physics.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and gameplay choices have been confirmed and will guide the build:

- **Confirmed Decision 1 (Task Mini-Games)**: Full authentic 2D mini-games featuring interactive canvas/SVG mechanics:
  - *Fix Wiring*: 4 colored wire pins with smooth SVG drag-and-snap bezier lines.
  - *Swipe Card*: Velocity-tracked card swipe reader requiring consistent "goldilocks" speed (not too fast, not too slow) with realistic error feedback ("Too fast", "Too slow", "Bad read").
  - *Clear Asteroids*: 2D vector radar grid with click-to-destroy drifting space debris and laser reticle.
  - *Unlock Manifolds*: 10 numeric keypad buttons scrambled randomly on a 2x5 grid, requiring sequential ascending clicks 1 through 10 with error resets.
- **Confirmed Decision 2 (Lobby Customization)**: Host settings panel in the Dropship Lobby supporting live sliders and selectors for:
  - Player Speed (`0.75x` to `1.75x`)
  - Kill Cooldown (`10s` to `60s`)
  - Impostor Count (`1` or `2`)
  - Bot Fill & Bot Difficulty (`easy`, `medium`, `hard`)
- **Confirmed Decision 3 (Ghost Perks & Haunt Chat)**: Eliminated crewmates gain wall noclip (bypassing `resolveWallCollisions`), can freely approach and finish all assigned task mini-games to advance the global task progress bar, and communicate exclusively via a separated "Haunt Chat" channel invisible to living players.
- **Confirmed Decision 4 (Server Modularity & Deployment)**: Extract meeting vote tallies and Gemini bot discussion triggers cleanly, add `resolveCircleObstacleCollision` in `shared/physics.ts` for room props, and configure `server.ts` to statically serve `dist/` in production mode.

---

### 1. Overview & Core Concept

- **What It Does**: Upgrades Upon-Us into a feature-complete 3D social deduction experience where players not only explore The Skeld in full 3D, but also interact with tactile, hands-on 2D task mini-games, hear synthesized audio cues for every action, ghost-float through walls after dying to finish tasks, and customize match balance prior to launch.
- **Target Audience / Persona**: Multiplayer game groups, casual social deduction enthusiasts, and solo players playing alongside Gemini-driven AI bots.
- **Key Value**: Replaces passive waiting and progress bars with genuine gameplay tension, tactile mini-games, rich audio immersion, and fair ghost involvement.

---

### 2. User Experience & Visual Design

#### Key User Flows
1. **Lobby Customization**: The room host opens the Settings tab in the Dropship, tweaks Player Speed, Kill Cooldown, Impostors, and Bot Count/Difficulty. Changes instantly sync in real-time to all connected players via Socket.IO.
2. **Task Mini-Game Engagement**: Approaching a highlighted task station in 3D and pressing `USE` opens a retro-futuristic task modal:
   - *Fix Wiring*: Player drags wire ends from left terminals to matching color right terminals. Snapping all 4 completes the task with a triumphant two-tone chime.
   - *Swipe Card*: Player drags their crew badge across the reader. A velocity tracker ensures realistic pacing.
   - *Clear Asteroids*: Player fires targeting lasers at 10 moving space asteroids on a green vector radar screen.
   - *Unlock Manifolds*: Player taps numbered pads 1 through 10 in order; misclicks buzz and reset the sequence.
3. **Audio Immersion**: Every interaction produces an authentic synthesized sound: Emergency sirens, reactor alarms, vent thuds, footstep rhythms, card swipe clicks, and victory chimes.
4. **Ghost Haunting**: When killed or voted out, player avatars become translucent white spectres. Wall collision is disabled, enabling direct phasing through ship bulkheads to complete remaining tasks and chat in the private Haunt Channel.

#### Visual Identity & Theme
- **Aesthetic Direction**: Sci-fi industrial retro-futurism inspired by spaceship control terminals, CRT monitors, and utilitarian space equipment.
- **Color Palette & Theme Tokens**:
  - Neutral Canvas: Deep space obsidian (`#090d16`), hull slate (`#1e293b`), terminal dark glass (`#0f172a`).
  - Terminal Surfaces: Muted teal-tinted gunmetal (`#1e293b`), hairline borders (`rgba(255, 255, 255, 0.1)`).
  - Accent Tints: Reactor Red (`#ef4444`), Terminal Amber (`#f59e0b`), Wiring Yellow/Blue/Red/Magenta (`#eab308`, `#3b82f6`, `#ef4444`, `#ec4899`), Laser Cyan (`#06b6d4`), Radar Green (`#10b981`).
- **Typography & Layout**:
  - Display Headers: High-contrast geometric sans (`Plus Jakarta Sans`) with balanced headline widths.
  - Terminal Readouts & Keypads: Tabular figures (`font-mono tabular-nums`) for numeric sequencing, countdowns, and swipe telemetry.

---

### 3. Key Product Decisions & Trade-Offs

- **Procedural Web Audio API vs External MP3 Assets**:
  - *Chosen Approach*: Synthesize all SFX (Emergency siren, body report sting, vent clank, footstep clicks, card swipe, task chime) using Web Audio oscillators, biquad filters, and noise buffers in `src/audio.ts`.
  - *Why*: Eliminates network latency, 404 errors, CDN blocking, and cross-origin audio decode failures. Works reliably across all environments.
- **Client-Side Mini-Game Validation with Server-Authoritative Completion**:
  - *Chosen Approach*: The client runs the reactive mini-game physics and UI puzzles (drag vectors, speed calculations, asteroid hits) and emits a single verified `task:complete` event to the server upon success.
  - *Why*: Ensures zero-latency 60fps drag-and-drop feedback for the player without being impacted by WebSocket ping.
- **Ghost Wall Phasing**:
  - *Chosen Approach*: In `src/render/gameScene.ts` and `shared/physics.ts`, if `localPlayer.isAlive === false`, the movement loop bypasses `resolveWallCollisions` and allows smooth noclip across ship walls.
  - *Why*: Directly recreates the canonical ghost experience, making dead players feel empowered to wrap up tasks quickly.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        UPON-US ARCHITECTURE                            │
└────────────────────────────────────────────────────────────────────────┘

 [ Client: React + Three.js ]
    │
    ├── 3D Viewport (`src/render/gameScene.ts`)
    │     ├── Local Player Controller (Movement, Speed multiplier, Ghost noclip)
    │     ├── Raycast Line-of-Sight & Fog of War
    │     └── Proximity & Interaction Sensors (`USE` button dispatcher)
    │
    ├── Task Mini-Games (`src/ui/taskMiniGames.tsx`)
    │     ├── FixWiringModal (SVG drag wires, color matching)
    │     ├── SwipeCardModal (Pointer drag, velocity analysis)
    │     ├── ClearAsteroidsModal (Vector canvas, target reticle)
    │     └── UnlockManifoldsModal (1-10 ascending button matrix)
    │
    ├── Audio Engine (`src/audio.ts`)
    │     ├── Synthesis nodes: Sirens, Clanks, Stings, Chimes, Footsteps
    │
    └── UI Overlays (`src/ui/gameOverlays.tsx`, `src/ui/chatOverlay.tsx`, `src/ui/lobby.tsx`)
          ├── Haunt Chat (Ghost-only messaging tab)
          └── Host Settings Drawer (Live synced game configuration)
    │
    ▲ (Socket.IO Real-Time Events)
    ▼
 [ Server: Node / Express + Socket.IO (`server/`) ]
    │
    ├── Lobby Manager (`server/lobbyManager.ts`)
    │     └── Custom GameSettings sync (speed, kill cooldown, impostor count, bots)
    │
    ├── Game Room (`server/game/GameRoom.ts`)
    │     ├── Sabotage Manager (`server/game/sabotage.ts`)
    │     ├── Meeting & Gemini Bot AI (`server/game/meeting.ts`)
    │     ├── Task Manager (`server/game/tasks.ts`)
    │     └── Ghost Haunt Chat routing
    │
    └── Static Build Serving (`server.ts`)
          └── Serves `dist/` when `NODE_ENV === "production"`
```

#### State & Event Mapping
- `settings:update` (Host -> Server -> Room): Broadcasts new speed, cooldown, impostor count, and bot configuration.
- `chat:message` (Client -> Server -> Room): Checks sender's `isAlive` state; if dead, filters and broadcasts only to sockets of dead players (`Haunt Chat`).
- `task:complete` (Client -> Server): Authoritatively updates remaining tasks and advances the shared progress bar.
- `soundEngine`: Triggers synthesized audio for all UI and game events.
