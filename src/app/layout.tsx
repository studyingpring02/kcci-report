import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '대한상공회의소 경제자료실 글 생성기',
  description: '인물 정보를 검색하고 경제자료실 게시판 양식에 맞는 글을 자동으로 작성합니다',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
