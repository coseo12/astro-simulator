# 다음 예제 프로젝트 주제 선정 리포트

> **작성일**: 2026-03-26
> **검증 방법**: Claude + Gemini 교차 토론
> **목적**: 프레임워크 성숙도 2단계 → 3단계 진입을 위한 예제 프로젝트 선정

---

## 1. 배경 및 목표

### 1.1. 현재 상태

| 항목 | 상태 |
|------|------|
| 운영 성숙도 | 2단계 (Managed) / 5단계 |
| 완료된 예제 | To-Do 앱 (Next.js + TypeScript + Vitest) |
| 검증된 항목 | 전체 파이프라인 완주, 10건 구조적 문제 발견/수정 |
| **미검증 항목** | **FE/BE 병렬 개발, 복잡한 상태 전이, DB 마이그레이션, 외부 서비스 연동** |

### 1.2. 다음 예제가 달성해야 할 목표

1. `scope:frontend` + `scope:backend` 이슈 분리 → FE/BE 에이전트 병렬 작업
2. 여러 이슈가 동시에 파이프라인을 통과하는 교차 상태 전이
3. 실제 기술 과제 (인증, 실시간 통신, 파일 처리 등)
4. 에이전트 간 의존성 충돌 및 협상 시나리오
5. P2/P3 미해결 항목의 자연스러운 검증

---

## 2. 후보 프로젝트 3개 (Gemini + Claude 합의)

### 2-1. 실시간 채팅 애플리케이션

**핵심 기능**: 사용자 인증 → 채팅방 생성/참여 → 실시간 메시지 송수신 → 접속자 목록

#### FE/BE 분리 포인트

| 영역 | Backend (scope:backend) | Frontend (scope:frontend) |
|------|------------------------|--------------------------|
| 인증 | JWT 기반 회원가입/로그인 API | 로그인/회원가입 UI + 토큰 관리 |
| 채팅방 | CRUD REST API | 방 목록/생성 UI |
| 실시간 | WebSocket 서버 + 브로드캐스팅 | Socket.IO 클라이언트 + 메시지 UI |
| 메시지 | 영속성 저장 + 조회 API | 이전 대화 로딩 + 무한 스크롤 |

#### 예상 이슈 분해 (12개)

| # | 이슈 | scope | 의존성 |
|---|------|-------|--------|
| 1 | DB 스키마 설계 (User, Room, Message) | fullstack | - |
| 2 | 사용자 인증 API (회원가입/로그인/JWT) | backend | #1 |
| 3 | 로그인/회원가입 페이지 UI | frontend | - |
| 4 | 인증 API 연동 + 토큰 상태 관리 | frontend | #2, #3 |
| 5 | WebSocket 기반 실시간 메시징 서버 | backend | #2 |
| 6 | 채팅방 CRUD API | backend | #1 |
| 7 | 채팅방 목록 + 메인 채팅 UI | frontend | - |
| 8 | WebSocket 클라이언트 + 실시간 메시지 표시 | frontend | #5, #7 |
| 9 | 대화 내용 DB 저장 로직 | backend | #5, #1 |
| 10 | 이전 대화 불러오기 API + 무한 스크롤 | fullstack | #9, #8 |
| 11 | 접속자 목록 실시간 업데이트 | fullstack | #5, #8 |
| 12 | WebSocket 동시성 + E2E 테스트 | qa | #8, #5 |

#### 기술 스택

- **FE**: Next.js 15, TypeScript, Socket.IO-Client, Zustand, TanStack Query
- **BE**: NestJS (WebSocket Gateway + DI), Prisma, SQLite, Socket.IO
- **Test**: Vitest, Playwright

#### 프레임워크 검증 포인트

