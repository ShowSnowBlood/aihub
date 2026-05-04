'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function TestModal({ isOpen, onClose }: Props) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!isOpen || !mounted) return null

  return createPortal(
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0,0,0,0.9)',
        zIndex: 100000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onClick={onClose}
    >
      <div 
        style={{
          width: '400px',
          height: '500px',
          backgroundColor: '#fff',
          borderRadius: '8px',
          padding: '20px'
        }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{ color: '#000', marginBottom: '20px' }}>测试弹窗</h2>
        <p style={{ color: '#333' }}>如果看到这个，说明弹窗工作正常</p>
        <button 
          onClick={onClose}
          style={{
            marginTop: '20px',
            padding: '10px 20px',
            backgroundColor: '#007bff',
            color: '#fff',
            border: 'none',
            borderRadius: '4px'
          }}
        >
          关闭
        </button>
      </div>
    </div>,
    document.body
  )
}
