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

// ─── 게임 상태 ───────────────────────────────────────────────────────────────
let gameState = {
  status: 'waiting',
  currentQuestion: null,
  questionIndex: -1,
  timeLeft: 0,
  votes: { A: 0, B: 0 },
  voters: {},        // { [socketId]: 'A' | 'B' }  — 변경 가능하도록 Map 대신 객체
  questions: []
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
      gameState.status = 'result';
      io.emit('state', getPublicState());
    }
  }, 1000);
}

// ─── Socket.io ───────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  socket.emit('state', getPublicState());

  // 관리자: 다음 문제로
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

  // 관리자: 투표 시작
  socket.on('admin:startVote', ({ seconds }) => {
    if (gameState.status !== 'showing') return;
    gameState.status = 'voting';
    startVotingTimer(seconds || 15);
    io.emit('state', getPublicState());
  });

  // 관리자: 결과 공개
  socket.on('admin:showResult', () => {
    clearTimer();
    gameState.status = 'result';
    io.emit('state', getPublicState());
  });

  // 관리자: 처음으로
  socket.on('admin:reset', () => {
    clearTimer();
    gameState.status = 'waiting';
    gameState.currentQuestion = null;
    gameState.questionIndex = -1;
    gameState.votes = { A: 0, B: 0 };
    gameState.voters = {};
    gameState.timeLeft = 0;
    io.emit('state', getPublicState());
  });

  // 관리자: 문제 목록 불러오기
  socket.on('admin:getQuestions', () => {
    socket.emit('questions', gameState.questions);
  });

  // 관리자: 문제 목록 업데이트
  socket.on('admin:setQuestions', (questions) => {
    gameState.questions = questions;
    io.emit('questions', gameState.questions);
    io.emit('state', getPublicState());
  });

  // 참여자: 투표 (변경 가능)
  socket.on('vote', ({ choice }) => {
    if (gameState.status !== 'voting') return;
    if (choice !== 'A' && choice !== 'B') return;

    const prev = gameState.voters[socket.id];

    // 이전 투표가 있으면 차감
    if (prev) {
      gameState.votes[prev]--;
    }

    // 새 투표 반영
    gameState.voters[socket.id] = choice;
    gameState.votes[choice]++;

    io.emit('state', getPublicState());
  });

  socket.on('disconnect', () => {
    // 연결 끊기면 투표 취소
    const prev = gameState.voters[socket.id];
    if (prev && gameState.votes[prev] > 0) {
      gameState.votes[prev]--;
    }
    delete gameState.voters[socket.id];
    io.emit('state', getPublicState());
  });
});

// ─── 시작 ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ 밸런스 게임 서버 실행 중: http://localhost:${PORT}`);
  console.log(`   참여자: /participant.html`);
  console.log(`   스크린: /screen.html`);
  console.log(`   관리자: /admin.html`);
});
