import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"

// Stripe will be initialized at runtime

// Security constants
const MAX_PAYLOAD_SIZE = 1024 * 1024 // 1MB max payload
const ALLOWED_CONTENT_TYPES = ['application/json']

async function logSecurely(level: 'info' | 'error' | 'warn', message: string, meta?: Record<string, any>) {
  const timestamp = new Date().toISOString()
  const logData = { timestamp, level, message, ...meta }
  
  if (process.env.NODE_ENV === 'production') {
    // In production, you might want to send to a logging service
    // For now, use console with structured format
    console[level](`[${timestamp}] ${message}`, meta)
  } else {
    console[level](`[${timestamp}] ${message}`, meta)
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let eventId: string | undefined

  try {
    // Validate environment variables at runtime
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: 'Stripe configuration error' },
        { status: 500 }
      )
    }

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      return NextResponse.json(
        { error: 'Webhook configuration error' },
        { status: 500 }
      )
    }

    // Initialize Stripe at runtime
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-05-28.basil",
    })
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    // Security: Verify HTTPS in production
    const proto = request.headers.get('x-forwarded-proto')
    if (process.env.NODE_ENV === 'production' && proto !== 'https') {
      await logSecurely('warn', 'Webhook received over non-HTTPS', {
        protocol: proto,
        ip: request.headers.get('x-forwarded-for'),
      })
      return NextResponse.json(
        { error: 'HTTPS required' },
        { status: 400 }
      )
    }

    // Security: Check content length
    const contentLength = request.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > MAX_PAYLOAD_SIZE) {
      await logSecurely('error', 'Webhook payload too large', {
        size: contentLength,
        maxSize: MAX_PAYLOAD_SIZE,
      })
      return NextResponse.json(
        { error: 'Payload too large' },
        { status: 413 }
      )
    }

    // Security: Verify content type
    const contentType = request.headers.get('content-type')
    if (!contentType || !ALLOWED_CONTENT_TYPES.some(ct => contentType.includes(ct))) {
      await logSecurely('warn', 'Invalid content type', {
        contentType,
        ip: request.headers.get('x-forwarded-for'),
      })
      return NextResponse.json(
        { error: 'Invalid content type' },
        { status: 400 }
      )
    }

    const body = await request.text()
    const headersList = await headers()
    const signature = headersList.get('stripe-signature')

    if (!signature) {
      await logSecurely('warn', 'Missing Stripe signature', {
        ip: request.headers.get('x-forwarded-for'),
      })
      return NextResponse.json(
        { error: 'Bad Request' },
        { status: 400 }
      )
    }

    let event: Stripe.Event

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
      eventId = event.id
    } catch (err) {
      const error = err as Error
      await logSecurely('error', 'Webhook signature verification failed', {
        error: error.message,
        ip: request.headers.get('x-forwarded-for'),
      })
      return NextResponse.json(
        { error: 'Bad Request' },
        { status: 400 }
      )
    }

    // Log webhook receipt
    await logSecurely('info', 'Webhook received', {
      eventId: event.id,
      eventType: event.type,
      livemode: event.livemode,
    })

    // Process webhook events (simplified for frontend webhook)
    await processWebhookEvent(event)

    const processingTime = Date.now() - startTime
    await logSecurely('info', 'Webhook processed successfully', {
      eventId: event.id,
      eventType: event.type,
      processingTimeMs: processingTime,
    })

    return NextResponse.json({ received: true })
  } catch (error) {
    const processingTime = Date.now() - startTime
    await logSecurely('error', 'Webhook handler error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      eventId,
      processingTimeMs: processingTime,
    })
    
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}

async function processWebhookEvent(event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      await logSecurely('info', 'Checkout session completed', { sessionId: session.id })
      // Frontend-specific processing (analytics, notifications, etc.)
      break
    }

    case 'customer.subscription.created': {
      const subscription = event.data.object as Stripe.Subscription
      await logSecurely('info', 'Subscription created', { subscriptionId: subscription.id })
      break
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      await logSecurely('info', 'Subscription updated', { subscriptionId: subscription.id })
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      await logSecurely('info', 'Subscription canceled', { subscriptionId: subscription.id })
      break
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice
      await logSecurely('info', 'Payment succeeded', { invoiceId: invoice.id })
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      await logSecurely('info', 'Payment failed', { invoiceId: invoice.id })
      break
    }

    default:
      await logSecurely('info', 'Unhandled webhook event', {
        eventType: event.type,
        eventId: event.id,
      })
  }
}

// Note: App Router automatically handles request body parsing
// No config export needed for App Router (unlike Pages Router)