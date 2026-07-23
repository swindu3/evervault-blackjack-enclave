const express = require("express");
const crypto = require("crypto");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 8008;
const STARTING_BALANCE = 100;
const BET = 10;

const players = new Map();

const SUITS = ["hearts", "diamonds", "clubs", "spades"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

function buildDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function handValue(hand) {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    if (card.rank === "A") {
      aces += 1;
      total += 11;
    } else if (["J", "Q", "K"].includes(card.rank)) {
      total += 10;
    } else {
      total += parseInt(card.rank, 10);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

function newGame(player) {
  const deck = buildDeck();
  const playerHand = [deck.pop(), deck.pop()];
  const dealerHand = [deck.pop(), deck.pop()];
  const game = { deck, playerHand, dealerHand, status: "in-progress", message: "Your move." };
  if (handValue(playerHand) === 21) {
    game.status = "player-blackjack";
    game.message = "Blackjack! You win.";
    player.balance += Math.round(BET * 1.5);
  }
  return game;
}

function dealerPlay(game, player) {
  while (handValue(game.dealerHand) < 17) {
    game.dealerHand.push(game.deck.pop());
  }
  const playerTotal = handValue(game.playerHand);
  const dealerTotal = handValue(game.dealerHand);
  if (dealerTotal > 21) {
    game.status = "dealer-bust";
    game.message = "Dealer busts. You win.";
    player.balance += BET;
  } else if (dealerTotal > playerTotal) {
    game.status = "dealer-win";
    game.message = "Dealer wins.";
    player.balance -= BET;
  } else if (dealerTotal < playerTotal) {
    game.status = "player-win";
    game.message = "You win.";
    player.balance += BET;
  } else {
    game.status = "push";
    game.message = "Push.";
  }
}

function serialize(game) {
  const reveal = game.status !== "in-progress";
  return {
    status: game.status,
    message: game.message,
    playerHand: game.playerHand,
    playerTotal: handValue(game.playerHand),
    dealerHand: reveal ? game.dealerHand : [game.dealerHand[0], { hidden: true }],
    dealerTotal: reveal ? handValue(game.dealerHand) : null,
  };
}

function getSessionId(req) {
  return req.get("x-session-id");
}

app.post("/api/new-game", (req, res) => {
  let sessionId = getSessionId(req);
  let player = sessionId && players.get(sessionId);
  if (!player) {
    sessionId = crypto.randomUUID();
    player = { balance: STARTING_BALANCE };
    players.set(sessionId, player);
  }
  player.game = newGame(player);
  res.json({ sessionId, state: serialize(player.game), balance: player.balance });
});

app.post("/api/hit", (req, res) => {
  const player = players.get(getSessionId(req));
  if (!player) return res.status(404).json({ error: "No active game for session" });
  const game = player.game;
  if (game.status !== "in-progress") return res.json({ state: serialize(game), balance: player.balance });

  game.playerHand.push(game.deck.pop());
  const total = handValue(game.playerHand);
  if (total > 21) {
    game.status = "player-bust";
    game.message = "Bust! Dealer wins.";
    player.balance -= BET;
  } else if (total === 21) {
    dealerPlay(game, player);
  }
  res.json({ state: serialize(game), balance: player.balance });
});

app.post("/api/stand", (req, res) => {
  const player = players.get(getSessionId(req));
  if (!player) return res.status(404).json({ error: "No active game for session" });
  const game = player.game;
  if (game.status === "in-progress") {
    dealerPlay(game, player);
  }
  res.json({ state: serialize(game), balance: player.balance });
});

app.get("/api/state", (req, res) => {
  const player = players.get(getSessionId(req));
  if (!player) return res.status(404).json({ error: "No active game for session" });
  res.json({ state: serialize(player.game), balance: player.balance });
});

app.get("/healthz", (req, res) => res.send("ok"));

app.listen(PORT, () => {
  console.log(`Blackjack enclave server listening on port ${PORT}`);
});
