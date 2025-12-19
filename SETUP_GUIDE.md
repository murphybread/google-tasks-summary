# Google Tasks Summary 설정 가이드

## 목차

1. [처음 사용하는 경우 (초기 설정)](#1-처음-사용하는-경우-초기-설정)
2. [기존 Apps Script 프로젝트 연동하기](#2-기존-apps-script-프로젝트-연동하기)
3. [이후 배포하는 경우 (업데이트)](#3-이후-배포하는-경우-업데이트)

---

## 1. 처음 사용하는 경우 (초기 설정)

### 1.1 사전 준비

- Node.js 설치 확인 (터미널에서 `node --version` 실행)
- Google 계정 준비
- Google Sheets에서 빈 스프레드시트 생성 및 ID 확인
  - 스프레드시트 URL: `https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit`
  - `{SHEET_ID}` 부분을 복사해두기
  - **참고**: 시트(탭)를 미리 만들 필요가 없습니다. `Daily`, `Weekly` 시트가 자동으로 생성됩니다.

### 1.2 프로젝트 초기화

#### (1) 의존성 설치

```bash
npm install
```

#### (2) Google Apps Script CLI (clasp) 설치

```bash
npm install -g @google/clasp
```

#### (3) Google 계정 로그인

```bash
clasp login
```

- 브라우저가 열리면 Google 계정으로 로그인
- 권한 요청을 승인

### 1.3 Apps Script 프로젝트 생성

#### (1) 새 Apps Script 프로젝트 생성

```bash
clasp create --type webapp --title "Google Tasks Summary"
```

- 이 명령어가 `.clasp.json` 파일을 자동 생성합니다

#### (2) 코드 업로드

```bash
clasp push
```

### 1.4 Google Apps Script UI에서 설정

#### (1) Apps Script 편집기 열기

```bash
clasp open
```

#### (2) Apps Script 고급 서비스 활성화

1. 좌측 메뉴에서 **Services (서비스)** 클릭
2. **Google Tasks API** 검색
3. **Add (추가)** 클릭

#### (3) Script Properties 설정

1. 좌측 메뉴에서 **Project Settings (프로젝트 설정)** 클릭
2. **Script Properties** 섹션 찾기
3. **Add script property** 클릭하여 다음 3개 변수 추가:

| Property           | Value 예시      | 설명                           |
| ------------------ | --------------- | ------------------------------ |
| `TASK_LIST_NAME`   | `내 할 일 목록` | Google Tasks의 목록 이름       |
| `TEAM_MEMBER_NAME` | `홍길동`        | 사용자 이름 (보고서에 표시됨)  |
| `SHEET_ID`         | `1AbC...XYZ`    | 1.1에서 복사한 스프레드시트 ID |

**주의**: Google Tasks 앱에서 실제 목록 이름을 정확히 확인하여 입력하세요.

### 1.5 배포 생성

#### (1) 첫 배포 생성

```bash
npm run deploy:new
```

#### (2) 배포 ID 확인

배포 완료 후 출력되는 **Deployment ID**를 복사합니다.
예: `AKfycbxwi03iPbI7yvBTTagbtpt-sg4GU5JRlZ4kAQnXh9G8X_wiPJNkq_kPKMdiIGOoMQ`

#### (3) deploy.js 파일 수정

[deploy.js](deploy.js) 파일을 열어 4번째 줄의 `DEPLOYMENT_ID`를 방금 복사한 ID로 변경:

```javascript
const DEPLOYMENT_ID = "여기에_복사한_배포_ID_붙여넣기";
```

### 1.6 웹앱 접속 테스트

#### (1) 웹앱 URL 확인

```bash
npm run deploy
```

실행 후 출력되는 웹앱 URL을 브라우저에서 열기

#### (2) 권한 승인

- 첫 접속 시 Google 계정 선택 및 권한 승인 필요
- "이 앱은 확인되지 않았습니다" 경고가 나올 수 있음 → **고급** → **안전하지 않은 페이지로 이동** 클릭

---

## 2. 기존 Apps Script 프로젝트 연동하기

이미 Google Apps Script에서 생성된 프로젝트를 로컬 코드와 연동하는 경우:

### 2.1 Script ID 확인

#### (1) Apps Script 편집기 접속

1. [Google Apps Script](https://script.google.com) 접속
2. 연동하려는 프로젝트 열기

#### (2) Script ID 복사

1. 좌측 메뉴에서 **프로젝트 설정** (톱니바퀴 아이콘) 클릭
2. **스크립트 ID** 확인 및 복사
   - 예: `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms`

### 2.2 로컬 프로젝트 연동

#### (1) .clasp.json 파일 생성

프로젝트 루트 디렉토리에 `.clasp.json` 파일을 수동으로 생성:

```json
{
  "scriptId": "여기에_복사한_Script_ID_붙여넣기",
  "rootDir": "."
}
```

**예시:**

```json
{
  "scriptId": "12Axi12s28G...",
  "rootDir": "."
}
```

#### (2) clasp 로그인 (필요시)

```bash
clasp login
```

#### (3) 기존 코드 다운로드 받기 (선택사항)

⚠️ **중요한 주의사항**:

- **`clasp pull` 명령어는 기존 로컬 파일을 덮어씁니다!**
- 로컬에 작업 중인 코드가 있다면 먼저 백업하세요.

기존 Apps Script 프로젝트의 코드를 로컬로 다운로드하려면:

```bash
clasp pull
```

**권장 작업 흐름:**

1. 로컬 코드를 업로드할 예정이라면 → `clasp pull` 건너뛰기
2. Apps Script의 코드를 로컬로 가져올 예정이라면:
   - 로컬 파일 백업 (또는 Git commit)
   - `clasp pull` 실행
   - 필요시 백업한 파일과 병합

#### (4) 로컬 코드를 Apps Script로 업로드

⚠️ **중요한 주의사항**:

- **`clasp push` 명령어는 Apps Script의 기존 코드를 덮어씁니다!**
- Apps Script에 중요한 코드가 있다면 먼저 백업하세요.

로컬 코드를 Apps Script 프로젝트로 업로드:

```bash
clasp push
```

또는 확인 메시지와 함께 푸시:

```bash
clasp push --force
```

### 2.3 배포 설정

#### (1) 기존 배포 ID 확인 (선택사항)

기존에 배포가 있다면 배포 목록 확인:

```bash
clasp deployments
```

출력 예시:

```
3 Deployments.
- AK25r222i... @1 - First deployment
- AK25r222i... @2 - Update UI
- AK25r222i... @HEAD - Latest
```

#### (2) deploy.js 파일 수정

기존 배포를 업데이트하려면 [deploy.js](deploy.js) 파일을 열어 4번째 줄의 `DEPLOYMENT_ID` 수정:

```javascript
const DEPLOYMENT_ID = "여기에_기존_배포_ID_붙여넣기";
```

또는 새 배포를 생성하려면:

```bash
npm run deploy:new
```

### 2.4 연동 확인

#### (1) Apps Script 편집기 열기

```bash
clasp open
```

#### (2) 파일이 정상적으로 동기화되었는지 확인

- [Code.js](Code.js), [Index.html](Index.html) 등이 보이는지 확인

#### (3) 배포 및 테스트

```bash
npm run deploy
```

### 2.5 연동 시 체크리스트

연동 후 다음 항목들을 확인하세요:

- [ ] `.clasp.json` 파일에 올바른 `scriptId` 입력
- [ ] `clasp push`로 코드 업로드 완료
- [ ] Apps Script 편집기에서 파일 확인
- [ ] **Google Tasks API** 서비스 활성화 여부 확인 (1.4-②)
- [ ] **Script Properties** 설정 확인 (1.4-③):
  - `TASK_LIST_NAME`
  - `TEAM_MEMBER_NAME`
  - `SHEET_ID`
- [ ] 배포 ID 설정 ([deploy.js](deploy.js))
- [ ] 웹앱 접속 테스트

---

## 3. 이후 배포하는 경우 (업데이트)

기존 프로젝트를 수정하고 재배포하는 경우:

### 3.1 코드 수정 후 배포

#### (1) 기본 배포 (설명 없이)

```bash
npm run deploy
```

#### (2) 설명과 함께 배포

```bash
npm run deploy "버그 수정 및 UI 개선"
```

### 3.2 배포 목록 확인

```bash
npm run deployments
```

### 3.3 주의사항

- `.clasp.json` 파일이 있어야 합니다
- 로그인 상태가 만료되었다면 `clasp login` 재실행
- Script Properties는 한 번만 설정하면 유지됩니다

---

## 4. 문제 해결 (Troubleshooting)

### "Google Tasks API 서비스가 활성화되지 않았습니다" 오류

→ 1.4-(2) 단계 다시 확인 (Apps Script 편집기에서 Services 추가)

### "Task 목록을 찾을 수 없습니다" 오류

→ Script Properties의 `TASK_LIST_NAME`이 Google Tasks의 실제 목록 이름과 일치하는지 확인

### 배포 후 변경사항이 반영되지 않음

→ 브라우저 캐시 삭제 또는 시크릿 모드에서 접속

### clasp 명령어 인식 안 됨

→ clasp 글로벌 설치: `npm install -g @google/clasp`

---

## 5. 프로젝트 파일 구조

```
google-tasks-summary/
├── Code.js              # 메인 Apps Script 로직
├── Index.html           # 웹앱 UI
├── deploy.js            # 배포 자동화 스크립트
├── appsscript.json      # Apps Script 설정
├── package.json         # npm 스크립트 정의
├── .clasp.json          # clasp 설정 (자동 생성, Git 제외)
└── .gitignore           # Git 제외 파일 목록
```

---

## 6. 유용한 명령어 모음

| 명령어                | 설명                                  |
| --------------------- | ------------------------------------- |
| `npm run push`        | 코드만 업로드 (배포 안 함)            |
| `npm run deploy`      | 코드 업로드 + 기존 배포 업데이트      |
| `npm run deploy:new`  | 새 배포 생성                          |
| `npm run deployments` | 배포 목록 확인                        |
| `clasp open`          | Apps Script 편집기 열기               |
| `clasp login`         | Google 계정 로그인                    |
| `clasp logout`        | 로그아웃                              |
| `clasp pull`          | Apps Script → 로컬로 코드 다운로드 ⚠️ |
| `clasp push`          | 로컬 → Apps Script로 코드 업로드 ⚠️   |

---

**작성일**: 2025-01-19
**프로젝트**: Google Tasks Summary Web App
