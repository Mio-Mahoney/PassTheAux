import { SenderError, schema, table, t } from 'spacetimedb/server';

const spacetimedb = schema({
  person: table(
    { public: true },
    {
      name: t.string(),
    }
  ),
  room: table(
    { public: true },
    {
      id: t.string().primaryKey(),
      joinCode: t.string().unique(),
      maxPlayers: t.u32(),
      totalRounds: t.u32(),
      status: t.string(),
      hostIdentity: t.identity(),
    }
  ),
  player: table(
    { public: true },
    {
      id: t.string().primaryKey(),
      roomId: t.string().index('hash'),
      name: t.string(),
      identity: t.identity().index('hash'),
      isHost: t.bool(),
      isReady: t.bool(),
      isHotseat: t.bool(),
      score: t.u32(),
    }
  ),
  gameRound: table(
    { public: true },
    {
      id: t.string().primaryKey(),
      roomId: t.string().index('hash'),
      roundNumber: t.u32(),
      hotseatPlayerId: t.string().index('hash'),
      prompt: t.string(),
      status: t.string(),
      currentSubmissionId: t.string(),
      startedAtMs: t.number(),
      endsAtMs: t.number(),
    }
  ),
  songSubmission: table(
    { public: true },
    {
      id: t.string().primaryKey(),
      roomId: t.string().index('hash'),
      roundId: t.string().index('hash'),
      playerId: t.string().index('hash'),
      queueOrder: t.u32(),
      title: t.string(),
      artist: t.string(),
      album: t.string(),
      albumCover: t.string(),
      releaseDate: t.string(),
      durationMs: t.u32(),
      spotifyUrl: t.string(),
      previewUrl: t.string(),
      status: t.string(),
      scoreTotal: t.u32(),
      ratingCount: t.u32(),
      averageScore: t.u32(),
    }
  ),
  rating: table(
    { public: true },
    {
      id: t.string().primaryKey(),
      roomId: t.string().index('hash'),
      roundId: t.string().index('hash'),
      submissionId: t.string().index('hash'),
      playerId: t.string().index('hash'),
      score: t.u32(),
    }
  ),
});
export default spacetimedb;

export const init = spacetimedb.init(_ctx => {
  // Called when the module is initially published
});

export const onConnect = spacetimedb.clientConnected(_ctx => {
  // Called every time a new client connects
});

export const onDisconnect = spacetimedb.clientDisconnected(_ctx => {
  // Called every time a client disconnects
});

export const add = spacetimedb.reducer(
  { name: t.string() },
  (ctx, { name }) => {
    ctx.db.person.insert({ name });
  }
);

export const sayHello = spacetimedb.reducer(ctx => {
  for (const person of ctx.db.person.iter()) {
    console.info(`Hello, ${person.name}!`);
  }
  console.info('Hello, World!');
});

function requirePlayerOwnedBySender(
  ctx: Parameters<Parameters<typeof spacetimedb.reducer>[1]>[0],
  playerId: string
) {
  const player = ctx.db.player.id.find(playerId);

  if (!player) {
    throw new SenderError('Player not found.');
  }

  if (player.identity.toHexString() !== ctx.sender.toHexString()) {
    throw new SenderError('You can only modify your own player.');
  }

  return player;
}

function requirePlayerRoom(
  ctx: Parameters<Parameters<typeof spacetimedb.reducer>[1]>[0],
  playerId: string
) {
  const player = requirePlayerOwnedBySender(ctx, playerId);
  const room = ctx.db.room.id.find(player.roomId);

  if (!room) {
    throw new SenderError('Room not found.');
  }

  return { player, room };
}

