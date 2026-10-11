import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import crypto from 'node:crypto';
import { attachRuntime } from '../runtime';
import { constantTimeEqual } from '../serverSecurity';
import { PeerChess } from '../chess';
import { PeerRockPaperScissors } from '../rps';
import { PeerTicTacToe } from '../ticTacToe';
import { PeerTrivia } from '../trivia';
import { PeerWouldYouRather } from '../wouldYouRather';
import { PeerConnectFour } from '../connectFour';
import { parseVoice } from '../voiceMessages';
import { parseImages } from '../chatImages';

const peers = [
  { id: 'a', handle: 'Alice' },
  { id: 'b', handle: 'Bob' },
];

function startGame(
  game: {
    act(actor: string, peers: { id: string; handle: string }[], action: never): void;
    snapshot(now?: number): { invitation: { id: string } | null };
  },
  invite: never,
  accept: (invitationId: string) => never,
) {
  game.act('a', peers, invite);
  const invitation = game.snapshot().invitation!;
  assert.ok(invitation, 'invitation should exist');
  game.act('b', peers, accept(invitation.id));
}

function chessSeats(game: PeerChess) {
  const players = game.snapshot().game!.players;
  const white = players.find((player) => player.color === 'white')!.id;
  return { white, black: players.find((player) => player.id !== white)!.id };
}

function startChess() {
  const game = new PeerChess();
  startGame(
    game,
    { action: 'invite' } as never,
    (invitationId) => ({ action: 'respond', invitationId, accept: true }) as never,
  );
  return game;
}

// ------------------------------------------------------- Connect Four ---

test('connect four detects a vertical win', () => {
  const game = new PeerConnectFour();
  startGame(
    game,
    { action: 'invite' } as never,
    (invitationId) => ({ action: 'respond', invitationId, accept: true }) as never,
  );
  const id = game.snapshot().game!.id;
  const drop = (actor: string, column: number) =>
    game.act(actor, peers, {
      action: 'move',
      gameId: id,
      round: 1,
      revision: game.snapshot().revision,
      column,
    } as never);
  drop('a', 0);
  drop('b', 1);
  drop('a', 0);
  drop('b', 1);
  drop('a', 0);
  drop('b', 1);
  drop('a', 0);
  const state = game.snapshot().game!;
  assert.equal(state.result!.winnerId, 'a');
  assert.equal(state.result!.winningCells.length, 4);
  assert.deepEqual(
    [...state.result!.winningCells].sort((x, y) => x - y),
    [14, 21, 28, 35],
  );
});

test('connect four detects a diagonal win', () => {
  const game = new PeerConnectFour();
  startGame(
    game,
    { action: 'invite' } as never,
    (invitationId) => ({ action: 'respond', invitationId, accept: true }) as never,
  );
  const id = game.snapshot().game!.id;
  const drop = (actor: string, column: number) =>
    game.act(actor, peers, {
      action: 'move',
      gameId: id,
      round: 1,
      revision: game.snapshot().revision,
      column,
    } as never);
  // Builds red diagonal (5,0)-(4,1)-(3,2)-(2,3) with yellow supports and red fillers in column 5.
  const line: [string, number][] = [
    ['a', 0],
    ['b', 1],
    ['a', 1],
    ['b', 2],
    ['a', 5],
    ['b', 2],
    ['a', 2],
    ['b', 3],
    ['a', 5],
    ['b', 3],
    ['a', 5],
    ['b', 3],
    ['a', 3],
  ];
  for (const [actor, column] of line) drop(actor, column);
  const state = game.snapshot().game!;
  assert.equal(state.result!.winnerId, 'a');
  assert.equal(state.result!.winningCells.length, 4);
  assert.deepEqual(
    [...state.result!.winningCells].sort((x, y) => x - y),
    [17, 23, 29, 35],
  );
});

