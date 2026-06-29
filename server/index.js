const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, '../public')));

// ─── URL 라우팅 (.html 없이 접근) ────────────────────────────────────────────
app.get('/participant', (req, res) => res.sendFile(path.join(__dirname, '../public/participant.html')));
app.get('/screen',      (req, res) => res.sendFile(path.join(__dirname, '../public/screen.html')));
app.get('/admin',       (req, res) => res.sendFile(path.join(__dirname, '../public/admin.html')));

// ─── 게임 상태 ───────────────────────────────────────────────────────────────
let gameState = {
  status: 'waiting',
  currentQuestion: null,
  questionIndex: -1,
  timeLeft: 0,
  votes: { A: 0, B: 0 },
  voters: {},
  questions: [],
  summary: []
};

let timer = null;

function getPublicState() {
  const total = gameState.votes.A + gameState.votes.B;
  return {
    status: gameState.status,
    currentQuestion: gameState.currentQuestion,
    questionIndex: gameState.questionIndex,
    totalQuestions: gameState.questions.length,
    timeLeft: gameState.timeLeft,
    votes: gameState.votes,
    total,
    pctA: total > 0 ? Math.round((gameState.votes.A / total) * 100) : 50,
    pctB: total > 0 ? Math.round((gameState.votes.B / total) * 100) : 50,
    summary: gameState.summary,
  };
}

function clearTimer() {
  if (timer) { clearInterval(timer); timer = null; }
}

function startVotingTimer(seconds) {
  gameState.timeLeft = seconds;
  clearTimer();
  timer = setInterval(() => {
    gameState.timeLeft--;
    io.emit('state', getPublicState());
    if (gameState.timeLeft <= 0) {
      clearTimer();
      saveSummary();
      gameState.status = 'result';
      io.emit('state', getPublicState());
    }
  }, 1000);
}

function saveSummary() {
  if (!gameState.currentQuestion) return;
  const total = gameState.votes.A + gameState.votes.B;
  gameState.summary.push({
    index: gameState.questionIndex,
    A: gameState.currentQuestion.A,
    B: gameState.currentQuestion.B,
    votesA: gameState.votes.A,
    votesB: gameState.votes.B,
    total,
    pctA: total > 0 ? Math.round((gameState.votes.A / total) * 100) : 50,
    pctB: total > 0 ? Math.round((gameState.votes.B / total) * 100) : 50,
    winner: gameState.votes.A >= gameState.votes.B ? 'A' : 'B',
  });
}

// ─── Socket.io ───────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  socket.emit('state', getPublicState());

  socket.on('admin:startVote', ({ seconds }) => {
    if (gameState.status === 'voting' || gameState.status === 'ended') return;

    if (gameState.status === 'waiting' || gameState.currentQuestion === null) {
      const nextIdx = gameState.questionIndex + 1;
      if (nextIdx >= gameState.questions.length) {
        gameState.status = 'ended';
        gameState.currentQuestion = null;
        clearTimer();
        io.emit('state', getPublicState());
        return;
      }
      gameState.questionIndex = nextIdx;
      gameState.currentQuestion = gameState.questions[nextIdx];
    }

    gameState.votes = { A: 0, B: 0 };
    gameState.voters = {};
    gameState.status = 'voting';
    startVotingTimer(seconds || 15);
    io.emit('state', getPublicState());
  });

  socket.on('admin:showResult', () => {
    clearTimer();
    saveSummary();
    gameState.status = 'result';
    io.emit('state', getPublicState());
  });

  socket.on('admin:next', () => {
    const nextIdx = gameState.questionIndex + 1;
    if (nextIdx >= gameState.questions.length) {
      gameState.status = 'ended';
      gameState.currentQuestion = null;
      clearTimer();
      io.emit('state', getPublicState());
      return;
    }
    gameState.questionIndex = nextIdx;
    gameState.currentQuestion = gameState.questions[nextIdx];
    gameState.votes = { A: 0, B: 0 };
    gameState.voters = {};
    gameState.status = 'showing';
    clearTimer();
    io.emit('state', getPublicState());
  });

  socket.on('admin:reset', () => {
    clearTimer();
    gameState.status = 'waiting';
    gameState.currentQuestion = null;
    gameState.questionIndex = -1;
    gameState.votes = { A: 0, B: 0 };
    gameState.voters = {};
    gameState.timeLeft = 0;
    gameState.summary = [];
    io.emit('state', getPublicState());
  });

  socket.on('admin:getQuestions', () => {
    socket.emit('questions', gameState.questions);
  });

  socket.on('admin:setQuestions', (questions) => {
    gameState.questions = questions;
    io.emit('questions', gameState.questions);
    io.emit('state', getPublicState());
  });

  socket.on('vote', ({ choice }) => {
    if (gameState.status !== 'voting') return;
    if (choice !== 'A' && choice !== 'B') return;

    const prev = gameState.voters[socket.id];
    if (prev) gameState.votes[prev]--;
    gameState.voters[socket.id] = choice;
    gameState.votes[choice]++;

    io.emit('state', getPublicState());
  });

  socket.on('disconnect', () => {
    const prev = gameState.voters[socket.id];
    if (prev && gameState.votes[prev] > 0) gameState.votes[prev]--;
    delete gameState.voters[socket.id];
    io.emit('state', getPublicState());
  });
});

// ─── 시작 ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ 밸런스 게임 서버 실행 중: http://localhost:${PORT}`);
  console.log(`   참여자: /participant`);
  console.log(`   스크린: /screen`);
  console.log(`   관리자: /admin`);
});
