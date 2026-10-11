import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PeerTrivia } from '../trivia';
import { PeerWouldYouRather } from '../wouldYouRather';
import { PeerChess } from '../chess';
import { PeerConnectFour } from '../connectFour';

const peers = [
  { id: 'a', handle: 'Alice' },
  { id: 'b', handle: 'Bob' },
];

test('trivia hides future question text and options until asked', () => {
  const game = new PeerTrivia();
  game.act('a', peers, { action: 'invite', category: 'general' } as never);
  const invitation = game.snapshot().invitation!;
  game.act('b', peers, { action: 'respond', invitationId: invitation.id, accept: true } as never);
  const view = game.serializeFor('a');
  assert.ok(view.game!.questions.length > 1);
  const current = view.game!.questions[view.game!.currentQuestionIndex]!;
  assert.ok(current.question.length > 0, 'current question is visible');
  assert.ok(current.options.length > 0);
  for (const [index, q] of view.game!.questions.entries()) {
    if (index <= view.game!.currentQuestionIndex) continue;
    assert.equal(q.question, '', `future question ${index} text must be hidden`);
    assert.deepEqual(q.options, []);
    assert.equal(q.correctIndex, -1);
  }
});

test('chess move implicitly declines a pending draw offer instead of freezing', () => {
  const game = new PeerChess();
  game.act('a', peers, { action: 'invite' } as never);
  const invitation = game.snapshot().invitation!;
  game.act('b', peers, { action: 'respond', invitationId: invitation.id, accept: true } as never);
  const snap = game.snapshot();
  const id = snap.game!.id;
  const white = snap.game!.players.find((p) => p.color === 'white')!.id;
  const black = snap.game!.players.find((p) => p.id !== white)!.id;
  // Attacker offers a draw on the opponent's turn; the opponent's move must
  // still succeed and clear the offer.
  game.act(black, peers, { action: 'offerDraw', gameId: id, round: 1, revision: 0 } as never);
  assert.equal(game.snapshot().game!.drawOfferedBy, black);
  const mover = white; // white opens
  game.act(mover, peers, {
    action: 'move',
    gameId: id,
    round: 1,
    revision: 0,
    from: [6, 4],
    to: [4, 4],
  } as never);
  const after = game.snapshot().game!;
  assert.equal(after.drawOfferedBy, null);
  assert.equal(after.turn, 'black');
});

test('connect four rematch alternates the opening move', () => {
  const game = new PeerConnectFour();
  game.act('a', peers, { action: 'invite' } as never);
  const invitation = game.snapshot().invitation!;
  game.act('b', peers, { action: 'respond', invitationId: invitation.id, accept: true } as never);
  const id = game.snapshot().game!.id;
  assert.equal(game.snapshot().game!.turn, 'red');
  const drop = (actor: string, column: number) =>
    game.act(actor, peers, {
      action: 'move',
      gameId: id,
      round: game.snapshot().game!.round,
      revision: game.snapshot().revision,
      column,
    } as never);
  drop('a', 0);
  drop('b', 0);
  drop('a', 1);
  drop('b', 1);
  drop('a', 2);
  drop('b', 2);
  drop('a', 3);
  assert.ok(game.snapshot().game!.result, 'first round should have a winner');
  const round = game.snapshot().game!.round;
  game.act('a', peers, { action: 'rematch', gameId: id, round } as never);
  game.act('b', peers, { action: 'rematch', gameId: id, round } as never);
  const rematch = game.snapshot().game!;
  assert.equal(rematch.round, 2);
  assert.equal(rematch.turn, 'yellow', 'second round should open with yellow');
});

test('trivia and would-you-rather coerce unknown categories to safe defaults', () => {
  const trivia = new PeerTrivia();
  trivia.act('a', peers, { action: 'invite', category: 'nope' } as never);
  const tInv = trivia.snapshot().invitation!;
  trivia.act('b', peers, { action: 'respond', invitationId: tInv.id, accept: true } as never);
  const tGame = trivia.snapshot().game!;
  assert.equal(tGame.category, 'general');
  assert.ok(tGame.questions.length > 0);
  assert.ok(new Set(tGame.questions.map((q) => q.id)).size === tGame.questions.length);

  const wyr = new PeerWouldYouRather();
  wyr.act('a', peers, { action: 'invite', category: 'nope' } as never);
  const wInv = wyr.snapshot().invitation!;
  wyr.act('b', peers, { action: 'respond', invitationId: wInv.id, accept: true } as never);
  const wGame = wyr.snapshot().game!;
  assert.equal(wGame.category, 'Random');
  assert.ok(wGame.questions.length > 0);
});
