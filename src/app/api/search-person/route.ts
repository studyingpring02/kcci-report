import { NextRequest, NextResponse } from 'next/server'
import { getCachedPerson, savePerson } from '@/lib/supabase'

export const maxDuration = 60

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || ''
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || ''

async function naverSearch(query: string, type: 'news' | 'image', display = 3) {
  try {
    const url = `https://openapi.naver.com/v1/search/${type}.json?query=${encodeURIComponent(query)}&display=${display}`
    const res = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
      },
    })
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

function stripHtml(str: string) {
  return str.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'").trim()
}

export async function POST(req: NextRequest) {
  try {
    const { name, org, forceRefresh } = await req.json()
    if (!name || name.trim().length < 2) {
      return NextResponse.json({ error: '이름을 2자 이상 입력해주세요.' }, { status: 400 })
    }

    const cleanName = name.trim()

    // 1. Supabase 캐시 확인
    if (!forceRefresh) {
      const cached = await getCachedPerson(cleanName, org || '')
      if (cached) return NextResponse.json({ ...cached, name: cleanName, _source: 'cache' })
    }

    const hasNaverKey = !!(NAVER_CLIENT_ID && NAVER_CLIENT_SECRET)
    let imageUrl = ''
    let title = ''
    let orgResult = org || ''
    let summary = ''

    // 네이버 인물 검색 페이지 직접 링크
    const naverLink = `https://search.naver.com/search.naver?query=${encodeURIComponent(cleanName)}`

    if (hasNaverKey) {
      const query = org ? `${cleanName} ${org}` : cleanName

      const [newsData, imageData] = await Promise.allSettled([
        naverSearch(query, 'news', 5),
        naverSearch(`${cleanName} 프로필`, 'image', 5),
      ])

      const news = newsData.status === 'fulfilled' ? newsData.value : null
      const images = imageData.status === 'fulfilled' ? imageData.value : null

      // 이미지
      if (images?.items?.length) {
        for (const item of images.items) {
          const url = item.thumbnail || ''
          if (url && url.startsWith('http')) { imageUrl = url; break }
        }
      }

      // 뉴스에서 직책/소속/요약만 추출 (이름은 절대 추출 안 함)
      if (news?.items?.length) {
        const desc = stripHtml(news.items[0]?.description || '')
        summary = desc

        const titleMatch = desc.match(/(회장|대표이사|대표|대통령|장관|의원|총장|교수|CEO|이사|부회장|사장|원장|총리|수석)/)
        if (titleMatch) title = titleMatch[0]

        if (!orgResult) {
          const orgMatch = desc.match(/([가-힣]{2,6}(그룹|회사|은행|부|원|청|처|위원회|협회))/)
          if (orgMatch) orgResult = orgMatch[0]
        }
      }
    }

    return NextResponse.json({
      name: cleanName,  // 무조건 입력값 그대로
      title: title || '',
      org: orgResult || '',
      summary: summary || '',
      confirmed: false,
      image_url: imageUrl,
      naver_link: naverLink,  // 네이버 검색 페이지 직접 링크
      _source: hasNaverKey ? 'naver' : 'manual',
    })
  } catch (error) {
    console.error('인물 검색 오류:', error)
    return NextResponse.json({ error: '인물 검색 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
