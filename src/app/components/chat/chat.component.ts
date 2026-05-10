import {
  Component, OnInit, OnDestroy, AfterViewChecked,
  Input, OnChanges, SimpleChanges,
  ViewChild, ElementRef, ChangeDetectorRef, NgZone,
  PLATFORM_ID, Inject
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, interval } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import {
  ChatService,
  ChatConversationDTO,
  ChatMessageDTO
} from '../services/chat.service';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css']
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewChecked, OnChanges {

  @ViewChild('messagesEl') private messagesEl!: ElementRef<HTMLDivElement>;

  @Input() patients: { id: any; nom: string }[] = [];
  @Input() initialPatientId: any = null;
  @Input() role: 'nutritionist' | 'coach' | 'patient' = 'nutritionist';
  @Input() userId: any = null;
  @Input() conversationType: string | undefined = undefined;

  // ── State ─────────────────────────────────────────────────────────────────
  conversations: ChatConversationDTO[] = [];
  selectedConv:  ChatConversationDTO | null = null;
  messages:      ChatMessageDTO[] = [];

  loadingConvs    = false;
  loadingMessages = false;
  sending         = false;

  newMessage  = '';
  searchQuery = '';

  showNewConvModal = false;
  newConvTargetId: any = null;
  newConvError  = '';
  creatingConv  = false;

  wsStatus: 'connecting' | 'connected' | 'disconnected' = 'connecting';

  // ── Private state ─────────────────────────────────────────────────────────
  private wsSub:    Subscription | null = null;  // WebSocket incoming messages
  private connSub:  Subscription | null = null;  // connection status
  private pollSub:  Subscription | null = null;  // HTTP polling fallback
  private shouldScroll = false;
  /** Highest real message ID displayed — prevents duplicates */
  private lastSeenId = 0;

  private readonly avatarColors = ['av-0', 'av-1', 'av-2', 'av-3', 'av-4'];

  constructor(
    private chatService: ChatService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    if (!this.userId) {
      this.userId = localStorage.getItem('userId') ?? sessionStorage.getItem('userId') ?? '';
    }
    if (!this.userId) return;

    // Connect WebSocket
    this.chatService.connect(String(this.userId));

    // Track connection status
    this.connSub = this.chatService.connected$.subscribe(ok => {
      this.ngZone.run(() => {
        this.wsStatus = ok ? 'connected' : 'disconnected';
        this.cdr.detectChanges();
      });
    });

    // Handle incoming WebSocket messages
    this.wsSub = this.chatService.incomingMessage$.subscribe(msg => {
      this.ngZone.run(() => this.handleIncomingMessage(msg));
    });

    this.loadConversations();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialPatientId']?.currentValue && this.userId && !this.loadingConvs) {
      this.openOrCreateConversation(changes['initialPatientId'].currentValue);
    }
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.wsSub?.unsubscribe();
    this.connSub?.unsubscribe();
    // Don't disconnect the shared STOMP client — other components may use it
  }

  // ── Incoming message handler (WebSocket + polling) ────────────────────────

  private handleIncomingMessage(msg: ChatMessageDTO): void {
    // Ignore if not for the open conversation
    if (!this.selectedConv || Number(msg.conversationId) !== Number(this.selectedConv.id)) {
      // Update unread badge for other conversations
      const conv = this.conversations.find(c => Number(c.id) === Number(msg.conversationId));
      if (conv) {
        conv.lastMessage   = msg.content;
        conv.lastMessageAt = msg.sentAt;
        conv.unreadCount   = (conv.unreadCount || 0) + 1;
        this.cdr.detectChanges();
      }
      return;
    }

    // Avoid duplicates (real ID check)
    if (msg.id > 0 && this.messages.find(m => m.id === msg.id)) return;

    this.messages     = [...this.messages, msg];
    this.shouldScroll = true;
    if (msg.id > this.lastSeenId) this.lastSeenId = msg.id;

    // Update conversation preview
    const conv = this.conversations.find(c => Number(c.id) === Number(this.selectedConv!.id));
    if (conv) { conv.lastMessage = msg.content; conv.lastMessageAt = msg.sentAt; }

    // Mark as read
    this.chatService.markAsRead(this.selectedConv.id, String(this.userId)).subscribe();
    this.cdr.detectChanges();
  }

  // ── Conversations ─────────────────────────────────────────────────────────

  loadConversations(): void {
    this.loadingConvs = true;
    const apiRole = this.role === 'nutritionist' ? 'nutritionist'
                  : this.role === 'coach'        ? 'coach'
                  : 'patient';

    this.chatService.getConversations(String(this.userId), apiRole, this.conversationType).subscribe({
      next: (data) => {
        this.ngZone.run(() => {
          this.conversations = data.sort((a, b) =>
            new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime()
          );
          this.loadingConvs = false;
          if (this.initialPatientId) {
            this.openOrCreateConversation(this.initialPatientId);
          }
          this.cdr.detectChanges();
        });
      },
      error: () => {
        this.ngZone.run(() => { this.loadingConvs = false; this.cdr.detectChanges(); });
      }
    });
  }

  selectConversation(conv: ChatConversationDTO): void {
    this.selectedConv    = conv;
    this.messages        = [];
    this.loadingMessages = true;
    this.stopPolling();

    this.chatService.getMessages(conv.id).subscribe({
      next: (msgs) => {
        this.ngZone.run(() => {
          this.messages        = msgs;
          this.loadingMessages = false;
          this.shouldScroll    = true;
          conv.unreadCount     = 0;
          this.lastSeenId      = msgs.length > 0 ? Math.max(...msgs.map(m => m.id)) : 0;
          this.cdr.detectChanges();
          // Start polling fallback (catches messages if WS drops)
          this.startPollingFallback(conv.id);
        });
      },
      error: () => {
        this.ngZone.run(() => {
          this.loadingMessages = false;
          this.lastSeenId      = 0;
          this.cdr.detectChanges();
          this.startPollingFallback(conv.id);
        });
      }
    });

    this.chatService.markAsRead(conv.id, String(this.userId)).subscribe();
  }

  openOrCreateConversation(targetId: any): void {
    const type = this.conversationType
      ?? (this.role === 'coach' ? 'CLIENT_COACH' : 'PATIENT_NUTRITIONIST');
    const p1 = String(this.userId);
    const p2 = String(targetId);

    const existing = this.conversations.find(c =>
      (String(c.participant1Id) === p1 && String(c.participant2Id) === p2) ||
      (String(c.participant1Id) === p2 && String(c.participant2Id) === p1)
    );

    if (existing) {
      this.selectConversation(existing);
      return;
    }

    this.chatService.createConversation(p1, p2, type).subscribe({
      next: (conv) => {
        this.ngZone.run(() => {
          if (!this.conversations.find(c => c.id === conv.id)) {
            this.conversations = [conv, ...this.conversations];
          }
          this.selectConversation(conv);
          this.cdr.detectChanges();
        });
      },
      error: (err) => console.error('Failed to create conversation', err)
    });
  }

  // ── Send message ──────────────────────────────────────────────────────────

  sendMessage(): void {
    if (!this.newMessage.trim() || !this.selectedConv || this.sending) return;

    const content    = this.newMessage.trim();
    this.newMessage  = '';
    this.sending     = true;

    const receiverId = this.getOtherId(this.selectedConv);
    const tempId     = -(Date.now()); // negative — never clashes with real DB IDs

    const tempMsg: ChatMessageDTO = {
      id: tempId, conversationId: this.selectedConv.id,
      senderId: String(this.userId), receiverId, content,
      sentAt: new Date().toISOString(), isRead: false
    };

    this.messages     = [...this.messages, tempMsg];
    this.shouldScroll = true;
    this.cdr.detectChanges();

    const payload: Partial<ChatMessageDTO> = {
      conversationId: this.selectedConv.id,
      senderId:       String(this.userId),
      receiverId,
      content
    };

    if (this.chatService.isStompConnected) {
      // ── WebSocket path ──────────────────────────────────────────────────
      // Server saves + pushes to receiver via /user/{receiverId}/queue/messages
      // We also save via HTTP to get the real ID back for our own message
      this.chatService.saveMessage(payload).subscribe({
        next: (saved) => {
          this.ngZone.run(() => {
            this.messages = this.messages.map(m => m.id === tempId ? saved : m);
            this.sending  = false;
            if (saved.id > this.lastSeenId) this.lastSeenId = saved.id;
            this.updateConvPreview(content);
            this.cdr.detectChanges();
          });
        },
        error: () => {
          this.ngZone.run(() => {
            this.messages   = this.messages.filter(m => m.id !== tempId);
            this.newMessage = content;
            this.sending    = false;
            this.cdr.detectChanges();
          });
        }
      });
    } else {
      // ── HTTP fallback ───────────────────────────────────────────────────
      this.chatService.saveMessage(payload).subscribe({
        next: (saved) => {
          this.ngZone.run(() => {
            this.messages = this.messages.map(m => m.id === tempId ? saved : m);
            this.sending  = false;
            if (saved.id > this.lastSeenId) this.lastSeenId = saved.id;
            this.updateConvPreview(content);
            this.cdr.detectChanges();
          });
        },
        error: () => {
          this.ngZone.run(() => {
            this.messages   = this.messages.filter(m => m.id !== tempId);
            this.newMessage = content;
            this.sending    = false;
            this.cdr.detectChanges();
          });
        }
      });
    }
  }

  onEnter(event: KeyboardEvent): void {
    if (!event.shiftKey) { event.preventDefault(); this.sendMessage(); }
  }

  // ── New conversation modal ────────────────────────────────────────────────

  openNewConvModal(): void {
    this.showNewConvModal = true;
    this.newConvTargetId  = null;
    this.newConvError     = '';
  }

  closeNewConvModal(): void { this.showNewConvModal = false; }

  createConversation(): void {
    if (!this.newConvTargetId) { this.newConvError = 'Veuillez sélectionner un contact.'; return; }
    this.creatingConv = true;
    this.newConvError = '';
    this.openOrCreateConversation(this.newConvTargetId);
    this.closeNewConvModal();
    this.creatingConv = false;
  }

  // ── Polling fallback (catches messages when WS drops) ────────────────────

  private startPollingFallback(conversationId: number): void {
    this.stopPolling();
    this.pollSub = interval(3000).pipe(
      switchMap(() => this.chatService.getMessages(conversationId))
    ).subscribe({
      next: (msgs) => {
        const newMsgs = msgs.filter(m => m.id > this.lastSeenId);
        if (newMsgs.length === 0) return;
        this.ngZone.run(() => {
          newMsgs.forEach(m => this.handleIncomingMessage(m));
        });
      },
      error: () => {}
    });
  }

  private stopPolling(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = null;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  get filteredConversations(): ChatConversationDTO[] {
    if (!this.searchQuery.trim()) return this.conversations;
    const q = this.searchQuery.toLowerCase();
    return this.conversations.filter(c =>
      this.getOtherName(c).toLowerCase().includes(q) ||
      (c.lastMessage ?? '').toLowerCase().includes(q)
    );
  }

  getOtherId(conv: ChatConversationDTO): string {
    return String(conv.participant1Id) === String(this.userId)
      ? conv.participant2Id
      : conv.participant1Id;
  }

  getOtherName(conv: ChatConversationDTO): string {
    const otherId = this.getOtherId(conv);
    const found   = this.patients.find(p => String(p.id) === String(otherId));
    return found ? found.nom : `Contact #${otherId}`;
  }

  isMine(msg: ChatMessageDTO): boolean {
    return String(msg.senderId) === String(this.userId);
  }

  avatarClass(convId: number): string {
    return this.avatarColors[Math.abs(convId) % this.avatarColors.length];
  }

  formatTime(dateStr: string | null): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const now     = new Date();
    const isToday = d.toDateString() === now.toDateString();
    return isToday
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString([], { day: '2-digit', month: 'short' });
  }

  private updateConvPreview(content: string): void {
    if (!this.selectedConv) return;
    const conv = this.conversations.find(c => c.id === this.selectedConv!.id);
    if (conv) { conv.lastMessage = content; conv.lastMessageAt = new Date().toISOString(); }
  }

  private scrollToBottom(): void {
    try {
      const el = this.messagesEl?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    } catch {}
  }
}
