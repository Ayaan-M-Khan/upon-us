# Upon-Us 🚀

A real-time, full 3D multiplayer social deduction game inspired by *Among Us*, built with **React**, **Three.js**, **Express**, **Socket.IO**, and **Google Gemini 2.5 Flash**.

Experience The Skeld in full 3D with server-authoritative physics, authentic bean crewmates, procedural sound effects, fog-of-war line-of-sight occlusion, interactive ship consoles, and AI bots powered by Gemini.

---

## 🎮 Game Overview

Players are crew aboard **The Skeld** deep in interstellar space. Among them lurk one or more **Impostors** whose mission is to sabotage critical ship systems and eliminate the crew before all tasks are completed.

- **Crewmates**: Complete all assigned short, long, and common tasks across the ship, report dead bodies, deduce who the killers are, and vote them out during Emergency Meetings.
- **Impostors**: Blend in, fake tasks, crawl through ventilation shafts, trigger critical sabotages (Reactor Meltdown, O2 Depletion, Lights Out, Door Locks), and eliminate crewmates without being caught.
- **Ghosts**: Slain crewmates become translucent ghosts who bypass walls and Fog-of-War, completing their remaining tasks to help the living crew win.

---

## ✨ Core Gameplay Mechanics

### 1. 🚨 Functional Sabotage System
Impostors have access to a tactical sabotage map with a 30-second shared cooldown:
- **Electrical Lights Out**: Plunges the ship into darkness. Crewmate vision radius shrinks to a tight 5-meter circle while Impostor vision remains normal. Crewmates must locate the electrical breaker panel in Electrical and flip all 5 switches to `[ON]` to restore lighting.
- **Reactor Meltdown (Critical)**: Triggers an intense 45-second emergency countdown and pulsing audible klaxons. Requires simultaneous override interaction at the dual handpads in Reactor. If the timer reaches 0, Impostors win immediately. Emergency meetings are prohibited during active critical meltdowns.
- **O2 Depletion (Critical)**: Vents life-support oxygen over 45 seconds. Crewmates must input emergency reset codes on keypads in O2 and Admin before suffocation occurs.
- **Door Locks (Cafeteria & Storage)**: Drops heavy 3D blast doors and impassable collision barriers across all doorways to the selected room for 10 seconds, trapping or dividing players.

### 2. 👁️ Fog-of-War & Line-of-Sight Occlusion
- Crewmates and Impostors cannot see other players or dead bodies through walls.
- Line-of-sight rays are cast in real time against ship geometry, prop furniture, and active blast doors.
- Characters and corpses outside line of sight or beyond the effective vision radius (further reduced when Lights are sabotaged) are dynamically hidden.
- Dead players (Ghosts) bypass Fog-of-War and see all living players and corpses across the entire ship.

### 3. 🪑 Interior Prop Collisions & Pathfinding
- Axis-Aligned Bounding Box (AABB) collision geometry covers all major furniture and props rendered in 3D:
  - Cafeteria Emergency Meeting Table & 4 Bench Tables
  - Reactor Core & Energy Rings
  - Upper & Lower Engine Blocks
  - MedBay Scanner Pad
  - Admin Hologram Table
  - Storage Cargo Crates
- Players and AI bots collide with and slide smoothly around props without snagging or clipping through tables.

### 4. 🤖 Gemini 2.5 Flash AI Bots
- Matches can be started with any group size (or tested solo); intelligent AI bots automatically fill empty seats up to the lobby minimum.
- In-game, bots pathfind via A* over the floor grid, execute task sequences, react to bodies, and flee or chase.
- During Emergency Meetings, bots utilize the `@google/genai` SDK (`gemini-2.5-flash`) to generate natural 1-sentence alibis, accusations, or defenses based on their actual game memory:
  - Their assigned role (Crewmate vs Impostor)
  - The room they were in when the body was found or meeting called
  - Tasks completed
  - Any players they witnessed committing murder
- A fast deterministic fallback library ensures uninterrupted gameplay if offline or when an API key is not present.

### 5. 🖥️ Interactive Consoles: Admin & Security
- **Admin Table**: Approaching the hologram table in Admin and pressing **USE** opens a live 2D schematic radar map displaying real-time biometric headcount badges of living crew in each room.
- **Security Terminal**: Approaching the monitors in Security and pressing **USE** opens a 4-channel CCTV surveillance feed (Cafeteria West Corridor, MedBay Spine, Navigation Hallway, and Security Spine) with live motion tracking indicators.

---

