import './globals.css'

export const metadata = {
  title: '체험 예약 관리 시스템',
  description: '체험 예약·정산 통합 관리',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="ko" data-theme="dark">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('roadnvill-theme');document.documentElement.dataset.theme=(t==='light'||t==='dark')?t:'dark'}catch(e){document.documentElement.dataset.theme='dark'}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
