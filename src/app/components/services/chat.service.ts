import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, Subject, interval, Subscription } from 'rxjs';
import { switchMap } from 'rxjs/operators';

export interface ChatConversationDTO {
  id: number;
  participant1Id: string;
  participant2Id: string;
  type: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface ChatMessageDTO {
  id: number;
  conversationId: number;
  senderId: string;
  receiverId: string;
  content: string;
  sentAt: string;
  isRead: boolean;
}

@Injectable({ providedIn: 'root' })
export class ChatService {

  private readonly apiUrl = 'http://localhost:8084/api/chat';

  /** Emits incoming messages (from polling) */
  readonly messages$ = new Subject<ChatMessageDTO>();

  /** Emits connection status */
  readonly connected$ = new Subject<boolean>();

  private pollSub: Subscription | null = null;
  private lastMessageCount = 0;

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token') ?? sessionStorage.getItem('token') ?? '';
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  // ── Connection (HTTP polling — WebSocket ready when packages installed) ───

  connect(userId: string): void {
    // Emit connected immediately — polling is always available
    setTimeout(() => this.connected$.next(true), 0);
  }

  disconnect(): void {
    this.stopPolling();
    this.connected$.next(false);
  }

  sendMessage(msg: Partial<ChatMessageDTO>): void {
    // No-op for WebSocket path — use saveMessage() instead
  }

  get isWebSocketConnected(): boolean {
    return false; // Always use HTTP fallback until packages are installed
  }

  // ── HTTP polling ──────────────────────────────────────────────────────────

  startPolling(conversationId: number, intervalMs = 3000): void {
    this.stopPolling();
    this.lastMessageCount = 0;

    this.pollSub = interval(intervalMs).pipe(
      switchMap(() => this.getMessages(conversationId))
    ).subscribe({
      next: (msgs) => {
        if (msgs.length > this.lastMessageCount) {
          const newMsgs = msgs.slice(this.lastMessageCount);
          newMsgs.forEach(m => this.messages$.next(m));
          this.lastMessageCount = msgs.length;
        }
      },
      error: () => {}
    });
  }

  stopPolling(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = null;
    this.lastMessageCount = 0;
  }

  // ── HTTP API ──────────────────────────────────────────────────────────────

  getConversations(userId: string, role: 'nutritionist' | 'coach' | 'patient'): Observable<ChatConversationDTO[]> {
    return this.http.get<ChatConversationDTO[]>(
      `${this.apiUrl}/${role}/${userId}`,
      { headers: this.getHeaders() }
    );
  }

  getMessages(conversationId: number): Observable<ChatMessageDTO[]> {
    return this.http.get<ChatMessageDTO[]>(
      `${this.apiUrl}/${conversationId}/messages`,
      { headers: this.getHeaders() }
    );
  }

  createConversation(p1: string, p2: string, type: string): Observable<ChatConversationDTO> {
    return this.http.post<ChatConversationDTO>(
      this.apiUrl,
      { participant1Id: p1, participant2Id: p2, type },
      { headers: this.getHeaders() }
    );
  }

  saveMessage(msg: Partial<ChatMessageDTO>): Observable<ChatMessageDTO> {
    return this.http.post<ChatMessageDTO>(
      `${this.apiUrl}/message`,
      msg,
      { headers: this.getHeaders() }
    );
  }

  markAsRead(conversationId: number, userId: string): Observable<void> {
    return this.http.patch<void>(
      `${this.apiUrl}/${conversationId}/read/${userId}`,
      {},
      { headers: this.getHeaders() }
    );
  }
}
