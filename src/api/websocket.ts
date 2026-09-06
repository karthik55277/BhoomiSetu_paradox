/**
 * Real-time WebSocket Client Service for BhoomiSetu.
 * Manages authenticated WebSocket handshake, heartbeat (ping/pong),
 * exponential backoff auto-reconnect, and event deduplication.
 */

import { API_BASE_URL } from './client'

export interface SystemEvent {
  event_id: string
  event_type: 'DISPUTE_UPDATE' | 'COMPENSATION_UPDATE' | 'DOCUMENT_UPLOAD' | 'AI_HIGH_RISK_ALERT' | string
  title: string
  message: string
  created_at: string
  target_roles?: string[]
  target_jurisdiction?: string
  data: Record<string, unknown>
}

export type ConnectionStatus = 'OFFLINE' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING'

export type EventListener = (event: SystemEvent) => void
export type StatusListener = (status: ConnectionStatus) => void

class WebSocketService {
  private socket: WebSocket | null = null
  private status: ConnectionStatus = 'OFFLINE'
  private eventListeners: Set<EventListener> = new Set()
  private statusListeners: Set<StatusListener> = new Set()
  private seenEventIds: Set<string> = new Set()
  private pingIntervalId: number | null = null
  private reconnectTimerId: number | null = null
  private reconnectDelay = 1000
  private maxReconnectDelay = 30000
  private isIntentionallyClosed = false

  public getStatus(): ConnectionStatus {
    return this.status
  }

  private setStatus(newStatus: ConnectionStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus
      this.statusListeners.forEach((listener) => listener(newStatus))
    }
  }

  public subscribeStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener)
    listener(this.status)
    return () => {
      this.statusListeners.delete(listener)
    }
  }

  public subscribeEvents(listener: EventListener): () => void {
    this.eventListeners.add(listener)
    return () => {
      this.eventListeners.delete(listener)
    }
  }

  public connect(): void {
    const token = localStorage.getItem('bhoomisetu_token')
    if (!token) {
      this.disconnect()
      return
    }

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return
    }

    this.isIntentionallyClosed = false
    this.setStatus(this.reconnectDelay > 1000 ? 'RECONNECTING' : 'CONNECTING')

    // Construct WS URL without leaking token to logs
    let wsBaseUrl = API_BASE_URL
    if (wsBaseUrl.startsWith('http://')) {
      wsBaseUrl = wsBaseUrl.replace('http://', 'ws://')
    } else if (wsBaseUrl.startsWith('https://')) {
      wsBaseUrl = wsBaseUrl.replace('https://', 'wss://')
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      wsBaseUrl = `${protocol}//${window.location.host}`
    }

    const wsUrl = `${wsBaseUrl}/api/v1/ws?token=${encodeURIComponent(token)}`

    try {
      this.socket = new WebSocket(wsUrl)

      this.socket.onopen = () => {
        this.setStatus('CONNECTED')
        this.reconnectDelay = 1000
        this.startHeartbeat()
      }

      this.socket.onmessage = (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data) as { type?: string; event_id?: string; message?: string }

          if (payload.type === 'PONG' || payload.type === 'CONNECTED') {
            return
          }

          if (payload.event_id) {
            const sysEvent = payload as unknown as SystemEvent
            if (this.seenEventIds.has(sysEvent.event_id)) {
              return // Deduplicated!
            }
            this.seenEventIds.add(sysEvent.event_id)
            if (this.seenEventIds.size > 500) {
              const firstVal = this.seenEventIds.values().next().value
              if (firstVal) this.seenEventIds.delete(firstVal)
            }

            this.eventListeners.forEach((listener) => listener(sysEvent))
          }
        } catch {
          // Ignore malformed message
        }
      }

      this.socket.onerror = () => {
        // Silent error - handshake failure or socket error will trigger onclose
      }

      this.socket.onclose = () => {
        this.stopHeartbeat()
        this.socket = null
        if (!this.isIntentionallyClosed) {
          this.setStatus('OFFLINE')
          this.scheduleReconnect()
        } else {
          this.setStatus('OFFLINE')
        }
      }
    } catch {
      this.setStatus('OFFLINE')
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimerId !== null) {
      clearTimeout(this.reconnectTimerId)
    }

    const token = localStorage.getItem('bhoomisetu_token')
    if (!token) return

    this.reconnectTimerId = window.setTimeout(() => {
      this.connect()
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay)
    }, this.reconnectDelay)
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.pingIntervalId = window.setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'PING' }))
      }
    }, 30000)
  }

  private stopHeartbeat(): void {
    if (this.pingIntervalId !== null) {
      clearInterval(this.pingIntervalId)
      this.pingIntervalId = null
    }
  }

  public disconnect(): void {
    this.isIntentionallyClosed = true
    this.stopHeartbeat()
    if (this.reconnectTimerId !== null) {
      clearTimeout(this.reconnectTimerId)
      this.reconnectTimerId = null
    }
    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
    this.setStatus('OFFLINE')
  }
}

export const wsService = new WebSocketService()
