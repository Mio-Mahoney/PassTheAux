# PassTheAux Frontend API Contract

## Overview

The frontend communicates with SpaceTimeDB via the TypeScript SDK. All game state updates arrive through **real-time subscriptions** (no polling). Game actions are initiated by calling **reducers**.

**Key Principles:**

- Clients subscribe to table rows filtered by `room_id` (only see their room's data)
- Real-time updates arrive instantly when the server modifies state
- Reducers are called to initiate game actions (room creation, song submission, voting, etc.)
- No traditional REST endpoints; everything is subscription-based

---

## Real-Time Subscriptions (Events)

The frontend subscribes to these tables. When data changes on the server, the client receives updates instantly.

### 1. **Room State Updates**

**Subscribe to:**

```typescript
const room$ = db.Room.watch(room_id);
```

**Event: `room:state-changed`** — Game state transition

```typescript
interface RoomUpdateEvent {
  type: "room:state-changed";
  room: {
    id: u64;
    state: GameState; // LOBBY | SEED_SELECTION | LISTENING | SUBMISSION | VOTING | RESULTS
    current_round: u32;
    current_hot_seat_id: Option<u64>;
    seed_song_id: Option<u64>;
    seed_prompt: Option<string>;
    state_changed_at: i64; // Unix timestamp (ms)
  };
}

// Example: GameState enum
type GameState =
  | "LOBBY"
  | "SEED_SELECTION"
  | "LISTENING"
  | "SUBMISSION"
  | "VOTING"
  | "RESULTS";
```

**When it fires:**

- Host calls `start_game()` → state becomes `SEED_SELECTION`
- Hot seat submits seed → state becomes `LISTENING`
- Listening timer expires → state becomes `SUBMISSION`
- All songs submitted or timeout → state becomes `VOTING`
- All votes submitted or timeout → state becomes `RESULTS`
- Results displayed → state becomes `SEED_SELECTION` (next round) or game ends

---

### 2. **Player Presence & Status**

**Subscribe to:**

```typescript
const players$ = db.Player.watch({ room_id });
```

**Event: `players:joined`** — Player joined room

```typescript
interface PlayerJoinedEvent {
  type: "players:joined";
  player: {
    id: u64;
    room_id: u64;
    name: string;
    score: u32;
    is_host: bool;
    is_ready: bool;
    is_connected: bool;
    joined_at: i64;
  };
}
```

**Event: `players:updated`** — Player status changed

```typescript
interface PlayerUpdatedEvent {
  type: "players:updated";
  player: {
    id: u64;
    is_ready: bool; // Toggled by set_ready()
    score: u32; // Updated after scoring
    is_connected: bool; // Connection status
  };
}
```

**Event: `players:left`** — Player left room

```typescript
interface PlayerLeftEvent {
  type: "players:left";
  player_id: u64;
  reason: "disconnected" | "left" | "host_ended_game";
}
```

**When they fire:**

- New player joins via `join_room()` → `players:joined`
- Player toggles ready via `set_ready()` → `players:updated` (is_ready)
- All players voted → scores updated → `players:updated` (score)
- Player leaves → `players:left`

---

### 3. **Song Submissions**

**Subscribe to:**

```typescript
const songs$ = db.Song.watch({
  room_id,
  round_number: db.Room.current_round(),
});
```

**Event: `songs:seed-submitted`** — Hot seat picked a seed song

```typescript
interface SeedSubmittedEvent {
  type: "songs:seed-submitted";
  song: {
    id: u64;
    spotify_id: string;
    name: string;
    artist: string;
    album_cover_url: string;
    preview_url: string; // 30-sec MP3
    is_seed: true;
    submitted_at: i64;
  };
  prompt: Option<string>; // e.g., "songs with cities in the title"
}
```

**Event: `songs:submitted`** — Regular player submitted a song

```typescript
interface SongSubmittedEvent {
  type: "songs:submitted";
  song: {
    id: u64;
    submitter_id: u64; // Which player submitted it
    spotify_id: string;
    name: string;
    artist: string;
    album_cover_url: string;
    preview_url: string;
    is_seed: false;
    submitted_at: i64;
  };
}
```

**When they fire:**

- Hot seat calls `submit_seed_song()` → `songs:seed-submitted` (everyone hears the seed)
- Regular player calls `submit_song()` during SUBMISSION state → `songs:submitted`

---

### 4. **Ratings/Votes**

**Subscribe to:**

```typescript
const ratings$ = db.Rating.watch({ room_id, round_number });
```

**Event: `ratings:voted`** — Player submitted a vote

```typescript
interface RatingSubmittedEvent {
  type: "ratings:voted";
  rating: {
    id: u64;
    song_id: u64;
    rater_id: u64;
    score: u8; // 1–10
    rated_at: i64;
  };
}
```

**When it fires:**

- Player calls `submit_rating()` during VOTING state → `ratings:voted`
- Client uses this to show live rating progress (e.g., "3/5 players voted")

---

## Reducer Calls (Client Actions)

Reducers are functions the client calls to trigger game actions. They return results or errors.

### 1. **Room Creation**

```typescript
const createRoom = async (hostName: string): Promise<Room> => {
  const room = await db.create_room({
    host_name: hostName,
  });
  return room;
};

// Call:
const room = await createRoom("Alice");
// Response:
{
  id: 12345,
  host_id: 1001,
  join_code: "ABC123",
  name: "Alice's Game",
  state: "LOBBY",
  current_round: 0,
  current_hot_seat_id: null,
  seed_song_id: null,
  seed_prompt: null,
  created_at: 1718000000000,
  state_changed_at: 1718000000000,
}
```

---

### 2. **Join Room**

```typescript
const joinRoom = async (
  joinCode: string,
  playerName: string
): Promise<Player> => {
  const player = await db.join_room({
    join_code: joinCode,
    player_name: playerName,
  });
  return player;
};

// Call:
const player = await joinRoom("ABC123", "Bob");
// Response:
{
  id: 1002,
  room_id: 12345,
  name: "Bob",
  score: 0,
  is_host: false,
  is_ready: false,
  is_connected: true,
  joined_at: 1718000005000,
}
```

**Errors:**

- `"Room not found"` — Invalid code
- `"Room is full"` — Max 8 players reached
- `"Room already started"` — Can't join after LOBBY state
- `"Player already in room"` — Same player joining twice

---

### 3. **Toggle Ready**

```typescript
const toggleReady = async (playerId: u64): Promise<Player> => {
  return await db.set_ready({
    player_id: playerId,
  });
};

// Call:
const updated = await toggleReady(1002);
// Response: { ...player, is_ready: true, ...}
```

**When to call:** Player clicks "Ready" button in LOBBY state. Host waits for all players to be ready.

---

### 4. **Start Game**

```typescript
const startGame = async (hostId: u64, roomId: u64): Promise<Room> => {
  return await db.start_game({
    host_id: hostId,
    room_id: roomId,
  });
};

// Call:
const room = await startGame(1001, 12345);
// Response: { ...room, state: "SEED_SELECTION", current_hot_seat_id: 1003, ... }
```

**Preconditions:**

- Caller must be the host
- At least 2 players in room
- (Optional) All players ready

**Side effects:**

- Room state → `SEED_SELECTION`
- Random hot seat selected
- All clients receive room state update

---

### 5. **Search Spotify**

```typescript
interface SpotifyTrack {
  id: string;
  name: string;
  artist: string;
  album_cover_url: string;
  preview_url: string; // 30-sec MP3 URL; may be empty if unavailable
}

const searchSpotify = async (
  roomId: u64,
  query: string,
): Promise<SpotifyTrack[]> => {
  return await db.search_spotify({
    room_id: roomId,
    query: query,
  });
};

// Call:
const results = await searchSpotify(12345, "michael jackson");
// Response:
[
  {
    id: "spotify:track:ABC",
    name: "Billie Jean",
    artist: "Michael Jackson",
    album_cover_url: "https://...",
    preview_url: "https://p.scdn.co/mp3-preview/...",
  },
  // ... 4 more results
];
```

**Error handling:**

- On 429 (rate-limited): Show user "Too many searches. Try again in a moment."
- On 5xx: Show "Spotify is down. Try again later."
- No results: Return empty array; UI shows "No songs found"
- No preview: `preview_url` is empty string; UI shows "No preview available"

---

### 6. **Submit Seed Song**

```typescript
const submitSeedSong = async (
  roomId: u64,
  hotSeatId: u64,
  track: SpotifyTrack,
  prompt?: string
): Promise<Song> => {
  return await db.submit_seed_song({
    room_id: roomId,
    hot_seat_id: hotSeatId,
    spotify_track: track,
    prompt: prompt || null,
  });
};

// Call:
const song = await submitSeedSong(
  12345,
  1003, // hot seat player ID
  {
    id: "spotify:track:ABC",
    name: "Billie Jean",
    artist: "Michael Jackson",
    album_cover_url: "https://...",
    preview_url: "https://...",
  },
  "songs with cities in the title"
);
// Response:
{
  id: 5001,
  room_id: 12345,
  round_number: 0,
  submitter_id: 1003,
  spotify_id: "spotify:track:ABC",
  name: "Billie Jean",
  artist: "Michael Jackson",
  album_cover_url: "https://...",
  preview_url: "https://...",
  is_seed: true,
  submitted_at: 1718000030000,
}
```

**Preconditions:**

- Room state must be `SEED_SELECTION`
- Caller must be the current hot seat
- Prompt ≤ 100 chars

**Side effects:**

- Song created
- Room state → `LISTENING`
- All clients receive seed song update + prompt
- All clients auto-play preview for 30 seconds

---

### 7. **Submit Song (Regular)**

```typescript
const submitSong = async (
  roomId: u64,
  playerId: u64,
  track: SpotifyTrack,
): Promise<Song> => {
  return await db.submit_song({
    room_id: roomId,
    player_id: playerId,
    spotify_track: track,
  });
};

// Call:
const song = await submitSong(12345, 1002, spotifyTrack);
// Response: { id: 5002, ..., is_seed: false, submitter_id: 1002, ... }
```

**Preconditions:**

- Room state must be `SUBMISSION`
- Caller must not be the hot seat
- Player hasn't already submitted in this round

**Errors:**

- `"Room not in SUBMISSION state"` — Too late or too early
- `"You already submitted this round"` — Player submitted twice
- `"You are the hot seat"` — Hot seat can't submit regular songs

---

### 8. **Submit Rating/Vote**

```typescript
const submitRating = async (
  roomId: u64,
  raterId: u64,
  songId: u64,
  score: u8 // 1–10
): Promise<Rating> => {
  return await db.submit_rating({
    room_id: roomId,
    rater_id: raterId,
    song_id: songId,
    score: score,
  });
};

// Call:
const rating = await submitRating(12345, 1002, 5002, 8);
// Response:
{
  id: 6001,
  room_id: 12345,
  round_number: 0,
  song_id: 5002,
  rater_id: 1002,
  score: 8,
  rated_at: 1718000090000,
}
```

**Preconditions:**

- Room state must be `VOTING`
- Score must be 1–10
- Rater must not be the submitter (enforced server-side)

**Errors:**

- `"Invalid score"` — Score outside 1–10
- `"You cannot rate your own song"` — Self-vote attempted
- `"Room not in VOTING state"` — Timing issue

---

### 9. **Next Round / Reset**

```typescript
const nextRound = async (roomId: u64): Promise<Room> => {
  return await db.reset_for_next_round({
    room_id: roomId,
  });
};

// Call:
const room = await nextRound(12345);
// Response: { ...room, state: "SEED_SELECTION", current_round: 1, current_hot_seat_id: 1004, ... }
```

**Side effects:**

- Scores calculated and added to Player.score
- Songs & ratings deleted (or archived)
- Round number incremented
- New hot seat selected
- Room state → `SEED_SELECTION`
- If < 2 players left → game ends

**Called by:** Host or automatically after RESULTS displayed

---

### 10. **Leave Room**

```typescript
const leaveRoom = async (roomId: u64, playerId: u64): Promise<void> => {
  return await db.leave_room({
    room_id: roomId,
    player_id: playerId,
  });
};

// Call:
await leaveRoom(12345, 1002);
// Response: void
```

**Side effects:**

- Player removed
- If player was host → new host assigned
- If room now empty → room deleted
- Other players see `players:left` event

---

## Example Client Integration (React)

### Setup

```typescript
import { createDefaultClient } from "@spacetimedb-sdk/react";

const client = createDefaultClient(
  "wss://your-spacetimedb-url.spacetimedb.com/",
);

await client.auth.authenticate("your-auth-token", true);
```

### Subscribing to Room State

```typescript
import { useCallback, useEffect, useState } from 'react';

export const GameRoom = ({ roomId }: { roomId: u64 }) => {
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);

  useEffect(() => {
    // Subscribe to room
    const unsubscribeRoom = client.Room.subscribe('SELECT * FROM Room WHERE id = ?', [roomId]);
    const unsubscribePlayers = client.Player.subscribe(
      'SELECT * FROM Player WHERE room_id = ? ORDER BY joined_at',
      [roomId]
    );
    const unsubscribeSongs = client.Song.subscribe(
      'SELECT * FROM Song WHERE room_id = ? ORDER BY submitted_at DESC',
      [roomId]
    );
    const unsubscribeRatings = client.Rating.subscribe(
      'SELECT * FROM Rating WHERE room_id = ? ORDER BY rated_at DESC',
      [roomId]
    );

    return () => {
      unsubscribeRoom();
      unsubscribePlayers();
      unsubscribeSongs();
      unsubscribeRatings();
    };
  }, [roomId]);

  return (
    <div>
      <h1>{room?.join_code}</h1>
      <p>State: {room?.state}</p>
      <p>Players: {players.length}</p>
    </div>
  );
};
```

### Creating a Room

```typescript
export const CreateRoom = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleCreate = async (hostName: string) => {
    setLoading(true);
    try {
      const room = await client.create_room({ host_name: hostName });
      navigate(`/room/${room.id}`);
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={() => handleCreate('Player 1')} disabled={loading}>
      {loading ? 'Creating...' : 'Create Game'}
    </button>
  );
};
```

### Hot Seat - Submitting Seed Song

```typescript
export const SeedSelection = ({ roomId, playerId }: { roomId: u64; playerId: u64 }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpotifyTrack[]>([]);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    try {
      const tracks = await client.search_spotify({ room_id: roomId, query });
      setResults(tracks);
    } catch (err) {
      alert(`Search failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSeed = async (track: SpotifyTrack) => {
    try {
      await client.submit_seed_song({
        room_id: roomId,
        hot_seat_id: playerId,
        spotify_track: track,
        prompt: prompt || null,
      });
      // UI will update via subscription when seed_song_id is set
    } catch (err) {
      alert(`Failed to submit: ${err.message}`);
    }
  };

  return (
    <div>
      <h2>Pick a Seed Song</h2>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search Spotify..."
      />
      <button onClick={handleSearch} disabled={loading}>
        {loading ? 'Searching...' : 'Search'}
      </button>
      <div>
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Prompt (optional)"
          maxLength={100}
        />
      </div>
      <div>
        {results.map((track) => (
          <div key={track.id}>
            <img src={track.album_cover_url} alt={track.name} />
            <p>{track.name} by {track.artist}</p>
            {track.preview_url && <audio src={track.preview_url} controls />}
            <button onClick={() => handleSelectSeed(track)}>
              Select as Seed
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
```

### Submission Phase

```typescript
export const Submission = ({ roomId, playerId }: { roomId: u64; playerId: u64 }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpotifyTrack[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (track: SpotifyTrack) => {
    try {
      await client.submit_song({
        room_id: roomId,
        player_id: playerId,
        spotify_track: track,
      });
      setSubmitted(true);
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  if (submitted) {
    return <p>Song submitted! Waiting for other players...</p>;
  }

  return (
    <div>
      <h2>Submit Your Song</h2>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search..."
      />
      <button
        onClick={async () => {
          const tracks = await client.search_spotify({ room_id: roomId, query });
          setResults(tracks);
        }}
      >
        Search
      </button>
      <div>
        {results.map((track) => (
          <div key={track.id}>
            <p>{track.name} by {track.artist}</p>
            <button onClick={() => handleSubmit(track)}>Submit</button>
          </div>
        ))}
      </div>
    </div>
  );
};
```

### Voting Phase

```typescript
export const Voting = ({ roomId, playerId, songs }: { roomId: u64; playerId: u64; songs: Song[] }) => {
  const [currentSongIdx, setCurrentSongIdx] = useState(0);
  const [myRatings, setMyRatings] = useState<Record<u64, u8>>({});

  const currentSong = songs[currentSongIdx];
  const isMySubmission = currentSong.submitter_id === playerId;

  const handleVote = async (score: u8) => {
    try {
      await client.submit_rating({
        room_id: roomId,
        rater_id: playerId,
        song_id: currentSong.id,
        score,
      });
      setMyRatings((prev) => ({ ...prev, [currentSong.id]: score }));
      setCurrentSongIdx((i) => i + 1);
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  if (currentSongIdx >= songs.length) {
    return <p>You've voted on all songs! Waiting for results...</p>;
  }

  return (
    <div>
      <h2>Rate This Song ({currentSongIdx + 1}/{songs.length})</h2>
      <div>
        <img src={currentSong.album_cover_url} alt={currentSong.name} />
        <p>{currentSong.name} by {currentSong.artist}</p>
        <p>Submitted by: {/* get player name */}</p>
        {isMySubmission ? (
          <p>(This is your song)</p>
        ) : (
          <div>
            {currentSong.preview_url && (
              <audio src={currentSong.preview_url} controls />
            )}
            <div>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
                <button key={score} onClick={() => handleVote(score)}>
                  {score}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
```

---

## Error Handling

### Common Errors

| Reducer            | Error                      | Cause                | Client Action                        |
| ------------------ | -------------------------- | -------------------- | ------------------------------------ |
| `join_room`        | "Room not found"           | Invalid code         | Show "Invalid code" message          |
| `join_room`        | "Room is full"             | 8 players already    | Show "Game is full"                  |
| `submit_seed_song` | "You are not the hot seat" | Wrong player         | Shouldn't happen; UI guard           |
| `submit_song`      | "You already submitted"    | Duplicate submission | Disable submit button                |
| `submit_rating`    | "Cannot rate own song"     | Self-vote            | Disable voting for own songs         |
| `search_spotify`   | HTTP 429                   | Rate limited         | "Too many searches, try again soon"  |
| `search_spotify`   | HTTP 5xx                   | Spotify down         | "Spotify is temporarily unavailable" |

---

## Timeline & Triggers

### Automatic State Transitions (Server-Side Timers)

The **server** manages these timeouts. Clients are informed via room state updates.

| Phase          | Duration | Trigger                           | Next State               |
| -------------- | -------- | --------------------------------- | ------------------------ |
| SEED_SELECTION | 60s      | Timer expires                     | LISTENING                |
| LISTENING      | 30s      | Timer expires                     | SUBMISSION               |
| SUBMISSION     | 90s      | All submitted OR timer expires    | VOTING                   |
| VOTING         | 180s     | All voted OR timer expires        | RESULTS                  |
| RESULTS        | 10s      | Host clicks "Next Round" OR timer | SEED_SELECTION (round++) |

**Client receives:** `room:state-changed` event when state transitions.

---

## Socket Events vs. Subscriptions

**Subscriptions (what we use):**

- Automatic, continuous updates
- Declarative ("give me all Players where room_id = X")
- No polling needed
- Built-in SpaceTimeDB feature

**Why not WebSocket events?**

- Subscriptions are simpler for CRUD state
- No need to manually emit events from server
- Client automatically syncs missed updates

---

## Testing Checklist

- [ ] Create room → host receives room ID & join code
- [ ] Join room → new player appears in players list
- [ ] All players ready → host can click "Start"
- [ ] Start game → hot seat selected, state = SEED_SELECTION
- [ ] Hot seat searches Spotify → results returned
- [ ] Hot seat submits seed → all see seed song, state = LISTENING, preview plays
- [ ] After 30s → state = SUBMISSION
- [ ] Players search & submit → songs appear in order
- [ ] All submitted → state = VOTING
- [ ] Players vote 1–10 → ratings appear
- [ ] All voted → state = RESULTS, scores calculated
- [ ] Next round → new hot seat, state = SEED_SELECTION, round++
- [ ] Leaderboard updates after each round
- [ ] Player leaves → room updates, host reassigned if needed
- [ ] Spotify 429 → friendly error message
- [ ] No preview available → UI shows "Preview unavailable"

---

## Summary Table: Subscriptions & Reducers

| Feature        | Type         | Subscription               | Reducer                  | Event                  |
| -------------- | ------------ | -------------------------- | ------------------------ | ---------------------- |
| Room created   | N/A          | N/A                        | `create_room()`          | `room:state-changed`   |
| Player joins   | Subscription | `db.Player.watch(room_id)` | `join_room()`            | `players:joined`       |
| Game starts    | Subscription | `db.Room.watch(room_id)`   | `start_game()`           | `room:state-changed`   |
| Seed submitted | Subscription | `db.Song.watch(...)`       | `submit_seed_song()`     | `songs:seed-submitted` |
| Song submitted | Subscription | `db.Song.watch(...)`       | `submit_song()`          | `songs:submitted`      |
| Vote submitted | Subscription | `db.Rating.watch(...)`     | `submit_rating()`        | `ratings:voted`        |
| Scores updated | Subscription | `db.Player.watch(...)`     | (backend calc)           | `players:updated`      |
| Next round     | Subscription | `db.Room.watch(...)`       | `reset_for_next_round()` | `room:state-changed`   |
