# 🧳 여행 경비 정산 (trip-expense-app)

▶ **바로 열기: https://96dcyymg7v-arch.github.io/trip-expense-app/**
(아이폰 Safari → 공유 → 홈 화면에 추가하면 앱처럼 열려요)

여행 중 쓴 돈을 기록하면 **누가 누구에게 얼마를 보내면 되는지**까지 자동으로 계산해 주는
아이폰 홈 화면용 웹앱이에요. 서버·DB 없이 브라우저 `localStorage`에만 저장되는 정적 사이트라
그대로 GitHub + Vercel에 올릴 수 있어요.

- 엔·페소·달러처럼 **현지 통화로 결제**해도 원화로 바로 환산
- 2~8명 **N빵**, "일부만 나누기"(예: 오락실은 민지만) 지원
- **최소 이체 횟수** 정산 + 카톡에 붙여넣을 정산 요약 텍스트
- 목표 예산 게이지 · 카테고리 비중 바 차트
- JSON 내보내기/불러오기 백업

## 화면

- **홈** — 이번 여행 총 지출·1인당 금액·예산 게이지, 지출 목록(샘플 항목엔 `샘플` 태그)
- **+ 지출 추가** — 현지 금액·원화 결제 선택, 카테고리, 결제한 사람, 같이 나눌 사람
- **정산** — 멤버별 낸 돈/쓴 돈/보낼 돈, 최소 이체 목록, 카테고리 비중, 공유 텍스트 복사
- **설정** — 통화·환율·예산·멤버 관리, JSON 백업, 데이터 초기화

## 파일 구조

```
index.html              앱 껍데기 + PWA 메타 태그
styles.css              파스텔 핑크/피치 카드 UI (모바일 퍼스트)
tripmath.js             정산 계산 로직 (DOM 없음 · 단위 테스트 대상)
app.js                  화면 렌더링 · 상태 저장 · 이벤트
manifest.webmanifest    홈 화면 추가용 매니페스트
sw.js                   오프라인 캐시(네트워크 우선, 실패 시 캐시)
icons/                  앱 아이콘 (180/192/512)
```

> `tests/`(단위·E2E 테스트, 캡처 스크립트), `preview/`(로컬 화면 캡처)는 `.gitignore`로
> 저장소에 올리지 않아요. 배포에는 위 앱 파일만 들어갑니다.

## 실행

정적 파일이라 서버 없이도 열리지만, 홈 화면 추가·서비스워커는 http(s)에서만 동작해요.

```bash
cd trip-expense-app
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000
```

아이폰 사파리에서 열고 **공유 → 홈 화면에 추가**를 누르면 앱처럼 전체 화면으로 열려요.

## 배포 (GitHub Pages / Vercel)

1. 이 폴더를 GitHub 저장소에 올린다 (빌드 과정 없음).
2. GitHub: **Settings → Pages → Source: Deploy from a branch → main / (root)** → Save.
   `https://<owner>.github.io/trip-expense-app/` 로 열려요.
3. Vercel을 쓴다면 **Add New → Project → 저장소 선택** → Framework Preset **Other**,
   Build Command·Output Directory 비움. (하위 폴더에 두었다면 Root Directory만 지정)
4. 나온 주소를 아이폰 사파리로 열고 홈 화면에 추가.

모든 경로가 상대 경로라(`./index.html`, `./styles.css`) 하위 경로 배포도 그대로 동작해요.
앱 파일을 고쳐 올리면 `sw.js`의 `CACHE` 이름을 올려 주세요(지금은 `trip-expense-v4`).
그래야 이미 앱을 설치한 브라우저도 새 버전을 받아요.

## 정산 계산 규칙

