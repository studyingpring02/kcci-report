import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { title, author, affiliation, topic, points, tone } = await req.json() as {
      title: string
      author: string
      affiliation: string
      topic: string
      points: string
      tone: string
    }

    if (!title || !author || !topic) {
      return NextResponse.json({ error: '제목, 필자명, 주제를 입력해주세요.' }, { status: 400 })
    }

    const toneGuide: Record<string, string> = {
      formal: '격식체, 권위 있는 어조. 학술적 논거와 데이터 인용 중심.',
      persuasive: '설득적 어조. 현실 문제 제기 후 해법 제시 구조.',
      narrative: '스토리텔링형. 구체적 사례나 현장 묘사로 시작해 논점으로 연결.',
    }

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1500,
      system: `당신은 경제 전문 칼럼니스트입니다. 매일경제 MT 시평 스타일의 경제 칼럼을 작성하세요.

MT 시평 문체 특징:
- 도입부: 짧고 임팩트 있는 현상 나열로 시작 ("기후위기, 양극화, AI 확산." 처럼)
- 단락은 3~5문장, 200~300자 내외
- 전문 용어와 평이한 언어를 균형 있게 혼용
- 문장 끝에 ~다. 로 통일 (격식체)
- 논증 구조: 문제 제기 → 원인/배경 분석 → 시사점/해법 제시
- 전체 분량: 800~1000자 (단락 4~6개)
- 인용구나 데이터 언급 시 자연스럽게 녹여 씀

어조: ${toneGuide[tone] || toneGuide['formal']}

반드시 아래 JSON으로만 응답. 코드블록 없이 순수 JSON:
{
  "title": "칼럼 제목",
  "paragraphs": ["단락1", "단락2", "단락3", "단락4", "단락5"]
}

paragraphs는 4~6개. 각 단락은 완결된 문단.`,
      messages: [{
        role: 'user',
        content: `제목: ${title}
필자: ${author} (${affiliation})
주제/논지: ${topic}
핵심 논거: ${points || '없음'}`,
      }],
    })

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')

    const cleaned = text.replace(/```json|```/g, '').trim()
    let column
    try {
      column = JSON.parse(cleaned)
    } catch {
      const s = cleaned.indexOf('{'), e = cleaned.lastIndexOf('}')
      if (s !== -1 && e !== -1) column = JSON.parse(cleaned.slice(s, e + 1))
      else throw new Error('파싱 실패')
    }

    return NextResponse.json({ ...column, author, affiliation })
  } catch (error) {
    console.error('칼럼 생성 오류:', error)
    return NextResponse.json({ error: '칼럼 생성 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
