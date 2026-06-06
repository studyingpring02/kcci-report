'use client'

import { useState, useRef, useCallback } from 'react'
import { TabType, Article } from '@/types'

const TABS = [
  { key: 'press' as TabType, label: '보도자료형', icon: '📢', desc: '"○○가 △△ 발표/선언" 형식 — 발표·협약·선언 등 구체적 행동이 있을 때' },
  { key: 'analysis' as TabType, label: '경제분석형', icon: '📊', desc: '배경·현황·전망 3단 구조 — 정책·금리·시장·산업 분석 보고서' },
  { key: 'profile' as TabType, label: '인물동향형', icon: '👤', desc: '인물 약력 + 최근 행보 중심 — 인사·취임·발언 동향 정리' },
  { key: 'brief' as const, label: '브리프인포', icon: '📄', desc: '대한상의 경제 인사이트 스타일 PDF — 주제와 내용 입력 시 2단 구조 보고서 자동 생성' },
  { key: 'column' as const, label: '경제칼럼', icon: '✍️', desc: 'MT 시평 스타일 — 필자·논지 입력 시 격식체 경제 칼럼 자동 생성' },
]

type AllTabType = TabType | 'brief' | 'column'

const STEP_LABELS = ['인물 정보 검색', '동일 인물 확인', '글 초안 작성', '워드 파일 생성']

interface PersonInfo {
  name: string
  title: string
  org: string
  summary: string
  confirmed: boolean
  image_url?: string
  naver_link?: string
  _source?: string
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<AllTabType>('press')
  
  // 각 탭별 상태
  const [names, setNames] = useState<Record<TabType, string>>({ press: '', analysis: '', profile: '' })
  const [orgs, setOrgs] = useState<Record<TabType, string>>({ press: '', analysis: '', profile: '' })
  const [contents, setContents] = useState<Record<TabType, string>>({ press: '', analysis: '', profile: '' })
  const [keywords, setKeywords] = useState<Record<TabType, string>>({ press: '', analysis: '', profile: '' })
  const [personInfos, setPersonInfos] = useState<Record<TabType, PersonInfo | null>>({ press: null, analysis: null, profile: null })
  const [personLoading, setPersonLoading] = useState<Record<TabType, boolean>>({ press: false, analysis: false, profile: false })
  
  // 모달
  const [modal, setModal] = useState<{ open: boolean; tab: TabType; person: PersonInfo | null }>({ open: false, tab: 'press', person: null })
  
  // 글 생성
  const [steps, setSteps] = useState([0, 0, 0, 0]) // 0=idle, 1=running, 2=done
  const [isGenerating, setIsGenerating] = useState(false)
  const [article, setArticle] = useState<Article | null>(null)
  const [error, setError] = useState('')
  const [isDownloading, setIsDownloading] = useState(false)

  // 브리프인포 전용 상태
  const [briefTopic, setBriefTopic] = useState('')
  const [briefContent, setBriefContent] = useState('')
  const [briefVolume, setBriefVolume] = useState('')
  const [briefAuthor, setBriefAuthor] = useState('')
  const [briefLoading, setBriefLoading] = useState(false)
  const [briefError, setBriefError] = useState('')

  // 경제칼럼 전용 상태
  const [colTitle, setColTitle] = useState('')
  const [colAuthor, setColAuthor] = useState('')
  const [colAffiliation, setColAffiliation] = useState('')
  const [colTopic, setColTopic] = useState('')
  const [colPoints, setColPoints] = useState('')
  const [colTone, setColTone] = useState('formal')
  const [colLoading, setColLoading] = useState(false)
  const [colError, setColError] = useState('')
  const [colResult, setColResult] = useState<{ title: string; author: string; affiliation: string; paragraphs: string[] } | null>(null)
  
