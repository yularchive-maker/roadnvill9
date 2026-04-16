import './globals.css'

export const metadata = {
  title: '체험 예약 관리 시스템',
  description: '농촌 체험 예약·정산 관리 | 길과마을',
}

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
