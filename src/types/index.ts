export type TabType = 'press' | 'analysis' | 'profile'

export interface PersonInfo {
  name: string
  title: string
  org: string
  summary: string
  confirmed: boolean
  reason?: string
}

export interface ArticleSection {
  heading: string
  body: string
}

export interface Article {
  title: string
  summary: string[]
  sections: ArticleSection[]
  source: string
  date: string
}

export interface GenerateRequest {
  type: TabType
  name: string
  org: string
  content: string
  keyword: string
  personInfo: PersonInfo
}

export interface SearchPersonRequest {
  name: string
  org: string
}