export const createRoom = spacetimedb.reducer(
  {
    roomId: t.string(),
    playerId: t.string(),
    joinCode: t.string(),
    hostName: t.string(),
    maxPlayers: t.u32(),
    totalRounds: t.u32(),
  },
  (ctx, { roomId, playerId, joinCode, hostName, maxPlayers, totalRounds }) => {
    const cleanHostName = hostName.trim();
    const cleanJoinCode = joinCode.trim().toUpperCase();

    if (!cleanHostName) {
      throw new SenderError('Host name is required.');
    }

    if (!cleanJoinCode) {
      throw new SenderError('Join code is required.');
    }

    if (maxPlayers < 1) {
      throw new SenderError('Room must allow at least one player.');
    }

    if (totalRounds < 1 || totalRounds > 3) {
      throw new SenderError('Game must have between 1 and 3 rounds.');
    }

    if (ctx.db.room.id.find(roomId)) {
      throw new SenderError('Room already exists.');
    }

    if (ctx.db.room.joinCode.find(cleanJoinCode)) {
      throw new SenderError('Lobby code already exists.');
    }

    ctx.db.room.insert({
      id: roomId,
      joinCode: cleanJoinCode,
      maxPlayers,
      totalRounds,
      status: 'lobby',
      hostIdentity: ctx.sender,
    });

    ctx.db.player.insert({
      id: playerId,
      roomId,
      name: cleanHostName,
      identity: ctx.sender,
      isHost: true,
      isReady: false,
      isHotseat: true,
      score: 0,
    });
  }
);

export const joinRoom = spacetimedb.reducer(
  {
    playerId: t.string(),
    joinCode: t.string(),
    playerName: t.string(),
  },
  (ctx, { playerId, joinCode, playerName }) => {
    const cleanJoinCode = joinCode.trim().toUpperCase();
    const cleanPlayerName = playerName.trim();
    const room = ctx.db.room.joinCode.find(cleanJoinCode);

    if (!room) {
      throw new SenderError('Room not found.');
    }

    if (room.status !== 'lobby') {
      throw new SenderError('Room is not accepting players.');
    }

    if (!cleanPlayerName) {
      throw new SenderError('Player name is required.');
    }

    if (ctx.db.player.id.find(playerId)) {
      throw new SenderError('Player already exists.');
    }

    const roomPlayers = Array.from(ctx.db.player.roomId.filter(room.id));

    if (roomPlayers.length >= room.maxPlayers) {
      throw new SenderError('Room is full.');
    }

    ctx.db.player.insert({
      id: playerId,
      roomId: room.id,
      name: cleanPlayerName,
      identity: ctx.sender,
      isHost: false,
      isReady: false,
      isHotseat: false,
      score: 0,
    });
  }
);

export const setReady = spacetimedb.reducer(
  {
    playerId: t.string(),
    isReady: t.bool(),
  },
  (ctx, { playerId, isReady }) => {
    const player = requirePlayerOwnedBySender(ctx, playerId);

    ctx.db.player.id.update({
      ...player,
      isReady,
    });
  }
);

export const leaveRoom = spacetimedb.reducer(
  {
    playerId: t.string(),
  },
  (ctx, { playerId }) => {
    const player = requirePlayerOwnedBySender(ctx, playerId);
    const room = ctx.db.room.id.find(player.roomId);

    if (player.isHost) {
      ctx.db.player.roomId.delete(player.roomId);

      if (room) {
        ctx.db.room.delete(room);
      }

      return;
    }

    ctx.db.player.delete(player);

    if (Array.from(ctx.db.player.roomId.filter(player.roomId)).length === 0) {
      if (room) {
        ctx.db.room.delete(room);
      }
    }
  }
);

export const beginRoundSetup = spacetimedb.reducer(
  {
    playerId: t.string(),
  },
  (ctx, { playerId }) => {
    const { player, room } = requirePlayerRoom(ctx, playerId);

    if (!player.isHotseat) {
      throw new SenderError('Only the hotseat player can choose the prompt.');
    }

    if (room.status === 'playing' || room.status === 'finished') {
      throw new SenderError('The game is not ready for a new prompt.');
    }

    ctx.db.room.id.update({
      ...room,
      status: 'choosing',
    });
  }
);