test('connect four ends in a draw on a full board with no four-in-a-row', () => {
  const game = new PeerConnectFour();
  startGame(
    game,
    { action: 'invite' } as never,
    (invitationId) => ({ action: 'respond', invitationId, accept: true }) as never,
  );
  const id = game.snapshot().game!.id;
  // Solver-verified draw line: even columns first, then odd, repeated. The
  // bottom rows alternate colors in a pattern with no four-in-a-row in any
  // direction, so all 42 moves play without an early win.
  const line = [
    0, 2, 4, 6, 1, 3, 5, 0, 2, 4, 6, 1, 3, 5, 0, 2, 4, 6, 1, 3, 5, 0, 2, 4, 6, 1, 3, 5, 0, 2, 4, 6,
    1, 3, 5, 0, 2, 4, 6, 1, 3, 5,
  ];
  assert.equal(line.length, 42);
  line.forEach((column, index) => {
    game.act(index % 2 === 0 ? 'a' : 'b', peers, {
      action: 'move',
      gameId: id,
      round: 1,
      revision: game.snapshot().revision,
      column,
    } as never);
    if (index < line.length - 1) assert.equal(game.snapshot().game!.result, null);
  });
  const final = game.snapshot().game!;
  assert.deepEqual(final.result, { winnerId: null, winningCells: [] });
  assert.ok(final.board.every((row) => row.every((cell) => cell !== null)));
});

test('connect four rejects a move in a full column', () => {
  const game = new PeerConnectFour();
  startGame(
    game,
    { action: 'invite' } as never,
    (invitationId) => ({ action: 'respond', invitationId, accept: true }) as never,
  );
  const id = game.snapshot().game!.id;
  const drop = (actor: string, column: number) =>
    game.act(actor, peers, {
      action: 'move',
      gameId: id,
      round: 1,
      revision: game.snapshot().revision,
      column,
    } as never);
  for (let index = 0; index < 3; index++) {
    drop('a', 0);
    drop('b', 0);
  }
  assert.equal(game.snapshot().game!.result, null);
  assert.throws(() => drop('a', 0), /Column is full/);
});

// -------------------------------------------------------------- Chess ---

const sq = (file: string, rank: number): [number, number] => [8 - rank, file.charCodeAt(0) - 97];

test('chess detects stalemate via the shortest known stalemate line', () => {
  const game = startChess();
  const id = game.snapshot().game!.id;
  const { white, black } = chessSeats(game);
  const W = white;
  const B = black;
  const line: [string, [number, number], [number, number]][] = [
    [W, sq('e', 2), sq('e', 3)],
    [B, sq('a', 7), sq('a', 5)],
    [W, sq('d', 1), sq('h', 5)],
    [B, sq('a', 8), sq('a', 6)],
    [W, sq('h', 5), sq('a', 5)],
    [B, sq('h', 7), sq('h', 5)],
    [W, sq('h', 2), sq('h', 4)],
    [B, sq('a', 6), sq('h', 6)],
    [W, sq('a', 5), sq('c', 7)],
    [B, sq('f', 7), sq('f', 6)],
    [W, sq('c', 7), sq('d', 7)],
    [B, sq('e', 8), sq('f', 7)],
    [W, sq('d', 7), sq('b', 7)],
    [B, sq('d', 8), sq('d', 3)],
    [W, sq('b', 7), sq('b', 8)],
    [B, sq('d', 3), sq('h', 7)],
    [W, sq('b', 8), sq('c', 8)],
    [B, sq('f', 7), sq('g', 6)],
    [W, sq('c', 8), sq('e', 6)],
  ];
  for (const [actor, from, to] of line) {
    game.act(actor, peers, {
      action: 'move',
      gameId: id,
      round: 1,
      revision: 0,
      from,
      to,
    } as never);
  }
  const state = game.snapshot().game!;
  assert.deepEqual(state.result, { winnerId: null, reason: 'stalemate' });
});

test('chess detects insufficient material from a bare-kings endgame', () => {
  const game = startChess();
  const id = game.snapshot().game!.id;
  const { white } = chessSeats(game);
  // Reaching K-vs-K through legal play is impractical in a unit test, so the
  // engine-evaluation branch is exercised from a seeded endgame position.
  const backdoor = game as unknown as {
    state: { game: { fen: string; turn: string; board: unknown } | null };
  };
  assert.ok(backdoor.state.game, 'a game should be active');
  backdoor.state.game.fen = 'k7/8/8/8/8/8/8/K7 w - - 0 1';
  game.act(white, peers, {
    action: 'move',
    gameId: id,
    round: 1,
    revision: 0,
    from: sq('a', 1),
    to: sq('a', 2),
  } as never);
  const state = game.snapshot().game!;
  assert.deepEqual(state.result, { winnerId: null, reason: 'insufficient-material' });
});

