import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { TabType, PersonInfo } from '@/types'

export const maxDuration = 60

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const TYPE_PROMPTS: Record<TabType, string> = {
  press: `대한상공회의소 경제자료실에 올라가는 보도자료를 작성하세요.

형식:
- 제목: "○○ ○○직책, △△ 내용" (예: "최태원 대한상의 회장, AI 반도체 투자 선언")
- 본문: 서술형 단락 3~5개
  * 첫 단락: 누가 언제 어디서 무엇을 했는지 (날짜 포함)
  * 둘째 단락: 배경 및 맥락
  * 셋째~넷째 단락: 주요 발언 인용 ("..."라며 등)
  * 마지막 단락: 향후 계획 또는 의미

실제 보도자료 예시:
"최태원 대한상공회의소 회장은 27일 서울 중구 대한상의 회관에서 김진오 저출산고령사회위원회 부위원장과 첫 만남을 가졌다."
"최태원 회장은 '저출생은 단순히 출산율만의 문제가 아니라...'라며 경제계도 힘을 보태겠다고 밝혔다."`,

  analysis: `대한상공회의소 경제자료실에 올라가는 경제분석 보도자료를 작성하세요.

형식:
- 제목: 분석 주제 중심 (예: "對美 실효관세율, 韓 3위→6위로 개선")
- 본문: 서술형 단락 4~6개
  * 첫 단락: 핵심 분석 결과 요약 (굵은 불릿 3줄 포함)
  * 이후 단락: 구체적 수치와 분석 내용
  * 마지막 단락: 시사점 및 전문가/기관 코멘트 인용

실제 스타일처럼 수치와 데이터를 포함하세요.`,

  profile: `대한상공회의소 경제자료실에 올라가는 인물동향 보도자료를 작성하세요.

형식:
- 제목: "○○ ○○직책, △△ 추진/발표/선언"
- 본문: 서술형 단락 3~5개
  * 첫 단락: 인물 소개 및 주요 행보
  * 둘째 단락: 배경 및 경위
  * 셋째~넷째 단락: 주요 발언 인용
  * 마지막 단락: 향후 계획`,
}

export async function POST(req: NextRequest) {
  try {
    const { type, name, org, content, keyword, personInfo } = await req.json() as {
      type: TabType; name: string; org: string
      content: string; keyword: string; personInfo: PersonInfo
    }

    if (!name || !content) {
      return NextResponse.json({ error: '인물 이름과 내용을 입력해주세요.' }, { status: 400 })
    }

    const today = new Date().toLocaleDateString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).replace(/\. /g, '.').replace(/\.$/, '')

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1000,
      system: `${TYPE_PROMPTS[type]}

반드시 아래 JSON 형식으로만 응답하세요. 코드블록 없이 순수 JSON:
{"title":"제목","paragraphs":["단락1","단락2","단락3","단락4"],"source":"대한상공회의소","date":"${today}"}

paragraphs는 3~5개 서술형 단락. 각 단락은 2~4문장.
인용구는 큰따옴표로: "..."라며 / "..."라고 밝혔다 / "..."고 강조했다`,
      messages: [{
        role: 'user',
        content: `인물: ${personInfo?.name || name} (${personInfo?.title || ''} / ${personInfo?.org || org || ''})
약력: ${personInfo?.summary || ''}
내용: ${content}
키워드: ${keyword || '없음'}
오늘 날짜: ${today}`,
      }],
    })

    const textContent = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')

    const cleaned = textContent.replace(/```json|```/g, '').trim()
    let article
    try { article = JSON.parse(cleaned) }
    catch {
      const start = cleaned.indexOf('{')
      const end = cleaned.lastIndexOf('}')
      if (start !== -1 && end !== -1) {
        try { article = JSON.parse(cleaned.slice(start, end + 1)) }
        catch { throw new Error('JSON 파싱 실패') }
      }
    }

    return NextResponse.json(article)
  } catch (error) {
    console.error('글 생성 오류:', error)
    return NextResponse.json({ error: '글 생성 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
