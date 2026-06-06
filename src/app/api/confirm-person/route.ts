import { NextRequest, NextResponse } from 'next/server'
import { savePerson } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    await savePerson({
      name: body.name,
      org: body.org || '',
      title: body.title || '',
      summary: body.summary || '',
      image_url: body.image_url || '',
      naver_link: body.naver_link || '',
      confirmed: true,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('인물 저장 오류:', error)
    return NextResponse.json({ error: '저장 실패' }, { status: 500 })
  }
}
