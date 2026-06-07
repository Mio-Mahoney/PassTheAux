import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import "./styles/LobbyStyle.css";

import TitleScreen from "./screens/TitleScreen";
import MenuScreen from "./screens/MenuScreen";
import TutorialScreen from "./screens/TutorialScreen";
import ModeSelectionScreen from "./screens/ModeSelectionScreen";
import LobbyScreen from "./screens/LobbyScreen";
import JoinScreen from "./screens/JoinScreen";
import HotseatWaitingScreen from "./screens/HotseatWaitingScreen";
import SongSearchScreen from "./screens/SongSearchScreen";
import RatingScreen from "./screens/RatingScreen";
import LeaderboardScreen, {
  type SongScore,
} from "./screens/LeaderboardScreen";
import { reducers, tables } from "./module_bindings";
import type { Player, Room } from "./types/lobby";
import type { Song } from "./types/song";
import {
  useReducer as useSpacetimeReducer,
  useSpacetimeDB,
  useTable,
} from "spacetimedb/react";

type Screen =
  | "title"
  | "menu"
  | "tutorial"
  | "mode-selection"
  | "lobby"
  | "join"
  | "hotseat-waiting"
  | "song-search"
  | "rating"
  | "round-results"
  | "final-results";

const MAX_PLAYERS = 8;
const SONG_TIMER_SECONDS = 60;
const MENU_MUSIC_SRC = "/audio/nightvision.mp3";

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);

    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
      12,
      16,
    )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function createLobbyCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function BackgroundMusic({ enabled }: { enabled: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    if (unlocked) {
      return;
    }

    function unlockAudio() {
      setUnlocked(true);
    }

    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, [unlocked]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    audio.volume = 0.28;

    if (enabled && unlocked) {
      void audio.play().catch(() => {
        // Browsers can still block playback until a user gesture happens.
      });
      return;
    }

    audio.pause();
  }, [enabled, unlocked]);

  return <audio ref={audioRef} src={MENU_MUSIC_SRC} loop preload="auto" />;
}