export const startRound = spacetimedb.reducer(
  {
    playerId: t.string(),
    roundId: t.string(),
    submissionId: t.string(),
    prompt: t.string(),
    title: t.string(),
    artist: t.string(),
    album: t.string(),
    albumCover: t.string(),
    releaseDate: t.string(),
    durationMs: t.u32(),
    spotifyUrl: t.string(),
    previewUrl: t.string(),
    startedAtMs: t.number(),
    endsAtMs: t.number(),
  },
  (
    ctx,
    {
      playerId,
      roundId,
      submissionId,
      prompt,
      title,
      artist,
      album,
      albumCover,
      releaseDate,
      durationMs,
      spotifyUrl,
      previewUrl,
      startedAtMs,
      endsAtMs,
    }
  ) => {
    const { player, room } = requirePlayerRoom(ctx, playerId);
    const cleanPrompt = prompt.trim();
    const cleanTitle = title.trim();

    if (!player.isHotseat) {
      throw new SenderError('Only the hotseat player can start the round.');
    }

    if (!cleanPrompt) {
      throw new SenderError('Prompt is required.');
    }

    if (!cleanTitle) {
      throw new SenderError('Song title is required.');
    }

    if (ctx.db.gameRound.id.find(roundId)) {
      throw new SenderError('Round already exists.');
    }

    if (ctx.db.songSubmission.id.find(submissionId)) {
      throw new SenderError('Song submission already exists.');
    }

    const roomRounds = Array.from(ctx.db.gameRound.roomId.filter(room.id));
    const activeRound = roomRounds.find(
      candidate => candidate.status === 'rating'
    );

    if (activeRound) {
      throw new SenderError('A round is already active.');
    }

    if (roomRounds.length >= room.totalRounds) {
      throw new SenderError('All rounds have already been played.');
    }

    ctx.db.gameRound.insert({
      id: roundId,
      roomId: room.id,
      roundNumber: roomRounds.length + 1,
      hotseatPlayerId: player.id,
      prompt: cleanPrompt,
      status: 'rating',
      currentSubmissionId: submissionId,
      startedAtMs,
      endsAtMs,
    });

    ctx.db.songSubmission.insert({
      id: submissionId,
      roomId: room.id,
      roundId,
      playerId: player.id,
      queueOrder: 0,
      title: cleanTitle,
      artist: artist.trim(),
      album: album.trim(),
      albumCover: albumCover.trim(),
      releaseDate: releaseDate.trim(),
      durationMs,
      spotifyUrl: spotifyUrl.trim(),
      previewUrl: previewUrl.trim(),
      status: 'playing',
      scoreTotal: 0,
      ratingCount: 0,
      averageScore: 0,
    });

    ctx.db.room.id.update({
      ...room,
      status: 'playing',
    });
  }
);

export const submitQueuedSong = spacetimedb.reducer(
  {
    playerId: t.string(),
    roundId: t.string(),
    submissionId: t.string(),
    title: t.string(),
    artist: t.string(),
    album: t.string(),
    albumCover: t.string(),
    releaseDate: t.string(),
    durationMs: t.u32(),
    spotifyUrl: t.string(),
    previewUrl: t.string(),
  },
  (
    ctx,
    {
      playerId,
      roundId,
      submissionId,
      title,
      artist,
      album,
      albumCover,
      releaseDate,
      durationMs,
      spotifyUrl,
      previewUrl,
    }
  ) => {
    const { player, room } = requirePlayerRoom(ctx, playerId);
    const round = ctx.db.gameRound.id.find(roundId);
    const cleanTitle = title.trim();

    if (!round || round.roomId !== room.id || round.status !== 'rating') {
      throw new SenderError('Active round not found.');
    }

    if (!cleanTitle) {
      throw new SenderError('Song title is required.');
    }

    if (ctx.db.songSubmission.id.find(submissionId)) {
      throw new SenderError('Song submission already exists.');
    }

    const roundSubmissions = Array.from(
      ctx.db.songSubmission.roundId.filter(round.id)
    );
    const existingPlayerSubmission = roundSubmissions.find(
      submission => submission.playerId === player.id
    );

    if (existingPlayerSubmission) {
      throw new SenderError('You already submitted a song this round.');
    }

    ctx.db.songSubmission.insert({
      id: submissionId,
      roomId: room.id,
      roundId,
      playerId: player.id,
      queueOrder: roundSubmissions.length,
      title: cleanTitle,
      artist: artist.trim(),
      album: album.trim(),
      albumCover: albumCover.trim(),
      releaseDate: releaseDate.trim(),
      durationMs,
      spotifyUrl: spotifyUrl.trim(),
      previewUrl: previewUrl.trim(),
      status: 'queued',
      scoreTotal: 0,
      ratingCount: 0,
      averageScore: 0,
    });
  }
);

