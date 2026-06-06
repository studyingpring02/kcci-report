import { NextRequest, NextResponse } from 'next/server'
import {
  Document, Packer, Paragraph, TextRun,
  AlignmentType, BorderStyle, WidthType,
} from 'docx'
import { TabType } from '@/types'

const TAB_LABELS: Record<TabType, string> = {
  press: '보도자료형',
  analysis: '경제분석형',
  profile: '인물동향형',
}

interface Article {
  title: string
  paragraphs?: string[]
  summary?: string[]
  sections?: { heading: string; body: string }[]
  source: string
  date: string
}

export async function POST(req: NextRequest) {
  try {
    const { article, type } = await req.json() as { article: Article; type: TabType }
    const label = TAB_LABELS[type] || '경제자료'
    const children: Paragraph[] = []

    // 헤더
    children.push(new Paragraph({
      children: [new TextRun({ text: `대한상공회의소 경제자료실  |  ${label}`, size: 18, color: '888888', font: 'Malgun Gothic' })],
      alignment: AlignmentType.RIGHT,
      spacing: { after: 120 },
    }))

    // 구분선
    children.push(new Paragraph({
      children: [],
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '1a1a1a', space: 1 } },
      spacing: { after: 360 },
    }))

    // 제목 (가운데 정렬, 굵게)
    children.push(new Paragraph({
      children: [new TextRun({ text: article.title || '제목 없음', bold: true, size: 32, font: 'Malgun Gothic', color: '1a1a1a' })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 480 },
    }))

    // 날짜 + 출처
    children.push(new Paragraph({
      children: [new TextRun({ text: `${article.date || ''}    |    출처: ${article.source || '대한상공회의소'}`, size: 19, color: '888888', font: 'Malgun Gothic' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 480 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD', space: 1 } },
    }))

    // 서술형 단락 (paragraphs)
    if (article.paragraphs && article.paragraphs.length > 0) {
      for (const para of article.paragraphs) {
        if (!para.trim()) continue
        children.push(new Paragraph({
          children: [new TextRun({ text: para.trim(), size: 22, font: 'Malgun Gothic', color: '1a1a1a' })],
          spacing: { after: 280 },
          alignment: AlignmentType.JUSTIFIED,
          indent: { firstLine: 440 },
        }))
      }
    }
    // 기존 섹션 형식 호환
    else if (article.sections && article.sections.length > 0) {
      for (const sec of article.sections) {
        if (sec.heading) {
          children.push(new Paragraph({
            children: [new TextRun({ text: sec.heading, bold: true, size: 24, font: 'Malgun Gothic' })],
            spacing: { before: 280, after: 120 },
          }))
        }
        if (sec.body) {
          const lines = sec.body.split('\n').filter(l => l.trim())
          for (const line of lines) {
            children.push(new Paragraph({
              children: [new TextRun({ text: line.trim(), size: 22, font: 'Malgun Gothic', color: '1a1a1a' })],
              spacing: { after: 160 },
              indent: { firstLine: 440 },
            }))
          }
        }
      }
    }

    // 하단
    children.push(new Paragraph({
      children: [],
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD', space: 1 } },
      spacing: { before: 480, after: 120 },
    }))
    children.push(new Paragraph({
      children: [new TextRun({ text: '※ 본 자료는 대한상공회의소 경제자료실 게시용으로 작성되었습니다.', size: 18, color: '9CA3AF', font: 'Malgun Gothic', italics: true })],
      alignment: AlignmentType.CENTER,
    }))

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1800 },
          },
        },
        children,
      }],
    })

    const buffer = await Packer.toBuffer(doc)
    const safeTitle = (article.title || '문서').slice(0, 30).replace(/[\\/:*?"<>|]/g, '_')
    const dateStr = (article.date || '').replace(/\./g, '')
    const filename = `KCCI_${label}_${safeTitle}_${dateStr}.docx`

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    })
  } catch (error) {
    console.error('워드 생성 오류:', error)
    return NextResponse.json({ error: '워드 파일 생성 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