## ⌨️ Controls

| Action | Keyboard / Mouse | Touch / Mobile |
| :--- | :--- | :--- |
| **Move** | `W`, `A`, `S`, `D` or Arrow Keys | Virtual Touch Joystick |
| **Orbit Camera** | Click & Drag Mouse | Touch & Drag Screen |
| **Interact / USE** | `E` or `Space` | "USE" Action Button |
| **Report Body** | `R` | "REPORT" Action Button |
| **Kill (Impostor)** | `Q` | "KILL" Action Button |
| **Vent (Impostor)** | `F` | "VENT" Action Button |
| **Sabotage (Impostor)** | `G` | "SABOTAGE" Action Button |
| **Camera View** | `C` (Toggle 1st / 3rd Person) | HUD Camera Mode Toggle |
| **Ship Map** | `Tab` or `M` | HUD Map Button |
| **Push-to-talk** | Hold `V` | Voice HUD |
| **Cancel / Exit** | `Esc` | Modal Close Buttons |

---

## 🏗️ Architecture & Project Structure

The project uses a clean, decoupled client-server architecture:

```
upon-us/
├── server.ts                  # Server entry point running Express & Vite dev middleware
├── server/
│   ├── index.ts               # Express & Socket.IO server initialization
│   ├── lobbyManager.ts        # Custom lobby codes, player colors, and game settings
│   └── game/
│       ├── GameRoom.ts        # 20 Hz server-authoritative simulation room
│       ├── sabotage.ts        # Authoritative SabotageManager (cooldowns, timers, repairs)
│       ├── meeting.ts         # Meeting states & Gemini 2.5 Flash bot statement generator
│       ├── roles.ts           # Role distribution (Crewmates vs Impostors)
│       ├── tasks.ts           # Task definitions, steps, and progress tracking
│       └── stateMachine.ts    # Game state transitions (Lobby -> Playing -> Meeting -> GameOver)
├── shared/
│   ├── constants.ts           # Game settings, timings, speeds, colors, and bot names
│   ├── events.ts              # Typed Socket.IO event names, payloads, and snapshots
│   ├── mapData.ts             # Skeld layout, room bounds, prop colliders, door barriers
│   ├── physics.ts             # Circle-segment collision solver & line-of-sight raycasting
│   └── nav.ts                 # A* pathfinding and line-of-walk string pulling
└── src/
    ├── main.tsx               # Client React root
    ├── App.tsx                # High-level state router (Menu -> Lobby -> GameView)
    ├── net.ts                 # Client Socket.IO manager with reconnect handling
    ├── audio.ts               # Procedural Web Audio synthesizer (zero audio files needed)
    ├── render/
    │   ├── gameScene.ts       # 3D Three.js game world, Fog-of-War LOS, and player controller
    │   ├── map3D.ts           # Procedural 3D Skeld (floors, walls, props, animated blast doors)
    │   ├── crewmateModel.ts   # 3D bean character model with visor, backpack, and run cycle
    │   └── cameraController.ts# Smooth orbital 3rd-person & immersive 1st-person camera
    └── ui/
        ├── menu.tsx           # Main menu (Create game, Join game, How to play)
        ├── lobby.tsx          # 3D Dropship pre-game lobby with bean customization
        ├── gameView.tsx       # Active match container connecting 3D scene & overlays
        ├── gameHud.tsx        # In-game HUD, task progress, minimap, and action buttons
        ├── gameOverlays.tsx   # Admin radar, Security CCTV, Sabotage map, repair panels, meetings
        └── chatOverlay.tsx    # Team & proximity text chat
```

---

## 🚀 Setup & Installation

### Prerequisites
- **Node.js** (v18.0.0 or later)
- **npm** or **bun**

### 1. Clone & Install Dependencies
```bash
git clone <repository-url>
cd upon-us
npm install
```

### 2. Configure Environment Variables
Copy the example environment configuration:
```bash
cp .env.example .env
```

To enable Gemini-powered AI Bot discussions in Emergency Meetings, provide your Gemini API key in `.env`:
```env
GEMINI_API_KEY="your_api_key_here"
```
*(Note: If `GEMINI_API_KEY` is not provided, the game seamlessly falls back to a rich deterministic dialogue engine).*

### 3. Run Development Server
```bash
npm run dev
```

Open your browser at **`http://localhost:3000`**.

### 4. Build for Production
```bash
npm run build
npm start
```

---

## 🛡️ License
MIT License. Built with ❤️ for social deduction game enthusiasts.