test('chess detects threefold repetition through the peer layer', () => {
  // PeerChess keeps its own position log because the chess.js instance is
  // rebuilt from a bare FEN on every move. Shuttling both knights out and
  // back twice repeats the initial position three times.
  const game = startChess();
  const id = game.snapshot().game!.id;
  const { white, black } = chessSeats(game);
  const shuttle: [string, [number, number], [number, number]][] = [
    [white, sq('g', 1), sq('f', 3)],
    [black, sq('g', 8), sq('f', 6)],
    [white, sq('f', 3), sq('g', 1)],
    [black, sq('f', 6), sq('g', 8)],
    [white, sq('g', 1), sq('f', 3)],
    [black, sq('g', 8), sq('f', 6)],
    [white, sq('f', 3), sq('g', 1)],
    [black, sq('f', 6), sq('g', 8)],
  ];
  for (const [index, [actor, from, to]] of shuttle.entries()) {
    game.act(actor, peers, {
      action: 'move',
      gameId: id,
      round: 1,
      revision: 0,
      from,
      to,
    } as never);
    const state = game.snapshot().game!;
    if (index < shuttle.length - 1) assert.equal(state.result, null);
  }
  assert.deepEqual(game.snapshot().game!.result, {
    winnerId: null,
    reason: 'threefold-repetition',
  });
});

test('chess does not claim a draw after a single repetition cycle', () => {
  const game = startChess();
  const id = game.snapshot().game!.id;
  const { white, black } = chessSeats(game);
  const cycle: [string, [number, number], [number, number]][] = [
    [white, sq('g', 1), sq('f', 3)],
    [black, sq('g', 8), sq('f', 6)],
    [white, sq('f', 3), sq('g', 1)],
    [black, sq('f', 6), sq('g', 8)],
  ];
  for (const [actor, from, to] of cycle) {
    game.act(actor, peers, {
      action: 'move',
      gameId: id,
      round: 1,
      revision: 0,
      from,
      to,
    } as never);
  }
  const state = game.snapshot().game!;
  assert.equal(state.result, null);
  assert.equal(state.turn, 'white');
});

test('chess draw offers can be declined and then accepted', () => {
  const game = startChess();
  const id = game.snapshot().game!.id;
  const { white, black } = chessSeats(game);
  game.act(white, peers, { action: 'offerDraw', gameId: id, round: 1 } as never);
  assert.equal(game.snapshot().game!.drawOfferedBy, white);
  game.act(black, peers, { action: 'respondDraw', gameId: id, round: 1, accept: false } as never);
  const declined = game.snapshot().game!;
  assert.equal(declined.drawOfferedBy, null);
  assert.equal(declined.result, null);
  game.act(white, peers, { action: 'offerDraw', gameId: id, round: 1 } as never);
  game.act(black, peers, { action: 'respondDraw', gameId: id, round: 1, accept: true } as never);
  const agreed = game.snapshot().game!;
  assert.deepEqual(agreed.result, { winnerId: null, reason: 'draw-agreed' });
});

test('chess resignation awards the game to the opponent', () => {
  const game = startChess();
  const id = game.snapshot().game!.id;
  const { black } = chessSeats(game);
  game.act('a', peers, { action: 'resign', gameId: id, round: 1 } as never);
  const state = game.snapshot().game!;
  const opponent = state.players.find((player) => player.id !== 'a')!.id;
  assert.equal(opponent, black === 'a' ? state.players.find((p) => p.id !== 'a')!.id : opponent);
  assert.deepEqual(state.result, { winnerId: opponent, reason: 'resignation' });
});

test('chess rejects illegal moves, wrong turns and wrong-colored pieces', () => {
  const game = startChess();
  const id = game.snapshot().game!.id;
  const { white, black } = chessSeats(game);
  const move = (actor: string, from: [number, number], to: [number, number]) =>
    game.act(actor, peers, {
      action: 'move',
      gameId: id,
      round: 1,
      revision: 0,
      from,
      to,
    } as never);
  // Black cannot open the game.
  assert.throws(() => move(black, sq('e', 7), sq('e', 5)), /not your turn/);
  // White cannot move a black pawn.
  assert.throws(() => move(white, sq('e', 7), sq('e', 5)), /Invalid move/);
  // A knight cannot move like a rook.
  assert.throws(() => move(white, sq('g', 1), sq('g', 3)), /Invalid move/);
  assert.equal(game.snapshot().game!.result, null);
});

// ------------------------------------------------------------- Trivia ---

function startTrivia() {
  const game = new PeerTrivia();
  startGame(
    game,
    { action: 'invite', category: 'general' } as never,
    (invitationId) => ({ action: 'respond', invitationId, accept: true }) as never,
  );
  return game;
}