  const timerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // 인물 검색 — name을 직접 파라미터로 받아서 상태 타이밍 문제 없앰
  const searchPerson = useCallback(async (tab: TabType, nameValue: string, orgValue: string, forceRefresh = false) => {
    if (!nameValue || nameValue.length < 2) return
    setPersonLoading(prev => ({ ...prev, [tab]: true }))
    setPersonInfos(prev => ({ ...prev, [tab]: null }))
    try {
      const res = await fetch('/api/search-person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameValue, org: orgValue, forceRefresh }),
      })
      const data = await res.json()
      if (res.ok) {
        // name을 무조건 입력값으로 덮어씀
        const fixedData = { ...data, name: nameValue }
        setPersonInfos(prev => ({ ...prev, [tab]: fixedData }))
        if (data._source !== 'cache') {
          setModal({ open: true, tab, person: fixedData })
        }
      }
    } catch { /* ignore */ }
    finally { setPersonLoading(prev => ({ ...prev, [tab]: false })) }
  }, [])

  const handleNameChange = (tab: TabType, value: string) => {
    setNames(prev => ({ ...prev, [tab]: value }))
    // 이름 바뀌면 기존 인물 정보 초기화
    setPersonInfos(prev => ({ ...prev, [tab]: null }))
  }

  const handleSearchClick = (tab: TabType) => {
    const nameValue = names[tab].trim()
    const orgValue = orgs[tab]
    if (nameValue.length < 2) return
    searchPerson(tab, nameValue, orgValue)
  }

  const handleConfirmYes = async () => {
    const { tab, person } = modal
    if (!person) return
    await fetch('/api/confirm-person', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...person, confirmed: true }),
    })
    setPersonInfos(prev => ({ ...prev, [tab]: { ...person, confirmed: true } }))
    setModal({ open: false, tab: 'press', person: null })
  }

  const handleConfirmNo = () => {
    const { tab } = modal
    setModal({ open: false, tab: 'press', person: null })
    setPersonInfos(prev => ({ ...prev, [tab]: null }))
    searchPerson(tab, names[tab], orgs[tab], true)
  }

  const setStep = (i: number, v: number) => setSteps(prev => prev.map((s, idx) => idx === i ? v : s))

  const downloadBriefPdf = async () => {
    if (!briefTopic.trim() || !briefContent.trim()) {
      setBriefError('주제와 내용을 입력해주세요.')
      return
    }
    setBriefLoading(true)
    setBriefError('')
    try {
      const res = await fetch('/api/generate-brief-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: briefTopic, content: briefContent, volume: briefVolume, author: briefAuthor }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'PDF 생성 실패')
      }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') || ''
      const match = disposition.match(/filename\*=UTF-8''(.+)/)
      const filename = match ? decodeURIComponent(match[1]) : 'KCCI_brief.pdf'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setBriefError(e instanceof Error ? e.message : '오류 발생')
    } finally {
      setBriefLoading(false)
    }
  }

  const generateColumn = async () => {
    if (!colTitle.trim() || !colAuthor.trim() || !colTopic.trim()) {
      setColError('제목, 필자명, 주제를 입력해주세요.')
      return
    }
    setColLoading(true)
    setColError('')
    setColResult(null)
    try {
      const res = await fetch('/api/generate-column', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: colTitle, author: colAuthor, affiliation: colAffiliation, topic: colTopic, points: colPoints, tone: colTone }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '생성 실패')
      setColResult(data)
    } catch (e) {
      setColError(e instanceof Error ? e.message : '오류 발생')
    } finally {
      setColLoading(false)
    }
  }

  const generate = async () => {
    const name = names[activeTab as TabType]
    const content = contents[activeTab as TabType]
    if (!name.trim() || !content.trim()) { setError('인물 이름과 내용을 입력해주세요.'); return }
    setError(''); setArticle(null); setIsGenerating(true)
    setSteps([0, 0, 0, 0])
    try {
      setStep(0, 1)
      let personInfo = personInfos[activeTab as TabType]
      if (!personInfo) {
        const res = await fetch('/api/search-person', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), org: orgs[activeTab as TabType] }),
        })
        const data = await res.json()
        personInfo = { ...data, name: name.trim() }
        setPersonInfos(prev => ({ ...prev, [activeTab]: personInfo }))
      }
      setStep(0, 2); setStep(1, 1)
      await new Promise(r => setTimeout(r, 300))
      setStep(1, 2); setStep(2, 1)

      const genRes = await fetch('/api/generate-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: activeTab,
          name: name.trim(),
          org: orgs[activeTab as TabType],
          content,
          keyword: keywords[activeTab as TabType],
          personInfo: personInfo || { name: name.trim(), title: '', org: orgs[activeTab as TabType], summary: '', confirmed: false },
        }),
      })
      const articleData = await genRes.json()
      if (!genRes.ok) throw new Error(articleData.error || '글 생성 실패')
      setArticle(articleData)
      setStep(2, 2); setStep(3, 1)
      await new Promise(r => setTimeout(r, 300))
      setStep(3, 2)
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.')
    } finally { setIsGenerating(false) }
  }

  const downloadDocx = async () => {
    if (!article) return
    setIsDownloading(true)
    try {
      const res = await fetch('/api/generate-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article, type: activeTab }),
      })
      if (!res.ok) throw new Error('워드 생성 실패')
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') || ''
      const match = disposition.match(/filename\*=UTF-8''(.+)/)
      const filename = match ? decodeURIComponent(match[1]) : 'KCCI_report.docx'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    } catch (e) { setError(e instanceof Error ? e.message : '다운로드 실패') }
    finally { setIsDownloading(false) }
  }

  const tab = TABS.find(t => t.key === activeTab) ?? TABS[0]
  const personInfo = personInfos[activeTab as TabType]
  const personLoaded = personLoading[activeTab as TabType]

  return (
    <main className="min-h-screen bg-gray-50">
      {/* 인물 확인 모달 */}
      {modal.open && modal.person && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,padding:'1rem'}}>
          <div style={{background:'white',borderRadius:'16px',width:'100%',maxWidth:'360px',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
            <div style={{padding:'20px 24px',borderBottom:'1px solid #f0f0f0'}}>
              <div style={{fontSize:'15px',fontWeight:'600',color:'#111'}}>이 분이 맞나요?</div>
              <div style={{fontSize:'13px',color:'#888',marginTop:'2px'}}>검색된 인물 정보를 확인해주세요</div>
            </div>
            <div style={{padding:'20px 24px'}}>
              <div style={{display:'flex',gap:'16px',marginBottom:'16px'}}>
                {modal.person.image_url ? (
                  <img src={modal.person.image_url} alt="" style={{width:'64px',height:'64px',borderRadius:'12px',objectFit:'cover',flexShrink:0}}
                    onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
                ) : (
                  <div style={{width:'64px',height:'64px',borderRadius:'12px',background:'#dbeafe',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'18px',fontWeight:'700',color:'#1d4ed8',flexShrink:0}}>
                    {modal.person.name.slice(0,2)}
                  </div>
                )}
                <div>
                  <div style={{fontSize:'18px',fontWeight:'700',color:'#111'}}>{modal.person.name}</div>
                  <div style={{fontSize:'14px',color:'#555',marginTop:'2px'}}>{modal.person.title || '직책 정보 없음'}</div>
                  <div style={{fontSize:'13px',color:'#888'}}>{modal.person.org || '소속 정보 없음'}</div>
                </div>
              </div>
              {modal.person.summary && (
                <div style={{fontSize:'13px',color:'#555',lineHeight:'1.7',background:'#f8f8f8',borderRadius:'10px',padding:'12px',marginBottom:'12px'}}>
                  {modal.person.summary}
                </div>
              )}
              {modal.person.naver_link && (
                <a href={modal.person.naver_link} target="_blank" rel="noopener noreferrer"
                  style={{fontSize:'13px',color:'#16a34a',textDecoration:'none'}}>
                  🔗 네이버에서 더 보기 →
                </a>
              )}
            </div>
            <div style={{padding:'0 24px 20px',display:'flex',gap:'8px'}}>
              <button onClick={handleConfirmNo}
                style={{flex:1,padding:'12px',fontSize:'14px',border:'1px solid #e0e0e0',borderRadius:'10px',background:'white',cursor:'pointer'}}>
                ❌ 아니에요 (재검색)
              </button>
              <button onClick={handleConfirmYes}
                style={{flex:1,padding:'12px',fontSize:'14px',border:'none',borderRadius:'10px',background:'#111',color:'white',cursor:'pointer',fontWeight:'600'}}>
                ✅ 맞아요
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium px-2 py-0.5 bg-gray-900 text-white rounded-full">대한상공회의소</span>
            <span className="text-xs text-gray-400">경제자료실</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">경제자료실 글 자동 생성기</h1>
          <p className="text-sm text-gray-500 mt-1">인물과 내용을 입력하면 게시판 양식에 맞게 글을 자동으로 작성하고 워드 파일로 다운로드합니다</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-5">
          <div className="flex border-b border-gray-200">
            {TABS.map(t => (
              <button key={t.key}
                onClick={() => { setActiveTab(t.key); setArticle(null); setError('') }}
                className={`flex-1 py-3.5 text-sm font-medium transition-all ${activeTab === t.key ? 'border-b-2 border-gray-900 text-gray-900 bg-gray-50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
                <span className="mr-1.5">{t.icon}</span>{t.label}
              </button>
            ))}
          </div>

          <div className="p-6">
            {activeTab === 'column' ? (
              <div>
                <div className="mb-5 px-4 py-3 bg-gray-50 rounded-xl border border-gray-100 text-sm text-gray-600">MT 시평 스타일 경제 칼럼을 자동 생성합니다. 생성 후 화면에서 바로 확인하세요.</div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">칼럼 제목 *</label>
                    <input type="text" value={colTitle} onChange={e => setColTitle(e.target.value)}
                      placeholder="예: 신 자본주의, 사회적가치 기반 일자리"
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">필자명 *</label>
                      <input type="text" value={colAuthor} onChange={e => setColAuthor(e.target.value)}
                        placeholder="예: 박양수"
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">소속/직책</label>
                      <input type="text" value={colAffiliation} onChange={e => setColAffiliation(e.target.value)}
                        placeholder="예: 대한상공회의소 SGI 원장"
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">주제 / 핵심 논지 *</label>
                    <textarea value={colTopic} onChange={e => setColTopic(e.target.value)}
                      placeholder="예: 기후위기·AI·양극화 시대, 전통 자본주의의 한계를 넘어 사회적 가치 기반의 새로운 성장 모델이 필요하다"
                      rows={3}
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">핵심 논거 (선택)</label>
                    <input type="text" value={colPoints} onChange={e => setColPoints(e.target.value)}
                      placeholder="예: ESG 경영 확대, 외부성 문제, 사회적 기업 사례"
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">문체</label>
                    <div className="flex gap-2">
                      {[
                        { value: 'formal', label: '격식체' },
                        { value: 'persuasive', label: '설득형' },
                        { value: 'narrative', label: '스토리형' },
                      ].map(t => (
                        <button key={t.value} onClick={() => setColTone(t.value)}
                          className={`flex-1 py-2 text-sm rounded-xl border transition-all ${colTone === t.value ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {colError && <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{colError}</div>}
                  <button onClick={generateColumn} disabled={colLoading}
                    className="w-full py-3 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
                    {colLoading
                      ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full spinner" />생성 중...</>
                      : <>✍️ 칼럼 생성하기</>}
                  </button>
                </div>
                {colResult && (
                  <div className="mt-6 border border-gray-200 rounded-2xl overflow-hidden">
                    <div className="px-6 pt-8 pb-4 bg-white">
                      <h2 className="text-xl font-bold text-gray-900 text-center mb-4">{colResult.title}</h2>
                      <div className="text-right mb-6">
                        <div className="text-sm font-semibold text-gray-700">MT 시평</div>
                        <div className="text-sm text-gray-600">{colResult.author} {colResult.affiliation}</div>
                      </div>
                      <div className="space-y-4">
                        {colResult.paragraphs.map((p, i) => (
                          <p key={i} className="text-sm text-gray-800 leading-relaxed text-justify">{p}</p>
                        ))}
                      </div>
                    </div>
                    <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end">
                      <button
                        onClick={() => {
                          const text = [
                            colResult.title, '',
                            'MT 시평', colResult.author + ' ' + colResult.affiliation, '',
                            ...colResult.paragraphs
                          ].join('\n')
                          navigator.clipboard.writeText(text)
                        }}
                        className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
                        📋 텍스트 복사
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : activeTab === 'brief' ? (
              <div>
                <div className="mb-5 px-4 py-3 bg-gray-50 rounded-xl border border-gray-100 text-sm text-gray-600">{tab.desc}</div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">보고서 주제 *</label>
                      <input type="text" value={briefTopic} onChange={e => setBriefTopic(e.target.value)}
                        placeholder="예: 한국 제조업 수출 구조 변화"
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Vol. 번호 (선택)</label>
                      <input type="text" value={briefVolume} onChange={e => setBriefVolume(e.target.value)}
                        placeholder="예: 40"
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">연구위원 (선택)</label>
                    <input type="text" value={briefAuthor} onChange={e => setBriefAuthor(e.target.value)}
                      placeholder="예: 박가희 연구위원(gaheebak@korcham.net)"
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">보고서 내용/핵심 분석 결과 *</label>
                    <textarea value={briefContent} onChange={e => setBriefContent(e.target.value)}
                      placeholder="분석 배경, 주요 결과, 시사점 등을 자유롭게 입력하세요. AI가 대한상의 인사이트 형식으로 재구성합니다."
                      rows={5}
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none" />
                  </div>
                  {briefError && <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{briefError}</div>}
                  <button onClick={downloadBriefPdf} disabled={briefLoading}
                    className="w-full py-3 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
                    {briefLoading
                      ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full spinner" />PDF 생성 중... (30초 내외)</>
                      : <>📄 PDF 다운로드</>}
                  </button>
                </div>
              </div>
            ) : (
              <>
            <div className="mb-5 px-4 py-3 bg-gray-50 rounded-xl border border-gray-100 text-sm text-gray-600">{tab.desc}</div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">인물 이름 *</label>
                  <div className="flex gap-2">
                    <input type="text" value={names[activeTab as TabType]}
                      onChange={e => handleNameChange(activeTab, e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSearchClick(activeTab) }}
                      placeholder="예: 최태원"
                      className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent" />
                    <button onClick={() => handleSearchClick(activeTab)}
                      disabled={personLoading[activeTab as TabType]}
                      className="px-4 py-2.5 text-sm bg-gray-900 text-white rounded-xl hover:bg-gray-800 disabled:opacity-50 flex-shrink-0">
                      {personLoading[activeTab as TabType] ? '검색중' : '검색'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">소속 (선택)</label>
                  <input type="text" value={orgs[activeTab as TabType]}
                    onChange={e => setOrgs(prev => ({ ...prev, [activeTab]: e.target.value }))}
                    placeholder="예: SK그룹"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent" />
                </div>
              </div>

              {/* 인물 카드 */}
              {(personLoaded || personInfo) && (
                <div className="flex items-start gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl">
                  {personLoaded ? (
                    <>
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full spinner" />
                      </div>
                      <div className="text-sm text-gray-500 pt-1">인물 정보 검색 중...</div>
                    </>
                  ) : personInfo ? (
                    <>
                      {personInfo.image_url ? (
                        <img src={personInfo.image_url} alt=""
                          className="w-10 h-10 rounded-full object-cover flex-shrink-0 bg-gray-100"
                          onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-700 text-xs font-bold">
                          {personInfo.name.slice(0,2)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="text-sm font-medium text-gray-900">{personInfo.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${personInfo.confirmed ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                            {personInfo.confirmed ? '✓ 확인됨' : '⚠ 미확인'}
                          </span>
                          {personInfo._source === 'cache' && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 border border-purple-200">캐시</span>}
                          {personInfo._source === 'naver' && <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-200">네이버</span>}
                        </div>
                        <div className="text-xs text-gray-500">{personInfo.title}{personInfo.org ? ` · ${personInfo.org}` : ''}</div>
                        {personInfo.summary && <div className="text-xs text-gray-400 mt-1 line-clamp-2">{personInfo.summary}</div>}
                        <div className="flex gap-3 mt-1.5">
                          {personInfo.naver_link && (
                            <a href={personInfo.naver_link} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 hover:underline">🔗 네이버</a>
                          )}
                          {!personInfo.confirmed && (
                            <button onClick={() => setModal({ open: true, tab: activeTab, person: personInfo })}
                              className="text-xs text-blue-600 hover:underline">다시 확인</button>
                          )}
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">행동/내용 *</label>
                <textarea value={contents[activeTab as TabType]}
                  onChange={e => setContents(prev => ({ ...prev, [activeTab]: e.target.value }))}
                  placeholder={activeTab === 'press' ? '예: AI 반도체 분야에 5조 원 규모 투자를 선언할 것이다' : activeTab === 'analysis' ? '예: 기준금리를 0.25%p 인하하는 방향을 검토할 것이다' : '예: 경제활성화 법안 추진을 본격화할 것이다'}
                  rows={3}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  {activeTab === 'press' ? '배경 키워드' : activeTab === 'analysis' ? '분석 관점' : '관련 이슈'}
                  <span className="ml-1 text-gray-400">(선택)</span>
                </label>
                <input type="text" value={keywords[activeTab as TabType]}
                  onChange={e => setKeywords(prev => ({ ...prev, [activeTab]: e.target.value }))}
                  placeholder={activeTab === 'press' ? '예: 미-중 무역분쟁, 반도체 공급망' : activeTab === 'analysis' ? '예: 가계부채, 환율 리스크' : '예: 규제 완화, 중소기업 지원'}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent" />
              </div>
            </div>

            {error && <div className="mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>}

            <button onClick={generate} disabled={isGenerating}
              className="mt-5 w-full py-3 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
              {isGenerating ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full spinner" />생성 중...</> : <>📝 글 생성하기</>}
            </button>
              </>
            )}
          </div>
        </div>

        {steps.some(s => s > 0) && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-5">
            <div className="text-xs font-medium text-gray-400 mb-3 uppercase tracking-wider">진행 상태</div>
            <div className="space-y-2.5">
              {STEP_LABELS.map((label, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${steps[i] === 2 ? 'bg-gray-900' : steps[i] === 1 ? 'bg-blue-500' : 'bg-gray-100 border border-gray-200'}`}>
                    {steps[i] === 2 && <span className="text-white text-xs">✓</span>}
                    {steps[i] === 1 && <div className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full spinner" />}
                  </div>
                  <span className={`text-sm ${steps[i] === 2 ? 'text-gray-900' : steps[i] === 1 ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {article && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <div className="text-xs text-gray-400 mb-0.5">생성 완료</div>
                <div className="text-sm font-medium text-gray-900 line-clamp-1">{article.title}</div>
              </div>
              <button onClick={downloadDocx} disabled={isDownloading}
                className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 disabled:opacity-50 transition-all flex-shrink-0">
                {isDownloading ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full spinner" />생성 중</> : <>⬇ .docx 다운로드</>}
              </button>
            </div>
            <div className="px-6 py-5">
              <div className="text-xs text-gray-400 mb-4">{article.date} · {article.source}</div>
              {(() => {
                const a = article as Article & { paragraphs?: string[] }
                if (a.paragraphs && a.paragraphs.length > 0) {
                  return (
                    <div className="space-y-4">
                      {a.paragraphs.map((para, i) => (
                        <p key={i} className="text-sm text-gray-700 leading-relaxed" style={{textIndent:'1.5em'}}>{para}</p>
                      ))}
                    </div>
                  )
                }
                return (
                  <>
                    {article.summary && article.summary.length > 0 && (
                      <div className="mb-5 p-4 bg-gray-50 rounded-xl border border-gray-100">
                        <div className="text-xs font-medium text-gray-500 mb-2.5">■ 핵심 요약</div>
                        <ul className="space-y-1.5">
                          {article.summary.map((s, i) => (
                            <li key={i} className="flex gap-2 text-sm text-gray-700">
                              <span className="text-gray-400 flex-shrink-0">▪</span><span>{s}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {article.sections && article.sections.map((sec, i) => (
                      <div key={i} className="mb-4">
                        {sec.heading && <div className="text-sm font-semibold text-gray-900 mb-2 pb-1.5 border-b border-gray-100">■ {sec.heading}</div>}
                        <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{sec.body}</div>
                      </div>
                    ))}
                  </>
                )
              })()}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
