# ⚡ 밸런스 게임 — 실시간 참여형 행사 도구

> OX퀴즈와 동일한 구조의 실시간 밸런스 게임. 참여자 / 스크린 / 관리자 3개 페이지.  
> Socket.io 기반 실시간 투표 · 타이머 · 결과 공개 지원.

---

## 📁 페이지 구성

| URL | 역할 | 디바이스 |
|-----|------|----------|
| `/participant.html` | 투표 참여 | 참가자 스마트폰 |
| `/screen.html` | 실시간 현황 표시 | 빔프로젝터 / TV |
| `/admin.html` | 게임 진행 제어 | 진행자 노트북/태블릿 |

---

## 🚀 배포 방법

### 1단계 — GitHub 레포 생성

```bash
git init
git add .
git commit -m "feat: 밸런스 게임 초기 세팅"
git remote add origin https://github.com/YOUR_ID/balance-game.git
git push -u origin main
```

### 2단계 — Render 배포

1. [render.com](https://render.com) 접속 → **New Web Service**
2. GitHub 레포 연결
3. 설정:

| 항목 | 값 |
|------|----|
| **Environment** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Plan** | Free |

4. **Create Web Service** 클릭 → 자동 배포 시작

> 배포 완료 후 URL: `https://balance-game-xxxx.onrender.com`

---

## 🎮 진행 순서

```
[관리자] 어드민 페이지 열기
[스크린] /screen.html 빔프로젝터에 띄우기
[참여자] QR코드로 /participant.html 접속

① 관리자: "다음 문제" → 스크린에 문제 표시
② 관리자: "투표 시작" (시간 설정 가능) → 참여자 투표
③ 자동 종료 또는 관리자: "결과 공개" → 실시간 결과 표시
④ 반복 (다음 문제)
```

---

## 🛠️ 로컬 실행

```bash
npm install
npm run dev   # nodemon (개발)
npm start     # 운영
```

접속: `http://localhost:3000`

---

## ✏️ 문제 커스터마이즈

**방법 1 — 관리자 페이지 UI**  
`/admin.html` → 문제 추가/삭제 → "목록 저장" 버튼

**방법 2 — 코드 직접 수정**  
`server/index.js` 상단 `gameState.questions` 배열 편집:

```js
questions: [
  { id: 1, A: '치킨', B: '피자', emoji: { A: '🍗', B: '🍕' } },
  // 원하는 문제 추가...
]
```

---

## 📦 기술 스택

- **Backend**: Node.js + Express + Socket.io
- **Frontend**: Vanilla HTML/CSS/JS (의존성 없음, 빠른 모바일 로딩)
- **배포**: Render (무료 플랜)

---

## 💡 행사 활용 팁

- 참여자 URL을 **QR코드**로 만들어 입장 시 배포
- 투표 시간은 기본 15초 → 문제 난이도에 따라 조절 (5~60초)
- `screen.html`은 **전체화면(F11)** 으로 표시 권장
- 중복 투표 방지: socket ID 기반으로 1인 1표 적용