function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("title");
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const autoAdvancedSubmissionRef = useRef<string | null>(null);

  const { isActive: connected } = useSpacetimeDB();
  const [spacetimeRooms, roomsReady] = useTable(tables.room);
  const [spacetimePlayers, playersReady] = useTable(tables.player);
  const [spacetimeRounds] = useTable(tables.gameRound);
  const [spacetimeSubmissions] = useTable(tables.songSubmission);
  const [spacetimeRatings] = useTable(tables.rating);

  const createRoomReducer = useSpacetimeReducer(reducers.createRoom);
  const joinRoomReducer = useSpacetimeReducer(reducers.joinRoom);
  const leaveRoomReducer = useSpacetimeReducer(reducers.leaveRoom);
  const setReadyReducer = useSpacetimeReducer(reducers.setReady);
  const beginRoundSetupReducer = useSpacetimeReducer(reducers.beginRoundSetup);
  const startRoundReducer = useSpacetimeReducer(reducers.startRound);
  const submitRatingReducer = useSpacetimeReducer(reducers.submitRating);
  const submitQueuedSongReducer = useSpacetimeReducer(reducers.submitQueuedSong);
  const advanceRoundReducer = useSpacetimeReducer(reducers.advanceRound);

  const spacetimeRoom =
    spacetimeRooms.find((candidate) => candidate.id === currentRoomId) ?? null;
  const roomPlayers = spacetimePlayers.filter(
    (player) => player.roomId === currentRoomId,
  );
  const room: Room | null = spacetimeRoom
    ? {
        id: spacetimeRoom.id,
        join_code: spacetimeRoom.joinCode,
        max_players: spacetimeRoom.maxPlayers,
        total_rounds: spacetimeRoom.totalRounds,
        status: spacetimeRoom.status,
        players: roomPlayers.map<Player>((player) => ({
          id: player.id,
          name: player.name,
          is_host: player.isHost,
          is_ready: player.isReady,
          is_hotseat: player.isHotseat,
          score: player.score,
        })),
      }
    : null;
  const currentPlayer =
    room?.players.find((player) => player.id === currentPlayerId) ?? null;
  const hotseatPlayer =
    room?.players.find((player) => player.is_hotseat) ?? null;
  const roomRounds = useMemo(
    () =>
      spacetimeRounds
        .filter((round) => round.roomId === currentRoomId)
        .sort((left, right) => left.roundNumber - right.roundNumber),
    [currentRoomId, spacetimeRounds],
  );
  const activeRound =
    roomRounds.find(
      (round) => round.roomId === currentRoomId && round.status === "rating",
    ) ?? null;
  const resultsRound =
    [...roomRounds].reverse().find((round) => round.status === "results") ??
    null;
  const currentSubmission =
    spacetimeSubmissions.find(
      (submission) => submission.id === activeRound?.currentSubmissionId,
    ) ?? null;
  const currentRatings = spacetimeRatings.filter(
    (rating) => rating.submissionId === currentSubmission?.id,
  );
  const currentPlayerRated = currentRatings.some(
    (rating) => rating.playerId === currentPlayerId,
  );
  const currentPlayerHasSubmittedSong = spacetimeSubmissions.some(
    (submission) =>
      submission.roundId === activeRound?.id &&
      submission.playerId === currentPlayerId,
  );
  const secondsRemaining = activeRound
    ? Math.max(0, Math.ceil((activeRound.endsAtMs - nowMs) / 1000))
    : 0;
  const canAdvanceRound =
    Boolean(currentPlayer?.is_host && activeRound && currentSubmission) &&
    (secondsRemaining === 0 || currentRatings.length >= roomPlayers.length);
  const currentSong: Song | null = currentSubmission
    ? {
        title: currentSubmission.title,
        artist: currentSubmission.artist,
        album: currentSubmission.album,
        albumCover: currentSubmission.albumCover || null,
        releaseDate: currentSubmission.releaseDate,
        durationMs: currentSubmission.durationMs,
        spotifyUrl: currentSubmission.spotifyUrl,
        previewUrl: currentSubmission.previewUrl || null,
      }
    : null;
  const roomSongScores = useMemo<SongScore[]>(
    () =>
      spacetimeSubmissions
        .filter((submission) => submission.roomId === currentRoomId)
        .filter((submission) => submission.status === "rated")
        .map<SongScore>((submission) => {
          const submitter = roomPlayers.find(
            (player) => player.id === submission.playerId,
          );

          return {
            id: submission.id,
            title: submission.title,
            artist: submission.artist,
            playerName: submitter?.name ?? "Player",
            averageScore: submission.averageScore,
            ratingCount: submission.ratingCount,
          };
        })
        .sort((left, right) => right.averageScore - left.averageScore),
    [currentRoomId, roomPlayers, spacetimeSubmissions],
  );
  const roundSongScores = useMemo(
    () =>
      roomSongScores.filter(
        (song) =>
          spacetimeSubmissions.find((submission) => submission.id === song.id)
            ?.roundId === resultsRound?.id,
      ),
    [resultsRound?.id, roomSongScores, spacetimeSubmissions],
  );

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 500);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (room?.status === "finished") {
      setCurrentScreen("final-results");
      return;
    }

    if (room?.status === "choosing") {
      if (
        currentPlayer?.is_hotseat &&
        currentScreen !== "song-search" &&
        currentScreen !== "rating"
      ) {
        setCurrentScreen("song-search");
        return;
      }

      if (
        !currentPlayer?.is_hotseat &&
        currentScreen !== "hotseat-waiting" &&
        currentScreen !== "rating"
      ) {
        setCurrentScreen("hotseat-waiting");
        return;
      }
    }

    if (room?.status === "round-results" && currentScreen !== "song-search") {
      setCurrentScreen("round-results");
      return;
    }

    if (
      activeRound &&
      (currentScreen === "lobby" ||
        currentScreen === "round-results" ||
        currentScreen === "hotseat-waiting" ||
        currentScreen === "song-search")
    ) {
      setCurrentScreen("rating");
    }
  }, [activeRound, currentPlayer?.is_hotseat, currentScreen, room?.status]);

  useEffect(() => {
    if (
      !canAdvanceRound ||
      !activeRound ||
      !currentSubmission ||
      secondsRemaining > 0
    ) {
      return;
    }

    if (autoAdvancedSubmissionRef.current === currentSubmission.id) {
      return;
    }

    autoAdvancedSubmissionRef.current = currentSubmission.id;
    void handleAdvanceRound();
  }, [activeRound, canAdvanceRound, currentSubmission, secondsRemaining]);

  function requireConnected() {
    if (!connected) {
      alert("Not connected to SpacetimeDB yet.");
      return false;
    }

    return true;
  }

  async function handleCreateLobby(totalRounds: number) {
    if (!requireConnected()) {
      return;
    }

    const hostName = prompt("Enter your name:");

    if (!hostName?.trim()) {
      return;
    }

    const roomId = createId();
    const playerId = createId();

    try {
      const createRoomPromise = createRoomReducer({
        roomId,
        playerId,
        joinCode: createLobbyCode(),
        hostName: hostName.trim(),
        maxPlayers: MAX_PLAYERS,
        totalRounds,
      });

      setCurrentRoomId(roomId);
      setCurrentPlayerId(playerId);
      setCurrentScreen("lobby");

      await createRoomPromise;
    } catch (error) {
      console.error(error);
      setCurrentRoomId(null);
      setCurrentPlayerId(null);
      setCurrentScreen("mode-selection");
      alert(error instanceof Error ? error.message : "Could not create lobby.");
    }
  }

  async function handleJoinLobby(lobbyCode: string) {
    if (!requireConnected()) {
      return;
    }

    if (!roomsReady) {
      alert("Lobby list is still loading.");
      return;
    }

    const playerName = prompt("Enter your name:");

    if (!playerName?.trim()) {
      return;
    }

    const cleanLobbyCode = lobbyCode.trim().toUpperCase();
    const existingRoom = spacetimeRooms.find(
      (candidate) => candidate.joinCode === cleanLobbyCode,
    );

    if (!existingRoom) {
      alert("Lobby not found.");
      return;
    }

    const playerId = createId();

    try {
      const joinRoomPromise = joinRoomReducer({
        playerId,
        joinCode: cleanLobbyCode,
        playerName: playerName.trim(),
      });

      setCurrentRoomId(existingRoom.id);
      setCurrentPlayerId(playerId);
      setCurrentScreen("lobby");

      await joinRoomPromise;
    } catch (error) {
      console.error(error);
      setCurrentRoomId(null);
      setCurrentPlayerId(null);
      setCurrentScreen("join");
      alert(error instanceof Error ? error.message : "Could not join lobby.");
    }
  }

  async function handleLeaveLobby() {
    if (currentPlayerId && connected) {
      try {
        await leaveRoomReducer({ playerId: currentPlayerId });
      } catch (error) {
        console.error(error);
      }
    }

    setCurrentRoomId(null);
    setCurrentPlayerId(null);
    setCurrentScreen("menu");
  }

  async function handleReadyToggle() {
    if (!currentPlayer) {
      return;
    }

    try {
      await setReadyReducer({
        playerId: currentPlayer.id,
        isReady: !currentPlayer.is_ready,
      });
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Could not update ready.");
    }
  }

  async function handleStartGame() {
    if (!currentPlayer) {
      return;
    }

    try {
      const beginRoundSetupPromise = beginRoundSetupReducer({
        playerId: currentPlayer.id,
      });

      setCurrentScreen(
        currentPlayer.is_hotseat ? "song-search" : "hotseat-waiting",
      );

      await beginRoundSetupPromise;
    } catch (error) {
      console.error(error);
      setCurrentScreen("lobby");
      alert(
        error instanceof Error
          ? error.message
          : "Could not start hotseat setup.",
      );
    }
  }

  async function handleSubmitHotseatSong(song: Song, prompt: string) {
    if (!currentPlayerId) {
      return;
    }

    try {
      const startRoundPromise = startRoundReducer({
        playerId: currentPlayerId,
        roundId: createId(),
        submissionId: createId(),
        prompt,
        title: song.title,
        artist: song.artist,
        album: song.album,
        albumCover: song.albumCover ?? "",
        releaseDate: song.releaseDate,
        durationMs: song.durationMs,
        spotifyUrl: song.spotifyUrl,
        previewUrl: song.previewUrl ?? "",
        startedAtMs: Date.now(),
        endsAtMs: Date.now() + SONG_TIMER_SECONDS * 1000,
      });

      setCurrentScreen("rating");

      await startRoundPromise;
    } catch (error) {
      console.error(error);
      setCurrentScreen("song-search");
      alert(error instanceof Error ? error.message : "Could not start round.");
    }
  }

  async function handleSubmitQueuedSong(song: Song) {
    if (!currentPlayerId || !activeRound) {
      return;
    }

    try {
      await submitQueuedSongReducer({
        playerId: currentPlayerId,
        roundId: activeRound.id,
        submissionId: createId(),
        title: song.title,
        artist: song.artist,
        album: song.album,
        albumCover: song.albumCover ?? "",
        releaseDate: song.releaseDate,
        durationMs: song.durationMs,
        spotifyUrl: song.spotifyUrl,
        previewUrl: song.previewUrl ?? "",
      });
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Could not queue song.");
    }
  }

  async function handleSubmitRating(score: number) {
    if (!currentPlayerId || !activeRound || !currentSubmission) {
      return;
    }

    try {
      await submitRatingReducer({
        playerId: currentPlayerId,
        roundId: activeRound.id,
        submissionId: currentSubmission.id,
        score: Math.round(score * 10),
      });
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Could not save rating.");
    }
  }

  async function handleAdvanceRound() {
    if (!currentPlayerId || !activeRound) {
      return;
    }

    try {
      await advanceRoundReducer({
        playerId: currentPlayerId,
        roundId: activeRound.id,
        nowMs: Date.now(),
        nextEndsAtMs: Date.now() + SONG_TIMER_SECONDS * 1000,
      });
    } catch (error) {
      console.error(error);
    }
  }

  const isBackgroundMusicScreen =
    currentScreen === "title" ||
    currentScreen === "menu" ||
    currentScreen === "tutorial" ||
    currentScreen === "mode-selection" ||
    currentScreen === "join" ||
    currentScreen === "hotseat-waiting" ||
    currentScreen === "round-results" ||
    currentScreen === "final-results" ||
    (currentScreen === "lobby" && (!room || room.status === "lobby"));

  return (
    <div className="app">
      <BackgroundMusic enabled={isBackgroundMusicScreen} />

      {currentScreen === "title" && (
        <TitleScreen onStart={() => setCurrentScreen("menu")} />
      )}

      {currentScreen === "menu" && (
        <MenuScreen
          onHost={() => setCurrentScreen("mode-selection")}
          onJoin={() => setCurrentScreen("join")}
          onHowToPlay={() => setCurrentScreen("tutorial")}
          onBackToTitle={() => setCurrentScreen("title")}
        />
      )}

      {currentScreen === "tutorial" && (
        <TutorialScreen onBack={() => setCurrentScreen("menu")} />
      )}

      {currentScreen === "mode-selection" && (
        <ModeSelectionScreen
          onBack={() => setCurrentScreen("menu")}
          onContinue={handleCreateLobby}
        />
      )}

      {currentScreen === "join" && (
        <JoinScreen
          onJoinLobby={handleJoinLobby}
          onBack={() => setCurrentScreen("menu")}
        />
      )}

      {currentScreen === "hotseat-waiting" && (
        <HotseatWaitingScreen
          hotseatName={hotseatPlayer?.name ?? "A player"}
          isHotseatPlayer={Boolean(currentPlayer?.is_hotseat)}
          onBack={handleLeaveLobby}
        />
      )}

      {currentScreen === "song-search" && (
        <SongSearchScreen
          onBack={() => setCurrentScreen("lobby")}
          onSubmitSong={(song, prompt) =>
            void handleSubmitHotseatSong(song, prompt)
          }
        />
      )}

      {currentScreen === "rating" &&
        (!currentSong || !activeRound || !room || !currentPlayer) && (
          <div className="lobby-screen">
            <div className="lobby-content">
              <h1 className="lobby-title">Loading Round...</h1>
            </div>
          </div>
        )}

      {currentScreen === "rating" &&
        currentSong &&
        activeRound &&
        room &&
        currentPlayer && (
          <RatingScreen
            song={currentSong}
            prompt={activeRound.prompt}
            ratingsSubmitted={currentRatings.length}
            playerCount={room.players.length}
            currentPlayerRated={currentPlayerRated}
            currentPlayerHasSubmittedSong={currentPlayerHasSubmittedSong}
            secondsRemaining={secondsRemaining}
            canAdvance={canAdvanceRound}
            onSubmitRating={(score) => void handleSubmitRating(score)}
            onSubmitQueuedSong={(song) => void handleSubmitQueuedSong(song)}
            onAdvanceRound={() => void handleAdvanceRound()}
            onBack={() => setCurrentScreen("lobby")}
          />
      )}

      {currentScreen === "round-results" && room && currentPlayer && (
        <LeaderboardScreen
          title={`Round ${resultsRound?.roundNumber ?? ""} Results`}
          subtitle={
            currentPlayer.is_hotseat
              ? "You are in the hotseat. Pick the next prompt."
              : "Next hotseat is choosing the next prompt."
          }
          songScores={roundSongScores}
          players={room.players}
          currentPlayerIsHotseat={currentPlayer.is_hotseat}
          actionLabel="Next Round"
          onAction={() => void handleStartGame()}
          onBack={() => setCurrentScreen("lobby")}
        />
      )}

      {currentScreen === "final-results" && room && currentPlayer && (
        <LeaderboardScreen
          title="Final Results"
          subtitle="Best total ratings wins."
          songScores={roomSongScores}
          players={room.players}
          currentPlayerIsHotseat={currentPlayer.is_hotseat}
          actionLabel="Done"
          onAction={handleLeaveLobby}
          onBack={handleLeaveLobby}
        />
      )}

      {currentScreen === "lobby" &&
        (!room || !currentPlayer || !playersReady) && (
          <div className="lobby-screen">
            <div className="lobby-content">
              <h1 className="lobby-title">Loading Lobby...</h1>
            </div>
          </div>
        )}

      {currentScreen === "lobby" && room && currentPlayer && playersReady && (
        <LobbyScreen
          room={room}
          currentPlayer={currentPlayer}
          onReadyToggle={handleReadyToggle}
          onStartGame={() => void handleStartGame()}
          onBack={handleLeaveLobby}
        />
      )}
    </div>
  );
}

export default App;
