import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

export const maxDuration = 120

const execAsync = promisify(exec)
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { topic, content, volume, author } = await req.json() as {
      topic: string
      content: string
      volume?: string
      author?: string
    }

    if (!topic || !content) {
      return NextResponse.json({ error: '주제와 내용을 입력해주세요.' }, { status: 400 })
    }

    const today = new Date().toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric',
    })

    // Claude로 브리프인포 구조화된 콘텐츠 생성
    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2000,
      system: `대한상공회의소 경제연구원 "대한상의 경제 인사이트" 보고서 형식으로 내용을 작성하세요.

반드시 아래 JSON 형식으로만 응답하세요. 코드블록 없이 순수 JSON:
{
  "title": "보고서 제목",
  "subtitle": "부제목 (있으면)",
  "abstract": "요약문 (4~6문장. 분석 배경, 주요 결과, 정책 시사점 포함)",
  "sections": [
    {
      "heading": "Ⅰ. 서론",
      "bullets": [
        { "main": "□ 핵심 포인트 (굵은 헤드)", "subs": ["○ 세부 내용 1", "○ 세부 내용 2"] }
      ]
    },
    {
      "heading": "Ⅱ. 현황 분석",
      "bullets": [
        { "main": "□ 핵심 포인트", "subs": ["○ 세부 내용", "– 하위 내용"] }
      ]
    },
    {
      "heading": "Ⅲ. 결론 및 시사점",
      "bullets": [
        { "main": "□ 정책 제언", "subs": ["① 첫 번째 제언 내용", "② 두 번째 제언 내용"] }
      ]
    }
  ]
}

sections는 3~4개, 각 섹션 bullets는 2~5개. 대한상의 보고서 특유의 □ / ○ / – / ① ② ③ 계층 구조를 반드시 사용하세요.`,
      messages: [{
        role: 'user',
        content: `주제: ${topic}\n내용: ${content}\n오늘 날짜: ${today}`,
      }],
    })

    const textContent = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')

    const cleaned = textContent.replace(/```json|```/g, '').trim()
    let briefData
    try {
      briefData = JSON.parse(cleaned)
    } catch {
      const start = cleaned.indexOf('{')
      const end = cleaned.lastIndexOf('}')
      if (start !== -1 && end !== -1) {
        briefData = JSON.parse(cleaned.slice(start, end + 1))
      } else {
        throw new Error('콘텐츠 생성 실패')
      }
    }

    // Python reportlab으로 PDF 생성
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kcci-brief-'))
    const jsonPath = path.join(tmpDir, 'brief.json')
    const pdfPath = path.join(tmpDir, 'output.pdf')

    const pdfData = {
      ...briefData,
      volume: volume || '',
      author: author || '',
      date: today,
    }

    await fs.writeFile(jsonPath, JSON.stringify(pdfData, null, 2), 'utf-8')

    const pythonScript = `
import json
import sys
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os

# 한글 폰트 등록
font_paths = [
    '/usr/share/fonts/truetype/nanum/NanumGothic.ttf',
    '/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
]

font_name = 'Helvetica'
font_bold = 'Helvetica-Bold'

for fp in font_paths:
    if os.path.exists(fp):
        try:
            pdfmetrics.registerFont(TTFont('NanumGothic', fp))
            font_name = 'NanumGothic'
            break
        except:
            pass

bold_paths = [
    '/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf',
    '/usr/share/fonts/truetype/nanum/NanumGothic.ttf',
]
for fp in bold_paths:
    if os.path.exists(fp):
        try:
            pdfmetrics.registerFont(TTFont('NanumGothicBold', fp))
            font_bold = 'NanumGothicBold'
            break
        except:
            pass

with open('${jsonPath}', 'r', encoding='utf-8') as f:
    data = json.load(f)

# 색상
NAVY = HexColor('#1a3a5c')
TEAL = HexColor('#0d7a6e')
LIGHT_BG = HexColor('#f5f7fa')
GRAY_TEXT = HexColor('#555555')
DARK = HexColor('#1a1a1a')
DIVIDER = HexColor('#cccccc')

PAGE_W, PAGE_H = A4
MARGIN_L = 20*mm
MARGIN_R = 20*mm
MARGIN_T = 15*mm
MARGIN_B = 20*mm
TEXT_W = PAGE_W - MARGIN_L - MARGIN_R

def make_styles():
    return {
        'heading': ParagraphStyle('heading', fontName=font_bold, fontSize=11, textColor=DARK, spaceBefore=8, spaceAfter=4, leading=16),
        'bullet_main': ParagraphStyle('bullet_main', fontName=font_bold, fontSize=9.5, textColor=DARK, spaceBefore=5, spaceAfter=2, leading=15, leftIndent=0),
        'bullet_sub': ParagraphStyle('bullet_sub', fontName=font_name, fontSize=9, textColor=GRAY_TEXT, spaceBefore=1, spaceAfter=1, leading=14, leftIndent=10),
        'bullet_sub2': ParagraphStyle('bullet_sub2', fontName=font_name, fontSize=8.5, textColor=GRAY_TEXT, spaceBefore=1, spaceAfter=1, leading=13, leftIndent=20),
        'abstract': ParagraphStyle('abstract', fontName=font_name, fontSize=9.5, textColor=DARK, spaceBefore=4, spaceAfter=4, leading=16, alignment=TA_JUSTIFY),
        'footer': ParagraphStyle('footer', fontName=font_name, fontSize=7.5, textColor=HexColor('#888888'), alignment=TA_CENTER),
        'meta': ParagraphStyle('meta', fontName=font_name, fontSize=8, textColor=HexColor('#888888'), alignment=TA_RIGHT),
    }

styles = make_styles()

story = []

# ── 헤더 테이블 ──
header_data = [[
    Paragraph('<font color="#1a3a5c"><b>대한상공회의소 경제연구원</b></font>', ParagraphStyle('hdr', fontName=font_bold, fontSize=9, textColor=NAVY)),
    Paragraph('<font size=18><b>대한상의 경제 인사이트</b></font>', ParagraphStyle('title_hdr', fontName=font_bold, fontSize=16, textColor=NAVY, alignment=TA_RIGHT)),
]]
header_table = Table(header_data, colWidths=[TEXT_W*0.4, TEXT_W*0.6])
header_table.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (-1,-1), LIGHT_BG),
    ('TOPPADDING', (0,0), (-1,-1), 8),
    ('BOTTOMPADDING', (0,0), (-1,-1), 8),
    ('LEFTPADDING', (0,0), (0,0), 10),
    ('RIGHTPADDING', (-1,0), (-1,0), 10),
    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ('LINEBELOW', (0,0), (-1,-1), 2, NAVY),
]))
story.append(header_table)

# vol / date 메타
meta_line = f"vol. {data.get('volume',''):<10}{'':>5}{data.get('date','')}"
story.append(Spacer(1, 3*mm))
story.append(Paragraph(meta_line, styles['meta']))
story.append(Spacer(1, 3*mm))

# ── 제목 ──
title_style = ParagraphStyle('main_title', fontName=font_bold, fontSize=18, textColor=DARK, alignment=TA_CENTER, spaceBefore=6, spaceAfter=4, leading=26)
story.append(Paragraph(data.get('title', ''), title_style))
if data.get('subtitle'):
    sub_style = ParagraphStyle('sub_title', fontName=font_name, fontSize=13, textColor=GRAY_TEXT, alignment=TA_CENTER, spaceAfter=6, leading=18)
    story.append(Paragraph(data['subtitle'], sub_style))

if data.get('author'):
    auth_style = ParagraphStyle('author', fontName=font_name, fontSize=9, textColor=HexColor('#888888'), alignment=TA_RIGHT, spaceAfter=4)
    story.append(Paragraph(data['author'] + ' 연구위원', auth_style))

story.append(HRFlowable(width=TEXT_W, thickness=1, color=DIVIDER, spaceAfter=4*mm))

# ── 요약 박스 ──
if data.get('abstract'):
    abs_rows = [[Paragraph(data['abstract'], styles['abstract'])]]
    abs_table = Table(abs_rows, colWidths=[TEXT_W - 8*mm])
    abs_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), LIGHT_BG),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
        ('LINEAFTER', (0,0), (0,-1), 3, TEAL),
    ]))
    story.append(abs_table)
    story.append(Spacer(1, 4*mm))

# ── 2단 본문 ──
def build_section(sec):
    elems = []
    # 섹션 헤더
    heading_style = ParagraphStyle('sec_head', fontName=font_bold, fontSize=10.5, textColor=DARK,
        spaceBefore=6, spaceAfter=3, leading=16,
        borderPad=4, borderColor=TEAL, borderWidth=0,
        leftIndent=0)
    elems.append(Paragraph(f'<b>{sec["heading"]}</b>', heading_style))
    elems.append(HRFlowable(width='100%', thickness=1.5, color=TEAL, spaceAfter=3))

    for bullet in sec.get('bullets', []):
        elems.append(Paragraph(bullet['main'], styles['bullet_main']))
        for sub in bullet.get('subs', []):
            if sub.startswith('–') or sub.startswith('-'):
                elems.append(Paragraph(sub, styles['bullet_sub2']))
            else:
                elems.append(Paragraph(sub, styles['bullet_sub']))
    return elems

sections = data.get('sections', [])

if sections:
    mid = (len(sections) + 1) // 2
    left_secs = sections[:mid]
    right_secs = sections[mid:]

    left_elems = []
    for sec in left_secs:
        left_elems.extend(build_section(sec))
        left_elems.append(Spacer(1, 4*mm))

    right_elems = []
    for sec in right_secs:
        right_elems.extend(build_section(sec))
        right_elems.append(Spacer(1, 4*mm))

    if right_elems:
        col_w = (TEXT_W - 5*mm) / 2
        two_col = Table([[left_elems, right_elems]], colWidths=[col_w, col_w],
                        hAlign='LEFT')
        two_col.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('LEFTPADDING', (0,0), (-1,-1), 0),
            ('RIGHTPADDING', (0,0), (0,-1), 5),
            ('LEFTPADDING', (1,0), (1,-1), 5),
            ('LINEAFTER', (0,0), (0,-1), 0.5, DIVIDER),
        ]))
        story.append(two_col)
    else:
        for elem in left_elems:
            story.append(elem)

# ── 푸터 ──
story.append(Spacer(1, 6*mm))
story.append(HRFlowable(width=TEXT_W, thickness=0.5, color=DIVIDER, spaceAfter=3))
story.append(Paragraph('* 본 자료는 집필자 개인의견이며 대한상공회의소 및 경제연구원의 공식견해와는 무관합니다.', styles['footer']))

# ── 빌드 ──
doc = SimpleDocTemplate(
    '${pdfPath}',
    pagesize=A4,
    leftMargin=MARGIN_L, rightMargin=MARGIN_R,
    topMargin=MARGIN_T, bottomMargin=MARGIN_B,
)
doc.build(story)
print('done')
`

    await fs.writeFile(path.join(tmpDir, 'gen.py'), pythonScript, 'utf-8')

    const { stdout, stderr } = await execAsync(`python3 ${path.join(tmpDir, 'gen.py')}`)
    if (stderr && !stdout.includes('done')) {
      console.error('Python error:', stderr)
      throw new Error('PDF 생성 실패: ' + stderr.slice(0, 200))
    }

    const pdfBuffer = await fs.readFile(pdfPath)
    await fs.rm(tmpDir, { recursive: true, force: true })

    const safeName = (briefData.title || topic).slice(0, 30).replace(/[\\/\\:*?"<>|]/g, '_')
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const filename = `KCCI_브리프인포_${safeName}_${dateStr}.pdf`

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    })
  } catch (error) {
    console.error('브리프인포 PDF 오류:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'PDF 생성 오류' },
      { status: 500 }
    )
  }
}
