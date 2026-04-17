# 📖 Glossary — MeetFlow 용어집

> MeetFlow 프로젝트에서 사용하는 서비스·기술·비즈니스 용어를 정리한 문서입니다.
> AI 에이전트(밀로 및 전문가 에이전트)와 팀원 모두가 동일한 언어로 소통하기 위한 단일 기준(Single Source of Truth)입니다.

**문서 버전:** v1.0
**최종 수정일:** 2026-04-17
**관리 주체:** MeetFlow Core Team

---

## 📑 목차

1. [서비스 핵심 개념](#1-서비스-핵심-개념)
2. [AI 에이전트 시스템](#2-ai-에이전트-시스템)
3. [기술 아키텍처](#3-기술-아키텍처)
4. [미팅 & 협업 용어](#4-미팅--협업-용어)
5. [비즈니스 & 제품 용어](#5-비즈니스--제품-용어)
6. [디자인 시스템](#6-디자인-시스템)
7. [약어 사전](#7-약어-사전)

---

## 1. 서비스 핵심 개념

### MeetFlow (미트플로우)
AI 직원 에이전트가 실시간 텍스트 미팅에 직접 참여하는 스마트 미팅 플랫폼.
사람과 AI가 한 회의 공간에서 동등한 발화 주체로 협업하는 것이 핵심 가치.

### AI 직원 (AI Employee)
실제 직원처럼 역할·전문성·책임 영역을 가진 AI 에이전트.
단순 챗봇이 아니라 "회의 참석자"로서 발언권을 가지고 태스크를 수행.

### 실시간 텍스트 미팅 (Real-time Text Meeting)
음성/영상이 아닌 텍스트 기반 채팅 형태의 회의.
AI가 자연스럽게 참여할 수 있도록 설계된 MeetFlow의 기본 포맷.

### 멘션 기반 호출 (Mention-based Invocation)
`@밀로`, `@코틀러` 등 멘션으로 특정 AI 에이전트를 회의에 끌어들이는 인터랙션 방식.

### 라우팅 (Routing)
사용자의 발화나 요청을 분석해 가장 적합한 전문가 에이전트에게 전달하는 과정.
밀로(Milo)가 담당.

---

## 2. AI 에이전트 시스템

### 밀로 (Milo)
**역할:** 라우터 / 코디네이터 (Router & Coordinator)
**특징:** 경량 모델로 빠른 분류와 위임 수행
사용자의 의도를 파악해 적합한 전문가 에이전트를 호출하거나, 여러 에이전트의 응답을 조율.

### 전문가 에이전트 (Specialist Agents)
특정 도메인 전문성을 가진 6명의 AI 직원. 각 인물명은 해당 분야의 대가에서 차용.

| 에이전트 | 모델 원류 | 전문 영역 |
|---------|----------|----------|
| **코틀러 (Kotler)** | Philip Kotler | 마케팅 전략, 시장 분석, 포지셔닝 |
| **프뢰벨 (Froebel)** | Friedrich Fröbel | 유아교육, 교육학, 놀이 기반 학습 |
| **간트 (Gantt)** | Henry Gantt | 프로젝트 관리, 일정, 태스크 분해 |
| **노먼 (Norman)** | Don Norman | UX/UI, 사용자 경험, 인터랙션 디자인 |
| **코르프 (Korff)** | Wilhelm Korff | 윤리, 가치판단, 의사결정 프레임워크 |
| **데밍 (Deming)** | W. Edwards Deming | 품질관리, 프로세스 개선, QA |

### 2단계 라우팅 패턴 (Two-stage Routing Pattern)
MeetFlow의 핵심 아키텍처. 비용·지연 최적화를 위한 설계.
1. **1단계 (Lightweight Router Call):** 밀로가 저비용 모델로 의도 분류 및 에이전트 선택
2. **2단계 (Detailed Agent Call):** 선택된 전문가 에이전트가 고성능 모델로 심층 응답 생성

### 에이전트 페르소나 (Agent Persona)
각 에이전트의 말투, 관점, 전문성, 의사결정 스타일을 정의한 프롬프트 묶음.
`SOUL.md` 형식으로 관리.

### 멀티 에이전트 시스템 (Multi-Agent System, MAS)
여러 AI 에이전트가 협업하며 복합 태스크를 처리하는 구조.
MeetFlow는 LangChain/CrewAI 같은 외부 프레임워크 없이 Anthropic API만으로 직접 구현.

### 시스템 프롬프트 (System Prompt)
에이전트의 정체성·원칙·응답 규칙을 정의하는 최상위 지시문.
대화 턴마다 주입되며, 사용자 메시지보다 우선함.

### 컨텍스트 윈도우 (Context Window)
에이전트가 한 번에 참조할 수 있는 대화/자료의 범위.
미팅이 길어질수록 요약·압축 전략이 필요.

### 툴 호출 (Tool Use / Function Calling)
에이전트가 외부 기능(검색, DB 조회, Slack 전송 등)을 호출하는 동작.
Anthropic API의 tool_use 블록으로 구현.

---

## 3. 기술 아키텍처

### Anthropic API
Claude 모델을 직접 호출하는 REST API.
MeetFlow는 외부 프레임워크 없이 순수 API 호출로 멀티 에이전트 구현.

### Claude Opus / Sonnet / Haiku
Claude 모델 티어. MeetFlow에서의 일반 사용 패턴:
- **Haiku:** 밀로 라우팅(빠른 분류)
- **Sonnet:** 대부분의 전문가 에이전트 응답
- **Opus:** 복잡한 추론·전략 기획이 필요한 경우

### MCP (Model Context Protocol)
Claude가 외부 도구/데이터 소스와 연동하는 표준 프로토콜.
Slack, Notion, Google Calendar 등을 MCP 서버로 연결.

### 세션 상태 (Session State)
한 미팅의 참여자, 발언 기록, 컨텍스트, 활성 에이전트 목록 등을 담은 런타임 상태.

### 메시지 큐 (Message Queue)
여러 에이전트의 동시 응답 요청을 순차 처리하기 위한 대기열.
동시 멘션 시 응답 순서·중복 방지를 담당.

### 스트리밍 응답 (Streaming Response)
에이전트 응답을 토큰 단위로 실시간 전송하는 방식.
회의의 실시간성을 유지하기 위한 필수 기술.

### 상태 저장소 (State Store)
세션·대화 이력·사용자 설정을 저장하는 계층.
LocalStorage(클라이언트 단기) + DB(영구 저장)의 이중 구조.

### 프론트엔드 스택
Next.js + React + TypeScript + Tailwind CSS 기반.

### 백엔드 스택
Node.js 기반 API 레이어 + Anthropic API 프록시 + MCP 커넥터.

---

## 4. 미팅 & 협업 용어

### 미팅 룸 (Meeting Room)
하나의 회의 단위. 제목, 참여자, 초대된 AI 에이전트, 대화 로그를 포함.

### 스레드 (Thread)
미팅 안의 하위 토픽 대화. 특정 주제로 분기해 논의할 때 사용.

### 멘션 (Mention)
`@이름` 형식으로 사람 또는 AI를 호명하는 행위.
AI 에이전트는 멘션되기 전에는 기본적으로 발언하지 않음(opt-in 원칙).

### 발화 턴 (Turn)
한 참여자의 한 번의 발언 단위.

### 회의록 (Meeting Minutes)
미팅 종료 후 AI가 자동 생성하는 요약본.
주요 결정사항, 액션 아이템, 미해결 이슈를 포함.

### 액션 아이템 (Action Item)
미팅에서 도출된 실행 과제. 담당자·기한·상태를 가짐.

### 의사결정 로그 (Decision Log)
회의 중 합의된 결정사항의 기록. 근거와 반대 의견도 함께 남김.

### 사이드바 컨텍스트 (Sidebar Context)
메인 대화 스트림 옆에 표시되는 보조 정보(파일, 링크, 이전 회의 요약 등).

---

## 5. 비즈니스 & 제품 용어

### v2 (버전 2)
현재 개발 중인 MeetFlow의 주요 리뉴얼 버전.
웹 기반, 다크 디자인 시스템, Slack·Notion 연동을 포함.

### CentralFlow CRM 미학
MeetFlow v2의 디자인 참조 레퍼런스.
미니멀한 다크 톤, 절제된 컬러 사용, 정보 밀도 높은 레이아웃이 특징.

### 통합 연동 (Integrations)
외부 도구와의 연결. 1차 타깃은 **Slack**과 **Notion**.
MCP 프로토콜로 구현.

### 온보딩 (Onboarding)
신규 사용자가 워크스페이스 설정 → 팀원 초대 → 첫 AI 미팅까지 도달하는 여정.

### 워크스페이스 (Workspace)
조직 단위의 공간. 여러 미팅 룸, 멤버, 커스텀 에이전트 설정을 포함.

### 커스텀 에이전트 (Custom Agent)
사용자가 자체 프롬프트·지식베이스로 정의하는 AI 직원.
기본 6인 외 추가 역할 확장 수단.

### 크레딧 / 사용량 (Credits / Usage)
에이전트 호출 비용을 추적하는 단위. 토큰 소비량 기반.

### 프리 티어 / 프로 / 엔터프라이즈
과금 티어(기획 중). 무료 사용량, 팀 기능, SSO·감사 로그 등으로 구분.

---

## 6. 디자인 시스템

### 컬러 토큰

| 토큰 | HEX | 용도 |
|-----|-----|-----|
| `--bg-primary` | `#131313` | 메인 배경 |
| `--brand-purple` | `#723CEB` | 브랜드 포인트, CTA |
| `--brand-orange` | `#FF902F` | 보조 강조, 경고 전 단계 |

### 타이포그래피
- **Gilroy:** 디스플레이/헤드라인
- **Lufga:** 서브헤드/강조
- **Inter:** 본문/UI

### 다크 시스템 원칙
배경은 깊은 블랙(`#131313`), 대비는 톤 다운된 화이트로,
브랜드 컬러는 최소한으로 사용해 시각적 피로도를 낮춤.

---

## 7. 약어 사전

| 약어 | 풀네임 | 의미 |
|-----|-------|-----|
| **MAS** | Multi-Agent System | 멀티 에이전트 시스템 |
| **MCP** | Model Context Protocol | 모델 컨텍스트 프로토콜 |
| **LLM** | Large Language Model | 대형 언어 모델 |
| **SSE** | Server-Sent Events | 서버 → 클라이언트 단방향 스트리밍 |
| **RAG** | Retrieval-Augmented Generation | 검색 증강 생성 |
| **UX** | User Experience | 사용자 경험 |
| **UI** | User Interface | 사용자 인터페이스 |
| **CTA** | Call To Action | 행동 유도 버튼/문구 |
| **PRD** | Product Requirements Document | 제품 요구사항 문서 |
| **QA** | Quality Assurance | 품질 보증 |
| **API** | Application Programming Interface | 애플리케이션 인터페이스 |
| **SDK** | Software Development Kit | 개발 도구 모음 |
| **SSO** | Single Sign-On | 통합 로그인 |
| **CRM** | Customer Relationship Management | 고객 관계 관리 |

---

## 📝 문서 관리 규칙

1. **새 용어 추가:** 프로젝트에서 처음 사용되는 용어는 이 문서에 등록 후 사용합니다.
2. **용어 통일:** 동일 개념에 여러 표현이 존재할 경우, 이 문서의 용어를 정식 표기로 삼습니다.
3. **카테고리 확장:** 새 도메인(예: 법무, 데이터) 추가 시 목차를 확장합니다.
4. **에이전트 참조:** 모든 AI 에이전트의 시스템 프롬프트에서 이 문서를 컨텍스트로 참조해 용어 일관성을 유지합니다.

---

*끝.*