export const submitRating = spacetimedb.reducer(
  {
    playerId: t.string(),
    roundId: t.string(),
    submissionId: t.string(),
    score: t.u32(),
  },
  (ctx, { playerId, roundId, submissionId, score }) => {
    const { player, room } = requirePlayerRoom(ctx, playerId);
    const round = ctx.db.gameRound.id.find(roundId);
    const submission = ctx.db.songSubmission.id.find(submissionId);

    if (score > 100) {
      throw new SenderError('Rating must be between 0.0 and 10.0.');
    }

    if (!round || round.roomId !== room.id || round.status !== 'rating') {
      throw new SenderError('Active round not found.');
    }

    if (!submission || submission.roundId !== round.id) {
      throw new SenderError('Current song not found.');
    }

    const id = `${submission.id}:${player.id}`;
    const existingRating = ctx.db.rating.id.find(id);
    const rating = {
      id,
      roomId: room.id,
      roundId: round.id,
      submissionId: submission.id,
      playerId: player.id,
      score,
    };

    if (existingRating) {
      ctx.db.rating.id.update(rating);
      return;
    }

    ctx.db.rating.insert(rating);
  }
);

export const advanceRound = spacetimedb.reducer(
  {
    playerId: t.string(),
    roundId: t.string(),
    nowMs: t.number(),
    nextEndsAtMs: t.number(),
  },
  (ctx, { playerId, roundId, nowMs, nextEndsAtMs }) => {
    const { player, room } = requirePlayerRoom(ctx, playerId);
    const round = ctx.db.gameRound.id.find(roundId);

    if (!player.isHost) {
      throw new SenderError('Only the host can advance the round.');
    }

    if (!round || round.roomId !== room.id || round.status !== 'rating') {
      throw new SenderError('Active round not found.');
    }

    const currentSubmission = ctx.db.songSubmission.id.find(
      round.currentSubmissionId
    );

    if (!currentSubmission) {
      throw new SenderError('Current song not found.');
    }

    const roomPlayers = Array.from(ctx.db.player.roomId.filter(room.id));
    const currentRatings = Array.from(
      ctx.db.rating.submissionId.filter(currentSubmission.id)
    );

    if (currentRatings.length < roomPlayers.length && nowMs < round.endsAtMs) {
      throw new SenderError('The timer is still running.');
    }

    const scoreTotal = currentRatings.reduce(
      (total, rating) => total + rating.score,
      0
    );
    const ratingCount = currentRatings.length;
    const averageScore =
      ratingCount > 0 ? Math.round(scoreTotal / ratingCount) : 0;
    const finalizedSubmission = {
      ...currentSubmission,
      status: 'rated',
      scoreTotal,
      ratingCount,
      averageScore,
    };
    const submissionOwner = ctx.db.player.id.find(currentSubmission.playerId);

    ctx.db.songSubmission.id.update(finalizedSubmission);

    if (submissionOwner) {
      ctx.db.player.id.update({
        ...submissionOwner,
        score: submissionOwner.score + averageScore,
      });
    }

    const nextSubmission = Array.from(
      ctx.db.songSubmission.roundId.filter(round.id)
    )
      .filter(submission => submission.status === 'queued')
      .sort((left, right) => left.queueOrder - right.queueOrder)[0];

    if (nextSubmission) {
      ctx.db.songSubmission.id.update({
        ...nextSubmission,
        status: 'playing',
      });

      ctx.db.gameRound.id.update({
        ...round,
        currentSubmissionId: nextSubmission.id,
        startedAtMs: nowMs,
        endsAtMs: nextEndsAtMs,
      });

      return;
    }

    const finishedSubmissions = Array.from(
      ctx.db.songSubmission.roundId.filter(round.id)
    ).map(submission =>
      submission.id === finalizedSubmission.id ? finalizedSubmission : submission
    );
    const lowestSubmission = finishedSubmissions
      .filter(submission => submission.status === 'rated')
      .sort((left, right) => left.averageScore - right.averageScore)[0];
    const nextHotseatPlayerId =
      lowestSubmission?.playerId ?? round.hotseatPlayerId;

    for (const roomPlayerSnapshot of roomPlayers) {
      const roomPlayer = ctx.db.player.id.find(roomPlayerSnapshot.id);

      if (!roomPlayer) {
        continue;
      }

      ctx.db.player.id.update({
        ...roomPlayer,
        isHotseat: roomPlayer.id === nextHotseatPlayerId,
      });
    }

    ctx.db.gameRound.id.update({
      ...round,
      status: 'results',
      currentSubmissionId: '',
      startedAtMs: nowMs,
      endsAtMs: nowMs,
    });

    ctx.db.room.id.update({
      ...room,
      status:
        round.roundNumber >= room.totalRounds ? 'finished' : 'round-results',
    });
  }
);