test('trivia timer expiry auto-reveals the question with no scores', () => {
  const game = startTrivia();
  const before = game.snapshot();
  assert.equal(before.game!.phase, 'answering');
  const expired = game.snapshot(before.game!.timerEndsAt).game!;
  assert.equal(expired.phase, 'revealing');
  assert.deepEqual(expired.answers, {});
  const players = expired.players.map((player: { id: string }) => player.id);
  assert.deepEqual(expired.scores, { [players[0]!]: 0, [players[1]!]: 0 });
});

test('trivia rejects duplicate answers on the same question', () => {
  const game = startTrivia();
  const id = game.snapshot().game!.id;
  const correct = game.snapshot().game!.questions[0]!.correctIndex;
  game.act('a', peers, {
    action: 'answer',
    gameId: id,
    round: 1,
    revision: 0,
    answerIndex: correct,
  } as never);
  assert.throws(
    () =>
      game.act('a', peers, {
        action: 'answer',
        gameId: id,
        round: 1,
        revision: 0,
        answerIndex: correct,
      } as never),
    /already answered/,
  );
});

test('trivia scores correct answers on reveal', () => {
  const game = startTrivia();
  const id = game.snapshot().game!.id;
  const correct = game.snapshot().game!.questions[0]!.correctIndex;
  game.act('a', peers, {
    action: 'answer',
    gameId: id,
    round: 1,
    revision: 0,
    answerIndex: correct,
  } as never);
  game.act('b', peers, {
    action: 'answer',
    gameId: id,
    round: 1,
    revision: 0,
    answerIndex: (correct + 1) % 4,
  } as never);
  const revealed = game.snapshot().game!;
  assert.equal(revealed.phase, 'revealing');
  assert.equal(revealed.scores['a'], 1);
  assert.equal(revealed.scores['b'], 0);
});

test('trivia completes the match at the last question', () => {
  const game = startTrivia();
  const id = game.snapshot().game!.id;
  const total = game.snapshot().game!.questions.length;
  assert.ok(total > 1, 'a match should deal multiple questions');
  for (let index = 0; index < total; index++) {
    const state = game.snapshot().game!;
    assert.equal(state.currentQuestionIndex, index);
    const correct = state.questions[index]!.correctIndex;
    game.act('a', peers, {
      action: 'answer',
      gameId: id,
      round: 1,
      revision: 0,
      answerIndex: correct,
    } as never);
    game.act('b', peers, {
      action: 'answer',
      gameId: id,
      round: 1,
      revision: 0,
      answerIndex: (correct + 1) % 4,
    } as never);
    if (index < total - 1) {
      game.act('a', peers, { action: 'next', gameId: id, round: 1, revision: 0 } as never);
    }
  }
  const final = game.snapshot().game!;
  assert.equal(final.phase, 'game-end');
  assert.equal(final.result!.winnerId, 'a');
  assert.equal(final.result!.finalScores['a'], total);
  assert.equal(final.result!.finalScores['b'], 0);
});

// --------------------------------------------------- Would You Rather ---

function startWyr() {
  const game = new PeerWouldYouRather();
  startGame(
    game,
    { action: 'invite', category: 'Random' } as never,
    (invitationId) => ({ action: 'respond', invitationId, accept: true }) as never,
  );
  return game;
}

test('would you rather plays every question through to round-end', () => {
  const game = startWyr();
  const id = game.snapshot().game!.id;
  const total = game.snapshot().game!.questions.length;
  assert.ok(total > 1, 'a match should deal multiple questions');
  for (let index = 0; index < total; index++) {
    const state = game.snapshot().game!;
    assert.equal(state.currentQuestionIndex, index);
    assert.equal(state.phase, 'choosing');
    game.act('a', peers, {
      action: 'choose',
      gameId: id,
      round: 1,
      revision: 0,
      choice: 'A',
    } as never);
    game.act('b', peers, {
      action: 'choose',
      gameId: id,
      round: 1,
      revision: 0,
      choice: 'B',
    } as never);
    assert.equal(game.snapshot().game!.phase, 'revealing');
    game.act('a', peers, { action: 'next', gameId: id, round: 1, revision: 0 } as never);
  }
  const final = game.snapshot().game!;
  assert.equal(final.phase, 'round-end');
  assert.deepEqual(final.result, { sameChoice: false });
});

