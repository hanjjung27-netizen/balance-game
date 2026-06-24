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
  status: 'waiting',      // waiting | showing | voting | result | ended
  currentQuestion: null,
  questionIndex: -1,
  timeLeft: 0,
  votes: { A: 0, B: 0 },
  voters: new Set(),      // 중복 투표 방지 (socket id)
  questions: [
    { id: 1, A: '치킨', B: '피자', emoji: { A: '🍗', B: '🍕' } },
    { id: 2, A: '바다', B: '산',   emoji: { A: '🌊', B: '⛰️' } },
    { id: 3, A: '아침형 인간', B: '야행성 인간', emoji: { A: '🌅', B: '🌙' } },
    { id: 4, A: '혼밥', B: '같이 밥', emoji: { A: '🍱', B: '👥' } },
    { id: 5, A: '여름', B: '겨울', emoji: { A: '☀️', B: '❄️' } },
  ]
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
  // 접속 즉시 현재 상태 전송
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
    gameState.voters = new Set();
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

  // 관리자: 결과 보기 (타이머 종료 전 강제)
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
    gameState.voters = new Set();
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

  // 참여자: 투표
  socket.on('vote', ({ choice }) => {
    if (gameState.status !== 'voting') return;
    if (gameState.voters.has(socket.id)) return; // 중복 방지
    if (choice !== 'A' && choice !== 'B') return;

    gameState.voters.add(socket.id);
    gameState.votes[choice]++;
    io.emit('state', getPublicState());
  });

  socket.on('disconnect', () => {
    gameState.voters.delete(socket.id);
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