- **병렬 개발**: BE(#2,#5,#6,#9) + FE(#3,#7) 동시 진행 → Architect의 API 명세 품질이 핵심
- **비동기 테스트**: QA가 WebSocket 수신/브로드캐스팅을 E2E 검증
- **Integrator 통합**: FE+BE 결합 시 WebSocket 핸드셰이크 + REST API 양쪽 검증
- **DB 마이그레이션**: Prisma 마이그레이션 파일 생성/적용 에이전트 능력

#### 난이도: **중상** | 리스크: WebSocket 상태 관리, 동시성 테스트 자동화

---

### 2-2. 칸반 보드 (Trello 클론)

**핵심 기능**: 보드/리스트/카드 CRUD → 드래그 앤 드롭 이동 → Optimistic UI → 실시간 동기화

#### FE/BE 분리 포인트

| 영역 | Backend | Frontend |
|------|---------|----------|
| 데이터 | 보드/리스트/카드 CRUD API | 보드 렌더링 UI |
| 이동 | 카드 이동 API (순서/리스트 변경) | 드래그 앤 드롭 (dnd-kit) |
| UX | - | Optimistic UI 업데이트 |
| 실시간 | WebSocket 변경사항 전파 | 실시간 동기화 UI |

#### 예상 이슈 분해 (13개)

| # | 이슈 | scope |
|---|------|-------|
| 1 | DB 모델링 (Board, List, Card, 정렬 전략) | fullstack |
| 2 | 보드 CRUD API | backend |
| 3 | 리스트 CRUD API | backend |
| 4 | 카드 CRUD API | backend |
| 5 | 보드/리스트/카드 렌더링 UI | frontend |
| 6 | 보드/리스트/카드 생성 UI + API 연동 | frontend |
| 7 | 카드 이동(순서/리스트 변경) API | backend |
| 8 | 드래그 앤 드롭 구현 (dnd-kit) | frontend |
| 9 | 카드 이동 시 Optimistic UI | frontend |
| 10 | 드래그 앤 드롭 상태 관리 리팩토링 | frontend |
| 11 | WebSocket 변경사항 전파 | backend |
| 12 | WebSocket 동기화 UI | frontend |
| 13 | E2E 테스트 (드래그 앤 드롭 시나리오) | qa |

#### 기술 스택

- **FE**: Next.js, TypeScript, dnd-kit, Tailwind CSS, SWR/TanStack Query
- **BE**: Express/Fastify, Prisma, SQLite
- **Test**: Vitest, Playwright

#### 프레임워크 검증 포인트

- **복잡한 UI 로직**: FE 에이전트의 라이브러리(dnd-kit) 활용 능력
- **Optimistic UI**: 서버 응답 전 UI 선반영 패턴 구현 능력
- **원자적 API 설계**: Architect의 복합 동작 API 설계 판단력
- **QA 엣지케이스**: 드래그 앤 드롭의 수많은 엣지 케이스 검출

#### 난이도: **중** | 리스크: DnD 라이브러리 사용법 오해, Optimistic UI 상태 불일치

---

### 2-3. 마크다운 기반 블로그 + 파일 업로드

**핵심 기능**: 관리자 인증 → 마크다운 에디터로 글 작성 → 이미지 업로드 → 글 목록/상세

#### FE/BE 분리 포인트

| 영역 | Backend | Frontend |
|------|---------|----------|
| 인증 | 관리자 인증 API | 로그인 UI |
| 포스트 | CRUD REST API | 마크다운 에디터 + 렌더링 |
| 파일 | multipart 업로드 API + S3 연동 | 파일 업로드 UI + 에디터 삽입 |

#### 예상 이슈 분해 (10개)

| # | 이슈 | scope |
|---|------|-------|
| 1 | 프로젝트 초기 설정 + S3 연동 준비 | fullstack |
| 2 | 관리자 인증 API | backend |
| 3 | 포스트 CRUD API | backend |
| 4 | 이미지 업로드 API + 스토리지 연동 | backend |
| 5 | 관리자 로그인 페이지 + 인증 연동 | frontend |
| 6 | 마크다운 에디터 포스트 작성/수정 | frontend |
| 7 | 이미지 업로드 + 에디터 삽입 | frontend |
| 8 | 포스트 목록 페이지 | frontend |
| 9 | 포스트 상세 페이지 + 마크다운 렌더링 | frontend |
| 10 | 파일 업로드 보안 + XSS 방지 테스트 | qa |

#### 기술 스택

- **FE**: Next.js, TypeScript, react-markdown, react-dropzone
- **BE**: NestJS/Express, multer, AWS S3 SDK, SQLite
- **Test**: Vitest, Playwright

#### 프레임워크 검증 포인트

- **외부 서비스 연동**: S3 등 클라우드 스토리지 연동 시 DevOps 역할
- **보안 검증**: Auditor의 파일 업로드 보안 (MIME 검증, 파일명 새니타이즈, XSS)
- **환경 변수 관리**: API Key 등 민감 정보 처리 방식

#### 난이도: **중** | 리스크: 외부 인프라 의존성, S3 로컬 모킹(MinIO) 필요

---

## 3. 비교 분석

| 기준 | 채팅 앱 | 칸반 보드 | 블로그 |
|------|---------|----------|--------|
| FE/BE 분리 명확성 | ★★★★★ | ★★★★☆ | ★★★☆☆ |
| 병렬 이슈 동시 진행 | ★★★★★ | ★★★★☆ | ★★★☆☆ |
| 기술 난이도 | ★★★★☆ | ★★★★☆ | ★★★☆☆ |
| 프레임워크 약점 노출 | ★★★★★ | ★★★★☆ | ★★★☆☆ |
| 포트폴리오 가치 | ★★★★★ | ★★★★★ | ★★★★☆ |
| 규모 적절성 (3-5일) | ★★★★☆ | ★★★★★ | ★★★★★ |
| **종합** | **29/30** | **27/30** | **22/30** |

---

## 4. 최종 추천: 실시간 채팅 애플리케이션

### 4.1. 선정 이유 (Claude + Gemini 합의)

1. **FE/BE 분리가 가장 자연스럽다**: REST API(인증/채팅방)와 WebSocket(실시간 메시징)이 명확히 분리되어 병렬 개발을 강제함
2. **복잡한 상태 전이가 풍부하다**: 접속 → 인증 → 방 참여 → 대화의 사용자 상태 + 여러 이슈의 파이프라인 교차
3. **To-Do 앱의 한계를 직접 돌파한다**: DB(SQLite), 실시간(WebSocket), 인증(JWT) 3가지 미검증 기술 과제를 모두 커버
4. **점진적 확장이 가능하다**: 1:1 DM, 파일 전송, 읽음 확인 등으로 후속 이슈 추가 용이

### 4.2. Gemini 고유 관점 (Claude가 놓쳤던 포인트)

- **에이전트 간 협상 시나리오**: Architect가 API를 정했지만 FE Developer가 "이 API로는 Optimistic UI가 어렵다. 필드 추가해달라"고 역제안하는 상황 → PM이 중재해야 함
- **불완전한 요구사항 처리**: "편하게 채팅하게 해줘" 같은 모호한 이슈를 Planner가 어떻게 구체화하는지 관찰

### 4.3. Claude 고유 관점 (Gemini가 놓쳤던 포인트)

- **lock-file.sh 동시성 검증**: FE/BE 에이전트가 실제로 동시 실행될 때 lock-file의 TOCTOU 문제가 표면화
- **auto_dispatch() FE/BE 분기 검증**: orchestrator가 `agent:frontend-developer`와 `agent:backend-developer`를 정확히 구분하여 디스패치하는지 실전 검증
- **ci.yml 실제 테스트**: 현재 echo만 있는 ci.yml이 NestJS + Vitest 환경에서 실제 동작하도록 강제됨
- **Auditor의 WebSocket 보안 검증**: CORS, Origin 검증, 인증 토큰 검증 등 REST와 다른 보안 패턴

---

## 5. To-Do 앱에서 미검증 → 반드시 검증해야 할 시나리오

| # | 시나리오 | To-Do 앱 | 채팅 앱에서 |
|---|---------|---------|-----------|
| 1 | FE/BE 병렬 개발 + 통합 | fullstack 단일 처리 | 강제 분리 |
| 2 | DB 마이그레이션 | 파일 기반 DB | Prisma 마이그레이션 |
| 3 | 환경 변수 관리 | 없음 | DB URL, JWT Secret |
| 4 | 인증/인가 | 없음 | JWT + Guard |
| 5 | 실시간 통신 | 없음 | WebSocket |
| 6 | 의존성 있는 이슈 교차 | 독립 CRUD | #4→#8, #5→#8 등 |
| 7 | 에이전트 간 의존성 충돌 | 없음 | FE가 BE API 미완성 시 블로킹 |
| 8 | 써드파티 라이브러리 활용 | 최소 | Socket.IO, Zustand, Prisma |
| 9 | E2E 비동기 테스트 | 동기 CRUD | WebSocket 수신 대기 |
| 10 | 다중 리소스 관계 | Todo 단일 | User↔Room↔Message |

---

## 6. 성숙도 2단계 → 3단계 진입 조건과 예제의 역할

### 6.1. 3단계(Defined) 진입 기준

| 기준 | 현재 | 3단계 요구 |
|------|------|-----------|
| 프로세스 표준화 | To-Do 1건 검증 | 2건+ 다른 유형 프로젝트로 반복 검증 |
| 에이전트 간 통신 프로토콜 | 라벨 기반 (암묵적) | 문서화된 계약 (API 명세 → FE/BE 동시 착수) |
| 에러 복구 | 반응적 (수동 개입) | 정의된 복구 절차 (agent-failed → 자동 재시도) |
| 정량적 측정 | 없음 | 이슈당 평균 처리 시간, 에이전트별 성공률 |
| 워크플로우 변형 대응 | fullstack만 검증 | FE/BE 분리, 의존성 있는 이슈 처리 |

### 6.2. 채팅 앱이 해야 할 역할

1. **반복 검증**: To-Do 앱과 전혀 다른 기술 스택(NestJS + WebSocket + SQLite)에서 동일 파이프라인 완주 → "우연이 아닌 체계"임을 증명
2. **FE/BE 분리 워크플로우 정착**: Architect → FE Dev + BE Dev (병렬) → Integrator 경로를 실전으로 확립
3. **에이전트 간 계약 문서화**: Architect가 작성한 API 명세가 FE/BE 동시 착수의 기준이 되는 패턴 정립
4. **에러 복구 절차 실전 테스트**: 의도적으로 실패 시나리오(BE API 미완성 시 FE 블로킹)를 만들어 status:blocked → DevOps 복구 경로 검증
5. **정량 데이터 수집 시작**: 각 에이전트의 실행 시간, 성공/실패 횟수를 .harness/logs에 기록하는 패턴 도입

---

## 7. 구현 로드맵 (채팅 앱)

### Phase 1: 기반 (1일)
- Planner → 기획서 작성
- PM → 12개 이슈 분해
- Architect → API 명세 + DB 스키마 + WebSocket 이벤트 정의

### Phase 2: 병렬 개발 (2일)
- **BE Track**: #2(인증) → #5(WebSocket) → #6(채팅방) → #9(메시지 저장)
- **FE Track**: #3(로그인 UI) → #7(채팅 UI) → #4(인증 연동) → #8(WebSocket 연동)
- Orchestrator: 두 트랙을 병렬 디스패치, 의존성 감지

### Phase 3: 통합 + 품질 (1-2일)
- Integrator: FE+BE 통합 정합성 검증
- Auditor: 정적 분석 + WebSocket 보안
- Reviewer: 코드 리뷰
- QA: API 테스트 + WebSocket E2E + Playwright

### Phase 4: 회고 + 프레임워크 개선 (0.5일)
- PIPELINE-SIMULATION.md 작성
- 발견된 프레임워크 문제 수정
- 성숙도 재평가

---

## 8. 결론

| 항목 | 결정 |
|------|------|
| **선정 프로젝트** | 실시간 채팅 애플리케이션 |
| **기술 스택** | Next.js 15 + NestJS + SQLite + Socket.IO + Prisma |
| **예상 이슈 수** | 12개 (FE 5 + BE 4 + Fullstack 2 + QA 1) |
| **목표 성숙도** | 2단계 → 3단계 (Defined) 진입 |
| **핵심 검증 항목** | FE/BE 병렬, WebSocket, DB 마이그레이션, 인증, 의존성 충돌 |
| **Claude-Gemini 합의** | 만장일치 추천 |

> **다음 단계**: 이 리포트를 기반으로 `examples/chat-app/` 프로젝트를 시작하고, Planner 에이전트부터 파이프라인을 실행한다.