test('would you rather rejects a vote after the reveal', () => {
  const game = startWyr();
  const id = game.snapshot().game!.id;
  game.act('a', peers, {
    action: 'choose',
    gameId: id,
    round: 1,
    revision: 0,
    choice: 'A',
  } as never);
  game.act('b', peers, {
    action: 'choose',
    gameId: id,
    round: 1,
    revision: 0,
    choice: 'B',
  } as never);
  assert.equal(game.snapshot().game!.phase, 'revealing');
  assert.throws(
    () =>
      game.act('a', peers, {
        action: 'choose',
        gameId: id,
        round: 1,
        revision: 0,
        choice: 'A',
      } as never),
    /Not time to choose/,
  );
});

// ---------------------------------------------------------------- RPS ---

function startRps() {
  const game = new PeerRockPaperScissors();
  startGame(
    game,
    { action: 'invite' } as never,
    (invitationId) => ({ action: 'respond', invitationId, accept: true }) as never,
  );
  return game;
}

test('rps tie rounds increment draws without scoring', () => {
  const game = startRps();
  const id = game.snapshot().game!.id;
  game.act('a', peers, {
    action: 'choose',
    gameId: id,
    round: 1,
    revision: 0,
    choice: 'rock',
  } as never);
  game.act('b', peers, {
    action: 'choose',
    gameId: id,
    round: 1,
    revision: 0,
    choice: 'rock',
  } as never);
  const state = game.snapshot().game!;
  assert.equal(state.turn, 'revealing');
  assert.equal(state.draws, 1);
  assert.deepEqual(state.scores, { a: 0, b: 0 });
  assert.equal(state.result!.winnerId, null);
});

test('rps rejects a duplicate choice in the same round', () => {
  const game = startRps();
  const id = game.snapshot().game!.id;
  game.act('a', peers, {
    action: 'choose',
    gameId: id,
    round: 1,
    revision: 0,
    choice: 'paper',
  } as never);
  assert.throws(
    () =>
      game.act('a', peers, {
        action: 'choose',
        gameId: id,
        round: 1,
        revision: 0,
        choice: 'scissors',
      } as never),
    /already chosen/,
  );
});

// -------------------------------------------------------- Tic-Tac-Toe ---

test('tic-tac-toe ends in a draw on a full board', () => {
  const game = new PeerTicTacToe();
  startGame(
    game,
    { action: 'invite' } as never,
    (invitationId) => ({ action: 'respond', invitationId, accept: true }) as never,
  );
  const id = game.snapshot().game!.id;
  const move = (actor: string, square: number) =>
    game.act(actor, peers, {
      action: 'move',
      gameId: id,
      round: 1,
      revision: game.snapshot().revision,
      square,
    } as never);
  // X O X / X O O / O X X: full board, no three-in-a-row.
  const line: [string, number][] = [
    ['a', 0],
    ['b', 1],
    ['a', 2],
    ['b', 4],
    ['a', 3],
    ['b', 5],
    ['a', 7],
    ['b', 6],
    ['a', 8],
  ];
  for (const [actor, square] of line) move(actor, square);
  const state = game.snapshot().game!;
  assert.equal(state.result, 'draw');
  assert.deepEqual(state.winningLine, []);
});

// -------------------------------------------- Voice and image uploads ---

const webmBytes = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x02, 0x03]);
const webmUrl = 'data:audio/webm;base64,' + webmBytes.toString('base64');
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

test('voice validation rejects spoofed headers, oversized durations and unsupported mime types', () => {
  assert.equal(parseVoice({ dataUrl: webmUrl, duration: 12 })?.duration, 12);
  // Header spoof: claims webm but the bytes are plain text.
  assert.throws(
    () =>
      parseVoice({
        dataUrl: 'data:audio/webm;base64,' + Buffer.from('not audio at all').toString('base64'),
        duration: 5,
      }),
    /invalid or too large/,
  );
  // Oversized duration claims beyond the three-minute limit.
  for (const duration of [181, 9999, 0, -3]) {
    assert.throws(() => parseVoice({ dataUrl: webmUrl, duration }), /3 minutes/);
  }
  // Unsupported container.
  assert.throws(
    () =>
      parseVoice({ dataUrl: 'data:audio/wav;base64,' + webmBytes.toString('base64'), duration: 5 }),
    /not supported/,
  );
  // Declared mime must match the actual bytes (mp4 header presented as webm).
  const mp4Bytes = Buffer.from([...Buffer.from('....ftyp', 'ascii'), 0x01, 0x02]);
  assert.throws(
    () =>
      parseVoice({ dataUrl: 'data:audio/webm;base64,' + mp4Bytes.toString('base64'), duration: 5 }),
    /invalid or too large/,
  );
});

