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

let gameState = {
  status: 'waiting',
  currentQuestion: null,
  questionIndex: -1,
  timeLeft: 0,
  votes: { A: 0, B: 0 },
  voters: {},
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

io.on('connection', (socket) => {
  socket.emit('state', getPublicState());

  // 투표 시작
  socket.on('admin:startVote', ({ seconds }) => {
    if (gameState.status === 'voting' || gameState.status === 'ended') return;

    // result 또는 showing 상태: 현재 문제 그대로 재투표
    // waiting 상태: 다음(첫) 문제로 이동
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

    // 어느 경우든 투표 초기화 후 시작
    gameState.votes = { A: 0, B: 0 };
    gameState.voters = {};
    gameState.status = 'voting';
    startVotingTimer(seconds || 15);
    io.emit('state', getPublicState());
  });

  // 결과 공개
  socket.on('admin:showResult', () => {
    clearTimer();
    gameState.status = 'result';
    io.emit('state', getPublicState());
  });

  // 다음 문제 (결과 → 다음 문제 미리보기)
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

  // 처음으로
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ 밸런스 게임 서버 실행 중: http://localhost:${PORT}`);
  console.log(`   참여자: /participant.html`);
  console.log(`   스크린: /screen.html`);
  console.log(`   관리자: /admin.html`);
});
