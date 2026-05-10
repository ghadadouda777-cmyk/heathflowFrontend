import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, interval, Subscription } from 'rxjs';

export interface AppNotification {
  id: number;
  userId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  relatedId?: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {

  private readonly apiUrl = 'http://localhost:8084/api/notifications';

  private _notifications = new BehaviorSubject<AppNotification[]>([]);
  private _unreadCount   = new BehaviorSubject<number>(0);

  readonly notifications$ = this._notifications.asObservable();
  readonly unreadCount$   = this._unreadCount.asObservable();

  private pollSub: Subscription | null = null;
  private currentUserId: string | null = null;
  private initialized = false;

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  private getHeaders(): HttpHeaders {
    if (!isPlatformBrowser(this.platformId)) return new HttpHeaders();
    const token = localStorage.getItem('token') ?? sessionStorage.getItem('token') ?? '';
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  init(userId: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!userId || userId === 'null' || userId === 'undefined') return;
    if (this.initialized && this.currentUserId === userId) return;

    this.currentUserId = userId;
    this.initialized = true;
    this.loadAll(userId);
    this.startPolling(userId);
  }

  destroy(): void {
    this.stopPolling();
    this.initialized = false;
    this.currentUserId = null;
  }

  addRealTime(notif: AppNotification): void {
    const current = this._notifications.getValue();
    if (current.find(n => n.id === notif.id)) return;
    this._notifications.next([notif, ...current]);
    this._unreadCount.next(this._unreadCount.getValue() + 1);
  }

  loadAll(userId: string): void {
    this.http.get<AppNotification[]>(`${this.apiUrl}/${userId}`, { headers: this.getHeaders() })
      .subscribe({
        next: (data) => {
          this._notifications.next(data);
          this._unreadCount.next(data.filter(n => !n.read).length);
        },
        error: () => {}
      });
  }

  markAsRead(notifId: number): void {
    this.http.patch(`${this.apiUrl}/${notifId}/read`, {}, { headers: this.getHeaders() })
      .subscribe({
        next: () => {
          const updated = this._notifications.getValue().map(n =>
            n.id === notifId ? { ...n, read: true } : n
          );
          this._notifications.next(updated);
          this._unreadCount.next(updated.filter(n => !n.read).length);
        },
        error: () => {}
      });
  }

  markAllAsRead(): void {
    if (!this.currentUserId) return;
    this.http.patch(`${this.apiUrl}/${this.currentUserId}/read-all`, {}, { headers: this.getHeaders() })
      .subscribe({
        next: () => {
          const updated = this._notifications.getValue().map(n => ({ ...n, read: true }));
          this._notifications.next(updated);
          this._unreadCount.next(0);
        },
        error: () => {}
      });
  }

  private startPolling(userId: string): void {
    this.stopPolling();
    this.pollSub = interval(10000).subscribe(() => {
      this.http.get<AppNotification[]>(`${this.apiUrl}/${userId}`, { headers: this.getHeaders() })
        .subscribe({
          next: (data) => {
            const currentIds = new Set(this._notifications.getValue().map(n => n.id));
            const hasNew = data.some(n => !currentIds.has(n.id));
            if (hasNew) {
              this._notifications.next(data);
              this._unreadCount.next(data.filter(n => !n.read).length);
            }
          },
          error: () => {}
        });
    });
  }

  private stopPolling(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = null;
  }
}
