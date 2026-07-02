# 데일리 플래너

연도 → 월 → 일 드릴다운되는 개인 플래너. 날짜별 시간표 / 할 일 / 메모, localStorage 영구 저장, ICS 캘린더 내보내기, PWA 설치 지원.

## 실행

```bash
npm install
npm run dev
```

→ http://localhost:5173

## 배포 (핸드폰에서 쓰려면)

```bash
npm run build
```

`dist/`를 Vercel에 올리면 끝. (TMDB 앱 배포했던 것과 동일한 방식, SPA라 vercel.json 불필요 — 라우터 없이 상태 기반 뷰 전환이라 새로고침 이슈 없음)

## 핸드폰 홈 화면에 추가 (PWA)

1. 배포된 주소를 핸드폰 브라우저로 열기
2. **Android Chrome**: 메뉴(⋮) → "홈 화면에 추가"
3. **iOS Safari**: 공유 버튼 → "홈 화면에 추가"

앱 아이콘으로 깔리고 주소창 없이 전체화면으로 열림.
> 진짜 위젯(홈 화면에서 캘린더가 바로 보이는 것)은 웹 기술로는 불가. React Native 포팅이 필요.

## 캘린더 연동

상단 "캘린더 내보내기" 버튼 → `planner.ics` 다운로드 →
- **Google Calendar**: 설정 → 가져오기 및 내보내기 → 파일 선택
- **iOS/Mac**: 파일 열면 바로 캘린더에 추가

시간표 블록은 일정으로, 할 일은 종일 이벤트로 들어감.

## 데이터 저장

localStorage(`daily-planner-v1` 키)에 날짜별로 저장. 내용이 비면 해당 날짜 키는 자동 삭제. 브라우저 데이터 삭제하면 날아가니 주의.

## 구조

```
src/
  lib.ts          타입, 날짜 유틸, localStorage, ICS 생성, 테마
  App.tsx         연/월/일 뷰 전환 + 상단 바
  views/
    YearView.tsx  12개월 미니 캘린더 그리드
    MonthView.tsx 월간 캘린더 (일정/할일 미리보기)
    DayView.tsx   시간표 + 할일 + 메모 (자동 저장)
```

## 기기 간 데이터 옮기기

### 방법 1: JSON 백업 (제일 간단, 세팅 불필요)
상단 "백업·동기화" → **백업 파일 저장** → 파일을 카톡 나에게 보내기 등으로 폰에 전달 → 폰에서 **백업 파일 불러오기**.

### 방법 2: Supabase 클라우드 동기화
한 번 세팅하면 버튼 하나로 업로드/다운로드 가능.

1. https://supabase.com 가입 → New Project 생성 (Free 플랜)
2. 좌측 SQL Editor에서 실행:

```sql
create table planner (
  sync_id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);
alter table planner enable row level security;
create policy "anon rw" on planner for all
  to anon using (true) with check (true);
```

3. Settings → API에서 **Project URL**과 **anon public 키** 복사
4. 앱의 "백업·동기화"에 URL, 키, 그리고 **동기화 코드**(아무도 못 맞출 나만의 문자열) 입력
5. PC에서 **업로드** → 폰에서 같은 값 입력 후 **다운로드**

> 주의: 이 방식은 동기화 코드를 아는 사람은 누구나 읽고 쓸 수 있는 단순한 구조야. 개인 플래너 용도로는 충분하지만, 민감한 내용을 적을 거면 코드를 길고 복잡하게. 제대로 하려면 Supabase Auth를 붙이면 됨.
