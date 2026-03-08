'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../lib/supabase/client'

export default function AuthCallback() {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Handle the OAuth callback
        const { data, error } = await supabase.auth.getSession()
        
        if (error) throw error
        
        if (data.session) {
          // Store token for API calls
          localStorage.setItem('sb-token', data.session.access_token)
          console.log('✅ Google OAuth successful!')
          router.push('/')
        } else {
          // Try to get session from URL hash (OAuth callback)
          const { data: authData, error: authError } = await supabase.auth.getUser()
          
          if (authError) throw authError
          
          if (authData.user) {
            // Get the session
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
            
            if (sessionError) throw sessionError
            
            if (sessionData.session) {
              localStorage.setItem('sb-token', sessionData.session.access_token)
              console.log('✅ Google OAuth successful!')
              router.push('/')
            }
          } else {
            console.log('❌ No session found')
            router.push('/login')
          }
        }
      } catch (error) {
        console.error('Auth callback error:', error)
        router.push('/login')
      }
    }

    handleAuthCallback()
  }, [router, supabase])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Completing Google authentication...</p>
      </div>
    </div>
  )
}