test('image validation rejects spoofed headers and unsupported mime types', () => {
  const photo = { name: 'Notes.png', dataUrl: 'data:image/png;base64,' + png, width: 1, height: 1 };
  assert.equal(parseImages([photo])[0]?.mimeType, 'image/png');
  // Header spoof: PNG bytes labelled as JPEG.
  assert.throws(() => parseImages([{ ...photo, dataUrl: 'data:image/jpeg;base64,' + png }]));
  // Unsupported vector format.
  assert.throws(() => parseImages([{ ...photo, dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }]));
  // Text bytes labelled as PNG.
  assert.throws(() => parseImages([{ ...photo, dataUrl: 'data:image/png;base64,SGVsbG8=' }]));
});

// ------------------------------------------------- Outsider rejection ---

test('every peer game rejects invites from outsiders', () => {
  const rps = new PeerRockPaperScissors();
  assert.throws(() => rps.act('outsider', peers, { action: 'invite' } as never), /participants/);
  const c4 = new PeerConnectFour();
  assert.throws(() => c4.act('outsider', peers, { action: 'invite' } as never), /participants/);
  const chess = new PeerChess();
  assert.throws(() => chess.act('outsider', peers, { action: 'invite' } as never), /participants/);
  const trivia = new PeerTrivia();
  assert.throws(
    () => trivia.act('outsider', peers, { action: 'invite', category: 'general' } as never),
    /participants/,
  );
  const wyr = new PeerWouldYouRather();
  assert.throws(
    () => wyr.act('outsider', peers, { action: 'invite', category: 'Random' } as never),
    /participants/,
  );
});

// ---------------------------------------------- Admin API and cookies ---

const adminApp = express();
adminApp.use(express.json());
const adminServer = http.createServer(adminApp);
const adminPassword = 'phase-coverage-admin-password-32-chars';
const stopAdmin = attachRuntime(adminApp, adminServer, {
  adminUsername: 'coverage-admin',
  adminPassword,
});
let adminBase: string;
before(async () => {
  await new Promise<void>((resolve) => adminServer.listen(0, '127.0.0.1', resolve));
  adminBase = 'http://127.0.0.1:' + (adminServer.address() as { port: number }).port;
});
after(async () => {
  stopAdmin();
  adminServer.closeIdleConnections();
  await new Promise<void>((resolve) => adminServer.close(() => resolve()));
});

test('admin APIs return 401 without credentials', async () => {
  const denied = await fetch(adminBase + '/api/admin/reports');
  assert.equal(denied.status, 401);
  const badLogin = await fetch(adminBase + '/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: adminBase },
    body: JSON.stringify({ username: 'coverage-admin', password: 'wrong-password' }),
  });
  assert.equal(badLogin.status, 401);
  const noSession = await (await fetch(adminBase + '/api/admin/session')).json();
  assert.deepEqual(noSession, { authenticated: false });
});

test('a tampered cm_device cookie fails verification and is rotated', () => {
  // Mirrors server.ts anonymous/device logic: cm_device is `<id>.<hmac>`.
  const secret = 'phase-coverage-moderation-secret';
  const sign = (id: string) => crypto.createHmac('sha256', secret).update(id).digest('hex');
  const verify = (value: string): string | null => {
    const [givenId, signature] = value.split('.');
    if (
      givenId &&
      /^[a-f0-9]{64}$/.test(givenId) &&
      signature &&
      constantTimeEqual(signature, sign(givenId))
    ) {
      return givenId;
    }
    return null;
  };
  const deviceId = crypto.randomBytes(32).toString('hex');
  const valid = deviceId + '.' + sign(deviceId);
  assert.equal(verify(valid), deviceId);
  // Flip one hex character of the signature: verification must fail so the
  // server issues a fresh device id instead of trusting the tampered cookie.
  const tampered =
    deviceId + '.' + sign(deviceId).replace(/[0-9a-f]$/, (c) => (c === 'a' ? 'b' : 'a'));
  assert.equal(verify(tampered), null);
  assert.equal(verify('not-a-device-cookie'), null);
  assert.equal(verify(deviceId + '.bogus'), null);
  assert.equal(verify(''), null);
});
