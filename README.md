# 대한상공회의소 경제자료실 글 자동 생성기

인물 이름과 행동/내용을 입력하면 Claude가 웹에서 인물 정보를 검색하고,
대한상공회의소 경제자료실 양식에 맞는 글을 자동으로 작성해 워드(.docx)로 다운로드합니다.

## 기능
- 보도자료형 / 경제분석형 / 인물동향형 3가지 양식
- 인물 이름 입력 시 자동 검색 및 확인
- 워드 파일(.docx) 다운로드

---

## Vercel 배포 (무료, 약 5분)

### 1. GitHub 업로드
```bash
git init && git add . && git commit -m "init"
git remote add origin https://github.com/[아이디]/kcci-report.git
git push -u origin main
```

### 2. Vercel 배포
1. vercel.com → GitHub 로그인
2. Add New Project → repository 선택
3. Environment Variables에 추가:
   - Key: ANTHROPIC_API_KEY
   - Value: sk-ant-... (본인 API 키)
4. Deploy 클릭

---

## 로컬 실행
```bash
npm install
cp .env.example .env.local   # API 키 입력
npm run dev                  # localhost:3000
```

## API 키 발급
console.anthropic.com → API Keys → Create Key
