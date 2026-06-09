import type { Metadata } from 'next'
import { Belleza, Lato, Charmonman, Poppins } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { AuthProvider } from '@/lib/auth-context'
import { DialogProvider } from '@/components/dialog-provider'
import { NoNumberScroll } from '@/components/no-number-scroll'
import './globals.css'

const belleza = Belleza({
  weight: ['400'],
  subsets: ['latin'],
  variable: '--next-font-belleza',
})

const lato = Lato({
  weight: ['300', '400', '700', '900'],
  subsets: ['latin'],
  variable: '--next-font-lato',
})

const charmonman = Charmonman({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--next-font-charmonman',
})

const poppins = Poppins({
  weight: ['300', '400', '500', '600', '700', '900'],
  subsets: ['latin'],
  variable: '--next-font-poppins',
})

export const metadata: Metadata = {
  title: 'Outbound Travelers | Premium Itinerary',
  description: 'Luxury travel itinerary for your dream vacation - Outbound Travelers',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${belleza.variable} ${lato.variable} ${charmonman.variable} ${poppins.variable}`}>
      <head>
        {/* Polyfill crypto.randomUUID for non-secure-context origins (e.g. http://tms.outbound.local).
            randomUUID only exists on HTTPS/localhost; getRandomValues works everywhere. Runs before app JS. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(typeof crypto!=="undefined"&&typeof crypto.randomUUID!=="function"&&crypto.getRandomValues){crypto.randomUUID=function(){return([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,function(c){return(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16)})}}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <AuthProvider>
          <DialogProvider>
            <NoNumberScroll />
            {children}
          </DialogProvider>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  )
}