- **환산**: `원화 = 금액 × 환율`, 지출 1건마다 원 단위로 반올림해 더해요(영수증 단위 합계와 일치).
- **원화 결제**: 카드값이 원화로 찍힌 건은 `원화로 결제했어요`로 입력 → 현지 금액 없이 원화 그대로 집계.
- **분담**: 선택한 인원에게 똑같이 나누고, 1원 단위 잔차는 최대잔여법으로 배분해 **부담 합계 = 총액**을 보장.
- **최소 이체**: 낼 사람(음수 잔액)과 받을 사람(양수 잔액)을 큰 금액 순으로 짝지어 `n-1`회 이내로 정리.
- **1인당**: 전체 인원 기준 평균(`총액 ÷ 인원`). 일부 인원만 나눈 지출이 있어도 표시는 전체 평균.
- **환율 기본값**: 2026-11-19 조회값(1 JPY = 8.3834원, 1 PHP = 20.9705원, 1 USD = 1,335.11원 …).
  설정 화면에서 직접 고칠 수 있어요.

## 샘플 데이터

첫 화면의 **샘플 여행 구경하기**를 누르면 '봄 여행 2박 3일 (샘플)'이 들어와요.
민지·지훈 두 사람, 2026년 5월 어느 주말, 공항 특급열차·숙소·식사·기념품 같은
**모두 가상의 예시 항목**입니다. 화면 위에 `샘플` 배너와 항목별 태그가 붙고,
설정에서 언제든 지울 수 있어요.

## 저장 데이터 (localStorage `trip-expense-app/v1`)

```json
{
  "version": 1,
  "activeTripId": "t_...",
  "trips": [{
    "id": "t_...", "name": "봄 여행 2박 3일", "currency": "JPY", "rate": 8.3834,
    "budget": 900000, "isSample": false,
    "members": [{ "id": "m_...", "name": "민지" }],
    "expenses": [{
      "id": "e_...", "title": "라멘 한 그릇", "amount": 1200,
      "paidInKRW": false, "amountKRW": 0, "category": "food",
      "payerId": "m_...", "participantIds": ["m_...", "m_..."],
      "at": "2026-05-01T13:00", "memo": "", "isSample": false
    }]
  }]
}
```

내보내기 파일은 `{ "app": "trip-expense-app", "version": 1, "exportedAt": "...", "trips": [...] }`
형태이고, 불러오면 기존 여행은 그대로 둔 채 목록에 **추가**돼요(같은 id는 새 id로 발급).

## 테스트

```bash
# 1) 계산 로직 단위 테스트 (quickjs 엔진에서 tripmath.js 실행)
python3 -m pip install quickjs
python3 tests/run_logic_tests.py
# → ALL PASS passed=63 failed=0

# 2) 실제 헤드리스 Chromium E2E (아이폰 390x844)
python3 -m pip install playwright   # 크롬 바이너리는 CHROME_BIN 으로 지정
CHROME_BIN=/path/to/chrome-headless-shell python3 tests/e2e_test.py
# → === E2E 결과: 88/88 통과 ===

# 3) 문서용 스크린샷 다시 만들기
CHROME_BIN=/path/to/chrome-headless-shell python3 tests/make_previews.py
```

E2E가 확인하는 것: 온보딩 → 샘플 불러오기 → 지출 추가/수정/삭제 → 새로고침 후 유지 →
원화 결제 모드 → 일부 인원만 나누기 → 정산 결과·이체 방향 → 클립보드 복사 → 예산/이름 변경 →
멤버 추가 → JSON 내보내기/불러오기 → 통화 변경(JPY→USD) → 375/430px 레이아웃 →
PWA 메타·매니페스트·서비스워커 → **JS 콘솔 에러 0건**.

## 알려진 한계

- 데이터는 **이 기기 브라우저에만** 저장돼요. 기기를 바꾸려면 JSON 내보내기/불러오기로 옮겨 주세요.
- 여러 명이 실시간으로 함께 쓰는 기능(동기화·초대)은 아직 없어요. 한 명이 기록하고 정산문을 공유하는 방식이에요.
- 환율은 입력 시점 값을 쓰고 자동 갱신하지 않아요(여행 중 오프라인에서도 동작해야 해서).
- 사파리 시크릿 모드에서는 localStorage가 지워질 수 있어요.
