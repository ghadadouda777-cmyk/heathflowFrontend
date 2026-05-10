import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { Client, IMessage } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

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
  private readonly wsUrl  = 'http://localhost:8084/ws';

  private stompClient: Client | null = null;
  private currentUserId: string | null = null;

  /** Emits every message received via WebSocket */
  readonly incomingMessage$ = new Subject<ChatMessageDTO>();

  /** true = STOMP connected, false = disconnected */
  readonly connected$ = new BehaviorSubject<boolean>(false);

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  private getHeaders(): HttpHeaders {
    if (!isPlatformBrowser(this.platformId)) return new HttpHeaders();
    const token = localStorage.getItem('token') ?? sessionStorage.getItem('token') ?? '';
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  // ── WebSocket connection ──────────────────────────────────────────────────

  connect(userId: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.stompClient?.connected) return; // already connected

    this.currentUserId = userId;

    this.stompClient = new Client({
      webSocketFactory: () => new SockJS(this.wsUrl) as any,
      reconnectDelay: 5000,
      onConnect: () => {
        this.connected$.next(true);

        // Subscribe to personal message queue
        this.stompClient!.subscribe(
          `/user/${userId}/queue/messages`,
          (frame: IMessage) => {
            try {
              const msg: ChatMessageDTO = JSON.parse(frame.body);
              this.incomingMessage$.next(msg);
            } catch { /* ignore malformed frames */ }
          }
        );
      },
      onDisconnect: () => this.connected$.next(false),
      onStompError:  () => this.connected$.next(false),
    });

    this.stompClient.activate();
  }

  disconnect(): void {
    this.stompClient?.deactivate();
    this.stompClient = null;
    this.connected$.next(false);
  }

  /** Send a message via STOMP — server saves + pushes to receiver */
  sendViaStomp(msg: Partial<ChatMessageDTO>): void {
    if (this.stompClient?.connected) {
      this.stompClient.publish({
        destination: '/app/chat.send',
        body: JSON.stringify(msg),
      });
    }
  }

  get isStompConnected(): boolean {
    return this.stompClient?.connected ?? false;
  }

  // ── HTTP API ──────────────────────────────────────────────────────────────

  getConversations(
    userId: string,
    role: 'nutritionist' | 'coach' | 'patient',
    conversationType?: string
  ): Observable<ChatConversationDTO[]> {
    if (role === 'patient' && conversationType) {
      return this.http.get<ChatConversationDTO[]>(
        `${this.apiUrl}/patient/${userId}/type/${conversationType}`,
        { headers: this.getHeaders() }
      );
    }
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

  /** HTTP fallback — used when STOMP is not connected */
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
