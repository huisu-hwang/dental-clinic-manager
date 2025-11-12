/**
 * Keep-Alive API Route
 *
 * Purpose:
 * 1. Prevents Supabase project from auto-pausing (free tier)
 * 2. Keeps database connection warm
 * 3. Called periodically by Vercel Cron Job
 *
 * This endpoint should be called every 1-2 minutes to:
 * - Prevent Supabase instance from sleeping
 * - Ensure database is responsive for user requests
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/keep-alive
 * Executes a simple query to keep Supabase project active
 */
export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('[Keep-Alive] Missing Supabase credentials')
      return NextResponse.json(
        { success: false, error: 'Missing environment variables' },
        { status: 500 }
      )
    }

    // Create a simple Supabase client for health check
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Execute a simple query to wake up the database
    // This query doesn't need RLS permissions and is very lightweight
    const startTime = Date.now()
    const { error } = await supabase
      .from('clinics')
      .select('count', { count: 'exact', head: true })
      .limit(1)

    const duration = Date.now() - startTime

    if (error) {
      console.error('[Keep-Alive] Query failed:', error.message)
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          duration
        },
        { status: 500 }
      )
    }

    console.log(`[Keep-Alive] Success - Query executed in ${duration}ms`)
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration,
      message: 'Supabase project is active'
    })

  } catch (error) {
    console.error('[Keep-Alive] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// Allow this endpoint to be called from anywhere (CORS)
export const runtime = 'edge' // Use Edge Runtime for faster cold starts
export const dynamic = 'force-dynamic' // Always execute, never cache
