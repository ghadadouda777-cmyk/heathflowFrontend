import {
  Component, OnInit, OnDestroy, OnChanges, SimpleChanges,
  HostListener, ElementRef, Input, ChangeDetectorRef,
  Inject, PLATFORM_ID
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { NotificationService, AppNotification } from '../services/notification.service';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-bell.component.html',
  styleUrls: ['./notification-bell.component.css']
})
export class NotificationBellComponent implements OnInit, OnDestroy, OnChanges {

  @Input() lang: 'fr' | 'en' = 'fr';
  @Input() userId: string | null = null;

  notifications: AppNotification[] = [];
  unreadCount = 0;
  open = false;

  private subs: Subscription[] = [];

  constructor(
    private notifService: NotificationService,
    private elRef: ElementRef,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const uid = (this.userId && this.userId !== 'null' && this.userId !== 'undefined')
      ? String(this.userId)
      : (localStorage.getItem('userId') ?? sessionStorage.getItem('userId') ?? '');

    if (uid) this.notifService.init(uid);

    this.subs.push(
      this.notifService.notifications$.subscribe(notifs => {
        this.notifications = notifs.slice(0, 10);
        this.cdr.markForCheck();
      }),
      this.notifService.unreadCount$.subscribe(count => {
        this.unreadCount = count;
        this.cdr.markForCheck();
      })
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (changes['userId'] && changes['userId'].currentValue) {
      const uid = String(changes['userId'].currentValue);
      if (uid && uid !== 'null' && uid !== 'undefined') {
        this.notifService.init(uid);
      }
    }
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  toggleDropdown(): void {
    this.open = !this.open;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elRef.nativeElement.contains(event.target)) {
      this.open = false;
    }
  }

  markAsRead(notif: AppNotification, event: MouseEvent): void {
    event.stopPropagation();
    if (!notif.read) this.notifService.markAsRead(notif.id);
  }

  markAllAsRead(): void {
    this.notifService.markAllAsRead();
  }

  typeIcon(type: string): string {
    const icons: Record<string, string> = {
      RDV_NEW:        '🗓️',
      RDV_CONFIRMED:  '✅',
      RDV_REFUSED:    '❌',
      RDV_TERMINATED: '🏁',
      NEW_MESSAGE:    '💬'
    };
    return icons[type] ?? '🔔';
  }

  relativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (this.lang === 'en') {
      if (mins < 1)   return 'just now';
      if (mins < 60)  return `${mins}m ago`;
      if (hours < 24) return `${hours}h ago`;
      return `${days}d ago`;
    } else {
      if (mins < 1)   return 'à l\'instant';
      if (mins < 60)  return `il y a ${mins} min`;
      if (hours < 24) return `il y a ${hours}h`;
      return `il y a ${days}j`;
    }
  }

  get markAllLabel(): string { return this.lang === 'en' ? 'Mark all as read' : 'Tout marquer comme lu'; }
  get emptyLabel(): string   { return this.lang === 'en' ? 'No notifications' : 'Aucune notification'; }
  get titleLabel(): string   { return 'Notifications'; }
}
