'use client'

import { useEffect } from 'react'
import './admin.css'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  useEffect(() => {
    // Hide cyberpunk background patterns
    const patterns = document.querySelectorAll('.grid-pattern, .circuit-pattern, .scanlines')
    patterns.forEach(el => {
      (el as HTMLElement).style.display = 'none'
    })
    
    // Set clean body background
    document.body.style.backgroundColor = '#f3f4f6'
    document.body.style.color = '#1f2937'
    
    return () => {
      patterns.forEach(el => {
        (el as HTMLElement).style.display = ''
      })
      document.body.style.backgroundColor = ''
      document.body.style.color = ''
    }
  }, [])

  return (
    <div className="admin-layout">
      {children}
    </div>
  )
}
