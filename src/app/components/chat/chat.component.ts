import {
  Component, OnInit, OnDestroy, AfterViewChecked,
  Input, OnChanges, SimpleChanges,
  ViewChild, ElementRef, ChangeDetectorRef, NgZone
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
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

  /** List of contacts to chat with: { id, nom } */
  @Input() patients: { id: any; nom: string }[] = [];

  /** Pre-select a contact on init */
  @Input() initialPatientId: any = null;

  /** 'nutritionist' | 'coach' | 'patient' */
  @Input() role: 'nutritionist' | 'coach' | 'patient' = 'nutritionist';

  /** Current user ID */
  @Input() userId: any = null;

  // ── State ─────────────────────────────────────────────────────────────────
  conversations: ChatConversationDTO[] = [];
  selectedConv: ChatConversationDTO | null = null;
  messages: ChatMessageDTO[] = [];

  loadingConvs = false;
  loadingMessages = false;
  sending = false;

  newMessage = '';
  searchQuery = '';

  showNewConvModal = false;
  newConvTargetId: any = null;
  newConvError = '';
  creatingConv = false;

  wsStatus: 'connecting' | 'connected' | 'disconnected' = 'connecting';

  private msgSub: Subscription | null = null;
  private connSub: Subscription | null = null;
  private shouldScroll = false;

  private readonly avatarColors = ['av-0', 'av-1', 'av-2', 'av-3', 'av-4'];

  constructor(
    private chatService: ChatService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    if (!this.userId) {
      // Fallback: read from localStorage
      this.userId = localStorage.getItem('userId') ?? sessionStorage.getItem('userId') ?? '1';
    }

    // Connect WebSocket
    this.wsStatus = 'connecting';
    this.chatService.connect(String(this.userId));

    // Listen for connection status
    this.connSub = this.chatService.connected$.subscribe(connected => {
      this.ngZone.run(() => {
        this.wsStatus = connected ? 'connected' : 'disconnected';
        this.cdr.detectChanges();
      });
    });

    // Listen for incoming messages
    this.msgSub = this.chatService.messages$.subscribe(msg => {
      this.ngZone.run(() => {
        if (this.selectedConv && msg.conversationId === this.selectedConv.id) {
          // Avoid duplicates
          if (!this.messages.find(m => m.id === msg.id)) {
            this.messages = [...this.messages, msg];
            this.shouldScroll = true;
            // Mark as read
            this.chatService.markAsRead(this.selectedConv.id, String(this.userId)).subscribe();
          }
        }
        // Update conversation preview
        const conv = this.conversations.find(c => c.id === msg.conversationId);
        if (conv) {
          conv.lastMessage = msg.content;
          conv.lastMessageAt = msg.sentAt;
          if (!this.selectedConv || this.selectedConv.id !== msg.conversationId) {
            conv.unreadCount = (conv.unreadCount || 0) + 1;
          }
        }
        this.cdr.detectChanges();
      });
    });

    // Load conversations
    this.loadConversations();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialPatientId'] && changes['initialPatientId'].currentValue) {
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
    this.msgSub?.unsubscribe();
    this.connSub?.unsubscribe();
    this.chatService.disconnect();
  }

  // ── Conversations ─────────────────────────────────────────────────────────

  loadConversations(): void {
    this.loadingConvs = true;
    const apiRole = this.role === 'nutritionist' ? 'nutritionist'
                  : this.role === 'coach'        ? 'coach'
                  : 'patient';

    this.chatService.getConversations(String(this.userId), apiRole).subscribe({
      next: (data) => {
        this.ngZone.run(() => {
          this.conversations = data.sort((a, b) =>
            new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime()
          );
          this.loadingConvs = false;

          // Auto-open if initialPatientId is set
          if (this.initialPatientId) {
            this.openOrCreateConversation(this.initialPatientId);
          }
          this.cdr.detectChanges();
        });
      },
      error: () => {
        this.ngZone.run(() => {
          this.loadingConvs = false;
          this.cdr.detectChanges();
        });
      }
    });
  }

  selectConversation(conv: ChatConversationDTO): void {
    this.selectedConv = conv;
    this.messages = [];
    this.loadingMessages = true;
    this.chatService.stopPolling();

    this.chatService.getMessages(conv.id).subscribe({
      next: (msgs) => {
        this.ngZone.run(() => {
          this.messages = msgs;
          this.loadingMessages = false;
          this.shouldScroll = true;
          conv.unreadCount = 0;
          this.cdr.detectChanges();
        });
      },
      error: () => {
        this.ngZone.run(() => {
          this.loadingMessages = false;
          this.cdr.detectChanges();
        });
      }
    });

    // Mark as read
    this.chatService.markAsRead(conv.id, String(this.userId)).subscribe();

    // Start polling as fallback (in case WebSocket is not connected)
    this.chatService.startPolling(conv.id, 3000);
  }

  openOrCreateConversation(targetId: any): void {
    const type = this.role === 'coach' ? 'CLIENT_COACH' : 'PATIENT_NUTRITIONIST';
    const p1 = String(this.userId);
    const p2 = String(targetId);

    // Check if conversation already exists
    const existing = this.conversations.find(c =>
      (c.participant1Id === p1 && c.participant2Id === p2) ||
      (c.participant1Id === p2 && c.participant2Id === p1)
    );

    if (existing) {
      this.selectConversation(existing);
      return;
    }

    // Create new
    this.chatService.createConversation(p1, p2, type).subscribe({
      next: (conv) => {
        this.ngZone.run(() => {
          const idx = this.conversations.findIndex(c => c.id === conv.id);
          if (idx === -1) this.conversations = [conv, ...this.conversations];
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

    const content = this.newMessage.trim();
    this.newMessage = '';

    const receiverId = this.getOtherId(this.selectedConv);

    const msgPayload: Partial<ChatMessageDTO> = {
      conversationId: this.selectedConv.id,
      senderId: String(this.userId),
      receiverId: receiverId,
      content: content
    };

    // Optimistic update
    const tempMsg: ChatMessageDTO = {
      id: Date.now(),
      conversationId: this.selectedConv.id,
      senderId: String(this.userId),
      receiverId: receiverId,
      content: content,
      sentAt: new Date().toISOString(),
      isRead: false
    };
    this.messages = [...this.messages, tempMsg];
    this.shouldScroll = true;
    this.cdr.detectChanges();

    if (this.chatService.isWebSocketConnected) {
      // Send via WebSocket
      this.chatService.sendMessage(msgPayload);
      // Update conversation preview
      this.updateConvPreview(content);
    } else {
      // HTTP fallback
      this.sending = true;
      this.chatService.saveMessage(msgPayload).subscribe({
        next: (saved) => {
          this.ngZone.run(() => {
            this.messages = this.messages.map(m => m.id === tempMsg.id ? saved : m);
            this.sending = false;
            this.updateConvPreview(content);
            this.cdr.detectChanges();
          });
        },
        error: () => {
          this.ngZone.run(() => {
            this.messages = this.messages.filter(m => m.id !== tempMsg.id);
            this.newMessage = content;
            this.sending = false;
            this.cdr.detectChanges();
          });
        }
      });
    }
  }

  onEnter(event: KeyboardEvent): void {
    if (!event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  // ── New conversation modal ────────────────────────────────────────────────

  openNewConvModal(): void {
    this.showNewConvModal = true;
    this.newConvTargetId = null;
    this.newConvError = '';
  }

  closeNewConvModal(): void {
    this.showNewConvModal = false;
  }

  createConversation(): void {
    if (!this.newConvTargetId) {
      this.newConvError = 'Veuillez sélectionner un contact.';
      return;
    }
    this.creatingConv = true;
    this.newConvError = '';
    this.openOrCreateConversation(this.newConvTargetId);
    this.closeNewConvModal();
    this.creatingConv = false;
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
    return conv.participant1Id === String(this.userId)
      ? conv.participant2Id
      : conv.participant1Id;
  }

  getOtherName(conv: ChatConversationDTO): string {
    const otherId = this.getOtherId(conv);
    const found = this.patients.find(p => String(p.id) === String(otherId));
    return found ? found.nom : `Contact #${otherId}`;
  }

  isMine(msg: ChatMessageDTO): boolean {
    return String(msg.senderId) === String(this.userId);
  }

  avatarClass(convId: number): string {
    return this.avatarColors[convId % this.avatarColors.length];
  }

  formatTime(dateStr: string | null): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    return isToday
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString([], { day: '2-digit', month: 'short' });
  }

  private updateConvPreview(content: string): void {
    if (this.selectedConv) {
      const conv = this.conversations.find(c => c.id === this.selectedConv!.id);
      if (conv) {
        conv.lastMessage = content;
        conv.lastMessageAt = new Date().toISOString();
      }
    }
  }

  private scrollToBottom(): void {
    try {
      const el = this.messagesEl?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    } catch {}
  }
}
